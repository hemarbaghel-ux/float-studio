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

export class FloatVectorEngine {
	private readonly _chunks = new Map<string, IFloatSemanticChunk>();
	private readonly _chunkVectors = new Map<string, number[]>();
	private readonly _bm25 = new FloatBm25Engine();
	private _embeddingProvider: IFloatEmbeddingProvider | null = null;

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
			chunks.push({
				id,
				filePath,
				language: path.extname(filePath).slice(1) || 'generic',
				startLine,
				endLine,
				content: chunkContent,
				hash
			});
		}
		return chunks;
	}

	public async addChunks(chunks: IFloatSemanticChunk[], signal?: AbortSignal): Promise<void> {
		for (const chunk of chunks) {
			this._chunks.set(chunk.id, chunk);
			// BM25 indexes full chunk text plus symbol name and docstring
			const indexableText = `${chunk.filePath} ${chunk.symbolName || ''} ${chunk.docstring || ''}\n${chunk.content}`;
			this._bm25.addDocument(chunk.id, indexableText);
		}

		// If embedding provider is available, batch embed
		if (this._embeddingProvider) {
			try {
				const available = await this._embeddingProvider.isAvailable();
				if (available) {
					const textsToEmbed = chunks.map(c => `${c.symbolName || ''}\n${c.content.substring(0, 500)}`);
					const vectors = await this._embeddingProvider.embedBatch(textsToEmbed, signal);
					for (let i = 0; i < chunks.length; i++) {
						this._chunkVectors.set(chunks[i].id, vectors[i]);
					}
				}
			} catch (err) {
				// Retain lexical index; do NOT fabricate embeddings
				console.warn('[FloatVectorEngine] Embedding provider failed; retaining BM25 and symbol search:', err);
			}
		}
	}

	public clearFileChunks(filePath: string): void {
		for (const [id, chunk] of this._chunks.entries()) {
			if (chunk.filePath === filePath) {
				this._chunks.delete(id);
				this._chunkVectors.delete(id);
				this._bm25.removeDocument(id);
			}
		}
	}

	public cosineSimilarity(a: number[], b: number[]): number {
		if (!a || !b || a.length !== b.length) return 0;
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

	public search(query: string, topK: number = 5): { chunk: any; score: number; matchType: 'vector' | 'lexical' | 'hybrid' }[] {
		const queryLower = query.toLowerCase();
		const queryTokens = this._bm25.tokenize(query);
		const bm25RawScores = this._bm25.search(query);
		let maxBm25 = 0;
		for (const s of bm25RawScores.values()) {
			if (s > maxBm25) maxBm25 = s;
		}

		const scored: { chunk: any; score: number; matchType: 'vector' | 'lexical' | 'hybrid' }[] = [];
		for (const [id, chunk] of this._chunks.entries()) {
			const rawBm25 = bm25RawScores.get(id) || 0;
			const bm25Score = maxBm25 > 0 ? rawBm25 / maxBm25 : 0;

			let symbolMatchScore = 0;
			if (chunk.symbolName) {
				const symLower = chunk.symbolName.toLowerCase();
				if (queryLower.includes(symLower) || queryTokens.includes(symLower)) {
					symbolMatchScore = 1.0;
				} else if (queryTokens.some(t => symLower.includes(t) || (t.length >= 5 && symLower.startsWith(t.substring(0, 5))))) {
					symbolMatchScore = 0.7;
				}
			}

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

			const score = (bm25Score * 0.4) + (contentMatch * 0.3) + (symbolMatchScore * 0.3);
			if (score > 0.05 || bm25Score > 0.1 || symbolMatchScore > 0 || contentMatch > 0.2) {
				scored.push({
					chunk: {
						id: chunk.id,
						filePath: chunk.filePath,
						startLine: chunk.startLine,
						endLine: chunk.endLine,
						content: chunk.content,
						symbols: chunk.symbolName ? [chunk.symbolName] : []
					},
					score: Math.round(score * 1000) / 1000,
					matchType: symbolMatchScore > bm25Score ? 'lexical' : 'hybrid'
				});
			}
		}

		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, topK);
	}

	public async searchHybrid(query: string, options: IFloatSearchOptions = {}): Promise<IFloatHybridSearchResult[]> {
		const topK = options.topK || 5;
		const queryLower = query.toLowerCase();
		const queryTokens = this._bm25.tokenize(query);

		// 1. Candidate Filtering
		const candidateIds = new Set<string>();
		for (const [id, chunk] of this._chunks.entries()) {
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
			const chunk = this._chunks.get(id)!;

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
		return this._chunks.size;
	}

	public getAllChunks(): IFloatSemanticChunk[] {
		return Array.from(this._chunks.values());
	}
}
