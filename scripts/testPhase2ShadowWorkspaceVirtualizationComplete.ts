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
import * as fs from 'fs';
import * as os from 'os';

import { FloatShadowWorkspaceManager } from '../daemon/src/shadow/floatShadowWorkspaceManager.js';
import { FloatSandboxedProcessRunner } from '../daemon/src/sandbox/floatSandboxedProcessRunner.js';
import { FloatShadowDiagnosticDiffCollector } from '../desktop/src/vs/workbench/contrib/float/common/shadow/floatShadowDiagnosticDiffCollector.js';
import { FloatDaemonServer } from '../daemon/src/server/floatDaemonServer.js';
import { FloatDaemonClient } from '../desktop/src/vs/workbench/contrib/float/common/daemon/floatDaemonClient.js';

console.log('================================================================');
console.log('FLOAT Studio: Phase 2 True Shadow Workspace Virtualization Suite');
console.log('Testing: CoW Shadow Trees, Sandboxed Process Runner, Diagnostics');
console.log('================================================================\n');

async function runPhase2Suite() {
	let totalPassed = 0;

	// Setup mock source workspace
	const mockSourceRoot = path.join(os.tmpdir(), `float-source-ws-${Date.now()}`);
	fs.mkdirSync(path.join(mockSourceRoot, 'src'), { recursive: true });
	fs.writeFileSync(path.join(mockSourceRoot, 'package.json'), JSON.stringify({ name: 'mock-app' }), 'utf8');
	fs.writeFileSync(path.join(mockSourceRoot, 'src/index.ts'), 'export const version = "1.0.0";', 'utf8');
	fs.writeFileSync(path.join(mockSourceRoot, 'src/utils.ts'), 'export function add(a: number, b: number) { return a + b; }', 'utf8');

	// =========================================================================
	// 1. Copy-on-Write Shadow Workspace Manager
	// =========================================================================
	console.log('--- Test 1: Copy-on-Write (CoW) Shadow Workspace Isolation ---');
	const shadowManager = new FloatShadowWorkspaceManager();

	const session = await shadowManager.createShadowWorkspace(mockSourceRoot);
	console.log(`[ShadowManager] Created shadow session: ${session.sessionId} at ${session.shadowRoot}`);
	assert.strictEqual(session.trackedFiles.size, 3, 'Must track 3 files from source workspace');

	// Verify original file content before shadow edit
	const originalContentBefore = fs.readFileSync(path.join(mockSourceRoot, 'src/index.ts'), 'utf8');

	// Apply edit inside shadow workspace
	await shadowManager.applyShadowEdit(session.sessionId, 'src/index.ts', 'export const version = "2.0.0-PROPOSAL";');
	// Add new file in shadow workspace
	await shadowManager.applyShadowEdit(session.sessionId, 'src/feature.ts', 'export function newFeature() {}');

	// 1. CRITICAL: Developer's source workspace must be 100% UNTOUCHED
	const originalContentAfter = fs.readFileSync(path.join(mockSourceRoot, 'src/index.ts'), 'utf8');
	assert.strictEqual(originalContentAfter, originalContentBefore, 'Live workspace must remain 100% untouched');
	assert.strictEqual(fs.existsSync(path.join(mockSourceRoot, 'src/feature.ts')), false, 'New file must not exist in live workspace');

	// 2. Shadow workspace must reflect proposed edits
	const shadowContent = fs.readFileSync(path.join(session.shadowRoot, 'src/index.ts'), 'utf8');
	assert.strictEqual(shadowContent, 'export const version = "2.0.0-PROPOSAL";');

	// 3. Diff verification
	const diff = shadowManager.getShadowDiff(session.sessionId);
	assert.strictEqual(diff.modifiedFiles.length, 1);
	assert.strictEqual(diff.modifiedFiles[0], 'src/index.ts');
	assert.strictEqual(diff.addedFiles.length, 1);
	assert.strictEqual(diff.addedFiles[0], 'src/feature.ts');
	assert.strictEqual(diff.totalChanges, 2);

	// 4. Teardown
	await shadowManager.teardownSession(session.sessionId);
	assert.strictEqual(fs.existsSync(session.shadowRoot), false, 'Shadow directory must be cleaned up on teardown');

	totalPassed++;
	console.log('✔ CoW Shadow Workspace guarantees zero-disk-mutation isolation for developer workspace');

	// =========================================================================
	// 2. Sandboxed Process Runner
	// =========================================================================
	console.log('\n--- Test 2: Sandboxed Process Runner & Security Boundary ---');
	const sandboxRunner = new FloatSandboxedProcessRunner();

	// Permitted toolchain execution
	const execRes = await sandboxRunner.runInShadowWorkspace(mockSourceRoot, 'node', [
		'-e',
		'console.log("SANDBOX_STDOUT_CHECK"); console.error("SANDBOX_STDERR_CHECK");'
	]);
	assert.strictEqual(execRes.exitCode, 0);
	assert.ok(execRes.stdout.includes('SANDBOX_STDOUT_CHECK'), 'Must capture stdout');
	assert.ok(execRes.stderr.includes('SANDBOX_STDERR_CHECK'), 'Must capture stderr');
	assert.strictEqual(execRes.timedOut, false);

	// Security: Non-permitted command blocking
	let caughtSecurityError = false;
	try {
		await sandboxRunner.runInShadowWorkspace(mockSourceRoot, 'curl', ['https://evil.com']);
	} catch (err: any) {
		caughtSecurityError = true;
		assert.ok(err.message.includes('not permitted'));
	}
	assert.strictEqual(caughtSecurityError, true, 'Must strictly reject non-whitelisted commands');

	// Timeout enforcement
	const timeoutRes = await sandboxRunner.runInShadowWorkspace(mockSourceRoot, 'node', [
		'-e',
		'setInterval(() => {}, 1000);'
	], { timeoutMs: 300 });
	assert.strictEqual(timeoutRes.timedOut, true, 'Runner must enforce timeout bounds and terminate child process');

	totalPassed++;
	console.log('✔ Sandboxed process runner enforces command whitelisting and timeout killswitches');

	// =========================================================================
	// 3. Shadow Diagnostic Diff Collector
	// =========================================================================
	console.log('\n--- Test 3: Shadow Diagnostic Interception & Repair Prompt Synthesis ---');
	const diagnosticCollector = new FloatShadowDiagnosticDiffCollector();

	const mockCompilerOutput = `
src/app.ts(42,10): error TS2322: Type 'number' is not assignable to type 'string'.
src/app.ts(55,1): warning TS6133: 'unusedVar' is declared but its value is never read.
--> src/main.rs:14:5
server/router.go:12:9: undefined: handleRequest
Traceback (most recent call last):
  File "server.py", line 15, in <module>
`;

	const diagnostics = diagnosticCollector.parseDiagnostics(mockCompilerOutput);
	assert.strictEqual(diagnostics.length, 5, 'Must extract 5 diagnostics across TypeScript, Rust, Go, Python');

	const tsDiag = diagnostics.find(d => d.code === 'TS2322');
	assert.ok(tsDiag, 'Must parse TypeScript error code');
	assert.strictEqual(tsDiag?.filePath, 'src/app.ts');
	assert.strictEqual(tsDiag?.line, 42);
	assert.strictEqual(tsDiag?.column, 10);
	assert.strictEqual(tsDiag?.severity, 'error');

	const repairPrompt = diagnosticCollector.generateRepairPrompt(diagnostics);
	assert.ok(repairPrompt.includes('TS2322'), 'Repair prompt must include diagnostic code');
	assert.ok(repairPrompt.includes('src/app.ts:42:10'), 'Repair prompt must include location coordinates');

	totalPassed++;
	console.log('✔ Shadow diagnostic collector extracts compiler errors across toolchains and formats AI self-repair goals');

	// =========================================================================
	// 4. Daemon IPC Subsystem Roundtrip
	// =========================================================================
	console.log('\n--- Test 4: Daemon IPC End-to-End Shadow Virtualization Pipeline ---');
	const pipeName = process.platform === 'win32'
		? `\\\\.\\pipe\\float-phase2-test-${Date.now()}`
		: path.join(os.tmpdir(), `float-phase2-test-${Date.now()}.sock`);

	// This is an isolated legacy integration fixture. Production daemon workers keep
		// allowSandboxExecution disabled and expose none of these shadow RPC handlers.
		const daemonServer = new FloatDaemonServer({ pipeName, allowSandboxExecution: true });
	await daemonServer.start();
	console.log(`[DaemonServer] Running on pipe: ${pipeName}`);

	const daemonClient = new FloatDaemonClient({ pipeName });
	await daemonClient.connect();
	console.log('[DaemonClient] Connected to daemon');

	// 1. Create shadow workspace via IPC
	const createRes = await daemonClient.createCowShadowWorkspace(mockSourceRoot);
	const sid = createRes.sessionId;
	assert.ok(sid);
	assert.strictEqual(createRes.trackedFilesCount, 3);

	// 2. Apply shadow edit via IPC
	const editRes = await daemonClient.applyCowShadowEdit(sid, 'src/index.ts', 'export const IPC_CHECK = true;');
	assert.strictEqual(editRes.applied, true);

	// 3. Get shadow diff via IPC
	const diffRes = await daemonClient.getCowShadowDiff(sid);
	assert.strictEqual(diffRes.totalChanges, 1);
	assert.strictEqual(diffRes.modifiedFiles[0], 'src/index.ts');

	// 4. Run sandboxed toolchain via IPC
	const toolchainRes = await daemonClient.runCowShadowToolchain(sid, 'node', [
		'-e',
		'console.log("src/index.ts(10,5): error TS9999: Simulated shadow compilation error");'
	]);
	assert.strictEqual(toolchainRes.exitCode, 0);
	assert.ok(toolchainRes.diagnosticsCount >= 1, 'IPC must return structured diagnostic count');
	assert.ok(toolchainRes.repairPrompt.includes('TS9999'), 'IPC must return generated repair prompt');

	// 5. Teardown shadow workspace via IPC
	const teardownRes = await daemonClient.teardownCowShadowWorkspace(sid);
	assert.strictEqual(teardownRes.cleaned, true);

	// Clean up
	daemonClient.dispose();
	await daemonServer.stop();
	try { fs.rmSync(mockSourceRoot, { recursive: true, force: true }); } catch {}

	totalPassed++;
	console.log('✔ Daemon IPC end-to-end shadow virtualization pipeline verified');

	console.log('\n================================================================');
	console.log(`SUCCESS: All ${totalPassed} Phase 2 Shadow Workspace Virtualization tests PASSED!`);
	console.log('================================================================');
}

runPhase2Suite().catch(err => {
	console.error('FAILED testPhase2ShadowWorkspaceVirtualizationComplete:', err);
	process.exit(1);
});
