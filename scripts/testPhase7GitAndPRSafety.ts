/**
 * Phase 7 Verification Suite: Git, PRs & Review Safety
 * Verifies:
 * 1. Agents and automated reviewers are strictly blocked from submitting event: 'APPROVE' (HTTP 403).
 * 2. AI PR diff review generates COMMENT-only reviews and detects hardcoded secrets/eval/TODOs.
 * 3. Commit message and PR description synthesis from diffs + conflict detection vs base branch.
 * 4. Detached HEAD protection rejects 'HEAD', 40-char SHAs, and empty branch refs with HTTP 409.
 */
import assert from 'node:assert/strict';
import {
  assertSafeAgentReviewEvent,
  approveAgentTaskPullRequest,
  analyzePullRequestDiff,
  synthesizeCommitMessageFromDiff,
  synthesizePullRequestDescriptionFromDiff,
  assertNotDetachedHead,
} from '../src/server/github/gitRouter';

async function runPhase7Tests() {
  console.log('=== Phase 7 Verification: Git, PRs & Review Safety ===\n');

  // 1. Agent PR Self-Approval Guard
  console.log('1. Testing Agent PR Self-Approval Guard (assertSafeAgentReviewEvent & approveAgentTaskPullRequest)...');
  assert.equal(assertSafeAgentReviewEvent('COMMENT'), 'COMMENT');

  let blockedApprove = false;
  try {
    assertSafeAgentReviewEvent('APPROVE');
  } catch (err: any) {
    blockedApprove = true;
    assert.equal(err.status, 403);
    assert.match(err.message, /not permitted to submit an APPROVE review/i);
  }
  assert.equal(blockedApprove, true, 'assertSafeAgentReviewEvent must throw HTTP 403 on APPROVE');

  let blockedTaskApprove = false;
  try {
    await approveAgentTaskPullRequest({ id: 'task-1', projectId: 'proj-1' }, 'user-1');
  } catch (err: any) {
    blockedTaskApprove = true;
    assert.equal(err.status, 403);
    assert.match(err.message, /not permitted to submit an APPROVE review|cannot self-approve/i);
  }
  assert.equal(blockedTaskApprove, true, 'approveAgentTaskPullRequest must reject self-approval with HTTP 403');
  console.log('   ✓ Agent self-approval strictly blocked with HTTP 403.\n');

  // 2. AI PR Diff Analysis (COMMENT-only)
  console.log('2. Testing AI Pull Request Diff Reviewer (COMMENT-only)...');
  const analysis = analyzePullRequestDiff([
    {
      filename: 'src/auth/config.ts',
      status: 'modified',
      additions: 5,
      deletions: 1,
      patch: [
        '@@ -1,3 +1,7 @@',
        ' export const config = {',
        '+  apiKey: "sk_live_9876543210abcdef12345",',
        '+  // TODO: move to env',
        '+  run: (code: string) => eval(code),',
        ' };',
      ].join('\n'),
    },
  ]);

  assert.equal(analysis.event, 'COMMENT', 'AI review event must strictly be COMMENT');
  assert.equal(analysis.findings.some((f) => f.severity === 'critical'), true, 'Must detect hardcoded secret');
  assert.equal(analysis.findings.some((f) => f.severity === 'warning'), true, 'Must detect eval()');
  assert.equal(analysis.findings.some((f) => f.severity === 'info'), true, 'Must detect TODO');
  assert.match(analysis.markdownReport, /COMMENT/);
  console.log('   ✓ AI PR review outputs COMMENT event and surfaces critical/warning/info findings.\n');

  // 3. Commit Message & PR Description Synthesis + Conflict Reporting
  console.log('3. Testing Commit Message & PR Description Synthesis from Diff...');
  const changes = [
    { path: 'src/server/github/gitRouter.ts', status: 'modified' as const },
    { path: 'src/features/git/GitPanel.tsx', status: 'modified' as const },
  ];
  const patches = [
    {
      path: 'src/server/github/gitRouter.ts',
      status: 'modified',
      patch: '--- a/src/server/github/gitRouter.ts\n+++ b/src/server/github/gitRouter.ts\n@@ -1,2 +1,4 @@\n+export function assertSafeAgentReviewEvent() {}\n+export function analyzePullRequestDiff() {}\n',
    },
  ];
  const commitMsg = synthesizeCommitMessageFromDiff(changes, patches);
  assert.ok(commitMsg.subject.length > 0 && commitMsg.subject.length <= 72);
  assert.match(commitMsg.subject, /gitRouter\.ts/);
  assert.match(commitMsg.body, /Diff stats: \+2 \/ -0 lines/);

  const prDesc = synthesizePullRequestDescriptionFromDiff({
    branch: 'feat/pr-safety',
    baseBranch: 'main',
    changes,
    patches,
    conflicts: ['src/server/github/gitRouter.ts'],
  });
  assert.equal(prDesc.hasConflicts, true);
  assert.deepEqual(prDesc.conflicts, ['src/server/github/gitRouter.ts']);
  assert.match(prDesc.body, /Detected 1 potential conflict/i);
  console.log('   ✓ Commit message & PR description synthesis + conflict detection verified.\n');

  // 4. Detached HEAD Guard
  console.log('4. Testing Detached HEAD Guard...');
  assert.doesNotThrow(() => assertNotDetachedHead('main'));
  assert.doesNotThrow(() => assertNotDetachedHead('feat/cursor-review'));

  for (const invalidBranch of ['', 'HEAD', 'a1b2c3d4e5f60123456789abcdef0123456789ab']) {
    let threw409 = false;
    try {
      assertNotDetachedHead(invalidBranch);
    } catch (err: any) {
      threw409 = err.status === 409;
    }
    assert.equal(threw409, true, `Expected HTTP 409 for detached HEAD input "${invalidBranch}"`);
  }
  console.log('   ✓ Detached HEAD states rejected with actionable HTTP 409 error.\n');

  console.log('ALL PHASE 7 CHECKS PASSED!');
}

runPhase7Tests().catch((err) => {
  console.error('Phase 7 verification failed:', err);
  process.exit(1);
});
