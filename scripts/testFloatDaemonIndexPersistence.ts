import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FloatDaemonServer } from '../daemon/src/server/floatDaemonServer.js';
import { FloatDaemonClient } from '../desktop/src/vs/workbench/contrib/float/common/daemon/floatDaemonClient.js';

async function run(): Promise<void> {
	const pipeName = process.platform === 'win32'
		? `\\\\.\\pipe\\float-index-persistence-${process.pid}-${Date.now()}`
		: path.join(os.tmpdir(), `float-index-persistence-${process.pid}-${Date.now()}.sock`);
	const storageDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'float-daemon-index-'));

	let server = new FloatDaemonServer({ pipeName });
	let client = new FloatDaemonClient({ pipeName });

	try {
		await server.start();
		await client.connect();

		const indexed = await client.indexFileSemantics(
			'src/auth/session.ts',
			'export function verifySessionToken(token: string): boolean { return token.length > 0; }'
		);
		assert.strictEqual(indexed.delta, 'added');
		assert(indexed.chunksCount > 0);

		const saved = await client.persistIndex(storageDir);
		assert.strictEqual(saved.saved, true);
		assert.strictEqual(saved.totalFiles, 1);
		assert.strictEqual(saved.totalChunks, indexed.chunksCount);

		client.dispose();
		await server.stop();

		// A fresh daemon instance must restore searchable chunks, not just file metadata.
		server = new FloatDaemonServer({ pipeName });
		client = new FloatDaemonClient({ pipeName });
		await server.start();
		await client.connect();

		const restored = await client.loadIndex(storageDir);
		assert.strictEqual(restored.loaded, true);
		assert.strictEqual(restored.totalFiles, 1);
		assert.strictEqual(restored.totalChunks, indexed.chunksCount);

		const search = await client.searchSemantics('verify session token', 5);
		assert(search.matches.some((match: { filePath: string }) => match.filePath === 'src/auth/session.ts'));

		console.log('PASS: daemon index chunks and vectors remain searchable after a full process restart');
	} finally {
		client.dispose();
		await server.stop().catch(() => undefined);
		await fs.promises.rm(storageDir, { recursive: true, force: true });
	}
}

run().catch(error => {
	console.error('FAIL: daemon index persistence round-trip', error);
	process.exitCode = 1;
});
