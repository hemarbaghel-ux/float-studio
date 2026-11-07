/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { FloatVectorEngine, IFloatCodeChunk } from '../daemon/src/vector/floatVectorEngine.ts';

function makeChunk(
	engine: FloatVectorEngine,
	id: string,
	filePath: string,
	content: string,
	symbols: string[] = []
): IFloatCodeChunk {
	const lines = content.split(/\r?\n/);
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
			'export function retryTokenCache() { return tokenCache.refresh(); } // cache manager rotates an access token with retry policy',
			['retryTokenCache']
		),
		makeChunk(
			engine,
			'workspace-refresh',
			'src/workspace/sessionManager.ts',
			'export function loadWorkspaceSession() { return sessionStore.getToken(); } // restore the workspace session token after refresh',
			['loadWorkspaceSession']
		)
	]);

	const matches = engine.search('refreshWorkspaceToken', 2);
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

	// CamelCase path components must be split before lowercasing. This fixture
	// deliberately keeps the query terms out of the chunk body and symbols.
	const pathRankingEngine = new FloatVectorEngine();
	const pathOnlyChunk = makeChunk(
		pathRankingEngine,
		'path-only-session-manager',
		'src/workspace/sessionManager.ts',
		'export const adapter = createAdapter();',
		['createAdapter']
	);
	// Remove the body vector signal so this assertion isolates path-token scoring.
	pathOnlyChunk.vector = new Array(384).fill(0);
	pathRankingEngine.addChunks([pathOnlyChunk]);
	const pathOnlyResults = pathRankingEngine.search('session manager', 3);
	assert.equal(
		pathOnlyResults[0]?.chunk.filePath,
		'src/workspace/sessionManager.ts',
		'camelCase filename segments should contribute path relevance even when the body has no query terms'
	);

	// Exact identifier detection must survive natural-language query framing.
	// The distractor intentionally shares the surrounding vocabulary and
	// repeats it, but it does not define the requested symbol.
	const symbolRankingEngine = new FloatVectorEngine();
	symbolRankingEngine.addChunks([
		makeChunk(
			symbolRankingEngine,
			'exact-workspace-credential-resolver',
			'src/identity/credentialResolver.ts',
			'export function resolveCredentialForWorkspace() { return identityProvider.load(); }',
			['resolveCredentialForWorkspace']
		),
		makeChunk(
			symbolRankingEngine,
			'lexical-workspace-credential-cache',
			'src/cache/workspaceCredentialStore.ts',
			'export function loadWorkspaceCredentials() {\n // resolveCredentialForWorkspace is called by the workspace credential provider\n // resolveCredentialForWorkspace loads the access token from the workspace credential cache\n // resolveCredentialForWorkspace resolves workspace credentials and access token lookup\n return credentialCache.load();\n}',
			['loadWorkspaceCredentials']
		),
		makeChunk(
			symbolRankingEngine,
			'other-identity-provider',
			'src/identity/provider.ts',
			'export function loadIdentityProvider() { return provider.current(); }',
			['loadIdentityProvider']
		)
	]);
	const proseSymbolResults = symbolRankingEngine.search(
		'Find resolveCredentialForWorkspace in the workspace credential provider and load the access token',
		3
	);
	assert.equal(
		proseSymbolResults[0]?.chunk.id,
		'exact-workspace-credential-resolver',
		'exact symbol should outrank a lexically similar file when embedded in natural-language instructions'
	);



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
	assert.ok(restored.search('refreshWorkspaceToken', 2).some(match => match.chunk.filePath === 'src/workspace/sessionManager.ts'));

	// Deterministic relevance/latency smoke benchmark. This is an offline
	// retrieval-quality guard, not a learned-embedding or ANN scalability claim.
	const benchmarkEngine = new FloatVectorEngine();
	const benchmarkDocuments = [
		{
			id: 'bench-auth-refresh',
			path: 'src/auth/sessionRefresh.ts',
			content: 'export function refreshWorkspaceToken(refreshCredential: string) { // rotate the access token using a refresh credential and persist updated session expiry' ,
			symbols: ['refreshWorkspaceToken']
		},
		{
			id: 'bench-auth-verify',
			path: 'src/auth/tokenVerifier.ts',
			content: 'export function verifyBearerToken(token: string) { // validate bearer JWT signature, issuer and expiration before granting a session' ,
			symbols: ['verifyBearerToken']
		},
		{
			id: 'bench-account-store',
			path: 'src/accounts/accountStore.ts',
			content: 'export function loadAccountRecord(accountId: string) { // load account profile record from persistent account storage by account id' ,
			symbols: ['loadAccountRecord']
		},
		{
			id: 'bench-invoice-totals',
			path: 'src/billing/invoiceTotals.ts',
			content: 'export function calculateInvoiceTotals(lines: InvoiceLine[]) { // calculate invoice subtotal, line items, discounts and tax rate' ,
			symbols: ['calculateInvoiceTotals']
		},
		{
			id: 'bench-session-cache',
			path: 'src/cache/sessionCache.ts',
			content: 'export function invalidateSessionCache(sessionId: string) { // invalidate expired session cache entries and remove stale credential data' ,
			symbols: ['invalidateSessionCache']
		},
		{
			id: 'bench-workspace-root',
			path: 'src/workspaces/workspaceResolver.ts',
			content: 'export function resolveWorkspaceRoot(uri: string) { // resolve active workspace root path from file URI and normalize folder location' ,
			symbols: ['resolveWorkspaceRoot']
		}
	];
	const benchmarkChunks = benchmarkDocuments.map(document =>
		makeChunk(benchmarkEngine, document.id, document.path, document.content, document.symbols)
	);
	for (let index = 0; index < 96; index++) {
		benchmarkChunks.push(makeChunk(
			benchmarkEngine,
			`bench-unrelated-${index}`,
				`src/graphics/viewportRenderer${index}.ts`,
				`export function renderViewportFrame${index}() { return canvas.drawSprite(${index}); } // GPU texture and sprite rendering pipeline`,
				[`renderViewportFrame${index}`]
			));
	}

	const indexStart = performance.now();
	benchmarkEngine.addChunks(benchmarkChunks);
	const indexingDurationMs = performance.now() - indexStart;
	const benchmarkCases = [
		{ query: 'refreshWorkspaceToken refresh credential rotate access token', expectedPath: 'src/auth/sessionRefresh.ts' },
		{ query: 'verifyBearerToken validate bearer JWT signature issuer expiration', expectedPath: 'src/auth/tokenVerifier.ts' },
		{ query: 'loadAccountRecord load account profile persistent storage', expectedPath: 'src/accounts/accountStore.ts' },
		{ query: 'calculateInvoiceTotals invoice subtotal discounts tax rate', expectedPath: 'src/billing/invoiceTotals.ts' },
		{ query: 'invalidateSessionCache expired session cache entries stale credential', expectedPath: 'src/cache/sessionCache.ts' },
		{ query: 'resolveWorkspaceRoot active workspace root file URI folder', expectedPath: 'src/workspaces/workspaceResolver.ts' }
	];

	let reciprocalRankTotal = 0;
	let recallAtFive = 0;
	for (const benchmarkCase of benchmarkCases) {
		const results = benchmarkEngine.search(benchmarkCase.query, 5);
		const rank = results.findIndex(result => result.chunk.filePath === benchmarkCase.expectedPath);
		if (rank >= 0) {
			recallAtFive++;
			reciprocalRankTotal += 1 / (rank + 1);
		}
	}
	const recallAtFiveScore = recallAtFive / benchmarkCases.length;
	const meanReciprocalRank = reciprocalRankTotal / benchmarkCases.length;
	assert.equal(recallAtFiveScore, 1, 'all curated code retrieval queries must find their expected file in top five');
	assert.ok(meanReciprocalRank >= 0.8, `curated retrieval MRR regressed: ${meanReciprocalRank.toFixed(3)}`);

	const searchLatencies: number[] = [];
	for (let repeat = 0; repeat < 20; repeat++) {
		for (const benchmarkCase of benchmarkCases) {
			const startedAt = performance.now();
			benchmarkEngine.search(benchmarkCase.query, 5);
			searchLatencies.push(performance.now() - startedAt);
		}
	}
	searchLatencies.sort((a, b) => a - b);
	const percentile = (value: number): number =>
		searchLatencies[Math.min(searchLatencies.length - 1, Math.ceil(value * searchLatencies.length) - 1)] ?? 0;
	const p50SearchMs = percentile(0.50);
	const p95SearchMs = percentile(0.95);
	assert.ok(Number.isFinite(indexingDurationMs) && indexingDurationMs >= 0);
	assert.ok(Number.isFinite(p50SearchMs) && Number.isFinite(p95SearchMs));

	console.log(
		`FLOAT retrieval smoke benchmark: Recall@5=${recallAtFiveScore.toFixed(2)}, ` +
		`MRR=${meanReciprocalRank.toFixed(3)}, chunks=${benchmarkChunks.length}, ` +
		`index=${indexingDurationMs.toFixed(2)}ms, search p50=${p50SearchMs.toFixed(3)}ms, ` +
		`p95=${p95SearchMs.toFixed(3)}ms.`
	);
	console.log('Metrics are deterministic fixture relevance plus local in-memory latency; they do not measure model embeddings or large-repository ANN performance.');

	console.log('FLOAT daemon hybrid retrieval: BM25, camelCase tokenization, stable-ID upsert, file cleanup and MMR diversity passed.');
}

main().catch(error => {
	console.error('FLOAT daemon hybrid retrieval test failed:', error);
	process.exit(1);
});
