/**
 * FLOAT STUDIO: Step 5 Codebase Semantic Indexing & Vector RAG Test Suite
 *
 * Verifies:
 * 1. Merkle-tree incremental hashing & dirty file detection (zero-overhead on unchanged files)
 * 2. Semantic AST chunking of TypeScript and Python functions/classes with line ranges
 * 3. Multi-signal vector embedding & cosine similarity ranking
 * 4. Bounded context extraction strictly honoring character limits (token budgets)
 * 5. Native @codebase and @symbol mention grounding in FloatContextProvider
 */

import assert from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FloatMerkleTree } from '../desktop/src/vs/workbench/contrib/float/common/workspace/floatMerkleTree.ts';
import { FloatSemanticChunker } from '../desktop/src/vs/workbench/contrib/float/common/workspace/floatSemanticChunker.ts';
import { FloatVectorIndex } from '../desktop/src/vs/workbench/contrib/float/common/workspace/floatVectorIndex.ts';
import { FloatWorkspaceIndexer } from '../desktop/src/vs/workbench/contrib/float/common/workspace/floatWorkspaceIndexer.ts';
import { FloatContextProvider } from '../desktop/src/vs/workbench/contrib/float/browser/context/floatContextProvider.ts';
import { FloatBrainService } from '../desktop/src/vs/workbench/contrib/float/common/brain/floatBrainService.ts';

async function runSuite(): Promise<void> {
	console.log('================================================================');
	console.log('  FLOAT STUDIO: STEP 5 CODEBASE SEMANTIC INDEXING & VECTOR RAG   ');
	console.log('================================================================\n');

	// -------------------------------------------------------------
	// Suite 1: Merkle-Tree Incremental Hashing
	// -------------------------------------------------------------
	console.log('--- Suite 1: Merkle-Tree Hashing & Change Detection ---');
	{
		const merkle = new FloatMerkleTree();
		assert.strictEqual(merkle.rootHash, '');

		// 1. Initial file indexing
		const changed1 = merkle.updateFile('src/auth.ts', 'export function login() { return true; }');
		assert.strictEqual(changed1, true);
		const initialRoot = merkle.rootHash;
		assert(initialRoot.length > 0, 'Root hash must be generated');

		// 2. Unchanged file: updateFile must return false and keep root hash identical
		const unchanged = merkle.updateFile('src/auth.ts', 'export function login() { return true; }');
		assert.strictEqual(unchanged, false, 'Unchanged file must return false');
		assert.strictEqual(merkle.rootHash, initialRoot, 'Root hash must remain identical for identical content');

		// 3. Modifying file changes root hash
		const changed2 = merkle.updateFile('src/auth.ts', 'export function login() { return false; }');
		assert.strictEqual(changed2, true);
		assert.notStrictEqual(merkle.rootHash, initialRoot, 'Modified file must change root hash');

		// 4. Dirty detection
		const dirty = merkle.getDirtyFiles({
			'src/auth.ts': 'export function login() { return false; }', // clean
			'src/user.ts': 'export interface User { id: string; }'      // dirty (new)
		});
		assert.strictEqual(dirty.length, 1);
		assert.strictEqual(dirty[0], 'src/user.ts');
		console.log('  -> PASS: Merkle-tree hashing, dirty tracking, and incremental skipping verified');
	}

	// -------------------------------------------------------------
	// Suite 2: AST Semantic Symbol & Chunking Engine
	// -------------------------------------------------------------
	console.log('\n--- Suite 2: AST Semantic Symbol & Chunking Engine ---');
	{
		const tsCode = `
import { db } from './db';

export interface PaymentRecord {
    id: string;
    amount: number;
}

export class PaymentProcessor {
    processPayment(record: PaymentRecord): boolean {
        return record.amount > 0;
    }
}

export function refundTransaction(txId: string): void {
    console.log("Refunding", txId);
}
`;
		const chunks = FloatSemanticChunker.chunkFile('src/payment.ts', tsCode);
		assert(chunks.length >= 3, `Expected at least 3 semantic chunks, got ${chunks.length}`);

		const ifaceChunk = chunks.find(c => c.symbolName === 'PaymentRecord');
		assert(ifaceChunk !== undefined);
		assert.strictEqual(ifaceChunk.symbolKind, 'interface');
		assert(ifaceChunk.startLine > 0);

		const classChunk = chunks.find(c => c.symbolName === 'PaymentProcessor');
		assert(classChunk !== undefined);
		assert.strictEqual(classChunk.symbolKind, 'class');

		const funcChunk = chunks.find(c => c.symbolName === 'refundTransaction');
		assert(funcChunk !== undefined);
		assert.strictEqual(funcChunk.symbolKind, 'function');
		assert(funcChunk.tokens.includes('refundtransaction'));

		// Test Python chunking
		const pyCode = `
class DataPipeline:
    def execute(self):
        pass

def load_dataset(path):
    return []
`;
		const pyChunks = FloatSemanticChunker.chunkFile('scripts/pipeline.py', pyCode);
		assert(pyChunks.some(c => c.symbolName === 'DataPipeline'));
		assert(pyChunks.some(c => c.symbolName === 'load_dataset'));
		console.log('  -> PASS: TypeScript and Python AST symbols accurately chunked with line boundaries');
	}

	// -------------------------------------------------------------
	// Suite 3: Vector Embeddings & Hybrid Search Ranking
	// -------------------------------------------------------------
	console.log('\n--- Suite 3: Vector Embeddings & Hybrid Search Ranking ---');
	{
		const vectorIndex = new FloatVectorIndex();

		const chunks = [
			{
				id: 'chunk-1',
				filePath: 'src/auth/jwt.ts',
				symbolName: 'verifyJwtToken',
				symbolKind: 'function' as const,
				startLine: 1,
				endLine: 10,
				content: 'export function verifyJwtToken(token: string): boolean { return Boolean(token); }',
				tokens: ['verifyjwttoken', 'verify', 'jwt', 'token', 'auth', 'boolean']
			},
			{
				id: 'chunk-2',
				filePath: 'src/ui/chart.tsx',
				symbolName: 'renderBarChart',
				symbolKind: 'function' as const,
				startLine: 1,
				endLine: 15,
				content: 'export function renderBarChart(data: number[]): JSX.Element { return <svg />; }',
				tokens: ['renderbarchart', 'render', 'bar', 'chart', 'svg', 'ui']
			},
			{
				id: 'chunk-3',
				filePath: 'src/db/orders.ts',
				symbolName: 'fetchUserOrders',
				symbolKind: 'function' as const,
				startLine: 1,
				endLine: 20,
				content: 'export async function fetchUserOrders(userId: string) { return db.query(userId); }',
				tokens: ['fetchuserorders', 'fetch', 'user', 'orders', 'db', 'query']
			}
		];

		for (const c of chunks) {
			vectorIndex.addChunk(c);
		}

		// 1. Semantic query matching "jwt authentication verification"
		const authResults = vectorIndex.search('jwt authentication verification');
		assert(authResults.length > 0);
		assert.strictEqual(authResults[0].chunk.symbolName, 'verifyJwtToken', 'verifyJwtToken must be top ranked for auth query');
		assert(authResults[0].cosineSimilarity > 0, 'Vector cosine similarity must be positive');

		// 2. Exact symbol lookup "renderBarChart"
		const chartResults = vectorIndex.search('renderBarChart');
		assert.strictEqual(chartResults[0].chunk.symbolName, 'renderBarChart');
		assert(chartResults[0].signals.includes('exact_symbol'));

		console.log('  -> PASS: Multi-signal ranking accurately prioritizes semantic similarity and exact symbols');
	}

	// -------------------------------------------------------------
	// Suite 4: Bounded Context Extraction & Token Budgeting
	// -------------------------------------------------------------
	console.log('\n--- Suite 4: Bounded Context Extraction & Token Budgeting ---');
	{
		const vectorIndex = new FloatVectorIndex();
		for (let i = 1; i <= 10; i++) {
			vectorIndex.addChunk({
				id: `chunk-${i}`,
				filePath: `src/module_${i}.ts`,
				symbolName: `handler_${i}`,
				symbolKind: 'function',
				startLine: 1,
				endLine: 20,
				content: `export function handler_${i}() {\n    // Implementation logic for module ${i}\n    console.log("Running task ${i}");\n}`,
				tokens: ['handler', `module_${i}`, 'task', 'implementation']
			});
		}

		// Request bounded context with max 350 chars
		const bounded = vectorIndex.retrieveBoundedContext('task handler', 350);
		assert(bounded.chunks.length > 0);
		assert(bounded.totalChars <= 350, `totalChars (${bounded.totalChars}) must not exceed limit 350`);
		assert(bounded.formattedText.includes('// --- src/module_'));
		console.log(`  -> PASS: Bounded context strictly constrained (budget: 350 chars, delivered: ${bounded.totalChars} chars across ${bounded.chunks.length} chunks)`);
	}

	// -------------------------------------------------------------
	// Suite 5: FloatContextProvider @codebase & @symbol Grounding
	// -------------------------------------------------------------
	console.log('\n--- Suite 5: @codebase & @symbol Context Provider Grounding ---');
	{
		const indexer = new FloatWorkspaceIndexer();
		indexer.indexFile('src/auth/service.ts', 'export function authenticate(user: string): boolean { return true; }');
		indexer.indexFile('src/billing/invoice.ts', 'export class InvoiceGenerator { generate(): string { return "INV-1"; } }');

		const mockBrainService = new FloatBrainService();
		const mockFloatService: any = {
			getWorkspaceIndexer: () => indexer,
			getBrainService: () => mockBrainService
		};

		const contextProvider = new FloatContextProvider(mockFloatService);

		// Resolve prompt with @codebase and @symbol
		const resolved = contextProvider.resolveContext('How does @codebase handle login with @symbol:authenticate?');
		assert(resolved.files.length >= 2);

		const codebaseContext = resolved.files.find(f => f.path === '@codebase');
		assert(codebaseContext !== undefined);
		assert(codebaseContext.excerpt.includes('[Codebase Semantic Context:'));

		const symbolContext = resolved.files.find(f => f.path.startsWith('@symbol:authenticate'));
		assert(symbolContext !== undefined);
		assert(symbolContext.excerpt.includes('authenticate(user: string)'));

		console.log('  -> PASS: @codebase and @symbol mentions grounded with real semantic code excerpts');
	}

	// -------------------------------------------------------------
	// Suite 6: Durable metadata, vectors, and Merkle hash recovery
	// -------------------------------------------------------------
	console.log('\\n--- Suite 6: Durable Index Persistence & Recovery ---');
	{
		const root = await mkdtemp(path.join(tmpdir(), 'float-index-roundtrip-'));
		try {
			const metadataPath = path.join(root, '.float', 'index-meta.json');
			const source = new FloatWorkspaceIndexer();
			source.indexFile('src/auth/session.ts', 'export function verifySessionToken(token: string) { return token.length > 0; }');
			const originalHash = source.merkleTree.getFileHash('src/auth/session.ts');
			await source.saveIndexMetadata(metadataPath);

			const restored = new FloatWorkspaceIndexer();
			assert.strictEqual(await restored.loadIndexMetadata(metadataPath), true);
			assert.strictEqual(restored.merkleTree.getFileHash('src/auth/session.ts'), originalHash);
			assert(restored.searchCodebase('verify session token', 5).some(result => result.chunk.filePath === 'src/auth/session.ts'));
			assert.strictEqual(restored.getStats().chunkCount, source.getStats().chunkCount);
			console.log('  -> PASS: Searchable chunks and exact Merkle hashes survive indexer restart');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}

	console.log('\n================================================================');
	console.log('  ALL STEP 5 CODEBASE SEMANTIC RAG SUITES PASSED (100%)         ');
	console.log('================================================================');
}

runSuite().catch(err => {
	console.error('\nFAILED Suite:', err);
	process.exit(1);
});
