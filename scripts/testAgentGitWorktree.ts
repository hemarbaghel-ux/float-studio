import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const testRoot = await mkdtemp(path.join(os.tmpdir(), 'float-agent-worktree-tests-'));
process.env.FLOAT_AGENT_WORKTREE_ROOT = path.join(testRoot, 'worktrees');
const { applyAgentChangesToWorktree, cleanupAgentGitWorktree, createAgentGitWorktree, getAgentWorktreeStatus } = await import('../src/server/agent/agentGitWorktree');

try {
  const taskId = 'task-git-isolation';
  const ownerId = 'owner-git-isolation';
  const sourceSnapshot = [{ path: 'src/index.ts', content: 'export const value = 1;\n' }];
  const worktree = await createAgentGitWorktree(taskId, ownerId, sourceSnapshot);
  assert.equal(execFileSync('git', ['-C', worktree.worktreePath, 'branch', '--show-current'], { encoding: 'utf8' }).trim(), worktree.branch);
  assert.match(worktree.branch, /^agent\//);
  assert.notEqual(path.resolve(worktree.worktreePath), process.cwd());
  console.log('[PASS] Creates an actual task-owned Git branch and linked worktree');

  let rejectedTraversal = false;
  try { await applyAgentChangesToWorktree(taskId, ownerId, [{ path: '../escape.txt', operation: 'create', proposedContent: 'bad' }]); }
  catch { rejectedTraversal = true; }
  assert.equal(rejectedTraversal, true);
  console.log('[PASS] Rejects path traversal before writing to the worktree');

  const result = await applyAgentChangesToWorktree(taskId, ownerId, [{ path: 'src/index.ts', operation: 'modify', proposedContent: 'export const value = 2;\n' }]);
  assert.equal(result.branch, worktree.branch);
  assert.match(result.diff, /-export const value = 1/);
  assert.match(result.diff, /\+export const value = 2/);
  assert.equal(sourceSnapshot[0].content, 'export const value = 1;\n');
  assert.equal(await readFile(path.join(worktree.worktreePath, 'src/index.ts'), 'utf8'), 'export const value = 2;\n');
  console.log('[PASS] Generates the real branch diff without modifying the source snapshot');

  const status = await getAgentWorktreeStatus(taskId, ownerId);
  assert.equal(status.diff, result.diff);
  assert.notEqual(status.baseCommit, '');
  console.log('[PASS] Exposes the persisted-reviewable diff and baseline commit');

  const isolatedRoot = worktree.root;
  await cleanupAgentGitWorktree(taskId, ownerId);
  let removed = false;
  try { await stat(isolatedRoot); } catch (error: any) { removed = error?.code === 'ENOENT'; }
  assert.equal(removed, true);
  assert.equal((await readdir(path.join(testRoot, 'worktrees'))).some(entry => entry.startsWith('float-agent-')), false);
  console.log('[PASS] Removes the task worktree and branch repository after review data is captured');
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
