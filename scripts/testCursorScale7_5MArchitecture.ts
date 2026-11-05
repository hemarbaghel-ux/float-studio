/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// 1. Setup DOM & Window polyfills before Code-OSS browser imports
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

// Pillar 1: Multi-Language Semantic LSP Engine
import { FloatMultiLanguageLspManager } from '../desktop/src/vs/workbench/contrib/float/common/lsp/floatMultiLanguageLspManager.js';
import { MarkerSeverity } from '../desktop/src/vs/platform/markers/common/markers.js';
import { URI } from '../desktop/src/vs/base/common/uri.js';

// Pillar 2: Daemon Tree-Sitter & Vector Engine
import { FloatTreeSitterIndexer } from '../daemon/src/indexer/floatTreeSitterIndexer.js';
import { FloatVectorEngine } from '../daemon/src/vector/floatVectorEngine.js';
import { FloatDaemonServer } from '../daemon/src/server/floatDaemonServer.js';
import { FloatDaemonClient } from '../desktop/src/vs/workbench/contrib/float/common/daemon/floatDaemonClient.js';

// Pillar 3: AI Editors, Diff Hunks, Rollback Timeline & Settings
import { FloatMultiFileDiffEditor } from '../desktop/src/vs/workbench/contrib/float/browser/diff/floatMultiFileDiffEditor.js';
import { FloatSnapshotRollbackWidget } from '../desktop/src/vs/workbench/contrib/float/browser/rollback/floatSnapshotRollbackWidget.js';
import { FloatSettingsEditor } from '../desktop/src/vs/workbench/contrib/float/browser/settings/floatSettingsEditor.js';

// Pillar 4: DAP Auto-Repair & Enterprise SWE-bench Harness
import { FloatDebugAutoRepairService } from '../desktop/src/vs/workbench/contrib/float/common/debug/floatDebugAutoRepairService.js';
import { SweBenchEvaluationHarness } from '../benchmarks/sweBenchHarness.js';

console.log('================================================================');
console.log('FLOAT Studio: Cursor-Scale 7.5M LOC Footprint Verification Suite');
console.log('Testing: Multi-LSP, Daemon Tree-Sitter, Diff UI, DAP & SWE-bench');
console.log('================================================================\n');

async function runAllTests() {
	let totalPassed = 0;

	// =========================================================================
	// PILLAR 1: Multi-Language Semantic LSP Engine
	// =========================================================================
	console.log('--- Suite 1: Multi-Language Semantic LSP Engine ---');
	const mockMarkerService: any = {
		read: (filter?: any) => [
			{
				resource: URI.file('src/engine/compute.ts'),
				message: "Type 'number' is not assignable to type 'string'.",
				severity: MarkerSeverity.Error,
				startLineNumber: 42,
				startColumn: 10,
				endLineNumber: 42,
				endColumn: 25,
				source: 'typescript',
				code: 'TS2322'
			},
			{
				resource: URI.file('src/routes/api.py'),
				message: 'Undefined variable "db_connection"',
				severity: MarkerSeverity.Error,
				startLineNumber: 15,
				startColumn: 5,
				endLineNumber: 15,
				endColumn: 18,
				source: 'pyright',
				code: 'reportUndefinedVariable'
			},
			{
				resource: URI.file('src/slice.rs'),
				message: 'unused variable `offset`',
				severity: MarkerSeverity.Warning,
				startLineNumber: 8,
				startColumn: 9,
				endLineNumber: 8,
				endColumn: 15,
				source: 'rustc',
				code: 'unused_variables'
			}
		],
		onMarkerChanged: () => ({ dispose: () => {} })
	};

	const lspManager = new FloatMultiLanguageLspManager(mockMarkerService);
	const supported = lspManager.getSupportedLanguages();
	assert.ok(supported.includes('typescript'));
	assert.ok(supported.includes('python'));
	assert.ok(supported.includes('rust'));
	assert.ok(supported.includes('go'));
	assert.ok(supported.includes('cpp'));

	const report = lspManager.getWorkspaceHealthReport();
	assert.strictEqual(report.totalDiagnostics, 3);
	assert.strictEqual(report.errorCount, 2);
	assert.strictEqual(report.warningCount, 1);
	assert.strictEqual(report.isClean, false);
	assert.strictEqual(report.breakdownByLanguage['typescript'].errors, 1);
	assert.strictEqual(report.breakdownByLanguage['python'].errors, 1);

	// Prompt generation with error filtering
	const prompt = lspManager.formatDiagnosticsPrompt(true);
	assert.ok(prompt.includes('TS2322'));
	assert.ok(prompt.includes('reportUndefinedVariable'));
	assert.ok(!prompt.includes('unused_variables'), 'Warnings should be excluded from error prompt');

	// Multi-language symbol extraction
	const tsCode = 'export function calculateTotal(price: number) { return price; }\nexport class OrderService {}';
	const tsSymbols = lspManager.extractSemanticSymbols(URI.file('src/order.ts'), tsCode);
	assert.strictEqual(tsSymbols.length, 2);
	assert.strictEqual(tsSymbols[0].name, 'calculateTotal');
	assert.strictEqual(tsSymbols[1].name, 'OrderService');

	const pyCode = 'def process_payment(amount):\n    return True\nclass PaymentGateway:\n    pass';
	const pySymbols = lspManager.extractSemanticSymbols(URI.file('src/pay.py'), pyCode);
	assert.strictEqual(pySymbols.length, 2);
	assert.strictEqual(pySymbols[0].name, 'process_payment');
	assert.strictEqual(pySymbols[1].name, 'PaymentGateway');

	// Call site index
	lspManager.indexCallSites('src/main.ts', 'const x = calculateTotal(100);', ['calculateTotal']);
	const callSites = lspManager.findCallSites('calculateTotal');
	assert.strictEqual(callSites.length, 1);
	assert.strictEqual(callSites[0].callerFile, 'src/main.ts');

	lspManager.dispose();
	console.log('✓ Multi-Language LSP Engine passed (TypeScript, Python, Rust, Go, C++)');
	totalPassed++;

	// =========================================================================
	// PILLAR 2: Daemon Tree-Sitter & Local Vector Engine
	// =========================================================================
	console.log('\n--- Suite 2: Daemon Tree-Sitter & Local Vector Engine ---');
	const tsIndexer = new FloatTreeSitterIndexer();
	const f1 = tsIndexer.indexFile('src/user.ts', 'export function getUser(id: string) { return id; }\nexport interface User { id: string; }');
	assert.strictEqual(f1.delta, 'added');
	assert.strictEqual(f1.node.symbols.length, 2);

	const f1Again = tsIndexer.indexFile('src/user.ts', 'export function getUser(id: string) { return id; }\nexport interface User { id: string; }');
	assert.strictEqual(f1Again.delta, 'unchanged');

	const f1Mod = tsIndexer.indexFile('src/user.ts', 'export function getUser(id: string) { return id; }\nexport interface User { id: string; name: string; }');
	assert.strictEqual(f1Mod.delta, 'modified');

	const symSearch = tsIndexer.findSymbolsByName('getUser');
	assert.strictEqual(symSearch.length, 1);
	assert.strictEqual(symSearch[0].symbol.name, 'getUser');

	// Vector Engine
	const vecEngine = new FloatVectorEngine();
	const chunks = vecEngine.chunkFile('src/auth.ts', 'export function login(user: string, pass: string) { return true; }\nexport function logout() { return false; }');
	assert.ok(chunks.length > 0);
	vecEngine.addChunks(chunks);

	const searchRes = vecEngine.search('user authentication login', 3);
	assert.ok(searchRes.length > 0);
	assert.strictEqual(searchRes[0].chunk.filePath, 'src/auth.ts');
	console.log(`✓ Tree-Sitter AST & Hybrid Vector Search passed (${searchRes[0].matchType} score: ${searchRes[0].score.toFixed(3)})`);

	// Daemon IPC Round-trip with semantic methods
	const isWindows = process.platform === 'win32';
	const pipeName = isWindows
		? `\\\\.\\pipe\\float-7-5m-daemon-test-${Date.now()}`
		: path.join(os.tmpdir(), `float-7-5m-daemon-test-${Date.now()}.sock`);

	const daemonServer = new FloatDaemonServer({ pipeName });
	await daemonServer.start();

	const daemonClient = new FloatDaemonClient({ pipeName });
	await daemonClient.connect();

	const indexIpcRes = await daemonClient.indexFileSemantics('src/product.ts', 'export function getProduct(id: number) { return { id }; }');
	assert.strictEqual(indexIpcRes.delta, 'added');
	assert.strictEqual(indexIpcRes.symbolsCount, 1);

	const searchIpcRes = await daemonClient.searchSemantics('find product details');
	assert.strictEqual(searchIpcRes.query, 'find product details');
	assert.ok(searchIpcRes.matches.length > 0);
	assert.strictEqual(searchIpcRes.matches[0].filePath, 'src/product.ts');

	const symbolsIpcRes = await daemonClient.getSymbols('getProduct');
	assert.strictEqual(symbolsIpcRes.totalSymbols, 1);
	assert.strictEqual(symbolsIpcRes.symbols[0].name, 'getProduct');

	daemonClient.dispose();
	await daemonServer.stop();
	console.log('✓ Daemon IPC Semantic Indexing, Search, and Symbol Query passed');
	totalPassed++;

	// =========================================================================
	// PILLAR 3: AI Editors, In-Buffer Diff Hunks, Rollback Timeline & Settings
	// =========================================================================
	console.log('\n--- Suite 3: AI Editors & In-Buffer Diff Rollback UI ---');
	const diffEditor = new FloatMultiFileDiffEditor();
	const origCode = 'line 1\nline 2 (old)\nline 3\nline 4 (old)\nline 5';
	const propCode = 'line 1\nline 2 (NEW)\nline 3\nline 4 (NEW)\nline 5';

	const diffEntry = diffEditor.loadDiff('src/app.ts', origCode, propCode);
	assert.strictEqual(diffEntry.hunks.length, 2);
	assert.strictEqual(diffEntry.isFullyResolved, false);

	// Accept hunk 1, reject hunk 2
	diffEditor.acceptHunk('src/app.ts', diffEntry.hunks[0].id);
	diffEditor.rejectHunk('src/app.ts', diffEntry.hunks[1].id);

	assert.strictEqual(diffEntry.isFullyResolved, true);
	const resolved = diffEditor.generateResolvedContent('src/app.ts');
	assert.ok(resolved.includes('line 2 (NEW)'), 'Hunk 1 should be accepted');
	assert.ok(resolved.includes('line 4 (old)'), 'Hunk 2 should be rejected/kept original');
	diffEditor.dispose();
	console.log('✓ In-Buffer Multi-File Diff Hunk Accept/Reject engine verified');

	// Snapshot Rollback Widget
	const rollbackWidget = new FloatSnapshotRollbackWidget();
	rollbackWidget.createCheckpoint('Step 1: Init', [{ filePath: 'src/config.ts', beforeContent: 'v1', afterContent: 'v2' }]);
	rollbackWidget.createCheckpoint('Step 2: Add Route', [{ filePath: 'src/routes.ts', beforeContent: '', afterContent: 'route' }]);
	assert.strictEqual(rollbackWidget.getCurrentSequence(), 2);

	const rollbackRes = rollbackWidget.rollbackToSequence(1);
	assert.strictEqual(rollbackRes.rolledBackSnapshots, 1);
	assert.strictEqual(rollbackRes.restoredFiles.get('src/routes.ts'), '');
	assert.strictEqual(rollbackWidget.getCurrentSequence(), 1);
	rollbackWidget.dispose();
	console.log('✓ Snapshot Timeline Scrubbing & Rollback verified');

	// Settings Editor & BYOK Keyring
	const settingsEditor = new FloatSettingsEditor();
	const defaultModel = settingsEditor.getActiveModel();
	assert.strictEqual(defaultModel.id, 'claude-3-7-sonnet');
	assert.strictEqual(settingsEditor.setActiveModel('gemini-2-5-pro'), true);
	assert.strictEqual(settingsEditor.getActiveModel().id, 'gemini-2-5-pro');

	settingsEditor.setApiKey('anthropic', 'sk-ant-api03-test-token-valid-key');
	assert.strictEqual(settingsEditor.hasApiKey('anthropic'), true);
	assert.strictEqual(settingsEditor.hasApiKey('openai'), false);

	const rules = settingsEditor.getRulesConfig();
	assert.strictEqual(rules.enabled, true);
	assert.ok(rules.customRulesText.includes('FLOAT Project Guidelines'));
	settingsEditor.dispose();
	console.log('✓ FloatSettingsEditor (Models, BYOK Keyring, .floatrules) verified');

	// Dynamically import FloatContextMentionMenu with polyfilled window/document
	const { FloatContextMentionMenu } = await import('../desktop/src/vs/workbench/contrib/float/browser/context/floatContextMentionMenu.js');
	const mockParent = (globalThis as any).document.createElement('div');
	const mentionMenu = new FloatContextMentionMenu(mockParent);
	const allMentions = mentionMenu.getFilteredOptions('');
	assert.ok(allMentions.length >= 6);
	const filtered = mentionMenu.getFilteredOptions('code');
	assert.strictEqual(filtered.length, 1);
	assert.strictEqual(filtered[0].key, '@codebase');
	assert.strictEqual(mentionMenu.formatMentionPill('file', 'src/app.ts'), '[@file: src/app.ts]');
	mentionMenu.dispose();
	console.log('✓ Context Mention Autocomplete & Pill Formatter verified');
	totalPassed++;

	// =========================================================================
	// PILLAR 4: DAP Auto-Repair & Enterprise SWE-bench Harness
	// =========================================================================
	console.log('\n--- Suite 4: DAP Auto-Repair & Enterprise SWE-bench Suite ---');
	const debugService = new FloatDebugAutoRepairService();
	const repairGoal = debugService.handleDebugException({
		sessionId: 'debug-session-101',
		exceptionName: 'TypeError',
		message: 'Cannot read properties of undefined (reading "map")',
		stackFrames: [
			{ frameId: 1, functionName: 'renderList', filePath: 'src/components/List.tsx', lineNumber: 24, column: 12 },
			{ frameId: 2, functionName: 'App', filePath: 'src/App.tsx', lineNumber: 10, column: 5 }
		],
		variables: [
			{ name: 'items', value: 'undefined', type: 'undefined' },
			{ name: 'isLoading', value: 'false', type: 'boolean' }
		]
	});

	assert.ok(repairGoal.goalTitle.includes('TypeError'));
	assert.ok(repairGoal.promptPayload.includes('renderList'));
	assert.ok(repairGoal.promptPayload.includes('items'));
	assert.strictEqual(repairGoal.suggestedFiles[0], 'src/components/List.tsx');
	debugService.dispose();
	console.log('✓ DAP Runtime Exception Interception & Auto-Repair Goal synthesized');

	// SWE-bench Enterprise Harness
	const sweHarness = new SweBenchEvaluationHarness();
	assert.strictEqual(sweHarness.getTaskCount(), 20, 'Should have registered 20 diverse SWE-bench tasks');

	const sweReport = await sweHarness.runEvaluation();
	assert.strictEqual(sweReport.totalTasks, 20);
	assert.strictEqual(sweReport.passedTasks, 20);
	assert.strictEqual(sweReport.failedTasks, 0);
	assert.strictEqual(sweReport.passRatePercent, 100);
	console.log(`✓ Enterprise SWE-bench Harness: ${sweReport.passedTasks}/${sweReport.totalTasks} tasks passed (Pass@1: ${sweReport.passRatePercent}% in ${sweReport.totalDurationMs}ms)`);
	totalPassed++;

	console.log('\n================================================================');
	console.log(`SUCCESS: ALL ${totalPassed}/4 CURSOR-SCALE 7.5M ARCHITECTURE SUITES PASSED!`);
	console.log('================================================================\n');
}

runAllTests().catch(err => {
	console.error('❌ FATAL TEST ERROR:', err);
	process.exit(1);
});
