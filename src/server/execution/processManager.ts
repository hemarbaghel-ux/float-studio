import { spawn, ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface ExecutionFile { path: string; content?: string }
export interface ExecutionRequest { ownerId: string; projectId: string; command: string; files: ExecutionFile[]; timeoutMs?: number; signal?: AbortSignal }
export type ExecutionEvent =
  | { type: 'started'; executionId: string }
  | { type: 'output'; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'completed'; status: 'succeeded' | 'failed' | 'timed_out' | 'cancelled'; exitCode: number | null; durationMs: number; changedFiles?: ExecutionFile[]; deletedFiles?: string[] }
  | { type: 'error'; message: string };
export interface CommandResult {
  status: 'succeeded' | 'failed' | 'timed_out' | 'cancelled';
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  error?: string;
}

interface ActiveExecution {
  id: string;
  ownerId: string;
  projectId: string;
  containerName: string;
  child?: ChildProcess;
  cancel: () => Promise<void>;
  done: Promise<void>;
}

const MAX_FILES = 500;
const MAX_WORKSPACE_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_TIMEOUT_MS = 10 * 60 * 1000;
const EXECUTION_UID = Number(process.env.FLOAT_EXECUTION_UID || (typeof process.getuid === 'function' ? process.getuid() : 1000));
const EXECUTION_GID = Number(process.env.FLOAT_EXECUTION_GID || (typeof process.getgid === 'function' ? process.getgid() : 1000));
const SENSITIVE_PATH = /(^|\/)(\.env(?:$|[./])|id_rsa(?:$|\.)|id_ed25519(?:$|\.))|\.(pem|key|p12|pfx|keystore)$/i;

/**
 * Executes inside an ephemeral, network-isolated Docker container. The API
 * process never evaluates project commands itself. A deployment must provide
 * a preloaded, pinned image and a Docker runtime; otherwise requests fail closed.
 */
export class ProjectProcessManager {
  private readonly active = new Map<string, ActiveExecution>();

  get available(): boolean {
    return Boolean(
      process.env.FLOAT_DOCKER_BIN &&
      /^.+@sha256:[a-f0-9]{64}$/i.test(process.env.FLOAT_EXECUTION_IMAGE || '') &&
      /^tcp:\/\//i.test(process.env.DOCKER_HOST || '') &&
      process.env.DOCKER_TLS_VERIFY === '1' &&
      process.env.DOCKER_CERT_PATH &&
      process.env.FLOAT_EXECUTION_SHARED_DIR &&
      path.isAbsolute(process.env.FLOAT_EXECUTION_SHARED_DIR) &&
      Number.isSafeInteger(EXECUTION_UID) && EXECUTION_UID > 0 &&
      Number.isSafeInteger(EXECUTION_GID) && EXECUTION_GID > 0 &&
      (typeof process.getuid !== 'function' || process.getuid() === EXECUTION_UID)
    );
  }

  async execute(request: ExecutionRequest): Promise<CommandResult> {
    let stdout = '';
    let stderr = '';
    let result: CommandResult | null = null;
    const execution = this.start(request, event => {
      if (event.type === 'output') {
        if (event.stream === 'stdout') stdout += event.text;
        else stderr += event.text;
      } else if (event.type === 'completed') {
        result = { status: event.status, exitCode: event.exitCode, durationMs: event.durationMs, stdout, stderr };
      } else if (event.type === 'error') {
        result = { status: 'failed', exitCode: null, durationMs: 0, stdout, stderr, error: event.message };
      }
    });
    await execution.done;
    return result ?? { status: 'failed', exitCode: null, durationMs: 0, stdout, stderr, error: 'Execution ended without a completion status.' };
  }

  start(request: ExecutionRequest, onEvent: (event: ExecutionEvent) => void): { executionId: string; done: Promise<void> } {
    if (!this.available) throw new Error('Isolated project execution is not configured. Configure a pinned image, dedicated TLS-secured remote Docker runner, and a shared execution directory.');
    if (!request.command.trim() || request.command.length > 4000) throw new Error('Command must contain 1 to 4000 characters.');
    if (!Array.isArray(request.files) || request.files.length > MAX_FILES) throw new Error(`Workspace snapshot exceeds the ${MAX_FILES} file limit.`);
    if (this.active.size >= 4 || [...this.active.values()].filter(execution => execution.ownerId === request.ownerId).length >= 2) {
      throw new Error('Execution concurrency limit reached. Wait for an active project process to finish.');
    }

    const executionId = randomUUID();
    const containerName = `float-exec-${executionId}`;
    const startedAt = Date.now();
    let cancelled = false;
    let timedOut = false;
    let outputBytes = 0;
    let root = '';
    let settled = false;
    let child: ChildProcess | undefined;
    let resolveDone!: () => void;
    const done = new Promise<void>(resolve => { resolveDone = resolve; });
    const execution: ActiveExecution = {
      id: executionId,
      ownerId: request.ownerId,
      projectId: request.projectId,
      containerName,
      done,
      cancel: async () => {
        if (settled) return;
        cancelled = true;
        child?.kill('SIGTERM');
        if (child) {
          const killer = spawn(process.env.FLOAT_DOCKER_BIN!, ['kill', containerName], { stdio: 'ignore', windowsHide: true, env: dockerEnvironment() });
          await new Promise<void>(resolve => {
            const timer = setTimeout(() => { killer.kill('SIGKILL'); resolve(); }, 5_000);
            timer.unref?.();
            killer.once('close', () => { clearTimeout(timer); resolve(); });
            killer.once('error', () => { clearTimeout(timer); resolve(); });
          });
        }
      }
    };
    this.active.set(executionId, execution);
    if (request.signal?.aborted) cancelled = true;
    else request.signal?.addEventListener('abort', () => { void execution.cancel(); }, { once: true });

    void (async () => {
      try {
        await ensurePrivateSharedDirectory(process.env.FLOAT_EXECUTION_SHARED_DIR!);
        root = await mkdtemp(path.join(process.env.FLOAT_EXECUTION_SHARED_DIR!, 'float-workspace-'));
        await chmod(root, 0o700);
        let totalBytes = 0;
        for (const file of request.files) {
          const relativePath = validateRelativePath(file.path);
          if (SENSITIVE_PATH.test(relativePath)) continue;
          const content = typeof file.content === 'string' ? file.content : '';
          totalBytes += Buffer.byteLength(content, 'utf8');
          if (totalBytes > MAX_WORKSPACE_BYTES) throw new Error('Workspace snapshot exceeds 10 MB.');
          const target = path.join(root, relativePath);
          if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Workspace file path escaped its sandbox.');
          await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
          await writeFile(target, content, { flag: 'wx', mode: 0o600 });
        }

        const image = process.env.FLOAT_EXECUTION_IMAGE!;
        const docker = process.env.FLOAT_DOCKER_BIN!;
        const timeout = Math.min(MAX_TIMEOUT_MS, Math.max(1000, request.timeoutMs ?? 120_000));
        const args = [
          'run', '--rm', '--name', containerName,
          '--network=none', '--memory=512m', '--memory-swap=512m', '--cpus=1', '--pids-limit=128',
          '--cap-drop=ALL', '--security-opt=no-new-privileges', '--read-only', '--user', `${EXECUTION_UID}:${EXECUTION_GID}`,
          '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
          '--mount', `type=bind,src=${root},dst=/workspace`, '--workdir=/workspace',
          '--env', 'HOME=/tmp', '--env', 'CI=true',
          image, '/bin/sh', '-lc', request.command
        ];
        if (cancelled) {
          settled = true;
          onEvent({ type: 'started', executionId });
          onEvent({ type: 'completed', status: 'cancelled', exitCode: null, durationMs: Date.now() - startedAt });
          return;
        }
        child = spawn(docker, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: dockerEnvironment() });
        execution.child = child;

        onEvent({ type: 'started', executionId });
        const emit = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
          outputBytes += chunk.byteLength;
          if (outputBytes > MAX_OUTPUT_BYTES) {
            void execution.cancel();
            return;
          }
          onEvent({ type: 'output', stream, text: chunk.toString('utf8') });
        };
        child.stdout?.on('data', (chunk: Buffer) => emit('stdout', chunk));
        child.stderr?.on('data', (chunk: Buffer) => emit('stderr', chunk));

        const timer = setTimeout(() => {
          timedOut = true;
          void execution.cancel();
        }, timeout);
        const exitCode = await new Promise<number | null>((resolve, reject) => {
          child.once('error', reject);
          child.once('close', code => resolve(code));
        }).catch(error => {
          onEvent({ type: 'error', message: `Could not start isolated execution: ${error.message || String(error)}` });
          return null;
        }).finally(() => clearTimeout(timer));

        let status: 'succeeded' | 'failed' | 'timed_out' | 'cancelled' = timedOut ? 'timed_out' : cancelled ? 'cancelled' : exitCode === 0 ? 'succeeded' : 'failed';
        let changedFiles: ExecutionFile[] | undefined;
        let deletedFiles: string[] | undefined;
        if (status === 'succeeded' || status === 'failed') {
          const outputFiles = await collectTextFiles(root);
          const originalFiles = new Map(request.files.filter(file => !SENSITIVE_PATH.test(file.path.replace(/\\/g, '/'))).map(file => [file.path.replace(/\\/g, '/'), file.content ?? '']));
          changedFiles = outputFiles.filter(file => originalFiles.get(file.path) !== file.content);
          const outputPaths = new Set(outputFiles.map(file => file.path));
          deletedFiles = [...originalFiles.keys()].filter(file => !outputPaths.has(file));
        }
        settled = true;
        onEvent({ type: 'completed', status, exitCode, durationMs: Date.now() - startedAt, changedFiles, deletedFiles });
      } catch (error: any) {
        settled = true;
        onEvent({ type: 'error', message: error.message || 'Project execution failed.' });
        onEvent({ type: 'completed', status: cancelled ? 'cancelled' : 'failed', exitCode: null, durationMs: Date.now() - startedAt });
      } finally {
        this.active.delete(executionId);
        if (root) await rm(root, { recursive: true, force: true }).catch(() => undefined);
        resolveDone();
      }
    })();

    return { executionId, done };
  }

  async cancel(executionId: string, ownerId: string, projectId: string): Promise<boolean> {
    const execution = this.active.get(executionId);
    if (!execution || execution.ownerId !== ownerId || execution.projectId !== projectId) return false;
    await execution.cancel();
    return true;
  }
}

export function validateRelativePath(raw: string): string {
  if (typeof raw !== 'string' || !raw || raw.length > 1024 || raw.includes('\0') || path.isAbsolute(raw) || /^[a-z]:/i.test(raw)) {
    throw new Error('Workspace snapshot contains an invalid relative file path.');
  }
  const normalized = raw.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) throw new Error('Workspace snapshot contains a path traversal attempt.');
  return segments.join(path.sep);
}

async function ensurePrivateSharedDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('FLOAT_EXECUTION_SHARED_DIR must be a real directory, not a symlink.');
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error('FLOAT_EXECUTION_SHARED_DIR must be owned by the execution service account.');
  if ((stat.mode & 0o077) !== 0) throw new Error('FLOAT_EXECUTION_SHARED_DIR must not be accessible by group or other users. Set its mode to 0700.');
}

function dockerEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH || '' };
  for (const key of ['DOCKER_HOST', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

async function collectTextFiles(root: string): Promise<ExecutionFile[]> {
  const files: ExecutionFile[] = [];
  let totalBytes = 0;
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) await walk(absolute);
      } else if (entry.isFile() && files.length < MAX_FILES && !SENSITIVE_PATH.test(path.relative(root, absolute).replace(/\\/g, '/'))) {
        const content = await readFile(absolute);
        if (content.byteLength <= MAX_WORKSPACE_BYTES && !content.includes(0) && totalBytes + content.byteLength <= MAX_WORKSPACE_BYTES) {
          totalBytes += content.byteLength;
          files.push({ path: path.relative(root, absolute).replace(/\\/g, '/'), content: content.toString('utf8') });
        }
      }
    }
  };
  await walk(root);
  return files;
}

export const projectProcessManager = new ProjectProcessManager();
