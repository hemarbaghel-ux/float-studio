/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';

export interface IFloatCodeChunk {
	id: string;
	filePath: string;
	startLine: number;
	endLine: number;
	content: string;
	symbols: string[];
	vector?: number[];
}

export interface IFloatSearchResult {
	chunk: IFloatCodeChunk;
	score: number;
	matchType: 'vector' | 'lexical' | 'hybrid';
}

export class FloatVectorEngine {
	private readonly _chunks: IFloatCodeChunk[] = [];
	private readonly _vectorDim = 384;

	public chunkFile(filePath: string, content: string, chunkSize: number = 30): IFloatCodeChunk[] {
		const lines = content.split('\n');
		const chunks: IFloatCodeChunk[] = [];

		for (let i = 0; i < lines.length; i += chunkSize) {
			const slice = lines.slice(i, i + chunkSize);
			const chunkContent = slice.join('\n');
			const startLine = i + 1;
			const endLine = Math.min(lines.length, i + chunkSize);

			// Extract local symbols
			const symbols: string[] = [];
			const symMatches = chunkContent.matchAll(/(?:function|def|fn|class|interface|struct)\s+([a-zA-Z0-9_$]+)/g);
			for (const m of symMatches) {
				symbols.push(m[1]);
			}

			const chunkId = `${filePath}:${startLine}-${endLine}:${crypto.createHash('sha256').update(chunkContent, 'utf8').digest('hex').substring(0, 8)}`;
			const vector = this.embedText(chunkContent);

			const chunk: IFloatCodeChunk = {
				id: chunkId,
				filePath,
				startLine,
				endLine,
				content: chunkContent,
				symbols,
				vector
			};

			chunks.push(chunk);
		}

		return chunks;
	}

	public addChunks(chunks: IFloatCodeChunk[]): void {
		this._chunks.push(...chunks);
	}

	public clearFileChunks(filePath: string): void {
		for (let i = this._chunks.length - 1; i >= 0; i--) {
			if (this._chunks[i].filePath === filePath) {
				this._chunks.splice(i, 1);
			}
		}
	}

	public embedText(text: string): number[] {
		// Deterministic 384-dimensional dense semantic vector with hash projection & L2 normalization
		const vec = new Float64Array(this._vectorDim);
		const tokens = text.toLowerCase().match(/[a-zA-Z0-9_$]{2,}/g) || [];

		for (const tok of tokens) {
			const hash = crypto.createHash('sha256').update(tok, 'utf8').digest();
			for (let i = 0; i < 16; i++) {
				const idx = (hash[i] * 31 + hash[i + 16]) % this._vectorDim;
				vec[idx] += 1.0;
			}
		}

		// L2 normalize
		let norm = 0;
		for (let i = 0; i < this._vectorDim; i++) {
			norm += vec[i] * vec[i];
		}
		norm = Math.sqrt(norm);
		if (norm > 0) {
			for (let i = 0; i < this._vectorDim; i++) {
				vec[i] /= norm;
			}
		}

		return Array.from(vec);
	}

	public cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) return 0;
		let dot = 0;
		for (let i = 0; i < a.length; i++) {
			dot += a[i] * b[i];
		}
		return Math.max(0, Math.min(1, dot));
	}

	public search(query: string, topK: number = 5): IFloatSearchResult[] {
		const queryVec = this.embedText(query);
		const queryTokens = new Set((query.toLowerCase().match(/[a-zA-Z0-9_$]{2,}/g) || []));

		const scored: IFloatSearchResult[] = [];

		for (const chunk of this._chunks) {
			const sim = chunk.vector ? this.cosineSimilarity(queryVec, chunk.vector) : 0;

			// Lexical overlap
			let lexicalMatches = 0;
			for (const tok of queryTokens) {
				if (chunk.content.toLowerCase().includes(tok) || chunk.symbols.some(s => s.toLowerCase().includes(tok))) {
					lexicalMatches++;
				}
			}
			const lexicalScore = queryTokens.size > 0 ? lexicalMatches / queryTokens.size : 0;

			// Hybrid fusion: 60% vector + 40% lexical
			const hybridScore = (sim * 0.6) + (lexicalScore * 0.4);

			if (hybridScore > 0.05 || lexicalScore > 0.3) {
				scored.push({
					chunk,
					score: hybridScore,
					matchType: sim > lexicalScore ? 'vector' : (lexicalScore > sim ? 'lexical' : 'hybrid')
				});
			}
		}

		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, topK);
	}

	public get totalChunks(): number {
		return this._chunks.length;
	}

	/** Returns a detached snapshot of every searchable code chunk. */
	public getAllChunks(): IFloatCodeChunk[] {
		return this._chunks.map(chunk => ({ ...chunk, symbols: [...chunk.symbols], vector: chunk.vector ? [...chunk.vector] : undefined }));
	}

	/** Restores persisted chunks and their precomputed feature vectors. */
	public restoreChunks(chunks: IFloatCodeChunk[]): void {
		this._chunks.length = 0;
		for (const chunk of chunks) {
			if (!chunk || typeof chunk.id !== 'string' || typeof chunk.filePath !== 'string' || typeof chunk.content !== 'string') {
				throw new Error('Invalid persisted semantic chunk');
			}
			this._chunks.push({ ...chunk, symbols: Array.isArray(chunk.symbols) ? [...chunk.symbols] : [], vector: Array.isArray(chunk.vector) ? [...chunk.vector] : undefined });
		}
	}
}
