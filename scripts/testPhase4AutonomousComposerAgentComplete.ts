/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// 1. Polyfill browser/window globals for Code-OSS imports
if (typeof (globalThis as any).window === 'undefined') {
	const createElement = (tag: string) => {
		const children: any[] = [];
		const listeners: Record<string, Function[]> = {};
		const el: any = {
			tagName: tag.toUpperCase(),
			style: {} as Record<string, string>,
			classList: { add: () => {}, remove: () => {}, contains: () => false },
			children,
			childNodes: children,
			appendChild: (child: any) => { children.push(child); return child; },
			append: (...nodes: any[]) => {
				for (const n of nodes) {
					children.push(typeof n === 'string' ? { textContent: n } : n);
				}
			},
			remove: () => {},
			addEventListener: (evt: string, fn: Function) => {
				listeners[evt] = listeners[evt] || [];
				listeners[evt].push(fn);
			},
			removeEventListener: (evt: string, fn: Function) => {
				listeners[evt] = (listeners[evt] || []).filter(f => f !== fn);
			},
			dispatchEvent: (event: any) => {
				(listeners[event.type] || []).forEach(fn => fn(event));
			},
			focus: () => {},
			select: () => {},
			value: '',
			textContent: '',
			innerHTML: '',
			_listeners: listeners
		};
		return el;
	};

	(globalThis as any).location = { href: 'http://localhost/' };
	(globalThis as any).document = {
		location: (globalThis as any).location,
		createElement,
		getElementsByTagName: () => [],
		head: createElement('head'),
		body: createElement('body')
	};
	(globalThis as any).window = {
		location: (globalThis as any).location,
		document: (globalThis as any).document,
		addEventListener: () => {},
		removeEventListener: () => {}
	};
}

import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';

import { FloatMultiFileSyncDiffEditor } from '../desktop/src/vs/workbench/contrib/float/browser/diff/floatMultiFileSyncDiffEditor.js';
import { FloatTerminalPtyAgent } from '../desktop/src/vs/workbench/contrib/float/browser/terminal/floatTerminalPtyAgent.js';
import { FloatDagTaskPlanner } from '../desktop/src/vs/workbench/contrib/float/common/planner/floatDagTaskPlanner.js';
import { FloatDaemonServer } from '../daemon/src/server/floatDaemonServer.js';
import { FloatDaemonClient } from '../desktop/src/vs/workbench/contrib/float/common/daemon/floatDaemonClient.js';

console.log('================================================================');
console.log('FLOAT Studio: Phase 4 Autonomous Composer & Terminal Agent Suite');
console.log('Testing: Multi-File Diff Sync, Terminal PTY, DAG Task Planner');
console.log('================================================================\n');

async function runPhase4Suite() {
	let totalPassed = 0;

	// =========================================================================
	// 1. Synchronized Multi-File Diff Orchestrator & Per-Hunk Staging
	// =========================================================================
	console.log('--- Test 1: Synchronized Multi-File Diff Orchestrator ---');
	const diffEditor = new FloatMultiFileSyncDiffEditor();

	const origFile1 = `export function add(a: number, b: number) { return a + b; }\nexport function sub(a: number, b: number) { return a - b; }`;
	const propFile1 = `export function add(a: number, b: number) { return a + b + 0; }\nexport function sub(a: number, b: number) { return a - b; }\nexport function mul(a: number, b: number) { return a * b; }`;

	const origFile2 = `export class Circle { radius: number = 1; }`;
	const propFile2 = `export class Circle { radius: number = 1; }\nexport class Square { side: number = 1; }`;

	const session1 = diffEditor.loadDiff('src/math.ts', origFile1, propFile1);
	const session2 = diffEditor.loadDiff('src/geometry.ts', origFile2, propFile2);

	console.log(`[MultiDiff] Loaded ${session1.hunks.length} hunks in math.ts, ${session2.hunks.length} hunks in geometry.ts`);
	assert.ok(session1.hunks.length >= 1);
	assert.ok(session2.hunks.length >= 1);

	// Accept hunk in file 1, reject in file 2
	diffEditor.acceptHunk('src/math.ts', session1.hunks[0].hunkId);
	diffEditor.rejectHunk('src/geometry.ts', session2.hunks[0].hunkId);

	const stats = diffEditor.getAggregatedStats();
	console.log(`[MultiDiffStats] Files: ${stats.totalFiles}, Hunks: ${stats.totalHunks}, Accepted: ${stats.acceptedHunks}, Rejected: ${stats.rejectedHunks}`);
	assert.strictEqual(stats.totalFiles, 2);
	assert.strictEqual(stats.acceptedHunks, 1);
	assert.strictEqual(stats.rejectedHunks, 1);

	// Check final buffer computations
	const finalGeometry = diffEditor.computeFinalBuffer('src/geometry.ts');
	assert.strictEqual(finalGeometry, origFile2, 'Rejected diff must revert buffer to original');

	totalPassed++;
	console.log('✔ Synchronized Multi-File Diff Editor accurately stages and applies hunk decisions');

	// =========================================================================
	// 2. Terminal PTY Agent & ANSI Log Auto-Remediation
	// =========================================================================
	console.log('\n--- Test 2: Terminal PTY ANSI Stripping & Error Remediation ---');
	const ptyAgent = new FloatTerminalPtyAgent();

	// Test ANSI stripping & Node module missing
	const rawNodeLog = '\u001b[31mError:\u001b[0m Cannot find module \'zustand\'\n    at Function.Module._resolveFilename';
	const analysis1 = ptyAgent.analyzeTerminalOutput(rawNodeLog);
	assert.ok(!analysis1.cleanOutput.includes('\u001b'), 'ANSI escape sequences must be stripped');
	assert.ok(analysis1.detectedErrors.some(e => e.includes('zustand')));
	assert.strictEqual(analysis1.remediation?.type, 'install_package');
	assert.strictEqual(analysis1.remediation?.command, 'npm install zustand');

	// Test Python missing module
	const rawPyLog = 'ModuleNotFoundError: No module named \'scipy\'';
	const analysis2 = ptyAgent.analyzeTerminalOutput(rawPyLog);
	assert.strictEqual(analysis2.remediation?.type, 'install_package');
	assert.strictEqual(analysis2.remediation?.command, 'pip install scipy');

	// Test Git merge conflict
	const rawGitLog = 'CONFLICT (content): Merge conflict in src/app.ts\nAutomatic merge failed; fix conflicts and then commit the result.';
	const analysis3 = ptyAgent.analyzeTerminalOutput(rawGitLog);
	assert.strictEqual(analysis3.remediation?.type, 'fix_conflict');

	// Test Port conflict
	const rawPortLog = 'Error: listen EADDRINUSE: address already in use :::8080';
	const analysis4 = ptyAgent.analyzeTerminalOutput(rawPortLog);
	assert.strictEqual(analysis4.remediation?.type, 'kill_port');

	totalPassed++;
	console.log('✔ Terminal PTY Agent strips ANSI codes and synthesizes automated remediation commands');

	// =========================================================================
	// 3. Topological DAG Task Planner & Atomic Rollbacks
	// =========================================================================
	console.log('\n--- Test 3: Topological DAG Task Planner & Checkpoint Rollbacks ---');
	const planner = new FloatDagTaskPlanner();

	planner.addTask({ id: 'task-1', title: 'Prepare workspace', dependencies: [] });
	planner.addTask({ id: 'task-2', title: 'Compile TypeScript', dependencies: ['task-1'] });
	planner.addTask({ id: 'task-3', title: 'Run Unit Tests', dependencies: ['task-2'] });
	planner.addTask({ id: 'task-4', title: 'Bundle Distribution', dependencies: ['task-3'] });

	const batches = planner.getTopologicalBatches();
	assert.strictEqual(batches.length, 4, 'Linear dependency chain must produce 4 execution waves');
	assert.strictEqual(batches[0][0].id, 'task-1');
	assert.strictEqual(batches[1][0].id, 'task-2');
	assert.strictEqual(batches[2][0].id, 'task-3');
	assert.strictEqual(batches[3][0].id, 'task-4');

	// Successful execution run
	const successSummary = await planner.executePlan('Build and verify release', async () => true);
	assert.strictEqual(successSummary.success, true);
	assert.strictEqual(successSummary.completed, 4);
	assert.strictEqual(successSummary.failed, 0);

	// Failure with automated rollback
	const failPlanner = new FloatDagTaskPlanner();
	failPlanner.addTask({ id: 'step-1', title: 'Init', dependencies: [] });
	failPlanner.addTask({ id: 'step-2', title: 'Failing step', dependencies: ['step-1'] });
	failPlanner.addTask({ id: 'step-3', title: 'Downstream step', dependencies: ['step-2'] });

	const failSummary = await failPlanner.executePlan('Failing goal', async (id) => id !== 'step-2');
	assert.strictEqual(failSummary.success, false);
	assert.strictEqual(failSummary.completed, 1);
	assert.strictEqual(failSummary.failed, 1);
	assert.strictEqual(failSummary.rolledBack, 1);

	totalPassed++;
	console.log('✔ DAG Task Planner enforces topological ordering and triggers atomic rollbacks on failure');

	// =========================================================================
	// 4. Daemon IPC Phase 4 End-to-End Pipeline
	// =========================================================================
	console.log('\n--- Test 4: Daemon IPC Phase 4 End-to-End Pipeline ---');
	const pipeName = process.platform === 'win32'
		? `\\\\.\\pipe\\float-phase4-test-${Date.now()}`
		: path.join(os.tmpdir(), `float-phase4-test-${Date.now()}.sock`);

	const daemonServer = new FloatDaemonServer({ pipeName });
	await daemonServer.start();
	console.log(`[DaemonServer] Running on pipe: ${pipeName}`);

	const daemonClient = new FloatDaemonClient({ pipeName });
	await daemonClient.connect();
	console.log('[DaemonClient] Connected to daemon');

	// 1. Test multi diff review over IPC
	const diffIpcRes = await daemonClient.reviewMultiDiff({
		files: [{ filePath: 'src/config.ts', originalContent: 'const a = 1;', proposedContent: 'const a = 2;' }],
		action: 'accept_all'
	});
	assert.ok(diffIpcRes.totalFiles >= 1);
	assert.ok(diffIpcRes.acceptedHunks >= 1);

	// 2. Test terminal PTY analysis over IPC
	const ptyIpcRes = await daemonClient.analyzeTerminalPty(rawNodeLog);
	assert.strictEqual(ptyIpcRes.remediation?.command, 'npm install zustand');

	// 3. Test DAG plan and execute over IPC
	const dagIpcRes = await daemonClient.executeDagPlan('Execute pipeline', [
		{ id: 't1', title: 'Step 1', dependencies: [] },
		{ id: 't2', title: 'Step 2', dependencies: ['t1'] }
	]);
	assert.strictEqual(dagIpcRes.success, true);
	assert.strictEqual(dagIpcRes.completed, 2);

	// Clean up
	daemonClient.dispose();
	await daemonServer.stop();

	totalPassed++;
	console.log('✔ Daemon IPC Phase 4 pipeline verified across multi-diff, terminal PTY, and DAG planner');

	console.log('\n================================================================');
	console.log(`SUCCESS: All ${totalPassed} Phase 4 Autonomous Composer Agent tests PASSED!`);
	console.log('================================================================');
}

runPhase4Suite().catch(err => {
	console.error('FAILED testPhase4AutonomousComposerAgentComplete:', err);
	process.exit(1);
});
