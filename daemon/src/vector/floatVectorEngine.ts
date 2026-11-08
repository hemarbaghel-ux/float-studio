/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';
import * as path from 'path';
import { IFloatSemanticChunk } from '../chunker/floatAstSemanticChunker.js';

export interface IFloatEmbeddingProvider {
	readonly providerId: string;
	readonly modelName: string;
	readonly dimension: number;
	embedBatch(texts: string[], signal?: AbortSignal): Promise<number[][]>;
	isAvailable(): Promise<boolean>;
}

/**
 * Local Ollama Embedding Provider (e.g. nomic-embed-text or all-minilm)
 */
export class FloatOllamaEmbeddingProvider implements IFloatEmbeddingProvider {
	public readonly providerId = 'ollama-local';
	public readonly modelName: string;
	public readonly dimension: number;
	private readonly _host: string;
	private readonly _port: number;

	constructor(options: { modelName?: string; dimension?: number; host?: string; port?: number } = {}) {
		this.modelName = options.modelName || 'nomic-embed-text';
		this.dimension = options.dimension || 768;
		this._host = options.host || '127.0.0.1';
		this._port = options.port || 11434;
	}

	public async isAvailable(): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			const req = http.request(
				{
					host: this._host,
					port: this._port,
					path: '/api/tags',
					method: 'GET',
					timeout: 1000
				},
				(res) => {
					resolve(res.statusCode === 200);
				}
			);
			req.on('error', () => resolve(false));
			req.on('timeout', () => {
				req.destroy();
				resolve(false);
			});
			req.end();
		});
	}

	public async embedBatch(texts: string[], signal?: AbortSignal): Promise<number[][]> {
		const vectors: number[][] = [];
		for (const text of texts) {
			if (signal?.aborted) {
				throw new Error('Embedding generation aborted by user.');
			}
			const vec = await this._embedSingle(text, signal);
			if (vec.length !== this.dimension) {
				throw new Error(`Dimension mismatch: expected ${this.dimension}, received ${vec.length}`);
			}
			vectors.push(vec);
		}
		return vectors;
	}

	private async _embedSingle(text: string, signal?: AbortSignal): Promise<number[]> {
		return new Promise<number[]>((resolve, reject) => {
			const payload = JSON.stringify({ model: this.modelName, prompt: text });
			const req = http.request(
				{
					host: this._host,
					port: this._port,
					path: '/api/embeddings',
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Content-Length': Buffer.byteLength(payload)
					},
					timeout: 5000
				},
				(res) => {
					let data = '';
					res.on('data', (c) => (data += c));
					res.on('end', () => {
						try {
							const parsed = JSON.parse(data);
							if (parsed.embedding && Array.isArray(parsed.embedding)) {
								resolve(parsed.embedding);
							} else {
								reject(new Error('Invalid response from Ollama embeddings: ' + data));
							}
						} catch (e) {
							reject(e);
						}
					});
				}
			);

			if (signal) {
				signal.addEventListener('abort', () => {
					req.destroy();
					reject(new Error('Embedding request aborted.'));
				});
			}

			req.on('error', reject);
			req.on('timeout', () => {
				req.destroy();
				reject(new Error('Ollama connection timeout.'));
			});
			req.write(payload);
			req.end();
		});
	}
}

/**
 * Standard Okapi BM25 Lexical Retrieval Engine
 */
export class FloatBm25Engine {
	private readonly _k1 = 1.2;
	private readonly _b = 0.75;
	// Inverted index: term -> Map<docId, termFrequency>
	private readonly _invertedIndex = new Map<string, Map<string, number>>();
	private readonly _docLengths = new Map<string, number>();
	private _totalLength = 0;

	public tokenize(text: string): string[] {
		return (text.toLowerCase().match(/[a-zA-Z0-9_$]{2,}/g) || []);
	}

	public addDocument(docId: string, text: string): void {
		this.removeDocument(docId);

		const tokens = this.tokenize(text);
		const length = tokens.length;
		this._docLengths.set(docId, length);
		this._totalLength += length;

		// Calculate frequencies
		const freqMap = new Map<string, number>();
		for (const tok of tokens) {
			freqMap.set(tok, (freqMap.get(tok) || 0) + 1);
		}

		for (const [term, freq] of freqMap.entries()) {
			let postings = this._invertedIndex.get(term);
			if (!postings) {
				postings = new Map<string, number>();
				this._invertedIndex.set(term, postings);
			}
			postings.set(docId, freq);
		}
	}

	public removeDocument(docId: string): void {
		const existingLength = this._docLengths.get(docId);
		if (existingLength !== undefined) {
			this._totalLength -= existingLength;
			this._docLengths.delete(docId);

			for (const postings of this._invertedIndex.values()) {
				postings.delete(docId);
			}
		}
	}

	public search(query: string, candidateDocIds?: Set<string>): Map<string, number> {
		const queryTokens = this.tokenize(query);
		const scores = new Map<string, number>();
		const totalDocs = this._docLengths.size;
		if (totalDocs === 0 || queryTokens.length === 0) return scores;

		const avgDocLength = this._totalLength / totalDocs;

		for (const term of queryTokens) {
			const postings = this._invertedIndex.get(term);
			if (!postings) continue;

			const docFreq = postings.size;
			// Standard IDF formula with Robertson-Spärck Jones smoothing
			const idf = Math.log((totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1.0);

			for (const [docId, tf] of postings.entries()) {
				if (candidateDocIds && !candidateDocIds.has(docId)) continue;

				const docLen = this._docLengths.get(docId) || avgDocLength;
				const tfNorm = (tf * (this._k1 + 1)) / (tf + this._k1 * (1 - this._b + this._b * (docLen / avgDocLength)));
				const termScore = idf * tfNorm;

				scores.set(docId, (scores.get(docId) || 0) + termScore);
			}
		}

		return scores;
	}

	public clear(): void {
		this._invertedIndex.clear();
		this._docLengths.clear();
		this._totalLength = 0;
	}

	public get totalDocuments(): number {
		return this._docLengths.size;
	}
}

export interface IFloatSearchOptions {
	topK?: number;
	languageFilter?: string;
	pathFilter?: string;
	activeFile?: string;
	signal?: AbortSignal;
}

export interface IFloatHybridSearchResult {
	chunk: IFloatSemanticChunk;
	score: number;
	scoreBreakdown: {
		bm25Score: number;
		denseVectorScore: number;
		symbolMatchScore: number;
		pathMatchScore: number;
		currentFileBonus: number;
	};
	matchType: 'hybrid' | 'lexical' | 'dense' | 'symbol';
	isNeuralScored: boolean;
}

export interface IFloatSearchDiagnostics {
	indexedChunks: number;
	candidateChunks: number;
	scoredChunks: number;
	queryTokenCount: number;
}

const BM25_K1 = 1.2;
const BM25_B = 0.75;

export class FloatVectorEngine {
	private readonly _chunks: (IFloatCodeChunk | IFloatSemanticChunk)[] = [];
	private readonly _chunkById = new Map<string, IFloatCodeChunk | IFloatSemanticChunk>();
	private readonly _fileChunkIds = new Map<string, Set<string>>();
	private readonly _chunkTokens = new Map<string, string[]>();
	private readonly _docLengths = new Map<string, number>();
	private readonly _invertedIndex = new Map<string, Map<string, number>>();
	private readonly _chunkVectors = new Map<string, number[]>();
	private readonly _vectorDim = 384;
	private _totalTokens = 0;
	private readonly _bm25 = new FloatBm25Engine();
	private _embeddingProvider: IFloatEmbeddingProvider | null = null;
	private _lastSearchDiagnostics: IFloatSearchDiagnostics = {
		indexedChunks: 0,
		candidateChunks: 0,
		scoredChunks: 0,
		queryTokenCount: 0
	};

	constructor(embeddingProvider?: IFloatEmbeddingProvider) {
		this._embeddingProvider = embeddingProvider || null;
	}

	public setEmbeddingProvider(provider: IFloatEmbeddingProvider | null): void {
		this._embeddingProvider = provider;
	}

	public get embeddingProvider(): IFloatEmbeddingProvider | null {
		return this._embeddingProvider;
	}

	public chunkFile(filePath: string, content: string, chunkSize: number = 30): IFloatSemanticChunk[] {
		const lines = content.split('\n');
		const chunks: IFloatSemanticChunk[] = [];
		for (let i = 0; i < lines.length; i += chunkSize) {
			const slice = lines.slice(i, i + chunkSize);
			const chunkContent = slice.join('\n');
			const startLine = i + 1;
			const endLine = Math.min(lines.length, i + chunkSize);
			const hash = crypto.createHash('sha256').update(chunkContent, 'utf8').digest('hex');
			const id = `${filePath}#L${startLine}-L${endLine}:${hash.substring(0, 8)}`;
			const symbols: string[] = [];
			const symMatches = chunkContent.matchAll(/(?:function|def|fn|class|interface|struct)\s+([a-zA-Z0-9_$]+)/g);
			for (const match of symMatches) {
				symbols.push(match[1]);
			}
			chunks.push({
				id,
				filePath,
				language: path.extname(filePath).slice(1) || 'generic',
				startLine,
				endLine,
				content: chunkContent,
				hash,
				symbols,
				vector: this.embedText(`${chunkContent} ${symbols.join(' ')}`)
			});
		}
		return chunks;
	}

	public async addChunks(chunks: (IFloatCodeChunk | IFloatSemanticChunk)[], signal?: AbortSignal): Promise<void> {
		for (const chunk of chunks) {
			this._removeChunkById(chunk.id);

			const symArray: string[] = 'symbols' in chunk && Array.isArray(chunk.symbols)
				? chunk.symbols
				: (chunk as IFloatSemanticChunk).symbolName ? [(chunk as IFloatSemanticChunk).symbolName!] : [];

			const stored: any = {
				...chunk,
				symbols: symArray,
				vector: chunk.vector ? [...chunk.vector] : this.embedText(`${chunk.content} ${symArray.join(' ')}`)
			};

			const indexedPath = stored.filePath.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
			const tokens = this._tokenize(`${indexedPath} ${stored.content} ${symArray.join(' ')}`);
			const termFrequencies = new Map<string, number>();
			for (const token of tokens) {
				termFrequencies.set(token, (termFrequencies.get(token) || 0) + 1);
			}

			this._chunks.push(stored);
			this._chunkById.set(stored.id, stored);
			this._chunkTokens.set(stored.id, tokens);
			this._docLengths.set(stored.id, tokens.length);
			this._totalTokens += tokens.length;

			let fileIds = this._fileChunkIds.get(stored.filePath);
			if (!fileIds) {
				fileIds = new Set<string>();
				this._fileChunkIds.set(stored.filePath, fileIds);
			}
			fileIds.add(stored.id);

			for (const [token, frequency] of termFrequencies) {
				let posting = this._invertedIndex.get(token);
				if (!posting) {
					posting = new Map<string, number>();
					this._invertedIndex.set(token, posting);
				}
				posting.set(stored.id, frequency);
			}

			const indexableText = `${chunk.filePath} ${symArray.join(' ')}\n${chunk.content}`;
			this._bm25.addDocument(chunk.id, indexableText);
		}

		if (this._embeddingProvider) {
			try {
				const available = await this._embeddingProvider.isAvailable();
				if (available) {
					const textsToEmbed = chunks.map(c => {
						const sym = 'symbols' in c ? c.symbols.join(' ') : (c as any).symbolName || '';
						return `${sym}\n${c.content.substring(0, 500)}`;
					});
					const vectors = await this._embeddingProvider.embedBatch(textsToEmbed, signal);
					for (let i = 0; i < chunks.length; i++) {
						this._chunkVectors.set(chunks[i].id, vectors[i]);
					}
				}
			} catch (err) {
				console.warn('[FloatVectorEngine] Embedding provider failed; retaining BM25 and symbol search:', err);
			}
		}
	}

	public clearFileChunks(filePath: string): void {
		const ids = this._fileChunkIds.get(filePath);
		if (!ids) {
			return;
		}
		for (const id of Array.from(ids)) {
			this._removeChunkById(id);
		}
	}

	private _removeChunkById(id: string): void {
		const existing = this._chunkById.get(id);
		if (!existing) {
			return;
		}

		for (const token of new Set(this._chunkTokens.get(id) ?? [])) {
			const posting = this._invertedIndex.get(token);
			posting?.delete(id);
			if (posting?.size === 0) {
				this._invertedIndex.delete(token);
			}
		}
		this._totalTokens = Math.max(0, this._totalTokens - (this._docLengths.get(id) ?? 0));
		this._chunkTokens.delete(id);
		this._docLengths.delete(id);
		this._chunkById.delete(id);
		this._chunkVectors.delete(id);
		this._bm25.removeDocument(id);

		const fileIds = this._fileChunkIds.get(existing.filePath);
		fileIds?.delete(id);
		if (fileIds?.size === 0) {
			this._fileChunkIds.delete(existing.filePath);
		}

		const index = this._chunks.findIndex(chunk => chunk.id === id);
		if (index >= 0) {
			this._chunks.splice(index, 1);
		}
	}

	private _tokenize(text: string): string[] {
		const identifiers = text.match(/[A-Za-z_$][A-Za-z0-9_$]*|\d+/g) ?? [];
		const tokens: string[] = [];
		for (const identifier of identifiers) {
			const whole = identifier.toLowerCase();
			if (whole.length >= 2) {
				tokens.push(whole);
			}
			const parts = identifier
				.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
				.split(/[_$\s]+/)
				.map(part => part.toLowerCase())
				.filter(part => part.length >= 2);
			tokens.push(...parts);
		}
		return tokens;
	}

	public embedText(text: string): number[] {
		// Deterministic hash-projection features. These are not learned embeddings.
		const vector = new Float64Array(this._vectorDim);
		const tokens = this._tokenize(text);
		for (const token of tokens) {
			const hash = crypto.createHash('sha256').update(token, 'utf8').digest();
			for (let i = 0; i < 16; i++) {
				const index = (hash[i] * 31 + hash[i + 16]) % this._vectorDim;
				vector[index] += 1;
			}
		}

		let norm = 0;
		for (let i = 0; i < this._vectorDim; i++) {
			norm += vector[i] * vector[i];
		}
		norm = Math.sqrt(norm);
		if (norm > 0) {
			for (let i = 0; i < this._vectorDim; i++) {
				vector[i] /= norm;
			}
		}
		return Array.from(vector);
	}

	public cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length || a.length !== this._vectorDim) {
			return 0;
		}
		let dot = 0;
		let normA = 0;
		let normB = 0;
		for (let i = 0; i < a.length; i++) {
			dot += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}
		if (normA === 0 || normB === 0) return 0;
		return Math.max(0, Math.min(1, dot / (Math.sqrt(normA) * Math.sqrt(normB))));
	}

	private _computeBM25Scores(queryTokens: string[]): Map<string, number> {
		const scores = new Map<string, number>();
		const documentCount = this._chunks.length;
		if (documentCount === 0 || queryTokens.length === 0) {
			return scores;
		}
		const averageDocumentLength = this._totalTokens / documentCount;
		if (averageDocumentLength <= 0) {
			return scores;
		}

		for (const token of new Set(queryTokens)) {
			const posting = this._invertedIndex.get(token);
			if (!posting || posting.size === 0) {
				continue;
			}
			const documentFrequency = posting.size;
			const inverseDocumentFrequency = Math.log(
				1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5)
			);
			for (const [chunkId, frequency] of posting) {
				const documentLength = this._docLengths.get(chunkId) ?? averageDocumentLength;
				const denominator = frequency + BM25_K1 * (
					1 - BM25_B + BM25_B * (documentLength / averageDocumentLength)
				);
				const termScore = inverseDocumentFrequency * (
					(frequency * (BM25_K1 + 1)) / denominator
				);
				scores.set(chunkId, (scores.get(chunkId) ?? 0) + termScore);
			}
		}
		return scores;
	}

	public search(query: string, topK: number = 5): IFloatSearchResult[] {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery || this._chunks.length === 0) {
			this._lastSearchDiagnostics = {
				indexedChunks: this._chunks.length,
				candidateChunks: 0,
				scoredChunks: 0,
				queryTokenCount: 0
			};
			return [];
		}
		const limit = Number.isFinite(topK) ? Math.max(1, Math.min(50, Math.trunc(topK))) : 5;
		const queryTokens = this._tokenize(query);
		if (queryTokens.length === 0) {
			this._lastSearchDiagnostics = {
				indexedChunks: this._chunks.length,
				candidateChunks: 0,
				scoredChunks: 0,
				queryTokenCount: 0
			};
			return [];
		}
		// Keep complete identifiers separate from prose tokens. A natural-language
		// request can contain an exact symbol plus several descriptive words;
		// comparing the symbol against the entire normalized sentence loses that
		// high-confidence signal.
		const queryIdentifiers = new Set(
			(query.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [])
				.map(identifier => identifier.toLowerCase().replace(/[^a-z0-9_$]/g, ''))
		);
		const queryVector = this.embedText(query);
		const bm25Scores = this._computeBM25Scores(queryTokens);
		const candidateIds = Array.from(bm25Scores.keys());
		this._lastSearchDiagnostics = {
			indexedChunks: this._chunks.length,
			candidateChunks: candidateIds.length,
			scoredChunks: 0,
			queryTokenCount: new Set(queryTokens).size
		};
		if (candidateIds.length === 0) {
			return [];
		}
		const queryIdentifier = normalizedQuery.replace(/[^a-z0-9_$]/g, '');
		const ranked: IFloatSearchResult[] = [];

		// Candidate generation uses the inverted BM25 index. The expensive vector,
		// symbol and MMR scoring stages now evaluate only documents with a lexical,
		// symbol or path token hit, rather than scanning the complete workspace.
		for (const chunkId of candidateIds) {
			const chunk = this._chunkById.get(chunkId);
			if (!chunk) {
				continue;
			}
			this._lastSearchDiagnostics.scoredChunks++;
			const vectorScore = chunk.vector ? this.cosineSimilarity(queryVector, chunk.vector) : 0;
			const bm25Score = bm25Scores.get(chunk.id) ?? 0;
			const normalizedBM25 = bm25Score / (bm25Score + 1.5);

			let symbolBoost = 0;
			for (const symbol of chunk.symbols) {
				const normalizedSymbol = symbol.toLowerCase().replace(/[^a-z0-9_$]/g, '');
				if (normalizedSymbol && queryIdentifiers.has(normalizedSymbol)) {
					// Exact identifier match remains strong even inside a prose query.
					symbolBoost = Math.max(symbolBoost, 0.36);
				} else if (
					normalizedSymbol &&
					(normalizedSymbol === queryIdentifier ||
						queryTokens.some(token => normalizedSymbol === token) ||
						normalizedSymbol.includes(queryIdentifier) ||
						queryIdentifier.includes(normalizedSymbol))
				) {
					symbolBoost = Math.max(symbolBoost, 0.14);
				}
			}

			// Split camelCase path components before _tokenize lowercases identifiers.
			const pathTokens = this._tokenize(chunk.filePath.replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
			const uniqueQueryTokens = new Set(queryTokens);
			const pathMatches = queryTokens.filter(token => pathTokens.includes(token)).length;
			const pathBoost = uniqueQueryTokens.size > 0
				? (pathMatches / uniqueQueryTokens.size) * 0.10
				: 0;

			// BM25 is the main lexical signal; hash projection is a secondary signal.
			const score = (normalizedBM25 * 0.58) + (vectorScore * 0.22) + symbolBoost + pathBoost;
			if (score <= 0.025) {
				continue;
			}

			ranked.push({
				chunk,
				score,
				matchType: bm25Score > 0 && vectorScore > 0.02
					? 'hybrid'
					: bm25Score > 0 || symbolBoost > 0 || pathBoost > 0
						? 'lexical'
						: 'vector'
			});
		}

		ranked.sort((a, b) => b.score - a.score);
		return this._applyMMR(ranked, limit);
	}

	public getLastSearchDiagnostics(): IFloatSearchDiagnostics {
		return { ...this._lastSearchDiagnostics };
	}

	private _applyMMR(
		ranked: IFloatSearchResult[],
		limit: number,
		lambda: number = 0.72
	): IFloatSearchResult[] {
		if (ranked.length <= limit) {
			return ranked;
		}
		const selected: IFloatSearchResult[] = [];
		const remaining = [...ranked];

		while (selected.length < limit && remaining.length > 0) {
			let bestIndex = 0;
			let bestMMRScore = -Infinity;
			for (let i = 0; i < remaining.length; i++) {
				const candidate = remaining[i];
				let redundancy = 0;
				for (const chosen of selected) {
					if (candidate.chunk.filePath === chosen.chunk.filePath) {
						redundancy = 1;
						continue;
					}
					if (candidate.chunk.vector && chosen.chunk.vector) {
						redundancy = Math.max(
							redundancy,
							this.cosineSimilarity(candidate.chunk.vector, chosen.chunk.vector)
						);
					}
				}
				const mmrScore = lambda * candidate.score - (1 - lambda) * redundancy;
				if (mmrScore > bestMMRScore) {
					bestMMRScore = mmrScore;
					bestIndex = i;
				}
			}
			selected.push(remaining[bestIndex]);
			remaining.splice(bestIndex, 1);
		}
		return selected;
	}

	public getChunks(): IFloatCodeChunk[] {
		return this._chunks.map(chunk => ({
			...chunk,
			symbols: [...chunk.symbols],
			vector: chunk.vector ? [...chunk.vector] : undefined
		}));
	}

	public restoreChunks(chunks: IFloatCodeChunk[]): void {
		const seenIds = new Set<string>();
		const valid: IFloatCodeChunk[] = [];
		for (const chunk of chunks) {
			if (
				!chunk ||
				typeof chunk.id !== 'string' ||
				!chunk.id ||
				typeof chunk.filePath !== 'string' ||
				!chunk.filePath ||
				!Number.isInteger(chunk.startLine) || chunk.startLine < 1 ||
				!Number.isInteger(chunk.endLine) || chunk.endLine < chunk.startLine ||
				typeof chunk.content !== 'string' ||
				!Array.isArray(chunk.symbols) ||
				!chunk.symbols.every(symbol => typeof symbol === 'string') ||
				(chunk.vector !== undefined && (
					!Array.isArray(chunk.vector) ||
					chunk.vector.length !== this._vectorDim ||
					!chunk.vector.every(Number.isFinite)
				))
			) {
				throw new Error('FLOAT semantic index contains an invalid stored vector chunk.');
			}
			if (seenIds.has(chunk.id)) {
				throw new Error('FLOAT semantic index contains duplicate vector chunk IDs.');
			}
			seenIds.add(chunk.id);
			valid.push({
				...chunk,
				symbols: [...chunk.symbols],
				vector: chunk.vector ? [...chunk.vector] : undefined
			});
		}

		this._chunks.length = 0;
		this._chunkById.clear();
		this._fileChunkIds.clear();
		this._chunkTokens.clear();
		this._docLengths.clear();
		this._invertedIndex.clear();
		this._totalTokens = 0;
		this.addChunks(valid);
	}

	public async searchHybrid(query: string, options: IFloatSearchOptions = {}): Promise<IFloatHybridSearchResult[]> {
		const topK = options.topK || 5;
		const queryLower = query.toLowerCase();
		const queryTokens = this._bm25.tokenize(query);

		// 1. Candidate Filtering
		const candidateIds = new Set<string>();
		for (const [id, chunk] of this._chunkById.entries()) {
			if (options.languageFilter && chunk.language !== options.languageFilter) continue;
			if (options.pathFilter && !chunk.filePath.toLowerCase().includes(options.pathFilter.toLowerCase())) continue;
			candidateIds.add(id);
		}

		if (candidateIds.size === 0) return [];

		// 2. BM25 Lexical Retrieval
		const bm25RawScores = this._bm25.search(query, candidateIds);
		let maxBm25 = 0;
		for (const s of bm25RawScores.values()) {
			if (s > maxBm25) maxBm25 = s;
		}

		// 3. Optional Dense Embedding Retrieval
		let queryVector: number[] | null = null;
		let isNeural = false;
		if (this._embeddingProvider && (await this._embeddingProvider.isAvailable().catch(() => false))) {
			try {
				const [vec] = await this._embeddingProvider.embedBatch([query], options.signal);
				queryVector = vec;
				isNeural = true;
			} catch {}
		}

		const scoredResults: IFloatHybridSearchResult[] = [];

		for (const id of candidateIds) {
			const chunk = this._chunkById.get(id)!;

			// Normalized BM25 score (0 to 1)
			const rawBm25 = bm25RawScores.get(id) || 0;
			const bm25Score = maxBm25 > 0 ? rawBm25 / maxBm25 : 0;

			// Dense Vector Cosine Similarity
			let denseVectorScore = 0;
			if (queryVector && this._chunkVectors.has(id)) {
				denseVectorScore = this.cosineSimilarity(queryVector, this._chunkVectors.get(id)!);
			}

			// Symbol-Name Match Bonus
			let symbolMatchScore = 0;
			if (chunk.symbolName) {
				const symLower = chunk.symbolName.toLowerCase();
				if (queryLower.includes(symLower) || queryTokens.includes(symLower)) {
					symbolMatchScore = 1.0;
				} else if (queryTokens.some(t => symLower.includes(t) || (t.length >= 5 && symLower.startsWith(t.substring(0, 5))))) {
					symbolMatchScore = 0.7;
				}
			}

			// Path Match Bonus
			let pathMatchScore = 0;
			const pathLower = chunk.filePath.toLowerCase();
			const pathHits = queryTokens.filter(t => pathLower.includes(t) || (t.length >= 5 && pathLower.includes(t.substring(0, 5)))).length;
			if (queryTokens.length > 0) {
				pathMatchScore = Math.min(1.0, pathHits / queryTokens.length);
			}

			// Lexical Substring Content Match
			let contentMatch = 0;
			const contentLower = chunk.content.toLowerCase();
			for (const t of queryTokens) {
				if (contentLower.includes(t)) {
					contentMatch += 0.25;
				} else if (t.length >= 5 && contentLower.includes(t.substring(0, 5))) {
					contentMatch += 0.15;
				}
			}
			contentMatch = Math.min(1.0, contentMatch);

			// Active File Contextual Bonus
			let currentFileBonus = 0;
			if (options.activeFile && chunk.filePath === options.activeFile) {
				currentFileBonus = 0.15;
			}

			// Calibrated Score Fusion
			let compositeScore: number;
			let matchType: IFloatHybridSearchResult['matchType'];

			if (isNeural && denseVectorScore > 0) {
				compositeScore =
					(bm25Score * 0.30) +
					(denseVectorScore * 0.30) +
					(contentMatch * 0.15) +
					(symbolMatchScore * 0.15) +
					(pathMatchScore * 0.10) +
					currentFileBonus;
				matchType = 'hybrid';
			} else {
				// Pure Lexical + Symbol Retrieval (Truthful: never fake neural vectors)
				compositeScore =
					(bm25Score * 0.35) +
					(contentMatch * 0.30) +
					(symbolMatchScore * 0.20) +
					(pathMatchScore * 0.15) +
					currentFileBonus;
				matchType = symbolMatchScore > bm25Score ? 'symbol' : 'lexical';
			}

			if (compositeScore > 0.05 || bm25Score > 0.1 || symbolMatchScore > 0 || contentMatch > 0.2) {
				scoredResults.push({
					chunk,
					score: Math.round(compositeScore * 1000) / 1000,
					scoreBreakdown: {
						bm25Score: Math.round(bm25Score * 1000) / 1000,
						denseVectorScore: Math.round(denseVectorScore * 1000) / 1000,
						symbolMatchScore: Math.round(symbolMatchScore * 1000) / 1000,
						pathMatchScore: Math.round(pathMatchScore * 1000) / 1000,
						currentFileBonus: Math.round(currentFileBonus * 1000) / 1000
					},
					matchType,
					isNeuralScored: isNeural && denseVectorScore > 0
				});
			}
		}

		scoredResults.sort((a, b) => b.score - a.score);
		return scoredResults.slice(0, topK);
	}

	public get totalChunks(): number {
		return this._chunkById.size;
	}

	public getAllChunks(): IFloatSemanticChunk[] {
		return Array.from(this._chunkById.values()) as any;
	}
}
