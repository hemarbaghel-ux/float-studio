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

import { FloatSyntaxContextSlicer } from '../desktop/src/vs/workbench/contrib/float/browser/autocomplete/floatSyntaxContextSlicer.js';
import { FloatCursorJumpPredictor } from '../desktop/src/vs/workbench/contrib/float/browser/autocomplete/floatCursorJumpPredictor.js';
import { FloatSpeculativeTokenStreamer } from '../desktop/src/vs/workbench/contrib/float/browser/autocomplete/floatSpeculativeTokenStreamer.js';
import { FloatDaemonServer } from '../daemon/src/server/floatDaemonServer.js';
import { FloatDaemonClient } from '../desktop/src/vs/workbench/contrib/float/common/daemon/floatDaemonClient.js';

console.log('================================================================');
console.log('FLOAT Studio: Phase 3 Copilot++ Speculative Cursor Tab Suite');
console.log('Testing: AST Context Slicing, Remote Cursor Jumps, KV Speculation');
console.log('================================================================\n');

async function runPhase3Suite() {
	let totalPassed = 0;

	// =========================================================================
	// 1. AST-Aware Syntax Context Slicing
	// =========================================================================
	console.log('--- Test 1: AST-Aware Syntax Context Slicer ---');
	const slicer = new FloatSyntaxContextSlicer();

	const sampleSource = `
import { DatabaseConnection } from './db';
import { Logger } from './logger';

export interface IOrder {
	id: string;
	total: number;
}

export class OrderProcessor {
	private readonly _db: DatabaseConnection;

	constructor(db: DatabaseConnection) {
		this._db = db;
	}

	public async processOrder(order: IOrder): Promise<boolean> {
		const isValid = order.total > 0;
		if (!isValid) return false;
		return true;
	}

	public async refundOrder(orderId: string): Promise<void> {
		// refund logic
	}
}
`;

	// Cursor inside processOrder method (line 20)
	const slice = slicer.sliceContext('src/orders/processor.ts', sampleSource, 20, 10, 5);
	console.log(`[ContextSlicer] Sliced lines ${slice.startLine}-${slice.endLine} (Enclosing: ${slice.enclosingScopeName}, Class: ${slice.enclosingClassName})`);

	assert.strictEqual(slice.enclosingClassName, 'OrderProcessor', 'Must extract parent class name');
	assert.strictEqual(slice.enclosingScopeName, 'processOrder', 'Must select the enclosing method, not a local variable declaration');
	assert.strictEqual(slice.enclosingScopeKind, 'method');
	assert.strictEqual(slice.imports.length, 2, 'Must extract top-level imports');
	assert.ok(slice.imports[0].includes('DatabaseConnection'));
	assert.ok(slice.slicedCode.includes('processOrder'), 'Must contain the active method in code slice');

	totalPassed++;
	console.log('✔ AST Syntax Context Slicer dynamically isolates enclosing class, method, and imports');

	// =========================================================================
	// 2. Remote Call-Site Cursor Jump Prediction
	// =========================================================================
	console.log('\n--- Test 2: Remote Call-Site Cursor Jump Prediction ---');
	const jumpPredictor = new FloatCursorJumpPredictor();

	const mockWorkspaceFiles: Record<string, string> = {
		'src/views/checkout.ts': 'import { processOrder } from "./processor";\nconst res = processOrder(currentOrder);',
		'src/views/bulkOrders.ts': 'export function runBatch() {\n  for(let o of list) {\n    processOrder(o);\n  }\n}'
	};

	const oldSignature = 'public async processOrder(order: IOrder): Promise<boolean>';
	const newSignature = 'public async processOrder(order: IOrder, priority: boolean = false): Promise<boolean>';

	const predictions = jumpPredictor.predictRemoteJumps('processOrder', oldSignature, newSignature, mockWorkspaceFiles);
	console.log(`[JumpPredictor] Found ${predictions.length} remote call sites to update across workspace`);

	assert.strictEqual(predictions.length, 2, 'Must identify both remote call sites');
	assert.strictEqual(predictions[0].targetFilePath, 'src/views/checkout.ts');
	assert.strictEqual(predictions[0].targetLine, 2);
	assert.ok(predictions[0].suggestedPatch.includes('processOrder(currentOrder, /* added arg */)'));

	assert.strictEqual(predictions[1].targetFilePath, 'src/views/bulkOrders.ts');
	assert.strictEqual(predictions[1].targetLine, 3);
	assert.ok(predictions[1].suggestedPatch.includes('processOrder(o, /* added arg */)'));

	totalPassed++;
	console.log('✔ Remote Cursor Jump Predictor anticipates call-site updates across the whole project');

	// =========================================================================
	// 3. Low-Latency Forward-Cache Speculative Keystroke Streamer
	// =========================================================================
	console.log('\n--- Test 3: Speculative Token Streamer & 0ms Keystroke Matching ---');
	const streamer = new FloatSpeculativeTokenStreamer();

	// Model streams ahead: 'const status = true;'
	streamer.setSpeculativePrediction('const status = true;');
	assert.strictEqual(streamer.getRemainingSpeculation(), 'const status = true;');

	// User types 'c'
	const r1 = streamer.onKeystroke('c');
	assert.strictEqual(r1.matched, true);
	assert.strictEqual(r1.latencyMs, 0, 'Matching keystroke must incur 0ms network latency');
	assert.strictEqual(r1.remainingSpeculation, 'onst status = true;');

	// User types 'o', 'n', 's', 't'
	for (const ch of ['o', 'n', 's', 't', ' ']) {
		const res = streamer.onKeystroke(ch);
		assert.strictEqual(res.matched, true);
		assert.strictEqual(res.latencyMs, 0);
	}

	assert.strictEqual(streamer.getRemainingSpeculation(), 'status = true;');

	// User diverges and types 'X'
	const divRes = streamer.onKeystroke('X');
	assert.strictEqual(divRes.matched, false);
	assert.strictEqual(divRes.remainingSpeculation, '');

	const metrics = streamer.getMetrics();
	console.log(`[StreamerMetrics] Total: ${metrics.totalKeystrokes}, Hits: ${metrics.speculativeHits}, Divergences: ${metrics.divergences}, HitRate: ${metrics.hitRatePercent}%`);
	assert.strictEqual(metrics.totalKeystrokes, 7);
	assert.strictEqual(metrics.speculativeHits, 6);
	assert.strictEqual(metrics.divergences, 1);
	assert.strictEqual(metrics.hitRatePercent, 86);

	totalPassed++;
	console.log('✔ Speculative token streamer delivers 0ms forward-cache latency on matching keystrokes');

	// =========================================================================
	// 4. Daemon IPC Phase 3 End-to-End Pipeline
	// =========================================================================
	console.log('\n--- Test 4: Daemon IPC Phase 3 End-to-End Pipeline ---');
	const pipeName = process.platform === 'win32'
		? `\\\\.\\pipe\\float-phase3-test-${Date.now()}`
		: path.join(os.tmpdir(), `float-phase3-test-${Date.now()}.sock`);

	const daemonServer = new FloatDaemonServer({ pipeName });
	await daemonServer.start();
	console.log(`[DaemonServer] Running on pipe: ${pipeName}`);

	const daemonClient = new FloatDaemonClient({ pipeName });
	await daemonClient.connect();
	console.log('[DaemonClient] Connected to daemon');

	// 1. Slice context over IPC
	const ipcSlice = await daemonClient.sliceSyntaxContext('src/orders/processor.ts', sampleSource, 20, 10);
	assert.strictEqual(ipcSlice.enclosingClassName, 'OrderProcessor');
	assert.strictEqual(ipcSlice.imports.length, 2);

	// 2. Predict cursor jumps over IPC
	const ipcJumps = await daemonClient.predictCursorJumps('processOrder', oldSignature, newSignature, mockWorkspaceFiles);
	assert.strictEqual(ipcJumps.totalJumps, 2);
	assert.strictEqual(ipcJumps.jumps[0].targetFilePath, 'src/views/checkout.ts');

	// 3. Test speculative keystrokes over IPC
	const ipcSpec = await daemonClient.testSpeculativeKeystrokes('return data;', 'retu');
	assert.strictEqual(ipcSpec.metrics.speculativeHits, 4);
	assert.strictEqual(ipcSpec.metrics.hitRatePercent, 100);

	// Clean up
	daemonClient.dispose();
	await daemonServer.stop();

	totalPassed++;
	console.log('✔ Daemon IPC Phase 3 pipeline verified for syntax slicing, jump predictions, and keystroke speculation');

	console.log('\n================================================================');
	console.log(`SUCCESS: All ${totalPassed} Phase 3 Copilot++ Cursor Tab tests PASSED!`);
	console.log('================================================================');
}

runPhase3Suite().catch(err => {
	console.error('FAILED testPhase3SpeculativeCursorTabComplete:', err);
	process.exit(1);
});
