/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { FloatDaemonServer } from '../daemon/src/server/floatDaemonServer.ts';
import { FloatDiskIndexStore } from '../daemon/src/storage/floatDiskIndexStore.ts';
import { FloatDaemonClient } from '../desktop/src/vs/workbench/contrib/float/common/daemon/floatDaemonClient.ts';

async function main(): Promise<void> {
	const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'float-index-persistence-'));
	const storageDir = path.join(tempRoot, 'semantic-index');
	const pipeName = (suffix: string) => process.platform === 'win32'
		? `\\\\.\\pipe\\float-index-${process.pid}-${suffix}`
		: path.join(tempRoot, `daemon-${suffix}.sock`);

	let firstServer: FloatDaemonServer | undefined;
	let firstClient: FloatDaemonClient | undefined;
	let secondServer: FloatDaemonServer | undefined;
	let secondClient: FloatDaemonClient | undefined;

	try {
		firstServer = new FloatDaemonServer({ pipeName: pipeName('first'), storageDir });
		firstClient = new FloatDaemonClient({ pipeName: pipeName('first') });
		await firstServer.start();
		await firstClient.connect(5_000);

		const filePath = 'src/persistenceFixture.ts';
		const source = [
			'export function persistedWorkspaceResolver() {',
			'  return "persistent semantic index restored";',
			'}'
		].join('\n');
		const indexed = await firstClient.call<{ chunksCount: number }>('semantic_index_file', { filePath, content: source });
		assert.ok(indexed.chunksCount > 0);

		// The daemon validates its own RPC boundary rather than relying only on
		// the workbench synchronizer to sanitize provider-supplied paths.
		for (const invalidPath of [
			'/etc/passwd',
			'../outside.ts',
			'src/../outside.ts',
			'C:/workspace/outside.ts',
			'src\\..\\outside.ts'
		]) {
			await assert.rejects(
				() => firstClient!.call('semantic_chunk_file', {
					filePath: invalidPath,
					content: 'export function rejectedPath() {}'
				}),
				/safe workspace-relative file path/
			);
		}

		await assert.rejects(
			() => firstClient!.call('semantic_chunk_file', {
				filePath: 'src/oversized.ts',
				content: 'x'.repeat(2 * 1024 * 1024 + 1)
			}),
			/exceeds the 2 MiB indexing limit/
		);

		await assert.rejects(
			() => firstClient!.call('semantic_search', { query: 'x'.repeat(2_049), topK: 5 }),
			/at most 2048 characters/
		);
		await assert.rejects(
			() => firstClient!.call('semantic_search', { query: 'persistedWorkspaceResolver', topK: 51 }),
			/topK must be an integer between 1 and 50/
		);
		await assert.rejects(
			() => firstClient!.call('semantic_get_symbols', { query: 'x'.repeat(257) }),
			/at most 256 characters/
		);

		const indexedPaths = await firstClient.call<{ files: string[] }>('semantic_list_indexed_files', {});
		assert.ok(indexedPaths.files.includes(filePath), 'daemon must expose its restored/indexed paths for workspace reconciliation');

		firstClient.dispose();
		await firstServer.stop();
		firstClient = undefined;
		firstServer = undefined;

		secondServer = new FloatDaemonServer({ pipeName: pipeName('second'), storageDir });
		secondClient = new FloatDaemonClient({ pipeName: pipeName('second') });
		await secondServer.start();
		await secondClient.connect(5_000);

		const search = await secondClient.call<{
			totalChunksIndexed: number;
			matches: Array<{ filePath: string; startLine: number; endLine: number; snippet: string }>;
		}>('semantic_search', { query: 'persistedWorkspaceResolver', topK: 5 });
		assert.ok(search.totalChunksIndexed > 0, 'restarted daemon must restore searchable chunks');
		assert.ok(search.matches.some(match => match.filePath === filePath), 'restored search result must retain its file path');

		const symbols = await secondClient.call<{ symbols: Array<{ name: string }> }>('semantic_get_symbols', { query: 'persistedWorkspaceResolver' });
		assert.ok(symbols.symbols.some(symbol => symbol.name === 'persistedWorkspaceResolver'), 'restarted daemon must restore symbol metadata');

		// Version-1 cache compatibility: the legacy store used index.data.json
		// and AST-semantic chunks rather than version-2 immutable generations.
		const legacyDirectory = path.join(tempRoot, 'legacy-v1');
		await mkdir(legacyDirectory, { recursive: true });
		const legacyPayload = {
			nodes: [{
				filePath: 'src/legacy.ts',
				fileHash: 'legacy-file-hash',
				language: 'typescript',
				symbols: [],
				lastModified: Date.now()
			}],
			chunks: [{
				id: 'src/legacy.ts#L1-L1:legacy',
				filePath: 'src/legacy.ts',
				language: 'typescript',
				startLine: 1,
				endLine: 1,
				content: 'export const legacyValue = 1;',
				hash: 'legacy-chunk-hash'
			}]
		};
		const legacyData = JSON.stringify(legacyPayload);
		const legacyChecksum = createHash('sha256').update(legacyData, 'utf8').digest('hex');
		await writeFile(path.join(legacyDirectory, 'index.data.json'), legacyData, { encoding: 'utf8', mode: 0o600 });
		await writeFile(path.join(legacyDirectory, 'manifest.json'), JSON.stringify({
			version: 1,
			createdAt: Date.now(),
			totalFiles: 1,
			totalSymbols: 0,
			totalChunks: 1,
			checksum: legacyChecksum
		}, null, 2), { encoding: 'utf8', mode: 0o600 });
		const legacyStore = new FloatDiskIndexStore(legacyDirectory);
		const legacyIndex = await legacyStore.loadIndex();
		assert.ok(legacyIndex, 'version-1 cache must remain readable');
		assert.equal(legacyIndex.manifest.version, 1);
		assert.equal(legacyIndex.chunks.length, 1);
		assert.ok('hash' in legacyIndex.chunks[0] && !('symbols' in legacyIndex.chunks[0]), 'legacy AST chunk shape must be preserved');
		await legacyStore.clear();

		console.log('FLOAT daemon index persistence: v2 restart restore and v1 cache compatibility passed.');
	} finally {
		firstClient?.dispose();
		secondClient?.dispose();
		await firstServer?.stop().catch(() => undefined);
		await secondServer?.stop().catch(() => undefined);
		await rm(tempRoot, { recursive: true, force: true });
	}
}

main().catch(error => {
	console.error('FLOAT daemon index persistence test failed:', error);
	process.exit(1);
});
