/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// 1. IPC Protocol & Daemon
import { FloatIpcProtocol } from '../desktop/src/vs/workbench/contrib/float/common/daemon/floatIpcProtocol.js';
import { FloatDaemonServer } from '../daemon/src/server/floatDaemonServer.js';
import { FloatDaemonClient } from '../desktop/src/vs/workbench/contrib/float/common/daemon/floatDaemonClient.js';

// 2. Language Service Bridge
import { FloatLanguageServiceBridge } from '../desktop/src/vs/workbench/contrib/float/common/lsp/floatLanguageServiceBridge.js';
import { MarkerSeverity } from '../desktop/src/vs/platform/markers/common/markers.js';
import { URI } from '../desktop/src/vs/base/common/uri.js';

// 3. Workbench Views
import { FloatComposerViewPane } from '../desktop/src/vs/workbench/contrib/float/browser/composer/floatComposerViewPane.js';
import { FloatChatViewPane } from '../desktop/src/vs/workbench/contrib/float/browser/chat/floatChatViewPane.js';
import { FloatQuickFixProvider } from '../desktop/src/vs/workbench/contrib/float/browser/quickfix/floatQuickFixProvider.js';
import { FloatTerminalQuickFix } from '../desktop/src/vs/workbench/contrib/float/browser/terminal/floatTerminalQuickFix.js';

// 4. DAP Debug Bridge
import { FloatDebugAdapterBridge } from '../desktop/src/vs/workbench/contrib/float/common/debug/floatDebugAdapterBridge.js';

// 5. Benchmark Harness
import { FloatBenchmarkHarness, IFloatBenchmarkTask } from '../benchmarks/floatBenchmarkHarness.js';

async function runCursorScaleMonorepoArchitectureTests() {
	console.log('================================================================');
	console.log('FLOAT Studio: Cursor-Scale Monorepo Architecture Test Suite');
	console.log('Testing: Sidecar Daemon IPC, LSP Bridge, Views, DAP & Benchmarks');
	console.log('================================================================\n');

	let totalPassed = 0;

	// TEST SUITE 1: High-Performance Sidecar Daemon & Length-Prefixed IPC
	console.log('--- Test Suite 1: Sidecar Daemon & Binary-Framed IPC Subsystem ---');
	const isWindows = process.platform === 'win32';
	const pipeName = isWindows
		? `\\\\.\\pipe\\float-arch-test-${Date.now()}`
		: path.join(os.tmpdir(), `float-arch-test-${Date.now()}.sock`);

	const server = new FloatDaemonServer({ pipeName });
	await server.start();
	console.log('✓ FloatDaemonServer started on named pipe');

	const client = new FloatDaemonClient({ pipeName });
	await client.connect();
	console.log('✓ FloatDaemonClient connected');

	const pingStart = Date.now();
	const pong = await client.ping();
	const pingLatency = Date.now() - pingStart;
	assert.strictEqual(pong.status, 'ok');
	assert.strictEqual(pong.version, '1.0.0-daemon');
	console.log(`✓ Daemon IPC Round-Trip Ping: ${pingLatency}ms (Status: ${pong.status}, activeClients: ${pong.activeClients})`);

	// Test multiplexed streaming through IPC
	const chunksReceived: any[] = [];
	let streamSummary: any = null;
	await new Promise<void>((resolve, reject) => {
		client.stream(
			'stream_agent_task',
			{ steps: 3 },
			{
				onChunk: chunk => chunksReceived.push(chunk),
				onEnd: summary => {
					streamSummary = summary;
					resolve();
				},
				onError: err => reject(err)
			}
		);
	});
	assert.strictEqual(chunksReceived.length, 3, 'Should receive streamed chunks from daemon');
	assert.strictEqual(streamSummary.status, 'completed');
	console.log(`✓ Multiplexed Binary IPC Streaming: received ${chunksReceived.length} chunks`);

	client.dispose();
	await server.stop();
	console.log('✓ Daemon & Client cleanly disposed\n');
	totalPassed++;

	// TEST SUITE 2: Language Service Protocol (LSP) Semantic Bridge
	console.log('--- Test Suite 2: LSP Semantic Bridge & Diagnostics Gate ---');
	const testFileUri = URI.file('C:/project/src/index.ts');
	const mockMarkers = [
		{
			resource: testFileUri,
			severity: MarkerSeverity.Error,
			message: "Type 'number' is not assignable to type 'string'.",
			startLineNumber: 42,
			startColumn: 10,
			endLineNumber: 42,
			endColumn: 25,
			source: 'typescript',
			code: 'TS2322'
		},
		{
			resource: testFileUri,
			severity: MarkerSeverity.Warning,
			message: "Variable 'unusedVar' is declared but its value is never read.",
			startLineNumber: 15,
			startColumn: 5,
			endLineNumber: 15,
			endColumn: 14,
			source: 'typescript',
			code: 'TS6133'
		}
	];

	const mockMarkerService: any = {
		read: (filter?: any) => mockMarkers,
		onMarkerChanged: () => ({ dispose: () => {} })
	};

	const lspBridge = new FloatLanguageServiceBridge(mockMarkerService);
	assert.strictEqual(lspBridge.isWorkspaceClean(), false, 'Workspace should have compiler errors');
	const activeDiags = lspBridge.getDiagnostics(testFileUri);
	assert.strictEqual(activeDiags.length, 2, 'Should retrieve 2 diagnostics for active file');

	const promptSummary = lspBridge.formatDiagnosticsForPrompt(testFileUri);
	assert.ok(promptSummary.includes('TS2322'), 'Formatted prompt should include error code');
	assert.strictEqual(promptSummary.includes('TS6133'), false, 'Prompt should filter out non-blocking warnings');
	console.log(`✓ Active Diagnostics Prompt Formatted:\n  ${promptSummary.split('\n')[1]}`);

	lspBridge.dispose();
	console.log('✓ LSP Semantic Bridge verified and disposed\n');
	totalPassed++;

	// TEST SUITE 3: Workbench AI Views (Composer & Chat)
	console.log('--- Test Suite 3: Workbench AI Views (Composer & Chat) ---');
	const composerPane = new FloatComposerViewPane();
	const session1 = composerPane.createSession('Refactor Auth Controller', 'agent');
	assert.strictEqual(composerPane.getActiveSession()?.title, 'Refactor Auth Controller');
	assert.strictEqual(composerPane.getActiveSession()?.mode, 'agent');
	composerPane.setSessionMode(session1.id, 'normal');
	assert.strictEqual(composerPane.getActiveSession()?.mode, 'normal');

	const chatPane = new FloatChatViewPane();
	const chatSession = chatPane.createNewSession('Architecture Discussion');
	assert.strictEqual(chatPane.getActiveSession()?.title, 'Architecture Discussion');

	// Test message sending and code block extraction
	await chatPane.sendUserMessage('Can you implement quicksort in TypeScript?');
	const messages = chatPane.getActiveSession()?.messages || [];
	assert.ok(messages.length >= 2, 'Should have user and assistant messages');

	const sampleMarkdown = 'Here is the code:\n```typescript\nfunction quicksort(arr: number[]): number[] {\n  return arr;\n}\n```\nDone!';
	const extractedBlocks = chatPane.extractCodeBlocks(sampleMarkdown);
	assert.strictEqual(extractedBlocks.length, 1);
	assert.strictEqual(extractedBlocks[0].language, 'typescript');
	assert.ok(extractedBlocks[0].code.includes('quicksort'));

	const mdExport = chatPane.exportConversationToMarkdown();
	assert.ok(mdExport.includes('# Architecture Discussion'));
	console.log('✓ Chat & Composer session management, message flow, and code block extraction verified');

	composerPane.dispose();
	chatPane.dispose();
	console.log('✓ Workbench Views verified and disposed\n');
	totalPassed++;

	// TEST SUITE 4: Diagnostic QuickFix & Terminal Auto-Remediation Providers
	console.log('--- Test Suite 4: QuickFix & Terminal Auto-Remediation ---');
	const quickFixProvider = new FloatQuickFixProvider(mockMarkerService);
	const mockTextModel: any = {
		uri: testFileUri,
		getLineContent: () => 'const x: string = 123;'
	};
	const mockRange: any = {
		startLineNumber: 42,
		startColumn: 10,
		endLineNumber: 42,
		endColumn: 25,
		isEmpty: () => false
	};
	const codeActionList = quickFixProvider.provideCodeActions(
		mockTextModel,
		mockRange,
		{ trigger: 1 },
		{ isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) } as any
	);

	assert.ok(codeActionList.actions.length >= 2, 'Should produce Fix with Composer and Explain with Chat actions');
	const fixAction = codeActionList.actions.find(a => a.kind === FloatQuickFixProvider.KIND_QUICKFIX);
	assert.ok(fixAction?.isAI, 'Fix action must have isAI flag set to true');
	assert.ok(fixAction?.isPreferred, 'Fix action must be preferred');
	console.log(`✓ QuickFix Action Produced: "${fixAction?.title}"`);

	// Terminal QuickFix
	const terminalQuickFix = new FloatTerminalQuickFix();
	const pythonErrorOutput = `Traceback (most recent call last):\n  File "main.py", line 1, in <module>\nModuleNotFoundError: No module named 'fastapi'\n`;
	const detectedDiag = terminalQuickFix.parseTerminalBuffer(pythonErrorOutput, 'bash', 'python main.py', 1);
	assert.ok(detectedDiag !== null);
	assert.strictEqual(detectedDiag?.matchedPattern, 'python_missing_module');
	assert.strictEqual(detectedDiag?.suggestedFix, 'pip install fastapi');
	console.log(`✓ Terminal Error Detected: ${detectedDiag?.summary} (Fix: ${detectedDiag?.suggestedFix})`);

	const gitConflictOutput = `Auto-merging src/app.ts\nCONFLICT (content): Merge conflict in src/app.ts\nAutomatic merge failed; fix conflicts and then commit the result.`;
	const gitDiag = terminalQuickFix.parseTerminalBuffer(gitConflictOutput, 'git', 'git merge feature', 1);
	assert.strictEqual(gitDiag?.matchedPattern, 'git_merge_conflict');
	console.log(`✓ Git Conflict Detected: ${gitDiag?.summary}`);

	quickFixProvider.dispose();
	terminalQuickFix.dispose();
	console.log('✓ QuickFix and Terminal Auto-Remediation verified and disposed\n');
	totalPassed++;

	// TEST SUITE 5: Debug Adapter Protocol (DAP) AI Runtime Inspection
	console.log('--- Test Suite 5: DAP Runtime Exception Inspection ---');
	const mockDebugSession: any = {
		getId: () => 'debug-sess-101',
		name: 'Node.js App Launch'
	};
	const mockThread: any = {
		threadId: 1,
		name: 'Main Thread',
		stoppedDetails: {
			reason: 'exception',
			description: 'ReferenceError: authToken is not defined',
			text: 'ReferenceError: authToken is not defined\n    at authenticate (C:/app/auth.js:28:15)'
		},
		getCallStack: () => [
			{
				name: 'authenticate',
				source: { name: 'auth.js', uri: URI.file('C:/app/auth.js') },
				range: { startLineNumber: 28, startColumn: 15 }
			},
			{
				name: 'handleRequest',
				source: { name: 'server.js', uri: URI.file('C:/app/server.js') },
				range: { startLineNumber: 85, startColumn: 10 }
			}
		]
	};
	const mockStackFrame: any = {
		name: 'authenticate',
		source: { name: 'auth.js', uri: URI.file('C:/app/auth.js') },
		range: { startLineNumber: 28, startColumn: 15 },
		getScopes: async () => [
			{
				name: 'Local',
				getChildren: async () => [
					{ name: 'reqHeaders', value: '{"authorization": "Bearer xxx"}', type: 'object' },
					{ name: 'isValid', value: 'false', type: 'boolean' }
				]
			}
		]
	};
	const mockDebugService: any = {
		state: 2, // Stopped
		onDidChangeState: () => ({ dispose: () => {} }),
		getViewModel: () => ({
			focusedSession: mockDebugSession,
			focusedThread: mockThread,
			focusedStackFrame: mockStackFrame
		})
	};

	const debugBridge = new FloatDebugAdapterBridge(mockDebugService);
	const breakContext = await debugBridge.captureActiveRuntimeState();
	assert.ok(breakContext !== null, 'Should capture break context');
	assert.strictEqual(breakContext?.reason, 'exception');
	assert.strictEqual(breakContext?.variables.length, 2);
	assert.strictEqual(breakContext?.callStack.length, 2);

	const debugPrompt = debugBridge.formatDebugPromptForComposer(breakContext!);
	assert.ok(debugPrompt.includes('ReferenceError: authToken is not defined'));
	assert.ok(debugPrompt.includes('auth.js:28:15'));
	assert.ok(debugPrompt.includes('reqHeaders'));
	console.log(`✓ Debug Adapter Inspection captured runtime exception & generated Composer goal:\n  ${debugPrompt.split('\n')[0]}`);

	debugBridge.dispose();
	console.log('✓ DAP Bridge verified and disposed\n');
	totalPassed++;

	// TEST SUITE 6: Automated SWE-Bench Evaluation Harness
	console.log('--- Test Suite 6: Automated SWE-Bench Evaluation Harness ---');
	const benchHarness = new FloatBenchmarkHarness(path.resolve(process.cwd(), '.tmp_benchmarks'));

	const sampleTask: IFloatBenchmarkTask = {
		id: 'task-math-eval-01',
		title: 'Fix addition bug in calculator',
		problemStatement: 'The add function returns incorrect sum due to string concatenation',
		files: {
			'src/calc.js': `function add(a, b) {\n  // TODO: fix\n  return String(a) + String(b);\n}\nmodule.exports = { add };`
		},
		patchInstruction: `return Number(a) + Number(b);`,
		expectedContains: ['Number(a) + Number(b)']
	};

	const taskResult = await benchHarness.runTask(sampleTask);
	assert.strictEqual(taskResult.passed, true, 'Benchmark task should pass');
	assert.strictEqual(taskResult.taskId, 'task-math-eval-01');
	console.log(`✓ Benchmark Task '${sampleTask.id}' passed in ${taskResult.durationMs}ms`);

	const suiteReport = await benchHarness.runSuite('Core Math Suite', [sampleTask]);
	assert.strictEqual(suiteReport.passRatePercent, 100);
	const mdReport = benchHarness.generateMarkdownReport(suiteReport);
	assert.ok(mdReport.includes('100.0%'));
	assert.ok(mdReport.includes('task-math-eval-01'));
	console.log(`✓ Suite Report Generated: Pass Rate ${suiteReport.passRatePercent}%`);

	benchHarness.dispose();
	console.log('✓ Benchmark Harness verified and disposed\n');
	totalPassed++;

	console.log('================================================================');
	console.log(`SUCCESS: ALL ${totalPassed}/6 CURSOR-SCALE MONOREPO TEST SUITES PASSED!`);
	console.log('================================================================');
}

runCursorScaleMonorepoArchitectureTests().catch(err => {
	console.error('FATAL TEST ERROR:', err);
	process.exit(1);
});
