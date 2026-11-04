/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ISemanticCodeChunk, tokenizeCode } from './floatSemanticChunker.js';

export interface IRankedCodeChunk {
	chunk: ISemanticCodeChunk;
	score: number;
	cosineSimilarity: number;
	bm25Score: number;
	signals: string[];
}

export interface IBoundedContextResult {
	chunks: IRankedCodeChunk[];
	totalChars: number;
	formattedText: string;
}

export interface ISerializedVectorIndex {
	chunks: ISemanticCodeChunk[];
	vectors: Array<{ id: string; values: number[] }>;
	bm25Stats?: {
		avgDocLength: number;
		totalDocs: number;
	};
}

const VECTOR_DIMS = 256;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/**
 * Deterministic hash-based sparse feature projection for in-memory code vector embeddings
 */
function embedTokens(tokens: string[]): Float64Array {
	const vec = new Float64Array(VECTOR_DIMS);
	if (tokens.length === 0) return vec;

	for (const token of tokens) {
		let h = 2166136261;
		for (let i = 0; i < token.length; i++) {
			h ^= token.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
		const idx = Math.abs(h) % VECTOR_DIMS;
		const sign = (h & 0x100) ? 1 : -1;
		vec[idx] += sign;
	}

	// L2 normalize vector
	let norm = 0;
	for (let i = 0; i < VECTOR_DIMS; i++) {
		norm += vec[i] * vec[i];
	}
	norm = Math.sqrt(norm);
	if (norm > 0) {
		for (let i = 0; i < VECTOR_DIMS; i++) {
			vec[i] /= norm;
		}
	}

	return vec;
}

function computeCosineSimilarity(a: Float64Array, b: Float64Array): number {
	let dot = 0;
	for (let i = 0; i < VECTOR_DIMS; i++) {
		dot += a[i] * b[i];
	}
	return Math.max(0, Math.min(1, dot));
}

/**
 * Production Hybrid Vector & BM25 Codebase Index Store
 */
export class FloatVectorIndex {
	private readonly _chunks = new Map<string, ISemanticCodeChunk>();
	private readonly _vectors = new Map<string, Float64Array>();
	private readonly _fileChunks = new Map<string, Set<string>>(); // filePath -> Set<chunkId>

	// Inverted index for BM25 keyword retrieval: token -> Map<chunkId, termFrequency>
	private readonly _invertedIndex = new Map<string, Map<string, number>>();
	private readonly _docLengths = new Map<string, number>();
	private _totalTokens: number = 0;

	public get chunkCount(): number {
		return this._chunks.size;
	}

	public addChunk(chunk: ISemanticCodeChunk): void {
		this._chunks.set(chunk.id, chunk);
		this._vectors.set(chunk.id, embedTokens(chunk.tokens));

		let fileSet = this._fileChunks.get(chunk.filePath);
		if (!fileSet) {
			fileSet = new Set();
			this._fileChunks.set(chunk.filePath, fileSet);
		}
		fileSet.add(chunk.id);

		// Index into BM25 inverted index
		const docLen = chunk.tokens.length;
		this._docLengths.set(chunk.id, docLen);
		this._totalTokens += docLen;

		const tfMap = new Map<string, number>();
		for (const t of chunk.tokens) {
			tfMap.set(t, (tfMap.get(t) || 0) + 1);
		}

		for (const [token, count] of tfMap.entries()) {
			let posting = this._invertedIndex.get(token);
			if (!posting) {
				posting = new Map();
				this._invertedIndex.set(token, posting);
			}
			posting.set(chunk.id, count);
		}
	}

	public removeChunksForFile(filePath: string): void {
		const norm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
		const chunkIds = this._fileChunks.get(norm);
		if (chunkIds) {
			for (const id of chunkIds) {
				const chunk = this._chunks.get(id);
				if (chunk) {
					for (const t of chunk.tokens) {
						const posting = this._invertedIndex.get(t);
						if (posting) {
							posting.delete(id);
							if (posting.size === 0) {
								this._invertedIndex.delete(t);
							}
						}
					}
					const docLen = this._docLengths.get(id) || 0;
					this._totalTokens = Math.max(0, this._totalTokens - docLen);
					this._docLengths.delete(id);
				}

				this._chunks.delete(id);
				this._vectors.delete(id);
			}
			this._fileChunks.delete(norm);
		}
	}

	public serialize(): ISerializedVectorIndex {
		const chunks = Array.from(this._chunks.values());
		const vectors: Array<{ id: string; values: number[] }> = [];
		for (const [id, vec] of this._vectors.entries()) {
			vectors.push({ id, values: Array.from(vec) });
		}
		const avgDocLength = this._chunks.size > 0 ? this._totalTokens / this._chunks.size : 0;
		return {
			chunks,
			vectors,
			bm25Stats: {
				avgDocLength,
				totalDocs: this._chunks.size
			}
		};
	}

	public deserialize(data: ISerializedVectorIndex): void {
		this.clear();
		if (!data || !Array.isArray(data.chunks)) return;

		for (const chunk of data.chunks) {
			this.addChunk(chunk);
		}

		if (Array.isArray(data.vectors)) {
			for (const v of data.vectors) {
				this._vectors.set(v.id, new Float64Array(v.values));
			}
		}
	}

	public clear(): void {
		this._chunks.clear();
		this._vectors.clear();
		this._fileChunks.clear();
		this._invertedIndex.clear();
		this._docLengths.clear();
		this._totalTokens = 0;
	}

	/**
	 * Computes Okapi BM25 score for a query across all indexed chunks
	 */
	private _computeBM25Scores(queryTokens: string[]): Map<string, number> {
		const scores = new Map<string, number>();
		const N = this._chunks.size;
		if (N === 0 || queryTokens.length === 0) return scores;

		const avgdl = this._totalTokens / N;

		for (const token of queryTokens) {
			const posting = this._invertedIndex.get(token);
			if (!posting || posting.size === 0) continue;

			const df = posting.size;
			// Robertson-Spärck Jones IDF
			const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

			for (const [chunkId, freq] of posting.entries()) {
				const docLen = this._docLengths.get(chunkId) || avgdl;
				const tf = (freq * (BM25_K1 + 1)) / (freq + BM25_K1 * (1 - BM25_B + BM25_B * (docLen / avgdl)));
				const termScore = idf * tf;
				scores.set(chunkId, (scores.get(chunkId) || 0) + termScore);
			}
		}

		return scores;
	}

	/**
	 * Multi-Signal Hybrid Semantic Search (BM25 + Dense Vector + Exact Symbol + AST Boosting):
	 * Combines dense vector similarity with sparse BM25 retrieval and Maximal Marginal Relevance (MMR)
	 */
	public search(query: string, limit: number = 10): IRankedCodeChunk[] {
		const normQuery = query.trim().toLowerCase();
		if (!normQuery) return [];

		const queryTokens = tokenizeCode(query);
		const queryVec = embedTokens(queryTokens);
		const bm25Map = this._computeBM25Scores(queryTokens);
		const ranked: IRankedCodeChunk[] = [];

		for (const [id, chunk] of this._chunks.entries()) {
			const chunkVec = this._vectors.get(id);
			if (!chunkVec) continue;

			const cosine = computeCosineSimilarity(queryVec, chunkVec);
			const bm25 = bm25Map.get(id) || 0;

			let score = (cosine * 35) + (Math.min(bm25, 10) * 4); // combined base score
			const signals: string[] = [];

			if (cosine > 0.25) {
				signals.push(`vector_sim:${cosine.toFixed(2)}`);
			}
			if (bm25 > 0.5) {
				signals.push(`bm25:${bm25.toFixed(2)}`);
			}

			// Exact symbol name match
			if (chunk.symbolName) {
				const symLower = chunk.symbolName.toLowerCase();
				if (symLower === normQuery) {
					score += 100;
					signals.push('exact_symbol');
				} else if (symLower.includes(normQuery) || normQuery.includes(symLower)) {
					score += 50;
					signals.push('symbol_substr');
				}
			}

			// Path / filename match
			const pathLower = chunk.filePath.toLowerCase();
			const fileName = pathLower.split('/').pop() || '';
			if (fileName.includes(normQuery)) {
				score += 35;
				signals.push('filename_match');
			} else if (pathLower.includes(normQuery)) {
				score += 20;
				signals.push('path_match');
			}

			// AST structure boosting (functions, classes, interfaces are prioritized over arbitrary blocks)
			if (chunk.symbolKind && chunk.symbolKind !== 'block') {
				score += 10;
				signals.push(`ast:${chunk.symbolKind}`);
			}

			if (score > 10) {
				ranked.push({
					chunk,
					score,
					cosineSimilarity: cosine,
					bm25Score: bm25,
					signals
				});
			}
		}

		// Sort descending by score
		ranked.sort((a, b) => b.score - a.score);

		// Apply Maximal Marginal Relevance (MMR) to prevent returning redundant chunks from same file
		return this._applyMMR(ranked, queryVec, limit);
	}

	/**
	 * Maximal Marginal Relevance (MMR) for diverse, non-redundant context chunks
	 */
	private _applyMMR(ranked: IRankedCodeChunk[], queryVec: Float64Array, limit: number, lambda: number = 0.7): IRankedCodeChunk[] {
		if (ranked.length <= limit) return ranked;

		const selected: IRankedCodeChunk[] = [];
		const remaining = [...ranked];

		while (selected.length < limit && remaining.length > 0) {
			let bestIdx = 0;
			let bestScore = -Infinity;

			for (let i = 0; i < remaining.length; i++) {
				const candidate = remaining[i];
				const candVec = this._vectors.get(candidate.chunk.id);
				if (!candVec) continue;

				// Sim to query
				const simToQuery = candidate.cosineSimilarity;

				// Max sim to already selected chunks
				let maxSimToSelected = 0;
				for (const sel of selected) {
					const selVec = this._vectors.get(sel.chunk.id);
					if (selVec) {
						const sim = computeCosineSimilarity(candVec, selVec);
						if (sim > maxSimToSelected) {
							maxSimToSelected = sim;
						}
					}
				}

				// MMR formula
				const mmrScore = lambda * (candidate.score / 100) - (1 - lambda) * maxSimToSelected;
				if (mmrScore > bestScore) {
					bestScore = mmrScore;
					bestIdx = i;
				}
			}

			selected.push(remaining[bestIdx]);
			remaining.splice(bestIdx, 1);
		}

		return selected;
	}

	/**
	 * Extracts token-budgeted bounded semantic context for prompt injections
	 */
	public retrieveBoundedContext(query: string, maxChars: number = 6000): IBoundedContextResult {
		const ranked = this.search(query, 20);
		const selected: IRankedCodeChunk[] = [];
		const blocks: string[] = [];
		let totalChars = 0;

		for (const r of ranked) {
			const header = `// --- ${r.chunk.filePath} (L${r.chunk.startLine}-${r.chunk.endLine}) [${r.chunk.symbolKind || 'block'}: ${r.chunk.symbolName || 'anonymous'}] ---`;
			const block = `${header}\n${r.chunk.content}\n`;

			if (totalChars + block.length > maxChars) {
				continue;
			}

			selected.push(r);
			blocks.push(block);
			totalChars += block.length;
		}

		return {
			chunks: selected,
			totalChars,
			formattedText: blocks.join('\n')
		};
	}
}
