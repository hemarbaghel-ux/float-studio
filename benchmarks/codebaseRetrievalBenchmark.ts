/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FloatTreeSitterIndexer } from '../daemon/src/indexer/floatTreeSitterIndexer.js';
import { FloatAstSemanticChunker } from '../daemon/src/chunker/floatAstSemanticChunker.js';
import { FloatVectorEngine, FloatBm25Engine } from '../daemon/src/vector/floatVectorEngine.js';

export interface IBenchmarkQuery {
	id: number;
	query: string;
	expectedFile: string;
	expectedSymbol?: string;
}

export interface IRetrievalMetrics {
	strategy: string;
	totalQueries: number;
	recallAt5: number;
	recallAt10: number;
	precisionAt5: number;
	mrrAt10: number;
	ndcgAt10: number;
	p50LatencyMs: number;
	p95LatencyMs: number;
	indexTimeMs: number;
	memoryUsedMb: number;
}

export class CodebaseRetrievalBenchmark {
	private readonly _fixturesDir: string;
	private readonly _queries: IBenchmarkQuery[];

	constructor() {
		this._fixturesDir = path.join(os.tmpdir(), 'float-retrieval-benchmark-fixtures');
		this._queries = this._buildBenchmarkQueries();
	}

	private _buildBenchmarkQueries(): IBenchmarkQuery[] {
		const queries: IBenchmarkQuery[] = [];
		const topics = [
			{ category: 'auth', file: 'auth/sessionService.ts', sym: 'validateSession' },
			{ category: 'database', file: 'db/connectionPool.ts', sym: 'acquireClient' },
			{ category: 'crypto', file: 'crypto/keyDerivation.ts', sym: 'deriveMasterKey' },
			{ category: 'network', file: 'net/httpClient.ts', sym: 'executeRequestWithRetry' },
			{ category: 'parser', file: 'syntax/astWalker.ts', sym: 'traverseSubtree' }
		];

		let id = 1;
		for (const t of topics) {
			queries.push(
				{ id: id++, query: `How does session validation work in ${t.category}?`, expectedFile: t.file, expectedSymbol: t.sym },
				{ id: id++, query: `Where is ${t.sym} implemented?`, expectedFile: t.file, expectedSymbol: t.sym },
				{ id: id++, query: `Inspect connection lifecycle and client acquisition for ${t.category}`, expectedFile: t.file, expectedSymbol: t.sym },
				{ id: id++, query: `Find error handling and retry logic in ${t.file}`, expectedFile: t.file, expectedSymbol: t.sym },
				{ id: id++, query: `Show the interface definition for ${t.sym}`, expectedFile: t.file, expectedSymbol: t.sym },
				{ id: id++, query: `Security checks and key derivation in ${t.file}`, expectedFile: t.file, expectedSymbol: t.sym },
				{ id: id++, query: `Configuration options for ${t.category} pool`, expectedFile: t.file, expectedSymbol: t.sym },
				{ id: id++, query: `Implementation details of ${t.sym} method`, expectedFile: t.file, expectedSymbol: t.sym },
				{ id: id++, query: `Heartbeat and keepalive ping in ${t.category}`, expectedFile: t.file, expectedSymbol: t.sym },
				{ id: id++, query: `Exported functions and types in ${t.file}`, expectedFile: t.file, expectedSymbol: t.sym }
			);
		}

		return queries; // Exactly 50 reproducible queries
	}

	public async setupFixtures(): Promise<void> {
		if (fs.existsSync(this._fixturesDir)) {
			await fs.promises.rm(this._fixturesDir, { recursive: true, force: true }).catch(() => {});
		}
		await fs.promises.mkdir(this._fixturesDir, { recursive: true });

		const fixtures: { relPath: string; content: string }[] = [
			{
				relPath: 'auth/sessionService.ts',
				content: `
export interface ISession {
	sessionId: string;
	userId: string;
	expiresAt: number;
}

export class SessionService {
	private readonly sessions = new Map<string, ISession>();

	public validateSession(sessionId: string): boolean {
		const session = this.sessions.get(sessionId);
		if (!session) return false;
		return Date.now() < session.expiresAt;
	}

	public invalidateSession(sessionId: string): void {
		this.sessions.delete(sessionId);
	}
}`
			},
			{
				relPath: 'db/connectionPool.ts',
				content: `
export interface IPoolConfig {
	maxConnections: number;
	idleTimeoutMs: number;
}

export class ConnectionPool {
	private activeCount = 0;

	public async acquireClient(): Promise<any> {
		this.activeCount++;
		return { query: async (sql: string) => [] };
	}

	public releaseClient(client: any): void {
		this.activeCount = Math.max(0, this.activeCount - 1);
	}
}`
			},
			{
				relPath: 'crypto/keyDerivation.ts',
				content: `
export class KeyDerivationService {
	public deriveMasterKey(password: string, salt: string): string {
		// SHA-256 key derivation
		return 'derived-master-key-001';
	}

	public verifyHash(key: string, expectedHash: string): boolean {
		return key.length > 0;
	}
}`
			},
			{
				relPath: 'net/httpClient.ts',
				content: `
export class HttpClient {
	public async executeRequestWithRetry(url: string, maxRetries: number = 3): Promise<string> {
		for (let i = 0; i < maxRetries; i++) {
			try {
				return 'OK';
			} catch {}
		}
		throw new Error('Network timeout');
	}
}`
			},
			{
				relPath: 'syntax/astWalker.ts',
				content: `
export class AstWalker {
	public traverseSubtree(root: any, callback: (node: any) => void): void {
		callback(root);
		for (const child of (root.children || [])) {
			this.traverseSubtree(child, callback);
		}
	}
}`
			}
		];

		for (const f of fixtures) {
			const full = path.join(this._fixturesDir, f.relPath);
			await fs.promises.mkdir(path.dirname(full), { recursive: true });
			await fs.promises.writeFile(full, f.content.trim(), 'utf8');
		}
	}

	public async runBenchmark(): Promise<IRetrievalMetrics[]> {
		await this.setupFixtures();
		const results: IRetrievalMetrics[] = [];

		const indexer = new FloatTreeSitterIndexer();
		const chunker = new FloatAstSemanticChunker(indexer);
		const vectorEngine = new FloatVectorEngine();

		// Index all fixture files
		const t0 = Date.now();
		const files = [
			'auth/sessionService.ts',
			'db/connectionPool.ts',
			'crypto/keyDerivation.ts',
			'net/httpClient.ts',
			'syntax/astWalker.ts'
		];

		for (const rel of files) {
			const full = path.join(this._fixturesDir, rel);
			const content = await fs.promises.readFile(full, 'utf8');
			await indexer.indexFileAsync(rel, content);
			const chunks = await chunker.chunkFileAsync(rel, content);
			await vectorEngine.addChunks(chunks);
		}
		const indexTimeMs = Date.now() - t0;

		// Evaluate Strategies
		const strategies: ('bm25-only' | 'symbol-only' | 'hybrid')[] = ['bm25-only', 'symbol-only', 'hybrid'];

		for (const strat of strategies) {
			let hitsAt5 = 0;
			let hitsAt10 = 0;
			let sumPrecisionAt5 = 0;
			let sumReciprocalRank = 0;
			let sumNdcg = 0;
			const latencies: number[] = [];

			for (const q of this._queries) {
				const start = Date.now();
				let searchMatches: any[] = [];

				if (strat === 'bm25-only') {
					// Pure lexical search
					const raw = (vectorEngine as any)._bm25.search(q.query);
					const sorted = Array.from(raw.entries()).sort((a: any, b: any) => b[1] - a[1]);
					searchMatches = sorted.slice(0, 10).map((e: any) => ({
						filePath: (vectorEngine as any)._chunks.get(e[0])?.filePath,
						symbolName: (vectorEngine as any)._chunks.get(e[0])?.symbolName
					}));
				} else if (strat === 'symbol-only') {
					const syms = indexer.findSymbolsByName(q.query);
					searchMatches = syms.slice(0, 10).map(s => ({ filePath: s.filePath, symbolName: s.symbol.name }));
				} else {
					// Production Hybrid Retrieval
					const res = await vectorEngine.searchHybrid(q.query, { topK: 10 });
					searchMatches = res.map(r => ({ filePath: r.chunk.filePath, symbolName: r.chunk.symbolName }));
				}

				const lat = Date.now() - start;
				latencies.push(lat);

				// Compute metrics against ground truth
				const top5 = searchMatches.slice(0, 5);
				const top10 = searchMatches.slice(0, 10);

				const hit5 = top5.some(m => m.filePath === q.expectedFile || (q.expectedSymbol && m.symbolName === q.expectedSymbol));
				const hit10 = top10.some(m => m.filePath === q.expectedFile || (q.expectedSymbol && m.symbolName === q.expectedSymbol));

				if (hit5) hitsAt5++;
				if (hit10) hitsAt10++;

				const relCount5 = top5.filter(m => m.filePath === q.expectedFile).length;
				sumPrecisionAt5 += (relCount5 / 5);

				// MRR@10
				let rank = 0;
				for (let i = 0; i < top10.length; i++) {
					if (top10[i].filePath === q.expectedFile) {
						rank = i + 1;
						break;
					}
				}
				if (rank > 0) {
					sumReciprocalRank += (1.0 / rank);
					sumNdcg += (1.0 / (Math.log2(rank + 1)));
				}
			}

			latencies.sort((a, b) => a - b);
			const p50 = latencies[Math.floor(latencies.length * 0.5)] || 1;
			const p95 = latencies[Math.floor(latencies.length * 0.95)] || 2;
			const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

			results.push({
				strategy: strat,
				totalQueries: this._queries.length,
				recallAt5: Math.round((hitsAt5 / this._queries.length) * 100) / 100,
				recallAt10: Math.round((hitsAt10 / this._queries.length) * 100) / 100,
				precisionAt5: Math.round((sumPrecisionAt5 / this._queries.length) * 100) / 100,
				mrrAt10: Math.round((sumReciprocalRank / this._queries.length) * 100) / 100,
				ndcgAt10: Math.round((sumNdcg / this._queries.length) * 100) / 100,
				p50LatencyMs: p50,
				p95LatencyMs: p95,
				indexTimeMs,
				memoryUsedMb: mem
			});
		}

		await this.teardown();
		return results;
	}

	public async teardown(): Promise<void> {
		if (fs.existsSync(this._fixturesDir)) {
			await fs.promises.rm(this._fixturesDir, { recursive: true, force: true }).catch(() => {});
		}
	}
}

// Direct CLI execution
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.endsWith('codebaseRetrievalBenchmark.ts')) {
	const benchmark = new CodebaseRetrievalBenchmark();
	benchmark.runBenchmark().then(metrics => {
		console.log('\n=================== FLOAT CODEBASE RETRIEVAL BENCHMARK ===================');
		console.table(metrics);
		console.log('===========================================================================\n');
	}).catch(err => {
		console.error('Benchmark execution error:', err);
		process.exit(1);
	});
}
