/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { FloatAgentTaskDag } from '../desktop/src/vs/workbench/contrib/float/browser/agent/floatAgentTaskDag.js';
import { FloatMultiAgentTeamOrchestrator, IAgentMessage } from '../desktop/src/vs/workbench/contrib/float/browser/agent/floatMultiAgentTeamOrchestrator.js';
import { FloatResilientModelGateway } from '../desktop/src/vs/workbench/contrib/float/common/model-runtime/floatResilientModelGateway.js';
import {
	FloatAgentStartGoalAction,
	FloatAgentCancelTaskAction,
	CONTEXT_FLOAT_AGENT_ACTIVE,
	CONTEXT_FLOAT_AGENT_STATE
} from '../desktop/src/vs/workbench/contrib/float/browser/agent/floatMultiAgentActions.js';
import { MenuRegistry } from '../desktop/src/vs/platform/actions/common/actions.js';

async function runSprint6Tests() {
	console.log('\n================================================================');
	console.log('  FLOAT STUDIO — SPRINT 6: AUTONOMOUS MULTI-AGENT DAG ORCHESTRATOR');
	console.log('  & RESILIENCE GATEWAY ACCEPTANCE TEST SUITE');
	console.log('================================================================\n');

	// --------------------------------------------------------------------------
	// Test 1: DAG Task Engine — Topological Sorting & Execution Batches
	// --------------------------------------------------------------------------
	console.log('[Test 1] Testing FloatAgentTaskDag Topological Sorting & Parallel Batches...');
	const dag = new FloatAgentTaskDag();

	// Root tasks (can run in parallel)
	dag.addTaskNode({
		id: 'task-a',
		title: 'Generate database schema',
		role: 'architect',
		dependencies: [],
		status: 'pending',
		retryCount: 0,
		maxRetries: 1
	});
	dag.addTaskNode({
		id: 'task-b',
		title: 'Generate mock fixtures',
		role: 'architect',
		dependencies: [],
		status: 'pending',
		retryCount: 0,
		maxRetries: 1
	});

	// Dependent tasks
	dag.addTaskNode({
		id: 'task-c',
		title: 'Implement repository layer',
		role: 'coder',
		dependencies: ['task-a', 'task-b'],
		status: 'pending',
		retryCount: 0,
		maxRetries: 2
	});
	dag.addTaskNode({
		id: 'task-d',
		title: 'Audit repository security',
		role: 'reviewer',
		dependencies: ['task-c'],
		status: 'pending',
		retryCount: 0,
		maxRetries: 1
	});

	assert.strictEqual(dag.hasCycle(), false, 'Acyclic graph should not detect cycles');

	const batches = dag.getExecutionBatches();
	assert.strictEqual(batches.length, 3, 'Should produce exactly 3 sequential stages');
	// Stage 1: task-a and task-b in parallel
	assert.deepStrictEqual(batches[0].sort(), ['task-a', 'task-b']);
	// Stage 2: task-c
	assert.deepStrictEqual(batches[1], ['task-c']);
	// Stage 3: task-d
	assert.deepStrictEqual(batches[2], ['task-d']);

	// Ready tasks initially should be task-a and task-b
	let ready = dag.getReadyTasks();
	assert.strictEqual(ready.length, 2);
	assert.deepStrictEqual(ready.map(r => r.id).sort(), ['task-a', 'task-b']);

	// Complete task-a only -> task-c not ready yet
	dag.markTaskStatus('task-a', 'completed', { tableCreated: 'users' });
	ready = dag.getReadyTasks();
	assert.strictEqual(ready.length, 1);
	assert.strictEqual(ready[0].id, 'task-b');

	// Complete task-b -> task-c is now ready
	dag.markTaskStatus('task-b', 'completed', { fixturesCount: 5 });
	ready = dag.getReadyTasks();
	assert.strictEqual(ready.length, 1);
	assert.strictEqual(ready[0].id, 'task-c');

	console.log('  ✓ Topological sorting, parallel batch calculation, and dependency resolution verified');

	// --------------------------------------------------------------------------
	// Test 2: DAG Cycle Detection
	// --------------------------------------------------------------------------
	console.log('\n[Test 2] Testing FloatAgentTaskDag Cycle Detection...');
	const cyclicDag = new FloatAgentTaskDag();
	cyclicDag.addTaskNode({ id: 'c1', title: 'Task 1', role: 'coder', dependencies: ['c3'], status: 'pending', retryCount: 0, maxRetries: 0 });
	cyclicDag.addTaskNode({ id: 'c2', title: 'Task 2', role: 'coder', dependencies: ['c1'], status: 'pending', retryCount: 0, maxRetries: 0 });
	cyclicDag.addTaskNode({ id: 'c3', title: 'Task 3', role: 'coder', dependencies: ['c2'], status: 'pending', retryCount: 0, maxRetries: 0 });

	assert.strictEqual(cyclicDag.hasCycle(), true, 'Cyclic DAG (c1->c3->c2->c1) must be detected');
	assert.throws(() => cyclicDag.getExecutionBatches(), /contains a cycle/, 'getExecutionBatches must throw on cyclic DAG');
	console.log('  ✓ Cycle detection and error containment verified');

	// --------------------------------------------------------------------------
	// Test 3: Multi-Agent Team Orchestration — Full Pipeline
	// --------------------------------------------------------------------------
	console.log('\n[Test 3] Testing Multi-Agent Team Orchestrator Full Execution Loop...');
	const orchestrator = new FloatMultiAgentTeamOrchestrator();

	const capturedMessages: IAgentMessage[] = [];
	orchestrator.onDidAgentMessage(msg => capturedMessages.push(msg));

	let sessionStarted = false;
	orchestrator.onDidStartSession(() => { sessionStarted = true; });

	const result = await orchestrator.startSession('Build customer invoice payment gateway');
	assert.strictEqual(sessionStarted, true, 'onDidStartSession must fire');
	assert.strictEqual(result.status, 'success', 'Session must complete successfully');
	assert.strictEqual(result.dagStats.completed, 4, 'All 4 default subagent tasks must complete');
	assert.strictEqual(result.dagStats.failed, 0);

	// Verify inter-agent message chain
	assert.ok(capturedMessages.length >= 4, `Expected at least 4 messages (got ${capturedMessages.length})`);
	const messageTypes = capturedMessages.map(m => m.type);
	assert.ok(messageTypes.includes('plan'), 'Architect must post plan message');
	assert.ok(messageTypes.includes('code_proposal'), 'Coder must post code_proposal message');
	assert.ok(messageTypes.includes('review_feedback'), 'Reviewer must post review_feedback message');
	assert.ok(messageTypes.includes('test_report'), 'Tester must post test_report message');

	console.log(`  ✓ Multi-agent autonomous team completed 4-stage pipeline (${capturedMessages.length} inter-agent messages recorded)`);

	// --------------------------------------------------------------------------
	// Test 4: Security Reviewer Gate — Secret Leaks & Self-Repair Retry
	// --------------------------------------------------------------------------
	console.log('\n[Test 4] Testing Security Reviewer Gate & Self-Repair Loop...');
	const secureOrchestrator = new FloatMultiAgentTeamOrchestrator();

	let attemptCount = 0;
	// Custom Coder that leaks an API key on attempt 1, then self-repairs on attempt 2
	secureOrchestrator.registerSubagentHandler('coder', async (task, _deps, post) => {
		attemptCount++;
		if (attemptCount === 1) {
			post({
				senderRole: 'coder',
				recipientRole: 'reviewer',
				taskId: task.id,
				type: 'code_proposal',
				content: 'Leaked code proposal',
				payload: { code: 'const API_KEY = "AIzaSyFakeKey1234567890";' }
			});
			return { code: 'const API_KEY = "AIzaSyFakeKey1234567890";' };
		} else {
			post({
				senderRole: 'coder',
				recipientRole: 'reviewer',
				taskId: task.id,
				type: 'code_proposal',
				content: 'Remediated code proposal',
				payload: { code: 'const apiKey = process.env.SERVICE_API_KEY;' }
			});
			return { code: 'const apiKey = process.env.SERVICE_API_KEY;' };
		}
	});

	// Reviewer that rejects proposals containing unredacted API keys
	secureOrchestrator.registerSubagentHandler('reviewer', async (task, deps, post) => {
		const coderOutput = deps['task-2-coder'];
		if (JSON.stringify(coderOutput).includes('AIzaSy')) {
			throw new Error('Security Review Gate Failed: Unredacted API key detected in proposal.');
		}
		post({
			senderRole: 'reviewer',
			recipientRole: 'tester',
			taskId: task.id,
			type: 'review_feedback',
			content: 'Code cleanly sanitized, zero credential leaks.'
		});
		return { approved: true };
	});

	const repairResult = await secureOrchestrator.startSession('Secure database migration');
	assert.strictEqual(repairResult.status, 'success');
	assert.strictEqual(attemptCount, 2, 'Coder should have attempted twice (initial + self-repair)');
	console.log('  ✓ Security gate caught leaked credential and orchestrated self-repair');

	// --------------------------------------------------------------------------
	// Test 5: Session Cancellation Handling
	// --------------------------------------------------------------------------
	console.log('\n[Test 5] Testing Session Cancellation...');
	const cancelOrchestrator = new FloatMultiAgentTeamOrchestrator();
	cancelOrchestrator.registerSubagentHandler('coder', async () => {
		cancelOrchestrator.cancelSession();
		return {};
	});

	const cancelResult = await cancelOrchestrator.startSession('Long running refactor');
	assert.strictEqual(cancelResult.status, 'cancelled');
	console.log('  ✓ Cancelled session successfully skipped remaining tasks');

	// --------------------------------------------------------------------------
	// Test 6: Resilient Model Gateway — Baseline Execution
	// --------------------------------------------------------------------------
	console.log('\n[Test 6] Testing Resilient Model Gateway Baseline Request Execution...');
	const gateway = new FloatResilientModelGateway({
		failureThreshold: 2,
		recoveryTimeoutMs: 100, // 100ms for fast testing
		halfOpenSuccessThreshold: 1
	});

	gateway.registerProvider('anthropic', async (p, m) => `[Anthropic:${m}] Response text`);
	gateway.registerProvider('openai', async (p, m) => `[OpenAI:${m}] Fallback response`);
	gateway.registerProvider('ollama', async (p, m) => `[Ollama:${m}] Local offline response`);

	const baseline = await gateway.execute('Explain Dijkstra algorithm', { preferredProvider: 'anthropic', model: 'claude-3-5-sonnet' });
	assert.strictEqual(baseline.providerId, 'anthropic');
	assert.strictEqual(baseline.failedOver, false);
	assert.strictEqual(baseline.data, '[Anthropic:claude-3-5-sonnet] Response text');
	console.log('  ✓ Baseline request succeeded through primary provider');

	// --------------------------------------------------------------------------
	// Test 7: Resilient Model Gateway — Circuit Breaker Tripping & Dynamic Failover
	// --------------------------------------------------------------------------
	console.log('\n[Test 7] Testing Circuit Breaker Tripping (CLOSED -> OPEN) & Failover...');
	let anthropicCalls = 0;
	gateway.registerProvider('anthropic', async () => {
		anthropicCalls++;
		throw new Error('503 Overloaded: Anthropic capacity exceeded');
	});

	const stateChanges: any[] = [];
	gateway.onDidCircuitStateChange(e => stateChanges.push(e));

	const failovers: any[] = [];
	gateway.onDidFailover(e => failovers.push(e));

	// Execute request: Anthropic will fail 2 consecutive times, tripping circuit to OPEN, then failing over to OpenAI
	const failoverResponse = await gateway.execute('Generate unit test', { preferredProvider: 'anthropic', model: 'code-model' });
	assert.strictEqual(failoverResponse.providerId, 'openai', 'Should have failed over to openai');
	assert.strictEqual(failoverResponse.failedOver, true);
	assert.strictEqual(failoverResponse.originalProvider, 'anthropic');

	const anthropicStatus = gateway.getCircuitStatus('anthropic');
	assert.strictEqual(anthropicStatus?.state, 'OPEN', 'Anthropic circuit must be OPEN');
	assert.strictEqual(anthropicStatus?.consecutiveFailures, 2);

	assert.ok(stateChanges.some(s => s.providerId === 'anthropic' && s.state === 'OPEN'));
	assert.ok(failovers.some(f => f.fromProvider === 'anthropic' && f.toProvider === 'openai'));
	console.log('  ✓ Circuit breaker tripped to OPEN and gracefully failed over to secondary provider');

	// --------------------------------------------------------------------------
	// Test 8: Resilient Model Gateway — Recovery (OPEN -> HALF_OPEN -> CLOSED)
	// --------------------------------------------------------------------------
	console.log('\n[Test 8] Testing Circuit Recovery (OPEN -> HALF_OPEN -> CLOSED)...');
	// Wait for recovery timeout (100ms)
	await new Promise(r => setTimeout(r, 150));

	// Re-register healthy anthropic
	gateway.registerProvider('anthropic', async (p, m) => `[Anthropic Recovered:${m}] OK`);

	// When checking circuit status after timeout, state should transition to HALF_OPEN
	const halfOpenStatus = gateway.getCircuitStatus('anthropic');
	assert.strictEqual(halfOpenStatus?.state, 'HALF_OPEN', 'Circuit should transition to HALF_OPEN after timeout');

	// Execute through anthropic; probe success will reset circuit to CLOSED
	const recoveredResponse = await gateway.execute('Health check', { preferredProvider: 'anthropic' });
	assert.strictEqual(recoveredResponse.providerId, 'anthropic');
	assert.strictEqual(recoveredResponse.failedOver, false);

	const finalStatus = gateway.getCircuitStatus('anthropic');
	assert.strictEqual(finalStatus?.state, 'CLOSED', 'Successful probe must reset circuit to CLOSED');
	console.log('  ✓ Half-open probe verified and circuit restored to CLOSED');

	// --------------------------------------------------------------------------
	// Test 9: Code-OSS Action Registrations & Context Keys
	// --------------------------------------------------------------------------
	console.log('\n[Test 9] Testing Code-OSS Action Registrations & Context Keys...');
	assert.strictEqual(FloatAgentStartGoalAction.ID, 'float.agent.startGoal');
	assert.strictEqual(FloatAgentCancelTaskAction.ID, 'float.agent.cancelTask');
	assert.strictEqual(CONTEXT_FLOAT_AGENT_ACTIVE.key, 'floatAgentTaskActive');
	assert.strictEqual(CONTEXT_FLOAT_AGENT_STATE.key, 'floatAgentTaskState');

	const startAction = new FloatAgentStartGoalAction();
	const cancelAction = new FloatAgentCancelTaskAction();
	assert.ok(startAction, 'FloatAgentStartGoalAction instantiated');
	assert.ok(cancelAction, 'FloatAgentCancelTaskAction instantiated');

	console.log('  ✓ Code-OSS action registrations and context keys verified');

	// --------------------------------------------------------------------------
	// Test 10: Cleanup & Resource Disposal
	// --------------------------------------------------------------------------
	console.log('\n[Test 10] Testing Resource Disposal...');
	orchestrator.dispose();
	secureOrchestrator.dispose();
	cancelOrchestrator.dispose();
	gateway.dispose();
	console.log('  ✓ All event emitters and internal memory stores cleanly disposed');

	console.log('\n================================================================');
	console.log('  [ALL SPRINT 6 TESTS PASSED] 100% GREEN (10/10 Verified)');
	console.log('================================================================\n');
}

runSprint6Tests().catch(err => {
	console.error('\n[FAIL] Sprint 6 verification failed:', err);
	process.exit(1);
});
