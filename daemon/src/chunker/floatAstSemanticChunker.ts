/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as path from 'path';
import { FloatTreeSitterIndexer, IFloatAstNode, IFloatFileMerkleNode } from '../indexer/floatTreeSitterIndexer.js';
import { IFloatImportReference } from '../parser/floatSyntaxParser.js';

export interface IFloatSemanticChunk {
	id: string;
	filePath: string;
	language: string;
	symbolName?: string;
	symbolKind?: string;
	parentSymbolId?: string;
	parentName?: string;
	startLine: number;
	endLine: number;
	content: string;
	docstring?: string;
	imports?: string[];
	hash: string;
}

export interface IFloatChunkingOptions {
	maxLinesPerChunk?: number;
	overlapLines?: number;
}

export class FloatAstSemanticChunker {
	private readonly _indexer: FloatTreeSitterIndexer;

	constructor(indexer?: FloatTreeSitterIndexer) {
		this._indexer = indexer || new FloatTreeSitterIndexer();
	}

	public async chunkFileAsync(filePath: string, content: string, options: IFloatChunkingOptions = {}): Promise<IFloatSemanticChunk[]> {
		const maxLines = options.maxLinesPerChunk || 60;
		const overlap = options.overlapLines || 5;

		const lines = content.split('\n');
		if (lines.length === 0 || content.trim().length === 0) {
			return [];
		}

		// 1. Parse using real Tree-Sitter WASM engine
		const fileNode: IFloatFileMerkleNode = await this._indexer.parseFileSymbolsAsync(filePath, content);
		const language = fileNode.language;
		const symbols = (fileNode.symbols || []).sort((a, b) => a.startLine - b.startLine);

		// Extract imports from syntax parser
		let importedModules: string[] = [];
		try {
			const parsedAst = await this._indexer.syntaxParser.parseFile(filePath, content);
			const imports: IFloatImportReference[] = this._indexer.syntaxParser.extractImports(parsedAst);
			importedModules = imports.map(i => i.sourceModule);
		} catch {}

		const chunks: IFloatSemanticChunk[] = [];
		const chunkedRanges = new Set<string>();

		const recordChunk = (chunk: IFloatSemanticChunk) => {
			const rangeKey = `${chunk.filePath}#${chunk.startLine}-${chunk.endLine}#${chunk.hash.substring(0, 8)}`;
			if (!chunkedRanges.has(rangeKey)) {
				chunkedRanges.add(rangeKey);
				chunks.push(chunk);
			}
		};

		if (symbols.length === 0) {
			// Fallback: sliding window chunking for files without declarations
			const fallbackChunks = this._slidingWindowChunk(filePath, language, lines, maxLines, overlap, 1, undefined, undefined, importedModules);
			return fallbackChunks;
		}

		// 2. Module Header / Imports Chunk
		if (symbols[0].startLine > 1) {
			const headerLines = lines.slice(0, symbols[0].startLine - 1);
			const headerContent = headerLines.join('\n').trim();
			if (headerContent.length > 0) {
				recordChunk(this._createChunk(
					filePath,
					language,
					1,
					symbols[0].startLine - 1,
					headerContent,
					'module_header',
					'module',
					undefined,
					undefined,
					undefined,
					importedModules
				));
			}
		}

		// 3. Process AST Symbols preserving genuine AST boundaries
		for (let i = 0; i < symbols.length; i++) {
			const sym = symbols[i];
			const startLine = sym.startLine;
			// Use real AST endLine; fallback to next symbol or file end if unclosed
			let endLine = sym.endLine && sym.endLine >= startLine ? sym.endLine : (symbols[i + 1] ? symbols[i + 1].startLine - 1 : lines.length);
			if (endLine > lines.length) endLine = lines.length;

			const symbolLines = lines.slice(startLine - 1, endLine);
			const symbolContent = symbolLines.join('\n').trim();

			if (symbolContent.length === 0) continue;

			if (symbolLines.length > maxLines) {
				// Subdivide large symbol (e.g. 150-line class or method)
				// Every sub-chunk retains the parent symbol name, kind, docstring, and parent scope
				const subChunks = this._slidingWindowChunk(
					filePath,
					language,
					symbolLines,
					maxLines,
					overlap,
					startLine,
					sym.name,
					sym.kind,
					importedModules,
					sym.parentSymbolId,
					sym.parentName,
					sym.docstring
				);
				for (const sub of subChunks) {
					recordChunk(sub);
				}
			} else {
				recordChunk(this._createChunk(
					filePath,
					language,
					startLine,
					endLine,
					symbolContent,
					sym.name,
					sym.kind,
					sym.parentSymbolId,
					sym.parentName,
					sym.docstring,
					importedModules
				));
			}
		}

		return chunks;
	}

	public chunkFile(filePath: string, content: string, options: IFloatChunkingOptions = {}): IFloatSemanticChunk[] {
		// Synchronous fallback wrapper
		const maxLines = options.maxLinesPerChunk || 60;
		const overlap = options.overlapLines || 5;

		const lines = content.split('\n');
		if (lines.length === 0 || content.trim().length === 0) {
			return [];
		}

		// Extract symbols using the daemon's language-aware symbol indexer.
		const fileNode = this._indexer.parseFileSymbols(filePath, content);
		const language = fileNode.language;
		const symbols = (fileNode.symbols || []).sort((a, b) => a.startLine - b.startLine);

		const chunks: IFloatSemanticChunk[] = [];

		if (symbols.length === 0) {
			return this._slidingWindowChunk(filePath, language, lines, maxLines, overlap);
		}

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

		for (let i = 0; i < symbols.length; i++) {
			const sym = symbols[i];
			const next = symbols[i + 1];
			const startLine = sym.startLine;
			const endLine = sym.endLine && sym.endLine >= startLine ? sym.endLine : (next ? next.startLine - 1 : lines.length);

			const startIdx = Math.max(0, startLine - 1);
			const hasSourceRange = Number.isInteger(sym.endLine) && sym.endLine! > sym.startLine;
			const proposedEndIdx = hasSourceRange
				? sym.endLine! - 1
				: next
					? Math.max(startIdx, next.startLine - 2)
					: lines.length - 1;
			const endIdx = Math.max(startIdx, Math.min(lines.length - 1, proposedEndIdx));

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
						sym.name,
						sym.kind,
						undefined,
						sym.parentSymbolId,
						sym.parentName,
						sym.docstring
					);
					chunks.push(...subChunks);
				} else {
					chunks.push(this._createChunk(
						filePath,
						language,
						startIdx + 1,
						endIdx + 1,
						chunkContent,
						sym.name,
						sym.kind,
						sym.parentSymbolId,
						sym.parentName,
						sym.docstring
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
		symbolKind?: string,
		imports?: string[],
		parentSymbolId?: string,
		parentName?: string,
		docstring?: string
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
					symbolKind,
					parentSymbolId,
					parentName,
					docstring,
					imports
				));
			}

			if (end >= lines.length) {
				break;
			}
			start += Math.max(1, maxLines - overlap);
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
		symbolKind?: string,
		parentSymbolId?: string,
		parentName?: string,
		docstring?: string,
		imports?: string[]
	): IFloatSemanticChunk {
		const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
		const id = `${filePath}#L${startLine}-L${endLine}:${hash.substring(0, 8)}`;

		return {
			id,
			filePath,
			language,
			symbolName,
			symbolKind,
			parentSymbolId,
			parentName,
			startLine,
			endLine,
			content,
			docstring,
			imports,
			hash
		};
	}
}
