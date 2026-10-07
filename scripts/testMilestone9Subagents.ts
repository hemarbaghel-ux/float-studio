import assert from 'assert';
import { MultiAgentCoordinator, SubagentTaskSpec } from '../src/server/agent/subagents';

console.log('=== FLOAT AI Milestone 9: Multi-Agent & Subagents Verification ===\n');

async function runTests() {
  try {
    // 1. Delegation across specialized roles
    console.log('--- Test 1: Subagent Role Delegation ---');
    const tasks: SubagentTaskSpec[] = [
      { role: 'explorer', instructions: 'Find all authentication modules' },
      { role: 'planner', instructions: 'Draft implementation plan' },
      { role: 'coder', instructions: 'Write proposed session handler' },
      { role: 'tester', instructions: 'Formulate assertions for token validation' },
      { role: 'reviewer', instructions: 'Review proposal for security' }
    ];

    const { results, summary } = await MultiAgentCoordinator.coordinate(
      'Refactor session management',
      tasks,
      { userId: 'u1', projectId: 'p1' }
    );

    assert.strictEqual(results.length, 5, 'All 5 subagent tasks processed');
    assert.ok(results.every(r => r.success), 'All subagent tasks succeeded');
    assert.ok(results.some(r => r.role === 'explorer'), 'Explorer executed');
    assert.ok(results.some(r => r.role === 'tester'), 'Tester executed');
    assert.ok(summary.includes('Coordinator synthesized 5/5'), 'Summary synthesizes all findings');
    console.log('[PASS] Coordinated delegation and findings synthesis verified');

    // 2. Cancellation via AbortController
    console.log('\n--- Test 2: Multi-Agent Cancellation ---');
    const abortCtrl = new AbortController();
    abortCtrl.abort(); // already aborted

    const cancelledRun = await MultiAgentCoordinator.coordinate(
      'Aborted task',
      [{ role: 'debugger', instructions: 'Trace error' }],
      { userId: 'u1', projectId: 'p1', signal: abortCtrl.signal }
    );

    assert.strictEqual(cancelledRun.results[0]?.success, false, 'Subagent stopped on abort signal');
    assert.ok(cancelledRun.results[0]?.error?.includes('cancelled'), 'Error indicates cancellation');
    console.log('[PASS] Cancellation cleanly halts subagent execution');

    console.log('\n==================================================');
    console.log('Milestone 9 Subagents: All 2 suites passed!');
    console.log('==================================================\n');
  } catch (err: any) {
    console.error('[FAIL] Subagents verification failed:', err);
    process.exit(1);
  }
}

runTests();
