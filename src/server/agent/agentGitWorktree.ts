import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface AgentWorkspaceFile { path: string; content: string; }
export interface AgentWorkspaceChange { path: string; operation: 'create' | 'modify' | 'delete' | 'rename'; proposedContent?: string; }
export interface AgentWorktreeSession {
  taskId: string;
  ownerId: string;
  root: string;
  repositoryPath: string;
  worktreePath: string;
  branch: string;
  baseCommit: string;
  baselinePaths: Set<string>;
}

const sessions = new Map<string, AgentWorktreeSession>();
const MAX_GIT_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_PERSISTED_DIFF_BYTES = 400 * 1024;
const MAX_GIT_RUNTIME_MS = 30_000;
const PRIVATE_PATH = /(^|\/)(\.env(?:$|\.)|\.git(?:$|\/)|node_modules(?:\/|$)|\.npmrc$|\.pypirc$|\.netrc$|(?:secrets?|credentials?)(?:\.[^/]+)?(?:\/|$)|id_rsa(?:$|\.)|id_ed25519(?:$|\.))|\.(pem|key|p12|pfx|keystore|crt|cer)$/i;
let isolatedGlobalGitConfig = '';

export async function createAgentGitWorktree(taskId: string, ownerId: string, files: AgentWorkspaceFile[], signal?: AbortSignal): Promise<AgentWorktreeSession> {
  if (!taskId || !ownerId || !Array.isArray(files) || !files.length) throw new Error('A task-owned workspace snapshot is required to create an agent worktree.');
  await cleanupStaleAgentWorktrees();
  const rootPath = await getWorkspaceRoot();
  const taskHash = createHash('sha256').update(`${ownerId}:${taskId}`).digest('hex').slice(0, 20);
  const root = await fs.mkdtemp(path.join(rootPath, `float-agent-${taskHash}-`));
  const repositoryPath = path.join(root, 'repository');
  const worktreePath = path.join(root, 'worktree');
  const branch = `agent/${taskId}`;
  await fs.mkdir(repositoryPath, { recursive: true });
  let keep = false;
  try {
    await fs.writeFile(path.join(root, 'task.json'), JSON.stringify({ taskId, ownerId, createdAt: Date.now() }), { flag: 'wx', mode: 0o600 });
    await runGit(repositoryPath, ['init'], signal);
    await runGit(repositoryPath, ['config', 'user.name', 'FLOAT Agent'], signal);
    await runGit(repositoryPath, ['config', 'user.email', 'agent@float.local'], signal);
    const baselinePaths = new Set<string>();
    for (const file of files) {
      const safePath = normalizeWorkspacePath(file.path);
      if (PRIVATE_PATH.test(safePath)) continue;
      if (typeof file.content !== 'string') continue;
      const target = path.resolve(repositoryPath, ...safePath.split('/'));
      assertWithin(repositoryPath, target);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.content, { flag: 'wx', mode: 0o600 });
      baselinePaths.add(safePath);
    }
    if (!baselinePaths.size) throw new Error('The task snapshot contains no safe source files for a Git worktree.');
    await runGit(repositoryPath, ['add', '--all', '--force', '--', '.'], signal);
    await runGit(repositoryPath, ['-c', 'commit.gpgsign=false', 'commit', '-m', 'FLOAT task baseline'], signal);
    await runGit(repositoryPath, ['branch', branch], signal);
    const baseCommit = (await runGit(repositoryPath, ['rev-parse', 'HEAD'], signal)).stdout.trim();
    await runGit(repositoryPath, ['worktree', 'add', '--', worktreePath, branch], signal);
    const session = { taskId, ownerId, root, repositoryPath, worktreePath, branch, baseCommit, baselinePaths };
    sessions.set(taskId, session);
    keep = true;
    return session;
  } finally {
    if (!keep) await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Write only validated agent proposals into the task's private Git checkout. */
export async function applyAgentChangesToWorktree(taskId: string, ownerId: string, changes: AgentWorkspaceChange[], signal?: AbortSignal): Promise<{ branch: string; baseCommit: string; diff: string }> {
  const session = getOwnedSession(taskId, ownerId);
  if (!Array.isArray(changes) || !changes.length || changes.length > 20) throw new Error('The proposed worktree change set is empty or too large.');
  for (const change of changes) {
    const safePath = normalizeWorkspacePath(change.path);
    if (PRIVATE_PATH.test(safePath)) throw new Error(`The agent worktree does not allow changing sensitive path "${safePath}".`);
    const isBaselineFile = session.baselinePaths.has(safePath);
    if (change.operation === 'create' && isBaselineFile) throw new Error(`Cannot create "${safePath}" because it already exists in the task snapshot.`);
    if (['modify', 'delete', 'rename'].includes(change.operation) && !isBaselineFile) throw new Error(`Cannot change "${safePath}" because it is not present in the task snapshot.`);
    const target = path.resolve(session.worktreePath, ...safePath.split('/'));
    assertWithin(session.worktreePath, target);
    await assertNoSymlinkParents(session.worktreePath, target);
    const existingTarget = await fs.lstat(target).catch((error: any) => error?.code === 'ENOENT' ? null : Promise.reject(error));
    if (existingTarget?.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in the agent worktree (${safePath}).`);
    if (change.operation === 'delete') {
      await fs.rm(target, { force: true });
    } else {
      if (typeof change.proposedContent !== 'string') throw new Error(`The proposal for "${safePath}" has no file content.`);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, change.proposedContent, { mode: 0o600 });
    }
  }
  await runGit(session.repositoryPath, ['-C', session.worktreePath, 'add', '--all', '--force', '--', '.'], signal);
  const diff = (await runGit(session.repositoryPath, ['-C', session.worktreePath, 'diff', '--cached', '--no-ext-diff', '--no-color', '--binary', 'HEAD', '--'], signal)).stdout;
  if (Buffer.byteLength(diff, 'utf8') > MAX_PERSISTED_DIFF_BYTES) throw new Error('The isolated worktree diff exceeds the 400 KB review limit. Split the agent task into smaller proposals.');
  return { branch: session.branch, baseCommit: session.baseCommit, diff };
}

export async function getAgentWorktreeStatus(taskId: string, ownerId: string): Promise<{ branch: string; baseCommit: string; diff: string }> {
  const session = getOwnedSession(taskId, ownerId);
  const diff = (await runGit(session.repositoryPath, ['-C', session.worktreePath, 'diff', '--cached', '--no-ext-diff', '--no-color', '--binary', 'HEAD', '--'])).stdout;
  if (Buffer.byteLength(diff, 'utf8') > MAX_PERSISTED_DIFF_BYTES) throw new Error('The isolated worktree diff exceeds the 400 KB review limit. Split the agent task into smaller proposals.');
  return { branch: session.branch, baseCommit: session.baseCommit, diff };
}

export async function cleanupAgentGitWorktree(taskId: string, ownerId?: string): Promise<void> {
  const session = sessions.get(taskId);
  if (session) {
    if (ownerId && session.ownerId !== ownerId) return;
    sessions.delete(taskId);
    await removeWorktreeRoot(session.root, session.repositoryPath, session.worktreePath, taskId);
    return;
  }
  // Recovery workers may have to remove a worktree left by a process that exited abruptly.
  const root = await getWorkspaceRoot();
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('float-agent-')) continue;
    const candidateRoot = path.join(root, entry.name);
    try {
      const metadata = JSON.parse(await fs.readFile(path.join(candidateRoot, 'task.json'), 'utf8'));
      if (metadata.taskId !== taskId || (ownerId && metadata.ownerId !== ownerId)) continue;
      const repositoryPath = path.join(candidateRoot, 'repository');
      const worktreePath = path.join(candidateRoot, 'worktree');
      await removeWorktreeRoot(candidateRoot, repositoryPath, worktreePath, taskId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
    }
  }
}

async function removeWorktreeRoot(root: string, repositoryPath: string, worktreePath: string, taskId: string): Promise<void> {
  try { await runGit(repositoryPath, ['worktree', 'remove', '--force', '--', worktreePath]); }
  catch (error) { console.warn(`[AgentWorktree] Git worktree cleanup for task ${taskId} required filesystem recovery:`, error); }
  await fs.rm(root, { recursive: true, force: true });
}

export async function cleanupStaleAgentWorktrees(now = Date.now()): Promise<void> {
  const root = await getWorkspaceRoot();
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('float-agent-')) continue;
    const directory = path.join(root, entry.name);
    const metadataPath = path.join(directory, 'task.json');
    try {
      const [metadata, stat] = await Promise.all([fs.readFile(metadataPath, 'utf8'), fs.stat(directory)]);
      const parsed = JSON.parse(metadata);
      if (now - Math.max(Number(parsed.createdAt) || 0, stat.mtimeMs) > 45 * 60_000 && !sessions.has(String(parsed.taskId))) {
        await fs.rm(directory, { recursive: true, force: true });
      }
    } catch {
      const stat = await fs.stat(directory).catch(() => null);
      if (stat && now - stat.mtimeMs > 45 * 60_000) await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function getOwnedSession(taskId: string, ownerId: string): AgentWorktreeSession {
  const session = sessions.get(taskId);
  if (!session || session.ownerId !== ownerId) throw new Error('The isolated Git worktree is not available for this task or account.');
  return session;
}

function normalizeWorkspacePath(rawPath: string): string {
  if (typeof rawPath !== 'string' || !rawPath.trim() || rawPath.includes('\0')) throw new Error('A valid relative file path is required for the agent worktree.');
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/');
  if (path.posix.isAbsolute(normalized) || /^[a-z]:/i.test(normalized) || parts.some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe task workspace path "${rawPath}".`);
  return parts.join('/');
}

function assertWithin(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    if (relative === '') return;
    throw new Error('The agent worktree path escaped its isolated workspace.');
  }
}

async function assertNoSymlinkParents(root: string, target: string): Promise<void> {
  const relative = path.relative(root, target);
  const segments = relative.split(path.sep);
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Symlinks and non-directory parents are not allowed in agent worktrees.');
    } catch (error: any) { if (error?.code !== 'ENOENT') throw error; }
  }
}

async function getWorkspaceRoot(): Promise<string> {
  const configured = process.env.FLOAT_AGENT_WORKTREE_ROOT?.trim();
  const root = path.resolve(configured || path.join(os.tmpdir(), 'float-agent-worktrees'));
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('FLOAT_AGENT_WORKTREE_ROOT must resolve to a real directory.');
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error('FLOAT_AGENT_WORKTREE_ROOT must be owned by the agent worker service account.');
  if (process.platform !== 'win32') await fs.chmod(root, 0o700);
  isolatedGlobalGitConfig = path.join(root, '.empty-global-gitconfig');
  try { await fs.writeFile(isolatedGlobalGitConfig, '', { flag: 'wx', mode: 0o600 }); }
  catch (error: any) {
    if (error?.code !== 'EEXIST') throw error;
    const configStat = await fs.lstat(isolatedGlobalGitConfig);
    if (!configStat.isFile() || configStat.isSymbolicLink() || configStat.size !== 0) throw new Error('The isolated Git global config must be an empty regular file.');
  }
  return root;
}

function runGit(cwd: string, args: string[], signal?: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Agent task was cancelled before Git worktree setup completed.'));
    const child = spawn(process.env.FLOAT_GIT_BIN || 'git', args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: isolatedGlobalGitConfig, GIT_TERMINAL_PROMPT: '0' },
    });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    const append = (target: 'stdout' | 'stderr', chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_GIT_OUTPUT_BYTES) { child.kill(); return; }
      if (target === 'stdout') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8');
    };
    child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));
    const timer = setTimeout(() => child.kill(), MAX_GIT_RUNTIME_MS);
    timer.unref?.();
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, exitSignal) => {
      clearTimeout(timer);
      if (outputBytes > MAX_GIT_OUTPUT_BYTES) return reject(new Error('Git worktree command exceeded its output limit.'));
      if (code !== 0) return reject(new Error(`Git worktree command failed (${code ?? exitSignal}): ${stderr.slice(-4_000) || stdout.slice(-4_000)}`));
      resolve({ stdout, stderr });
    });
  });
}
