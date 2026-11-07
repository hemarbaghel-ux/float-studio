/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as path from 'path';
import { FloatTreeSitterGrammarRegistry } from '../grammars/floatTreeSitterGrammarRegistry.js';

export interface IFloatAstNode {
	id: string;
	name: string;
	kind: 'function' | 'class' | 'interface' | 'method' | 'variable' | 'type' | 'module' | 'struct' | 'enum';
	language: string;
	startLine: number;
	endLine: number;
	signature?: string;
	docstring?: string;
	hash: string;
	children?: IFloatAstNode[];
}

export interface IFloatFileMerkleNode {
	filePath: string;
	fileHash: string;
	language: string;
	symbols: IFloatAstNode[];
	lastModified: number;
}

export interface IFloatIncrementalIndexDelta {
	addedFiles: string[];
	modifiedFiles: string[];
	removedFiles: string[];
	addedSymbols: number;
	modifiedSymbols: number;
	removedSymbols: number;
}

export class FloatTreeSitterIndexer {
	private readonly _fileNodes = new Map<string, IFloatFileMerkleNode>();
	private readonly _grammarRegistry = new FloatTreeSitterGrammarRegistry();

	public parseFileSymbols(filePath: string, content: string): IFloatFileMerkleNode {
		const ext = path.extname(filePath).toLowerCase();
		const profile = this._grammarRegistry.getProfileByExtension(ext);
		const language = profile ? profile.languageId : 'generic';
		const fileHash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

		const symbols = this._extractSymbolsByLanguage(language, content);

		const merkleNode: IFloatFileMerkleNode = {
			filePath,
			fileHash,
			language,
			symbols,
			lastModified: Date.now()
		};

		return merkleNode;
	}

	public indexFile(filePath: string, content: string): { delta: 'added' | 'modified' | 'unchanged'; node: IFloatFileMerkleNode } {
		const existing = this._fileNodes.get(filePath);
		const newNode = this.parseFileSymbols(filePath, content);

		if (!existing) {
			this._fileNodes.set(filePath, newNode);
			return { delta: 'added', node: newNode };
		}

		if (existing.fileHash === newNode.fileHash) {
			return { delta: 'unchanged', node: existing };
		}

		this._fileNodes.set(filePath, newNode);
		return { delta: 'modified', node: newNode };
	}

	public removeFile(filePath: string): boolean {
		return this._fileNodes.delete(filePath);
	}

	public restoreNodes(nodes: IFloatFileMerkleNode[]): void {
		const restored = new Map<string, IFloatFileMerkleNode>();
		for (const node of nodes) {
			if (
				!node ||
				typeof node.filePath !== 'string' ||
				!node.filePath ||
				typeof node.fileHash !== 'string' ||
				typeof node.language !== 'string' ||
				!Number.isFinite(node.lastModified) ||
				!Array.isArray(node.symbols)
			) {
				throw new Error('FLOAT semantic index contains an invalid stored file node.');
			}
			restored.set(node.filePath, node);
		}
		this._fileNodes.clear();
		for (const [filePath, node] of restored) {
			this._fileNodes.set(filePath, node);
		}
	}

	public getIndexedFiles(): string[] {
		return Array.from(this._fileNodes.keys());
	}

	public getFileNode(filePath: string): IFloatFileMerkleNode | undefined {
		return this._fileNodes.get(filePath);
	}

	public getAllSymbols(): { filePath: string; symbol: IFloatAstNode }[] {
		const results: { filePath: string; symbol: IFloatAstNode }[] = [];
		for (const [filePath, fileNode] of this._fileNodes.entries()) {
			for (const sym of fileNode.symbols) {
				results.push({ filePath, symbol: sym });
			}
		}
		return results;
	}

	public findSymbolsByName(nameQuery: string): { filePath: string; symbol: IFloatAstNode }[] {
		const lower = nameQuery.toLowerCase();
		return this.getAllSymbols().filter(s => s.symbol.name.toLowerCase().includes(lower));
	}

	private _extractSymbolsByLanguage(language: string, content: string): IFloatAstNode[] {
		const profile = this._grammarRegistry.getProfile(language);
		if (!profile) {
			return [];
		}

		const symbols: IFloatAstNode[] = [];
		const lines = content.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNum = i + 1;

			for (const pattern of profile.symbolPatterns) {
				pattern.regex.lastIndex = 0;
				let match: RegExpExecArray | null;
				while ((match = pattern.regex.exec(line)) !== null) {
					const symName = match[pattern.captureGroupIndex];
					if (symName && symName.length > 0) {
						symbols.push(this._createAstNode(symName, pattern.kind as any, language, lineNum, lineNum, line.trim()));
					}
				}
			}
		}

		return symbols;
	}

	private _createAstNode(name: string, kind: IFloatAstNode['kind'], language: string, startLine: number, endLine: number, signature?: string): IFloatAstNode {
		const hash = crypto.createHash('sha256').update(`${name}:${kind}:${signature || ''}`, 'utf8').digest('hex');
		return {
			id: `${name}-${startLine}-${hash.substring(0, 8)}`,
			name,
			kind,
			language,
			startLine,
			endLine,
			signature,
			hash
		};
	}
}
