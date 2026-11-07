/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { FloatVectorEngine, IFloatCodeChunk } from '../daemon/src/vector/floatVectorEngine.ts';

function makeChunk(
	engine: FloatVectorEngine,
	id: string,
	filePath: string,
	content: string,
	symbols: string[] = []
): IFloatCodeChunk {
	const lines = content.split(/\\r?\\n/);
	return {
		id,
		filePath,
		startLine: 1,
		endLine: lines.length,
		content,
		symbols,
		vector: engine.embedText(`${content} ${symbols.join(' ')}`)
	};
}

async function main(): Promise<void> {
	const engine = new FloatVectorEngine();
	engine.addChunks([
		makeChunk(
			engine,
			'auth-refresh-1',
			'src/auth/session.ts',
			'export function refreshWorkspaceToken() { return tokenCache.refresh(); } // cache manager rotates the access token',
			['refreshWorkspaceToken']
		),
		makeChunk(
			engine,
			'auth-refresh-2',
			'src/auth/session.ts',
			'export function refreshWorkspaceToken() { return tokenCache.refresh(); } // cache manager rotates the access token with retry policy',
			['refreshWorkspaceToken']
		),
		makeChunk(
			engine,
			'workspace-refresh',
			'src/workspace/sessionManager.ts',
			'export function refreshWorkspaceToken() { return sessionStore.rotateToken(); } // update session token when credentials rotate',
			['refreshWorkspaceToken']
		)
	]);

	const matches = engine.search('refresh workspace token', 2);
	assert.equal(matches.length, 2);
	assert.equal(matches[0].chunk.id, 'auth-refresh-1', 'highest-relevance exact symbol match should rank first');
	assert.notEqual(
		matches[0].chunk.filePath,
		matches[1].chunk.filePath,
		'MMR selection should prefer a relevant second file over a near-duplicate chunk from the same file'
	);

	// CamelCase sub-tokens should remain searchable, even when the full
	// identifier is not present as a spaced phrase in the query.
	const camelCase = engine.search('session manager token', 5);
	assert.ok(camelCase.some(match => match.chunk.filePath === 'src/workspace/sessionManager.ts'));

	// Stable-ID upsert must remove stale BM25 terms and document-length weight.
	const upsertEngine = new FloatVectorEngine();
	upsertEngine.addChunks([
		makeChunk(upsertEngine, 'stable-id', 'src/cache.ts', 'staleAuthorizationCredentialLookup()', ['staleAuthorizationCredentialLookup'])
	]);
	assert.ok(upsertEngine.search('stale authorization credential', 5).some(match => match.chunk.id === 'stable-id'));
	upsertEngine.addChunks([
		makeChunk(upsertEngine, 'stable-id', 'src/session.ts', 'freshSessionLeaseRenewal()', ['freshSessionLeaseRenewal'])
	]);
	assert.equal(upsertEngine.totalChunks, 1, 'replacing a stable ID must not duplicate the chunk');
	assert.equal(upsertEngine.search('stale authorization credential', 5).length, 0, 'old BM25 postings must be removed on upsert');
	assert.ok(upsertEngine.search('fresh session lease', 5).some(match => match.chunk.id === 'stable-id'));

	upsertEngine.clearFileChunks('src/session.ts');
	assert.equal(upsertEngine.totalChunks, 0);
	assert.equal(upsertEngine.search('fresh session lease', 5).length, 0, 'file removal must clean searchable postings');

	// Restoring a persisted snapshot must rebuild the same retrieval structures.
	const restored = new FloatVectorEngine();
	restored.restoreChunks(engine.getChunks());
	assert.equal(restored.totalChunks, engine.totalChunks);
	assert.ok(restored.search('refresh workspace token', 2).some(match => match.chunk.filePath === 'src/workspace/sessionManager.ts'));

	console.log('FLOAT daemon hybrid retrieval: BM25, camelCase tokenization, stable-ID upsert, file cleanup and MMR diversity passed.');
}

main().catch(error => {
	console.error('FLOAT daemon hybrid retrieval test failed:', error);
	process.exit(1);
});
