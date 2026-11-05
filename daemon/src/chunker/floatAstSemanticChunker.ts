/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as path from 'path';
import { FloatTreeSitterGrammarRegistry } from '../grammars/floatTreeSitterGrammarRegistry.js';
import { FloatTreeSitterIndexer, IFloatAstNode } from '../indexer/floatTreeSitterIndexer.js';

export interface IFloatSemanticChunk {
	id: string;
	filePath: string;
	language: string;
	symbolName?: string;
	symbolKind?: string;
	startLine: number;
	endLine: number;
	content: string;
	hash: string;
}

export interface IFloatChunkingOptions {
	maxLinesPerChunk?: number;
	overlapLines?: number;
}

export class FloatAstSemanticChunker {
	private readonly _indexer: FloatTreeSitterIndexer;
	private readonly _grammarRegistry: FloatTreeSitterGrammarRegistry;

	constructor(indexer?: FloatTreeSitterIndexer) {
		this._indexer = indexer || new FloatTreeSitterIndexer();
		this._grammarRegistry = new FloatTreeSitterGrammarRegistry();
	}

	public chunkFile(filePath: string, content: string, options: IFloatChunkingOptions = {}): IFloatSemanticChunk[] {
		const maxLines = options.maxLinesPerChunk || 50;
		const overlap = options.overlapLines || 5;

		const ext = path.extname(filePath).toLowerCase();
		const profile = this._grammarRegistry.getProfileByExtension(ext);
		const language = profile ? profile.languageId : 'generic';

		const lines = content.split('\n');
		if (lines.length === 0) {
			return [];
		}

		// Extract symbols using Tree-Sitter indexer
		const fileNode = this._indexer.parseFileSymbols(filePath, content);
		const symbols = fileNode.symbols.sort((a, b) => a.startLine - b.startLine);

		const chunks: IFloatSemanticChunk[] = [];

		if (symbols.length === 0) {
			// Fallback: sliding window chunking for unstructured files
			return this._slidingWindowChunk(filePath, language, lines, maxLines, overlap);
		}

		// 1. Process header / imports before first symbol
		if (symbols[0].startLine > 1) {
			const headerLines = lines.slice(0, symbols[0].startLine - 1);
			const headerContent = headerLines.join('\n').trim();
			if (headerContent.length > 0) {
				chunks.push(this._createChunk(
					filePath,
					language,
					1,
					symbols[0].startLine - 1,
					headerContent,
					'module_header',
					'module'
				));
			}
		}

		// 2. Process symbol-bounded chunks
		for (let i = 0; i < symbols.length; i++) {
			const current = symbols[i];
			const next = symbols[i + 1];

			const startIdx = Math.max(0, current.startLine - 1);
			// Calculate end index: either up to next symbol start, or end of current file/block
			let endIdx = next ? Math.max(startIdx + 1, next.startLine - 2) : lines.length - 1;
			if (endIdx < startIdx) {
				endIdx = startIdx;
			}

			const chunkLines = lines.slice(startIdx, endIdx + 1);
			const chunkContent = chunkLines.join('\n').trim();

			if (chunkContent.length > 0) {
				if (chunkLines.length > maxLines) {
					// Subdivide large symbol (e.g. 200-line class/function) with overlap
					const subChunks = this._slidingWindowChunk(
						filePath,
						language,
						chunkLines,
						maxLines,
						overlap,
						startIdx + 1,
						current.name,
						current.kind
					);
					chunks.push(...subChunks);
				} else {
					chunks.push(this._createChunk(
						filePath,
						language,
						startIdx + 1,
						endIdx + 1,
						chunkContent,
						current.name,
						current.kind
					));
				}
			}
		}

		return chunks;
	}

	private _slidingWindowChunk(
		filePath: string,
		language: string,
		lines: string[],
		maxLines: number,
		overlap: number,
		lineOffset: number = 1,
		symbolName?: string,
		symbolKind?: string
	): IFloatSemanticChunk[] {
		const chunks: IFloatSemanticChunk[] = [];
		let start = 0;

		while (start < lines.length) {
			const end = Math.min(start + maxLines, lines.length);
			const windowLines = lines.slice(start, end);
			const content = windowLines.join('\n').trim();

			if (content.length > 0) {
				chunks.push(this._createChunk(
					filePath,
					language,
					lineOffset + start,
					lineOffset + end - 1,
					content,
					symbolName,
					symbolKind
				));
			}

			if (end >= lines.length) {
				break;
			}
			start += (maxLines - overlap);
		}

		return chunks;
	}

	private _createChunk(
		filePath: string,
		language: string,
		startLine: number,
		endLine: number,
		content: string,
		symbolName?: string,
		symbolKind?: string
	): IFloatSemanticChunk {
		const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
		const id = `${filePath}#L${startLine}-L${endLine}:${hash.substring(0, 8)}`;

		return {
			id,
			filePath,
			language,
			symbolName,
			symbolKind,
			startLine,
			endLine,
			content,
			hash
		};
	}
}
