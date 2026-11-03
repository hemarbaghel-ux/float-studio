/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ISemanticCodeChunk, tokenizeCode } from './floatSemanticChunker.js';

export interface IRankedCodeChunk {
	chunk: ISemanticCodeChunk;
	score: number;
	cosineSimilarity: number;
	signals: string[];
}

export interface IBoundedContextResult {
	chunks: IRankedCodeChunk[];
	totalChars: number;
	formattedText: string;
}

const VECTOR_DIMS = 256;

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

export class FloatVectorIndex {
	private readonly _chunks = new Map<string, ISemanticCodeChunk>();
	private readonly _vectors = new Map<string, Float64Array>();
	private readonly _fileChunks = new Map<string, Set<string>>(); // filePath -> Set<chunkId>

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
	}

	public removeChunksForFile(filePath: string): void {
		const norm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
		const chunkIds = this._fileChunks.get(norm);
		if (chunkIds) {
			for (const id of chunkIds) {
				this._chunks.delete(id);
				this._vectors.delete(id);
			}
			this._fileChunks.delete(norm);
		}
	}

	public clear(): void {
		this._chunks.clear();
		this._vectors.clear();
		this._fileChunks.clear();
	}

	/**
	 * Multi-Signal Semantic Search:
	 * Combines exact symbol matching, path matching, token overlap, and vector cosine similarity
	 */
	public search(query: string, limit: number = 10): IRankedCodeChunk[] {
		const normQuery = query.trim().toLowerCase();
		if (!normQuery) return [];

		const queryTokens = tokenizeCode(query);
		const queryVec = embedTokens(queryTokens);
		const ranked: IRankedCodeChunk[] = [];

		for (const [id, chunk] of this._chunks.entries()) {
			const chunkVec = this._vectors.get(id);
			if (!chunkVec) continue;

			const cosine = computeCosineSimilarity(queryVec, chunkVec);
			let score = cosine * 40; // up to 40 pts from vector similarity
			const signals: string[] = [];

			if (cosine > 0.3) {
				signals.push(`vector_sim:${cosine.toFixed(2)}`);
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

			// Token overlap
			let tokenMatches = 0;
			for (const qt of queryTokens) {
				if (chunk.tokens.includes(qt)) {
					tokenMatches++;
				}
			}
			if (tokenMatches > 0 && queryTokens.length > 0) {
				const overlapRatio = tokenMatches / queryTokens.length;
				score += overlapRatio * 25;
				signals.push(`tokens:${tokenMatches}/${queryTokens.length}`);
			}

			if (score > 10) {
				ranked.push({
					chunk,
					score: Math.round(score * 10) / 10,
					cosineSimilarity: Math.round(cosine * 1000) / 1000,
					signals
				});
			}
		}

		ranked.sort((a, b) => b.score - a.score);
		return ranked.slice(0, limit);
	}

	/**
	 * Retrieves bounded code excerpts strictly capped by a character limit (token budget)
	 */
	public retrieveBoundedContext(query: string, maxChars: number = 6000): IBoundedContextResult {
		const ranked = this.search(query, 12);
		const selected: IRankedCodeChunk[] = [];
		const blocks: string[] = [];
		let totalChars = 0;

		for (const r of ranked) {
			const header = `// --- ${r.chunk.filePath} (L${r.chunk.startLine}-${r.chunk.endLine}) [${r.chunk.symbolKind || 'block'}: ${r.chunk.symbolName || 'anonymous'}] ---`;
			const block = `${header}\n${r.chunk.content}\n`;

			if (totalChars + block.length > maxChars && selected.length > 0) {
				break;
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
