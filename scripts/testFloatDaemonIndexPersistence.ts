/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FloatDaemonServer } from '../daemon/src/server/floatDaemonServer.ts';
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
		].join('\\n');
		const indexed = await firstClient.call<{ chunksCount: number }>('semantic_index_file', { filePath, content: source });
		assert.ok(indexed.chunksCount > 0);

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

		console.log('FLOAT daemon index persistence: searchable chunks and symbol metadata survive a daemon restart.');
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
