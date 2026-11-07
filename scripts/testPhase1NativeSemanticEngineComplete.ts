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
import * as crypto from 'crypto';

import { FloatAstSemanticChunker } from '../daemon/src/chunker/floatAstSemanticChunker.js';
import { FloatDiskIndexStore } from '../daemon/src/storage/floatDiskIndexStore.js';
import { FloatTreeSitterIndexer } from '../daemon/src/indexer/floatTreeSitterIndexer.js';
import { FloatDaemonServer } from '../daemon/src/server/floatDaemonServer.js';
import { FloatDaemonClient } from '../desktop/src/vs/workbench/contrib/float/common/daemon/floatDaemonClient.js';

console.log('================================================================');
console.log('FLOAT Studio: Phase 1 Deep Native Semantic Engine Complete Suite');
console.log('Testing: AST Semantic Chunker, Disk WAL Store, Daemon IPC Pipeline');
console.log('================================================================\n');

async function runPhase1Suite() {
	let totalPassed = 0;

	// =========================================================================
	// 1. AST-Boundary Semantic Chunker Across Core Languages
	// =========================================================================
	console.log('--- Test 1: AST Semantic Chunker on TypeScript & Python ---');
	const chunker = new FloatAstSemanticChunker();

	const tsSource = `
import { Observable } from 'rxjs';

export interface IComputePlan {
	id: string;
	budget: number;
}

export class DistributedMatrix {
	private readonly _rows: number;
	private readonly _cols: number;

	constructor(rows: number, cols: number) {
		this._rows = rows;
		this._cols = cols;
	}

	public multiply(scalar: number): void {
		// Computation logic
	}
}

export function computeDeterminant(m: DistributedMatrix): number {
	return 1.0;
}
`;

	const tsChunks = chunker.chunkFile('src/math/matrix.ts', tsSource);
	console.log(`[AST Chunker] Produced ${tsChunks.length} chunks for matrix.ts`);
	assert.ok(tsChunks.length >= 3, 'Should produce at least 3 semantic chunks');

	const hasInterfaceChunk = tsChunks.some(c => c.symbolName === 'IComputePlan');
	const hasClassChunk = tsChunks.some(c => c.symbolName === 'DistributedMatrix');
	const hasFunctionChunk = tsChunks.some(c => c.symbolName === 'computeDeterminant');

	assert.ok(hasInterfaceChunk, 'Should identify interface chunk');
	assert.ok(hasClassChunk, 'Should identify class chunk');
	assert.ok(hasFunctionChunk, 'Should identify function chunk');

	// Python test
	const pySource = `
"""
Neural Core Module
"""
import torch

class AttentionLayer:
    def __init__(self, dim):
        self.dim = dim

    def forward(self, x):
        return x

def scaled_dot_product(q, k, v):
    return torch.matmul(q, k.transpose(-2, -1))
`;
	const pyChunks = chunker.chunkFile('ai/attention.py', pySource);
	console.log(`[AST Chunker] Produced ${pyChunks.length} chunks for attention.py`);
	assert.ok(pyChunks.length >= 2, 'Should produce at least 2 chunks for Python');
	assert.ok(pyChunks.some(c => c.symbolName === 'AttentionLayer'), 'Should identify AttentionLayer');
	assert.ok(pyChunks.some(c => c.symbolName === 'scaled_dot_product'), 'Should identify scaled_dot_product');

	totalPassed++;
	console.log('✔ AST Semantic Chunker accurately slices code across language boundaries');

	// =========================================================================
	// 2. Persistent Disk-Backed Index Storage & WAL Journal
	// =========================================================================
	console.log('\n--- Test 2: Persistent On-Disk Index Storage & Checksum Verification ---');
	const testStoreDir = path.join(os.tmpdir(), `float-test-index-${Date.now()}`);
	const diskStore = new FloatDiskIndexStore(testStoreDir);

	const indexer = new FloatTreeSitterIndexer();
	const node1 = indexer.parseFileSymbols('src/math/matrix.ts', tsSource);
	const node2 = indexer.parseFileSymbols('ai/attention.py', pySource);

	const saveResult = await diskStore.saveIndex([node1, node2], [...tsChunks, ...pyChunks]);
	console.log(`[DiskStore] Saved ${saveResult.bytesWritten} bytes to manifest: ${saveResult.manifestPath}`);
	assert.ok(saveResult.bytesWritten > 0, 'Bytes written must be greater than zero');
	assert.strictEqual(diskStore.hasValidIndex(), true, 'Must report valid index file present');

	// Load back index
	const loaded = await diskStore.loadIndex();
	assert.ok(loaded !== null, 'Loaded index must not be null');
	assert.strictEqual(loaded.manifest.totalFiles, 2, 'Must have 2 files in manifest');
	assert.strictEqual(loaded.manifest.totalChunks, tsChunks.length + pyChunks.length, 'Chunks count must match');
	assert.strictEqual(loaded.nodes.length, 2, 'File nodes count must match');

	// Version-2 snapshots use an immutable generation file referenced by manifest.json.
	const manifestPath = path.join(testStoreDir, 'manifest.json');
	const v2Manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	assert.strictEqual(v2Manifest.version, 2, 'New snapshots must use the atomic manifest-pointer format');
	assert.strictEqual(typeof v2Manifest.dataFile, 'string');
	assert.ok(fs.existsSync(path.join(testStoreDir, v2Manifest.dataFile)), 'Manifest must reference the committed data generation');

	// Version-1 compatibility: old releases stored data in index.data.json.
	const legacyRawData = JSON.stringify({ nodes: [node1, node2], chunks: [...tsChunks, ...pyChunks] });
	const legacyDataFilePath = path.join(testStoreDir, 'index.data.json');
	fs.writeFileSync(legacyDataFilePath, legacyRawData, 'utf8');
	fs.writeFileSync(manifestPath, JSON.stringify({
		version: 1,
		createdAt: Date.now(),
		totalFiles: 2,
		totalSymbols: node1.symbols.length + node2.symbols.length,
		totalChunks: tsChunks.length + pyChunks.length,
		checksum: crypto.createHash('sha256').update(legacyRawData, 'utf8').digest('hex')
	}), 'utf8');
	const legacyLoaded = await diskStore.loadIndex();
	assert.ok(legacyLoaded !== null, 'Version-1 index snapshots must remain readable');
	assert.strictEqual(legacyLoaded.manifest.version, 1);

	// Corruption detection test against the file selected by the active manifest.
	fs.appendFileSync(legacyDataFilePath, '   '); // Corrupt hash
	const corruptedLoad = await diskStore.loadIndex();
	assert.strictEqual(corruptedLoad, null, 'Corrupted index must be rejected by SHA-256 checksum check');

	// Clean up
	await diskStore.clear();
	assert.strictEqual(diskStore.hasValidIndex(), false, 'Cleared store must report no valid index');
	try { fs.rmSync(testStoreDir, { recursive: true, force: true }); } catch {}

	totalPassed++;
	console.log('✔ Disk Index Store verified atomic write, persistence, and tamper-resistance');

	// =========================================================================
	// 3. Daemon IPC Server & Client Roundtrip for Semantic Chunker & Persistence
	// =========================================================================
	console.log('\n--- Test 3: Daemon IPC Semantic Chunker & Persistence Endpoints ---');
	const pipeName = process.platform === 'win32'
		? `\\\\.\\pipe\\float-phase1-test-${Date.now()}`
		: path.join(os.tmpdir(), `float-phase1-test-${Date.now()}.sock`);

	const daemonServer = new FloatDaemonServer({ pipeName });
	await daemonServer.start();
	console.log(`[DaemonServer] Running on pipe: ${pipeName}`);

	const daemonClient = new FloatDaemonClient({ pipeName });
	await daemonClient.connect();
	console.log('[DaemonClient] Connected to daemon');

	// 1. Test ping
	const pingRes = await daemonClient.ping();
	assert.strictEqual(pingRes.status, 'ok');

	// 2. Test semantic indexing over IPC
	const indexIpcRes = await daemonClient.indexFileSemantics('src/math/matrix.ts', tsSource);
	assert.strictEqual(indexIpcRes.delta, 'added');
	assert.ok(indexIpcRes.symbolsCount > 0);

	// 3. Test semantic chunking over IPC
	const chunkIpcRes = await daemonClient.chunkFileSemantics('src/math/matrix.ts', tsSource);
	assert.strictEqual(chunkIpcRes.filePath, 'src/math/matrix.ts');
	assert.ok(chunkIpcRes.chunksCount >= 3, 'Must receive AST chunks over binary IPC');

	// 4. Test persisting index to disk over IPC
	const daemonStorageDir = path.join(os.tmpdir(), `float-daemon-storage-${Date.now()}`);
	const persistIpcRes = await daemonClient.persistIndex(daemonStorageDir);
	assert.strictEqual(persistIpcRes.saved, true);
	assert.strictEqual(persistIpcRes.totalFiles, 1);

	// 5. Test loading index from disk over IPC
	const loadIpcRes = await daemonClient.loadIndex(daemonStorageDir);
	assert.strictEqual(loadIpcRes.loaded, true);
	assert.strictEqual(loadIpcRes.totalFiles, 1);

	// 6. Test semantic search over IPC
	const searchIpcRes = await daemonClient.searchSemantics('DistributedMatrix', 3);
	assert.ok(searchIpcRes.matches.length > 0, 'Semantic search must return matches');

	// Clean up IPC
	try { fs.rmSync(daemonStorageDir, { recursive: true, force: true }); } catch {}
	daemonClient.dispose();
	await daemonServer.stop();

	totalPassed++;
	console.log('✔ Daemon IPC seamlessly handles semantic chunking, persistence, and hybrid search');

	console.log('\n================================================================');
	console.log(`SUCCESS: All ${totalPassed} Phase 1 Native Semantic Engine tests PASSED!`);
	console.log('================================================================');
}

runPhase1Suite().catch(err => {
	console.error('FAILED testPhase1NativeSemanticEngineComplete:', err);
	process.exit(1);
});
