import { Router, Response } from 'express';
import JSZip from 'jszip';
import { createTwoFilesPatch } from 'diff';
import { createHash } from 'node:crypto';
import { FieldValue, type DocumentData, type DocumentReference } from 'firebase-admin/firestore';
import { requireAuth } from '../authMiddleware';
import { adminDb } from '../adminFirebase';
import { getIntegrationConnection, saveIntegrationConnection, type StoredIntegrationConnection } from '../integrationStore';
import type { FileNode } from '../../types';
import { computeContentHash } from '../agent/proposalService';
import { updateAgentTaskGitHubState } from '../agentPersistence';

export const gitRouter = Router({ mergeParams: true });
const API = 'https://api.github.com';
const MAX_FILES = 500;
const MAX_WORKSPACE_BYTES = 10 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const PRIVATE_PATH = /(^|\/)(\.env(?:$|[./])|\.git(?:$|\/)|id_rsa(?:$|\.)|id_ed25519(?:$|\.))|\.(pem|key|p12|pfx|keystore)$/i;
const OMIT_DIR = /(^|\/)(node_modules|vendor|dist|build|coverage|\.next|\.cache|\.venv|venv)(\/|$)/i;
const BINARY_EXTENSION = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|eot|mp[34]|mov|wasm|exe|dll|so|dylib|bin|lockb)$/i;

interface RemoteFile { sha: string; mode: string }
interface GitLink {
  ownerId: string; repositoryOwner: string; repositoryName: string; defaultBranch: string;
  branch: string; baseSha: string; baseFiles: Record<string, RemoteFile>; updatedAt: number;
  pendingCommit?: { sha: string; baseSha: string; message: string; createdAt: number };
}
interface GitContext {
  ownerId: string; projectId: string; projectRef: DocumentReference; project: DocumentData;
  link?: GitLink; connection: StoredIntegrationConnection; repository?: any;
}
type Change = { path: string; status: 'added' | 'modified' | 'deleted' };
const links = () => adminDb.collection('projectGitLinks');

/** Publishes an agent's saved proposal as a new task-scoped remote branch. The
 * ephemeral agent Git history is intentionally not pushed: its base may differ
 * from GitHub. Instead, proposal contents are checked against the live base and
 * committed with a real GitHub parent SHA. */
export async function publishAgentTaskBranch(task: any, ownerId: string): Promise<Record<string, unknown>> {
  const ctx = await loadContext(String(task.projectId || ''), ownerId, true);
  assertAgentProjectLink(task, ownerId, ctx);
  if (task.status !== 'COMPLETED') throw httpError(409, 'Only completed agent tasks can publish changes.');
  const changes = agentChanges(task);
  if (!changes.length) throw httpError(409, 'This agent task has no publishable file changes.');
  const existing = task.github;
  if (existing?.branch && existing?.commitSha) {
    const ref = await githubOptional(ctx, '/git/ref/heads/' + branchPath(existing.branch));
    if (ref?.object?.sha === existing.commitSha) return { github: existing, message: 'Agent branch is already published.' };
    throw httpError(409, 'The recorded agent branch no longer points to its published commit. No remote branch was changed.');
  }

  const baseBranch = ctx.link!.defaultBranch;
  const baseRef = await getRef(ctx, baseBranch);
  const baseFiles = await getTree(ctx, baseRef.object.sha);
  const conflicts: Array<{ path: string; reason: string }> = [];
  const normalized: Array<{ path: string; operation: string; content?: string }> = [];
  for (const change of changes) {
    const path = normalizeGitPath(String(change.path || ''));
    if (!path || !isManagedPath(path)) throw httpError(400, 'Agent change contains an unsafe or unsupported file path.');
    if (change.operation === 'rename') throw httpError(409, 'Rename proposals must be represented as explicit create/delete changes before publishing.');
    if (!['create', 'modify', 'delete'].includes(change.operation)) throw httpError(400, 'Agent proposal contains an unsupported file operation.');
    const live = baseFiles[path];
    if (change.operation === 'create' && live) conflicts.push({ path, reason: 'The file already exists on the linked GitHub default branch.' });
    if ((change.operation === 'modify' || change.operation === 'delete') && !live) conflicts.push({ path, reason: 'The file no longer exists on the linked GitHub default branch.' });
    if (live && (change.operation === 'modify' || change.operation === 'delete')) {
      const liveContent = await getBlob(ctx, live.sha);
      const expectedHash = String(change.originalHash || '');
      if ((expectedHash && computeContentHash(liveContent) !== expectedHash) || (!expectedHash && liveContent !== String(change.originalContent ?? ''))) {
        conflicts.push({ path, reason: 'The file changed on GitHub after the agent snapshot.' });
      }
    }
    if (change.operation !== 'delete' && typeof change.proposedContent !== 'string') throw httpError(422, 'Agent proposal is missing proposed file content.');
    normalized.push({ path, operation: change.operation, content: change.proposedContent });
  }
  if (conflicts.length) throw httpError(409, 'Agent changes conflict with the current GitHub default branch. No branch was created.', { conflicts });

  const parent = await github(ctx, '/git/commits/' + encodeURIComponent(baseRef.object.sha));
  const entries: any[] = [];
  for (const change of normalized) {
    const old = baseFiles[change.path];
    if (change.operation === 'delete') entries.push({ path: change.path, mode: old?.mode || '100644', type: 'blob', sha: null });
    else {
      const blob = await github(ctx, '/git/blobs', { method: 'POST', body: { content: change.content, encoding: 'utf-8' } });
      entries.push({ path: change.path, mode: old?.mode || '100644', type: 'blob', sha: blob.sha });
    }
  }
  const tree = await github(ctx, '/git/trees', { method: 'POST', body: { base_tree: parent.tree.sha, tree: entries } });
  const login = ctx.connection.accountName || ctx.link!.repositoryOwner;
  const accountId = ctx.connection.accountId || '';
  const email = accountId ? `${accountId}+${login}@users.noreply.github.com` : `${login}@users.noreply.github.com`;
  const commit = await github(ctx, '/git/commits', { method: 'POST', body: {
    message: `FLOAT agent: ${String(task.name || 'agent changes').slice(0, 180)}`,
    tree: tree.sha, parents: [baseRef.object.sha],
    author: { name: login, email }, committer: { name: login, email },
  } });
  const branch = validateBranch(`float/agents/${String(task.id).replace(/[^A-Za-z0-9-]/g, '').slice(0, 80)}`);
  const occupied = await githubOptional(ctx, '/git/ref/heads/' + branchPath(branch));
  if (occupied) throw httpError(409, 'The unique agent branch name already exists. No existing branch was overwritten.');
  await github(ctx, '/git/refs', { method: 'POST', body: { ref: 'refs/heads/' + branch, sha: commit.sha } });
  const publication = {
    repository: `${ctx.link!.repositoryOwner}/${ctx.link!.repositoryName}`,
    branch, baseBranch, baseSha: baseRef.object.sha, commitSha: commit.sha,
    commitUrl: commit.html_url || `${ctx.repository.html_url}/commit/${commit.sha}`,
    publishedAt: Date.now(), pullRequest: null,
  };
  if (!await updateAgentTaskGitHubState(String(task.id), ownerId, String(task.projectId), publication)) {
    throw httpError(409, 'The branch was published, but task ownership changed before status could be saved. Refresh the task and contact an administrator if it is not shown.');
  }
  return { github: publication, message: `Published ${branch} at ${commit.sha.slice(0, 8)}.` };
}

export async function createAgentTaskPullRequest(task: any, ownerId: string): Promise<Record<string, unknown>> {
  const ctx = await loadContext(String(task.projectId || ''), ownerId, true);
  assertAgentProjectLink(task, ownerId, ctx);
  const publication = task.github;
  if (!publication?.branch || !publication?.commitSha) throw httpError(409, 'Publish this completed agent task to GitHub before creating a pull request.');
  assertPublishedRepository(publication, ctx);
  const currentRef = await getRef(ctx, publication.branch);
  if (currentRef.object.sha !== publication.commitSha) throw httpError(409, 'The agent branch moved after publication. Refresh task status before opening a pull request.');
  const existing = await listPullRequests(ctx, 'open', publication.branch);
  const duplicate = existing.find((pr: any) => pr.base === publication.baseBranch);
  if (duplicate) {
    const pullRequest = await getAgentPullRequest(ctx, duplicate.number);
    await persistAgentPullRequest(task, ownerId, pullRequest);
    return { pullRequest, message: `Pull request #${duplicate.number} already exists.` };
  }
  const description = [
    String(task.description || ''), '',
    'Generated by FLOAT background agent. Review the changes and checks before merging.',
    '', `Agent task: ${task.id}`,
  ].join('\n').slice(0, 60_000);
  const pr = await github(ctx, '/pulls', { method: 'POST', body: {
    title: String(task.name || 'FLOAT agent changes').slice(0, 256), body: description,
    head: publication.branch, base: publication.baseBranch, draft: false,
  } });
  const pullRequest = await summarizeAgentPullRequest(ctx, pr);
  await persistAgentPullRequest(task, ownerId, pullRequest);
  return { pullRequest, message: `Created pull request #${pr.number}.` };
}

export async function refreshAgentTaskPullRequest(task: any, ownerId: string): Promise<Record<string, unknown>> {
  const ctx = await loadContext(String(task.projectId || ''), ownerId, true);
  assertAgentProjectLink(task, ownerId, ctx);
  const publication = task.github;
  if (!publication?.branch || !publication.pullRequest?.number) throw httpError(409, 'This agent task does not have a saved pull request.');
  assertPublishedRepository(publication, ctx);
  const pr = await github(ctx, '/pulls/' + encodeURIComponent(String(publication.pullRequest.number)));
  if (pr.head?.ref !== publication.branch || pr.base?.ref !== publication.baseBranch) throw httpError(409, 'The saved pull request no longer matches this agent branch.');
  const pullRequest = await summarizeAgentPullRequest(ctx, pr);
  await persistAgentPullRequest(task, ownerId, pullRequest);
  return { pullRequest, message: 'Pull request status refreshed from GitHub.' };
}

export async function approveAgentTaskPullRequest(task: any, ownerId: string): Promise<Record<string, unknown>> {
  const ctx = await loadContext(String(task.projectId || ''), ownerId, true);
  assertAgentProjectLink(task, ownerId, ctx);
  const publication = task.github;
  const savedPr = publication?.pullRequest;
  if (!publication?.branch || !savedPr?.number) throw httpError(409, 'This agent task has no pull request to approve.');
  assertPublishedRepository(publication, ctx);
  const pr = await github(ctx, '/pulls/' + encodeURIComponent(String(savedPr.number)));
  if (pr.head?.ref !== publication.branch || pr.base?.ref !== publication.baseBranch || pr.state !== 'open' || pr.merged_at) throw httpError(409, 'The pull request is no longer open for this agent branch.');
  await github(ctx, `/pulls/${encodeURIComponent(String(savedPr.number))}/reviews`, { method: 'POST', body: { event: 'APPROVE', body: 'Reviewed FLOAT background agent changes.' } });
  const pullRequest = await summarizeAgentPullRequest(ctx, await github(ctx, '/pulls/' + encodeURIComponent(String(savedPr.number))));
  await persistAgentPullRequest(task, ownerId, pullRequest);
  return { pullRequest, message: `Submitted an approval review for pull request #${savedPr.number}.` };
}

export async function mergeAgentTaskPullRequest(task: any, ownerId: string, confirmed: boolean): Promise<Record<string, unknown>> {
  const ctx = await loadContext(String(task.projectId || ''), ownerId, true);
  assertAgentProjectLink(task, ownerId, ctx);
  if (!confirmed) throw httpError(400, 'Explicit user confirmation is required before merging an agent pull request.');
  const publication = task.github;
  const savedPr = publication?.pullRequest;
  if (!publication?.branch || !savedPr?.number || !savedPr?.url) throw httpError(409, 'This agent task has no pull request to merge.');
  assertPublishedRepository(publication, ctx);
  if (publication.branch === ctx.link!.defaultBranch || publication.baseBranch !== ctx.link!.defaultBranch) throw httpError(400, 'Agent pull requests must target the linked default branch from a separate agent branch.');
  const pr = await github(ctx, '/pulls/' + encodeURIComponent(String(savedPr.number)));
  if (pr.head?.ref !== publication.branch || pr.base?.ref !== publication.baseBranch || pr.merged_at || pr.state !== 'open') throw httpError(409, 'The pull request is no longer open for this agent branch. Refresh its status.');
  if (pr.mergeable === false) throw httpError(409, 'GitHub reports a merge conflict. Resolve it in GitHub and refresh before trying again.');
  const response = await github(ctx, '/pulls/' + encodeURIComponent(String(savedPr.number)) + '/merge', { method: 'PUT', body: { sha: pr.head.sha, merge_method: 'merge' } });
  if (!response?.merged) throw httpError(409, response?.message || 'GitHub did not confirm that the pull request was merged.');
  const pullRequest = { ...savedPr, state: 'closed', merged: true, mergedAt: Date.now(), mergeSha: response.sha, reviewState: savedPr.reviewState || 'unknown' };
  await persistAgentPullRequest(task, ownerId, pullRequest);
  return { pullRequest, message: `GitHub confirmed pull request #${savedPr.number} merged.` };
}

function assertAgentProjectLink(task: any, ownerId: string, ctx: GitContext): void {
  if (task.ownerId !== ownerId || task.projectId !== ctx.projectId) throw httpError(403, 'Agent task does not belong to this user and project.');
}
function assertPublishedRepository(publication: any, ctx: GitContext): void {
  if (publication.repository !== `${ctx.link!.repositoryOwner}/${ctx.link!.repositoryName}`) throw httpError(409, 'The project’s linked GitHub repository changed after this task was published.');
}
function agentChanges(task: any): any[] {
  const changes = task.result?.changeSet?.changes;
  if (!Array.isArray(changes)) throw httpError(409, 'This agent task has no saved proposal.');
  return changes.filter(change => change && change.status !== 'rejected' && change.status !== 'failed');
}
async function persistAgentPullRequest(task: any, ownerId: string, pullRequest: any): Promise<void> {
  const publication = { ...task.github, pullRequest };
  if (!await updateAgentTaskGitHubState(String(task.id), ownerId, String(task.projectId), publication)) throw httpError(409, 'Agent task ownership changed before pull request status could be saved.');
}
async function getAgentPullRequest(ctx: GitContext, number: number): Promise<Record<string, unknown>> {
  const pr = await github(ctx, '/pulls/' + encodeURIComponent(String(number)));
  return summarizeAgentPullRequest(ctx, pr);
}
async function summarizeAgentPullRequest(ctx: GitContext, pr: any): Promise<Record<string, unknown>> {
  const reviews = await github(ctx, `/pulls/${encodeURIComponent(String(pr.number))}/reviews?per_page=100`);
  const latestByUser = new Map<string, string>();
  if (Array.isArray(reviews)) for (const review of reviews) {
    if (review.user?.login && ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED'].includes(review.state)) latestByUser.set(review.user.login, review.state);
  }
  const states = [...latestByUser.values()];
  const reviewState = states.includes('CHANGES_REQUESTED') ? 'changes_requested' : states.includes('APPROVED') ? 'approved' : states.length ? 'commented' : 'review_required';
  return {
    number: pr.number, title: pr.title, state: pr.state, url: pr.html_url, draft: !!pr.draft,
    merged: !!pr.merged_at, mergedAt: pr.merged_at || null, mergeable: pr.mergeable,
    head: pr.head?.ref, base: pr.base?.ref, headSha: pr.head?.sha,
    reviewState, updatedAt: pr.updated_at,
  };
}

gitRouter.get('/', requireAuth, async (req: any, res: Response) => {
  try {
    const ctx = await loadContext(req.params.projectId, req.user.uid, false);
    if (!ctx.link) return res.json({ connected: true, linked: false });
    const ref = await getRef(ctx, ctx.link.branch);
    const headFiles = await getTree(ctx, ref.object.sha);
    const local = projectFiles(ctx.project.files);
    const prs = await listPullRequests(ctx, 'open');
    res.json({
      connected: true, linked: true,
      repository: { fullName: ctx.link.repositoryOwner + '/' + ctx.link.repositoryName, htmlUrl: ctx.repository.html_url, private: !!ctx.repository.private },
      branch: ctx.link.branch, defaultBranch: ctx.link.defaultBranch,
      branches: await listBranches(ctx), headSha: ref.object.sha, baseSha: ctx.link.baseSha,
      changes: compareWorkspace(local, ctx.link.baseFiles), remoteChanges: compareRemote(headFiles, ctx.link.baseFiles),
      pendingCommit: ctx.link.pendingCommit || null, pullRequests: prs
    });
  } catch (error: any) { sendFailure(res, error); }
});

gitRouter.get('/diff', requireAuth, async (req: any, res: Response) => {
  try {
    const ctx = await loadContext(req.params.projectId, req.user.uid, true);
    const local = projectFiles(ctx.project.files);
    const changes = compareWorkspace(local, ctx.link!.baseFiles);
    const patches = [];
    for (const change of changes.slice(0, 50)) {
      const before = ctx.link!.baseFiles[change.path] ? await getBlob(ctx, ctx.link!.baseFiles[change.path].sha) : '';
      const after = change.status === 'deleted' ? '' : local.get(change.path) || '';
      patches.push({ path: change.path, status: change.status, patch: createTwoFilesPatch('a/' + change.path, 'b/' + change.path, before, after, 'base', 'workspace') });
    }
    res.json({ patches, truncated: changes.length > patches.length, total: changes.length });
  } catch (error: any) { sendFailure(res, error); }
});

gitRouter.get('/pull-requests', requireAuth, async (req: any, res: Response) => {
  try {
    const ctx = await loadContext(req.params.projectId, req.user.uid, true);
    res.json({ pullRequests: await listPullRequests(ctx, String(req.query.state || 'open')) });
  } catch (error: any) { sendFailure(res, error); }
});

gitRouter.post('/operations', requireAuth, async (req: any, res: Response) => {
  const write = (event: Record<string, unknown>) => {
    if (!res.destroyed && !res.writableEnded) res.write('data: ' + JSON.stringify(event) + '\n\n');
  };
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  const progress = (stage: string, message: string) => write({ type: 'progress', stage, message, timestamp: Date.now() });
  try {
    const body = req.body || {};
    progress('authorization', 'Checking project ownership and GitHub authorization.');
    const ctx = await loadContext(req.params.projectId, req.user.uid, body.action !== 'link');
    const result = await performOperation(String(body.action || ''), body, ctx, progress);
    write({ type: 'completed', ...result });
  } catch (error: any) {
    write({ type: 'error', status: error.status || 500, message: error.message || 'GitHub operation failed.', ...(error.details || {}) });
  } finally { if (!res.writableEnded) res.end(); }
});

async function loadContext(projectId: string, ownerId: string, requireLink: boolean): Promise<GitContext> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(projectId)) throw httpError(400, 'Invalid project ID.');
  const projectRef = adminDb.collection('projects').doc(projectId);
  const snapshot = await projectRef.get();
  if (!snapshot.exists) throw httpError(404, 'Project not found. Save the workspace before using GitHub.');
  const project = snapshot.data()!;
  if (project.ownerId !== ownerId) throw httpError(403, 'You do not own this project.');
  const linkSnapshot = await links().doc(projectId).get();
  const link = linkSnapshot.exists ? linkSnapshot.data() as GitLink : undefined;
  if (link && link.ownerId !== ownerId) throw httpError(403, 'Repository authorization does not belong to this account.');
  if (requireLink && !link) throw httpError(409, 'Link this project to a GitHub repository first.');
  let connection: StoredIntegrationConnection | null;
  try { connection = await getIntegrationConnection(ownerId, 'github'); }
  catch { throw httpError(503, 'GitHub integration storage is unavailable.'); }
  if (!connection || connection.status !== 'connected' || !connection.accessToken) throw httpError(401, 'Connect GitHub in Settings → Integrations.');
  const ctx: GitContext = { ownerId, projectId, projectRef, project, link, connection };
  if (link) ctx.repository = await github(ctx, '');
  return ctx;
}

async function performOperation(action: string, body: any, ctx: GitContext, progress: (stage: string, message: string) => void): Promise<Record<string, unknown>> {
  switch (action) {
    case 'link': return linkRepository(body, ctx, progress);
    case 'create-branch': return createBranch(body, ctx, progress);
    case 'switch-branch': return switchBranch(body, ctx, progress);
    case 'delete-branch': return deleteBranch(body, ctx, progress);
    case 'commit': return createCommit(body, ctx, progress);
    case 'push': return pushCommit(ctx, progress);
    case 'pull': return pullChanges(ctx, progress);
    case 'create-pr': return createPullRequest(body, ctx, progress);
    default: throw httpError(400, 'Unknown GitHub operation.');
  }
}

async function linkRepository(body: any, ctx: GitContext, progress: (stage: string, message: string) => void): Promise<Record<string, unknown>> {
  const fullName = String(body.fullName || '');
  const match = fullName.match(/^([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})$/);
  if (!match) throw httpError(400, 'Choose a repository from your connected GitHub account.');
  const [, repositoryOwner, repositoryName] = match;
  const link: GitLink = { ownerId: ctx.ownerId, repositoryOwner, repositoryName, defaultBranch: '', branch: '', baseSha: '', baseFiles: {}, updatedAt: Date.now() };
  const nextContext: GitContext = { ...ctx, link };
  progress('repository', 'Verifying GitHub access to ' + fullName + '.');
  const repo = await github(nextContext, '');
  const branch = String(body.branch || repo.default_branch || 'main');
  validateBranch(branch);
  const ref = await getRef(nextContext, branch);
  progress('snapshot', 'Reading the branch tree and recording the tracked text-file baseline.');
  link.defaultBranch = repo.default_branch || branch;
  link.branch = branch;
  link.baseSha = ref.object.sha;
  link.baseFiles = await getTree(nextContext, ref.object.sha);
  await links().doc(ctx.projectId).set(link);
  return { repository: { fullName, htmlUrl: repo.html_url, private: !!repo.private }, branch, defaultBranch: link.defaultBranch, changes: compareWorkspace(projectFiles(ctx.project.files), link.baseFiles), message: 'GitHub repository linked.' };
}

async function createBranch(body: any, ctx: GitContext, progress: (stage: string, message: string) => void): Promise<Record<string, unknown>> {
  if (ctx.link!.pendingCommit) throw httpError(409, 'A commit is waiting to be pushed. Push it before creating and switching branches.');
  const branch = validateBranch(String(body.name || ''));
  if (branch === ctx.link!.defaultBranch) throw httpError(400, 'A new branch cannot reuse the repository default branch.');
  progress('branch-check', 'Checking whether ' + branch + ' already exists.');
  if (await githubOptional(ctx, '/git/ref/heads/' + branchPath(branch))) throw httpError(409, 'Branch "' + branch + '" already exists.');
  const base = validateBranch(String(body.fromBranch || ctx.link!.branch));
  const ref = await getRef(ctx, base);
  progress('branch-create', 'Creating ' + branch + ' from ' + base + ' at ' + ref.object.sha.slice(0, 8) + '.');
  await github(ctx, '/git/refs', { method: 'POST', body: { ref: 'refs/heads/' + branch, sha: ref.object.sha } });
  const next = { ...ctx.link!, branch, baseSha: ref.object.sha, baseFiles: await getTree(ctx, ref.object.sha), updatedAt: Date.now() };
  delete (next as Partial<GitLink>).pendingCommit;
  await links().doc(ctx.projectId).set(next);
  return { branch, baseSha: ref.object.sha, message: 'Created and switched to ' + branch + '.' };
}

async function switchBranch(body: any, ctx: GitContext, progress: (stage: string, message: string) => void): Promise<Record<string, unknown>> {
  const branch = validateBranch(String(body.name || ''));
  const changes = compareWorkspace(projectFiles(ctx.project.files), ctx.link!.baseFiles);
  if (changes.length && body.confirmDiscard !== true) throw httpError(409, 'Workspace changes are uncommitted. Confirm branch switching to discard them or commit/pull first.', { changes });
  if (ctx.link!.pendingCommit && body.confirmDiscardPending !== true) throw httpError(409, 'A commit is waiting to be pushed. Confirm branch switching to discard that commit or push it first.');
  progress('branch-lookup', 'Looking up branch ' + branch + '.');
  const ref = await getRef(ctx, branch);
  progress('branch-snapshot', 'Loading the selected branch into the project workspace.');
  const baseFiles = await getTree(ctx, ref.object.sha);
  const contents = await downloadTextSnapshot(ctx, ref.object.sha);
  const next = { ...ctx.link!, branch, baseSha: ref.object.sha, baseFiles, updatedAt: Date.now() };
  delete (next as Partial<GitLink>).pendingCommit;
  await saveWorkspaceAndLink(ctx, contents, next);
  return { branch, baseSha: ref.object.sha, files: Object.fromEntries(contents), message: 'Switched to ' + branch + '.', discardedChanges: changes.length > 0 };
}

async function deleteBranch(body: any, ctx: GitContext, progress: (stage: string, message: string) => void): Promise<Record<string, unknown>> {
  const branch = validateBranch(String(body.name || ''));
  if (branch === ctx.link!.defaultBranch) throw httpError(400, 'The repository default branch cannot be deleted.');
  if (branch === ctx.link!.branch) throw httpError(409, 'Switch to another branch before deleting the current branch.');
  const branchInfo = (await listBranches(ctx)).find(item => item.name === branch);
  if (!branchInfo) throw httpError(404, 'Branch "' + branch + '" does not exist in the linked repository.');
  if (branchInfo.protected) throw httpError(409, 'Branch "' + branch + '" is protected and cannot be deleted from FLOAT.');
  progress('branch-safety', 'Checking open pull requests for ' + branch + '.');
  const pulls = await listPullRequests(ctx, 'open', branch);
  if (pulls.length) throw httpError(409, 'Branch "' + branch + '" has an open pull request (#' + pulls[0].number + ').');
  progress('branch-delete', 'Deleting branch ' + branch + ' from GitHub.');
  await github(ctx, '/git/refs/heads/' + branchPath(branch), { method: 'DELETE' });
  return { branch, message: 'Deleted branch ' + branch + '.' };
}

async function createCommit(body: any, ctx: GitContext, progress: (stage: string, message: string) => void): Promise<Record<string, unknown>> {
  const message = String(body.message || '').trim();
  if (body.confirmed !== true) throw httpError(400, 'Review the changes and explicitly confirm before creating a commit.');
  if (!message || message.length > 500) throw httpError(400, 'Commit message must contain 1 to 500 characters.');
  if (ctx.link!.pendingCommit) throw httpError(409, 'Push or discard the pending commit before creating another.');
  progress('branch-check', 'Checking that the remote branch has not advanced.');
  const ref = await getRef(ctx, ctx.link!.branch);
  if (ref.object.sha !== ctx.link!.baseSha) throw httpError(409, 'The GitHub branch advanced since the last sync. Pull and resolve changes before committing.');
  const parent = await github(ctx, '/git/commits/' + encodeURIComponent(ref.object.sha));
  const local = projectFiles(ctx.project.files);
  const changes = compareWorkspace(local, ctx.link!.baseFiles);
  if (!changes.length) throw httpError(409, 'There are no workspace changes to commit.');
  progress('review', 'Preparing ' + changes.length + ' changed file(s) for the commit.');
  const entries: any[] = [];
  for (const change of changes) {
    const old = ctx.link!.baseFiles[change.path];
    if (change.status === 'deleted') entries.push({ path: change.path, mode: old?.mode || '100644', type: 'blob', sha: null });
    else {
      const blob = await github(ctx, '/git/blobs', { method: 'POST', body: { content: local.get(change.path), encoding: 'utf-8' } });
      entries.push({ path: change.path, mode: old?.mode || '100644', type: 'blob', sha: blob.sha });
    }
  }
  progress('tree', 'Creating the Git tree from real GitHub blob objects.');
  const tree = await github(ctx, '/git/trees', { method: 'POST', body: { base_tree: parent.tree.sha, tree: entries } });
  progress('commit-object', 'Creating the confirmed commit object; the branch remains unchanged until Push.');
  const login = ctx.connection.accountName || ctx.link!.repositoryOwner;
  const accountId = ctx.connection.accountId || '';
  const commit = await github(ctx, '/git/commits', { method: 'POST', body: {
    message, tree: tree.sha, parents: [ref.object.sha],
    author: { name: login, email: accountId + '+' + login + '@users.noreply.github.com' },
    committer: { name: login, email: accountId + '+' + login + '@users.noreply.github.com' }
  } });
  const next: GitLink = { ...ctx.link!, updatedAt: Date.now(), pendingCommit: { sha: commit.sha, baseSha: ref.object.sha, message, createdAt: Date.now() } };
  await links().doc(ctx.projectId).set(next);
  return { commit: { sha: commit.sha, message, url: commit.html_url }, message: 'Commit object created and queued for push. The branch has not moved yet.' };
}

async function pushCommit(ctx: GitContext, progress: (stage: string, message: string) => void): Promise<Record<string, unknown>> {
  const pending = ctx.link!.pendingCommit;
  if (!pending) throw httpError(409, 'Create and confirm a commit before pushing.');
  progress('push-check', 'Verifying the remote branch still points to the commit parent.');
  const ref = await getRef(ctx, ctx.link!.branch);
  if (ref.object.sha !== pending.baseSha || pending.baseSha !== ctx.link!.baseSha) throw httpError(409, 'Remote branch moved. The pending commit was not pushed; pull and recreate the commit.');
  progress('push', 'Fast-forwarding ' + ctx.link!.branch + ' to ' + pending.sha.slice(0, 8) + '.');
  await github(ctx, '/git/refs/heads/' + branchPath(ctx.link!.branch), { method: 'PATCH', body: { sha: pending.sha, force: false } });
  const baseFiles = await getTree(ctx, pending.sha);
  const next = { ...ctx.link!, baseSha: pending.sha, baseFiles, updatedAt: Date.now() };
  delete (next as Partial<GitLink>).pendingCommit;
  await links().doc(ctx.projectId).set(next);
  return { branch: ctx.link!.branch, sha: pending.sha, message: 'Pushed ' + pending.sha.slice(0, 8) + ' to ' + ctx.link!.branch + '.' };
}

async function pullChanges(ctx: GitContext, progress: (stage: string, message: string) => void): Promise<Record<string, unknown>> {
  if (ctx.link!.pendingCommit) throw httpError(409, 'A commit is waiting to be pushed. Push it before pulling so it is not discarded.');
  progress('pull-check', 'Comparing local and remote edits against the last synced commit.');
  const ref = await getRef(ctx, ctx.link!.branch);
  const remoteFiles = await getTree(ctx, ref.object.sha);
  const local = projectFiles(ctx.project.files);
  const localChanges = compareWorkspace(local, ctx.link!.baseFiles);
  const remoteChanges = compareRemote(remoteFiles, ctx.link!.baseFiles);
  const localChanged = new Set(localChanges.map(change => change.path));
  const remoteChanged = new Set(remoteChanges.map(change => change.path));
  const conflicts = [...localChanged].filter(file => remoteChanged.has(file) && (local.has(file) ? gitBlobSha(local.get(file)!) : null) !== (remoteFiles[file]?.sha || null));
  if (conflicts.length) throw httpError(409, 'Pull found overlapping edits. No files changed. Resolve these files and retry.', { conflicts });
  progress('download', 'Downloading the actual GitHub branch archive.');
  const remoteContents = await downloadTextSnapshot(ctx, ref.object.sha);
  const merged = new Map(remoteContents);
  for (const change of localChanges) {
    if (change.status === 'deleted') merged.delete(change.path);
    else merged.set(change.path, local.get(change.path)!);
  }
  const totalBytes = [...merged.values()].reduce((sum, content) => sum + Buffer.byteLength(content, 'utf8'), 0);
  if (merged.size > MAX_FILES || totalBytes > MAX_WORKSPACE_BYTES) throw httpError(413, 'Merged workspace exceeds FLOAT’s workspace limits. No project changes were saved.');
  progress('workspace-save', 'Saving ' + merged.size + ' merged files to the owned FLOAT project.');
  await saveWorkspaceAndLink(ctx, merged, { ...ctx.link!, baseSha: ref.object.sha, baseFiles: remoteFiles, updatedAt: Date.now() });
  return { files: Object.fromEntries(merged), branch: ctx.link!.branch, sha: ref.object.sha, message: 'Pulled ' + ctx.link!.branch + ' and merged non-conflicting workspace changes.' };
}

async function createPullRequest(body: any, ctx: GitContext, progress: (stage: string, message: string) => void): Promise<Record<string, unknown>> {
  const title = String(body.title || '').trim();
  const description = String(body.body || '').trim();
  const base = validateBranch(String(body.base || ctx.link!.defaultBranch));
  if (!title || title.length > 256 || description.length > 65_536) throw httpError(400, 'A pull request title up to 256 characters is required; description limit is 64 KB.');
  if (ctx.link!.branch === base) throw httpError(400, 'Pull request head and base branches must differ.');
  progress('pull-request-check', 'Checking for an existing open pull request.');
  const existing = await listPullRequests(ctx, 'open', ctx.link!.branch);
  const duplicate = existing.find((pr: any) => pr.base === base);
  if (duplicate) throw httpError(409, 'An open pull request already exists for this branch.', { pullRequest: duplicate });
  progress('pull-request-create', 'Creating pull request ' + ctx.link!.branch + ' → ' + base + '.');
  const pr = await github(ctx, '/pulls', { method: 'POST', body: { title, body: description, head: ctx.link!.branch, base, draft: body.draft === true } });
  return { pullRequest: { number: pr.number, title: pr.title, state: pr.state, url: pr.html_url, draft: pr.draft, merged: !!pr.merged_at }, message: 'Created pull request #' + pr.number + '.' };
}

async function listBranches(ctx: GitContext): Promise<Array<{ name: string; sha: string; protected: boolean }>> {
  const branches = await github(ctx, '/branches?per_page=100');
  if (!Array.isArray(branches)) throw httpError(502, 'GitHub returned an invalid branches response.');
  return branches.map(branch => ({ name: branch.name, sha: branch.commit.sha, protected: !!branch.protected }));
}

async function listPullRequests(ctx: GitContext, state: string, head?: string): Promise<any[]> {
  const query = new URLSearchParams({ state: ['open', 'closed', 'all'].includes(state) ? state : 'open', per_page: '20' });
  if (head) query.set('head', ctx.link!.repositoryOwner + ':' + head);
  const pulls = await github(ctx, '/pulls?' + query.toString());
  if (!Array.isArray(pulls)) throw httpError(502, 'GitHub returned an invalid pull request response.');
  return pulls.map((pr: any) => ({ number: pr.number, title: pr.title, state: pr.state, url: pr.html_url, draft: pr.draft, merged: !!pr.merged_at, head: pr.head?.ref, base: pr.base?.ref, updatedAt: pr.updated_at }));
}

async function getRef(ctx: GitContext, branch: string): Promise<any> { return github(ctx, '/git/ref/heads/' + branchPath(branch)); }

async function getTree(ctx: GitContext, commitSha: string): Promise<Record<string, RemoteFile>> {
  const commit = await github(ctx, '/git/commits/' + encodeURIComponent(commitSha));
  const tree = await github(ctx, '/git/trees/' + encodeURIComponent(commit.tree.sha) + '?recursive=1');
  if (tree.truncated) throw httpError(413, 'This repository tree is too large for FLOAT’s current Git workspace limit.');
  if (!Array.isArray(tree.tree)) throw httpError(502, 'GitHub returned an invalid repository tree.');
  const result: Record<string, RemoteFile> = {};
  for (const entry of tree.tree) {
    if (entry.type !== 'blob' || !isManagedPath(entry.path)) continue;
    if (Object.keys(result).length >= MAX_FILES) throw httpError(413, 'Repository has more than ' + MAX_FILES + ' importable text files.');
    result[entry.path] = { sha: entry.sha, mode: entry.mode || '100644' };
  }
  return result;
}

async function getBlob(ctx: GitContext, sha: string): Promise<string> {
  const blob = await github(ctx, '/git/blobs/' + encodeURIComponent(sha));
  if (blob.encoding !== 'base64' || typeof blob.content !== 'string') throw httpError(502, 'GitHub returned binary or unsupported file data for the text diff.');
  const content = Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
  if (content.byteLength > 500_000 || content.includes(0)) throw httpError(413, 'A changed file is too large or binary for FLOAT’s text diff.');
  return content.toString('utf8');
}

async function downloadTextSnapshot(ctx: GitContext, sha: string): Promise<Map<string, string>> {
  const url = API + '/repos/' + repoPath(ctx.link!) + '/zipball/' + encodeURIComponent(sha);
  const response = await fetch(url, { headers: githubHeaders(ctx.connection.accessToken), signal: AbortSignal.timeout(30_000) });
  if (response.status === 401) return expireToken(ctx.connection);
  if (!response.ok) throw httpError(response.status >= 500 ? 502 : response.status, 'GitHub repository download failed (HTTP ' + response.status + ').');
  if (Number(response.headers.get('content-length') || 0) > MAX_ARCHIVE_BYTES) throw httpError(413, 'GitHub source archive exceeds FLOAT’s 20 MB compressed limit.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw httpError(413, 'GitHub source archive exceeds FLOAT’s 20 MB compressed limit.');
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files).filter(entry => !entry.dir);
  const stripTop = entries.length > 0 && entries.every(entry => entry.name.includes('/')) && new Set(entries.map(entry => entry.name.split('/')[0])).size === 1;
  const out = new Map<string, string>();
  let totalBytes = 0;
  for (const entry of entries) {
    const raw = stripTop ? entry.name.split('/').slice(1).join('/') : entry.name;
    const filePath = normalizeGitPath(raw);
    if (!filePath || !isManagedPath(filePath)) continue;
    if (out.size >= MAX_FILES) throw httpError(413, 'Repository contains more than ' + MAX_FILES + ' importable text files.');
    const uncompressedSize = Number((entry as any)._data?.uncompressedSize || 0);
    if (uncompressedSize > 500_000 || totalBytes + uncompressedSize > MAX_WORKSPACE_BYTES) throw httpError(413, 'GitHub source archive exceeds FLOAT’s uncompressed workspace limits.');
    const content = await entry.async('string');
    if (content.includes('\0')) continue;
    totalBytes += Buffer.byteLength(content, 'utf8');
    if (totalBytes > MAX_WORKSPACE_BYTES) throw httpError(413, 'GitHub source archive exceeds FLOAT’s uncompressed workspace limits.');
    out.set(filePath, content);
  }
  return out;
}

async function github(ctx: GitContext, endpoint: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  if (init.method && init.method !== 'GET') {
    const scopes = ctx.connection.scopes || [];
    if (!scopes.includes('repo')) throw httpError(403, 'This GitHub connection lacks the repo scope required for Git writes. Reconnect GitHub to authorize repository writes.');
    if (ctx.repository?.permissions && ctx.repository.permissions.push === false) throw httpError(403, 'This GitHub account has read-only access to the linked repository.');
  }
  const url = API + '/repos/' + repoPath(ctx.link!) + endpoint;
  const response = await fetch(url, {
    method: init.method || 'GET',
    headers: { ...githubHeaders(ctx.connection.accessToken), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000)
  });
  if (response.status === 401) return expireToken(ctx.connection);
  if (response.status === 403) {
    const body = await response.json().catch(() => ({}));
    const scopes = (response.headers.get('x-oauth-scopes') || ctx.connection.scopes.join(',')).split(',').map(scope => scope.trim());
    if (!scopes.includes('repo')) throw httpError(403, 'This GitHub connection lacks the repo scope required for Git operations. Reconnect GitHub to authorize repository writes.');
    throw httpError(403, body.message || 'GitHub denied this operation. Confirm repository write access.');
  }
  if (response.status === 404) throw httpError(404, 'GitHub repository, branch, commit, or pull request was not found or is inaccessible.');
  if (response.status === 409 || response.status === 422) {
    const body = await response.json().catch(() => ({}));
    throw httpError(response.status, body.message || 'GitHub rejected the operation because repository state changed.');
  }
  if (response.status === 204) return null;
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const retry = response.headers.get('retry-after');
    throw httpError(response.status >= 500 ? 502 : response.status, (body.message || 'GitHub API returned HTTP ' + response.status) + (retry ? ' Retry after ' + retry + ' seconds.' : ''));
  }
  const data = await response.json().catch(() => null);
  return data;
}

async function githubOptional(ctx: GitContext, endpoint: string): Promise<any | null> {
  try { return await github(ctx, endpoint); } catch (error: any) { if (error.status === 404) return null; throw error; }
}

function githubHeaders(token: string): HeadersInit {
  return { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'FLOAT-AI' };
}

async function expireToken(connection: StoredIntegrationConnection): Promise<never> {
  connection.status = 'expired';
  await saveIntegrationConnection(connection).catch(() => undefined);
  throw httpError(401, 'GitHub authorization expired or was revoked. Reconnect GitHub and retry.');
}

function repoPath(link: GitLink): string { return encodeURIComponent(link.repositoryOwner) + '/' + encodeURIComponent(link.repositoryName); }
function branchPath(branch: string): string { return branch.split('/').map(encodeURIComponent).join('/'); }

export function validateBranch(branch: string): string {
  if (branch.length > 120 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) || branch.includes('..') || branch.includes('//') || branch.endsWith('/') || branch.endsWith('.lock') || branch.split('/').some(part => part.startsWith('.') || part.endsWith('.'))) {
    throw httpError(400, 'Branch name is invalid. Use letters, numbers, slash, dot, underscore, or hyphen.');
  }
  return branch;
}

export function normalizeGitPath(raw: string): string | null {
  const normalized = raw.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.includes('\0') || normalized.split('/').some(part => !part || part === '.' || part === '..')) return null;
  return normalized;
}

function isManagedPath(filePath: string): boolean {
  return Boolean(normalizeGitPath(filePath) && !PRIVATE_PATH.test(filePath) && !OMIT_DIR.test(filePath) && !BINARY_EXTENSION.test(filePath));
}

function projectFiles(raw: unknown): Map<string, string> {
  let tree: FileNode[];
  try { tree = Array.isArray(raw) ? raw as FileNode[] : typeof raw === 'string' ? JSON.parse(raw) as FileNode[] : []; }
  catch { throw httpError(422, 'The saved project file tree is invalid JSON.'); }
  if (!Array.isArray(tree)) throw httpError(422, 'The saved project file tree has an invalid format.');
  const result = new Map<string, string>();
  let bytes = 0;
  const visit = (nodes: FileNode[], prefix = '') => {
    for (const node of nodes) {
      if (!node || typeof node.name !== 'string' || !node.name || node.name.includes('/') || node.name.includes('\\') || node.name === '.' || node.name === '..' || !['file', 'folder'].includes(node.type)) continue;
      const filePath = prefix ? prefix + '/' + node.name : node.name;
      if (node.type === 'folder') { visit(Array.isArray(node.children) ? node.children : [], filePath); continue; }
      if (!isManagedPath(filePath) || typeof node.content !== 'string') continue;
      const size = Buffer.byteLength(node.content, 'utf8');
      if (size > 500_000 || node.content.includes('\0')) continue;
      bytes += size;
      if (bytes > MAX_WORKSPACE_BYTES || result.size >= MAX_FILES) throw httpError(413, 'Workspace exceeds FLOAT’s Git file or size limit.');
      result.set(filePath, node.content);
    }
  };
  visit(tree);
  return result;
}

function mapToTree(files: Map<string, string>, preserved: FileNode[] = []): FileNode[] {
  const root: FileNode[] = preserved;
  for (const [filePath, content] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    let level = root;
    const segments = filePath.split('/');
    for (let index = 0; index < segments.length; index += 1) {
      const name = segments[index];
      const isFile = index === segments.length - 1;
      let node = level.find(item => item.name === name && item.type === (isFile ? 'file' : 'folder'));
      if (!node) {
        node = isFile ? { id: 'git-' + shaId(filePath), name, type: 'file', content } : { id: 'git-' + shaId(segments.slice(0, index + 1).join('/')), name, type: 'folder', children: [] };
        level.push(node);
      } else if (isFile) node.content = content;
      if (!isFile) { node.children = node.children || []; level = node.children; }
    }
  }
  return root;
}

function preservedProjectFiles(raw: unknown): FileNode[] {
  let tree: FileNode[];
  try { tree = Array.isArray(raw) ? raw as FileNode[] : typeof raw === 'string' ? JSON.parse(raw) as FileNode[] : []; }
  catch { throw httpError(422, 'The saved project file tree is invalid JSON.'); }
  const filter = (nodes: FileNode[], prefix = ''): FileNode[] => nodes.flatMap(node => {
    if (!node || typeof node.name !== 'string' || !node.name || node.name.includes('/') || node.name.includes('\\')) return [];
    const filePath = prefix ? prefix + '/' + node.name : node.name;
    if (node.type === 'folder') {
      const children = filter(Array.isArray(node.children) ? node.children : [], filePath);
      return children.length || !isManagedPath(filePath) ? [{ ...node, children }] : [];
    }
    return node.type === 'file' && !isManagedPath(filePath) ? [{ ...node }] : [];
  });
  return filter(Array.isArray(tree) ? tree : []);
}

async function saveWorkspaceAndLink(ctx: GitContext, files: Map<string, string>, link: GitLink): Promise<void> {
  const serialized = JSON.stringify(mapToTree(files, preservedProjectFiles(ctx.project.files)));
  // Firestore limits each document to 1 MiB; reserve room for project metadata.
  if (Buffer.byteLength(serialized, 'utf8') > 950_000) throw httpError(413, 'Workspace snapshot is too large to persist safely in the FLOAT project store.');
  const linkRef = links().doc(ctx.projectId);
  await adminDb.runTransaction(async transaction => {
    transaction.update(ctx.projectRef, { files: serialized, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(linkRef, link);
  });
}

function shaId(value: string): string { return createHash('sha1').update(value).digest('hex').slice(0, 24); }
function gitBlobSha(content: string): string {
  const bytes = Buffer.from(content, 'utf8');
  return createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
}

function compareWorkspace(local: Map<string, string>, base: Record<string, RemoteFile>): Change[] {
  const changes: Change[] = [];
  for (const [filePath, content] of local) {
    if (!base[filePath]) changes.push({ path: filePath, status: 'added' });
    else if (base[filePath].sha !== gitBlobSha(content)) changes.push({ path: filePath, status: 'modified' });
  }
  for (const filePath of Object.keys(base)) if (!local.has(filePath)) changes.push({ path: filePath, status: 'deleted' });
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

function compareRemote(remote: Record<string, RemoteFile>, base: Record<string, RemoteFile>): Change[] {
  const changes: Change[] = [];
  for (const [filePath, entry] of Object.entries(remote)) {
    if (!base[filePath]) changes.push({ path: filePath, status: 'added' });
    else if (base[filePath].sha !== entry.sha) changes.push({ path: filePath, status: 'modified' });
  }
  for (const filePath of Object.keys(base)) if (!remote[filePath]) changes.push({ path: filePath, status: 'deleted' });
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

function httpError(status: number, message: string, details?: Record<string, unknown>): Error & { status: number; details?: Record<string, unknown> } {
  return Object.assign(new Error(message), { status, details });
}

function sendFailure(res: Response, error: any): void {
  const status = Number(error.status) || 500;
  res.status(status).json({ error: error.message || 'GitHub request failed.', ...(error.details || {}) });
}
