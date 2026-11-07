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

const BM25_K1 = 1.2;
const BM25_B = 0.75;

export class FloatVectorEngine {
	private readonly _chunks: IFloatCodeChunk[] = [];
	private readonly _chunkById = new Map<string, IFloatCodeChunk>();
	private readonly _fileChunkIds = new Map<string, Set<string>>();
	private readonly _chunkTokens = new Map<string, string[]>();
	private readonly _docLengths = new Map<string, number>();
	private readonly _invertedIndex = new Map<string, Map<string, number>>();
	private readonly _vectorDim = 384;
	private _totalTokens = 0;

	public chunkFile(filePath: string, content: string, chunkSize: number = 30): IFloatCodeChunk[] {
		const lines = content.split('\n');
		const chunks: IFloatCodeChunk[] = [];

		for (let i = 0; i < lines.length; i += chunkSize) {
			const slice = lines.slice(i, i + chunkSize);
			const chunkContent = slice.join('\n');
			const startLine = i + 1;
			const endLine = Math.min(lines.length, i + chunkSize);
			const symbols: string[] = [];
			const symMatches = chunkContent.matchAll(/(?:function|def|fn|class|interface|struct)\s+([a-zA-Z0-9_$]+)/g);
			for (const match of symMatches) {
				symbols.push(match[1]);
			}

			const chunkId = `${filePath}:${startLine}-${endLine}:${crypto.createHash('sha256').update(chunkContent, 'utf8').digest('hex').substring(0, 8)}`;
			chunks.push({
				id: chunkId,
				filePath,
				startLine,
				endLine,
				content: chunkContent,
				symbols,
				vector: this.embedText(`${chunkContent} ${symbols.join(' ')}`)
			});
		}
		return chunks;
	}

	/**
	 * Upsert chunks by stable ID. Replacing a chunk removes its previous BM25
	 * postings, document-length contribution and file mapping before reindexing.
	 */
	public addChunks(chunks: IFloatCodeChunk[]): void {
		for (const chunk of chunks) {
			this._removeChunkById(chunk.id);
			const stored: IFloatCodeChunk = {
				...chunk,
				symbols: [...chunk.symbols],
				vector: chunk.vector ? [...chunk.vector] : this.embedText(`${chunk.content} ${chunk.symbols.join(' ')}`)
			};
			const tokens = this._tokenize(`${stored.content} ${stored.symbols.join(' ')}`);
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
		for (let i = 0; i < a.length; i++) {
			dot += a[i] * b[i];
		}
		return Math.max(0, Math.min(1, dot));
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
			return [];
		}
		const limit = Number.isFinite(topK) ? Math.max(1, Math.min(50, Math.trunc(topK))) : 5;
		const queryTokens = this._tokenize(query);
		if (queryTokens.length === 0) {
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
		const queryIdentifier = normalizedQuery.replace(/[^a-z0-9_$]/g, '');
		const ranked: IFloatSearchResult[] = [];

		for (const chunk of this._chunks) {
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

			const normalizedPath = chunk.filePath.toLowerCase().replace(/\\/g, '/');
			const pathTokens = this._tokenize(chunk.filePath.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase());
			const pathMatches = queryTokens.filter(token => pathTokens.includes(token)).length;
			const pathBoost = queryTokens.length > 0
				? (pathMatches / new Set(queryTokens).size) * 0.10
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

	public get totalChunks(): number {
		return this._chunks.length;
	}
}
