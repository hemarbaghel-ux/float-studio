/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as path from 'path';

export interface IFloatAstNode {
	id: string;
	name: string;
	kind: 'function' | 'class' | 'interface' | 'method' | 'variable' | 'type' | 'module';
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

	public parseFileSymbols(filePath: string, content: string): IFloatFileMerkleNode {
		const ext = path.extname(filePath).toLowerCase();
		const language = this._detectLanguage(ext);
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

	private _detectLanguage(ext: string): string {
		switch (ext) {
			case '.ts':
			case '.tsx':
				return 'typescript';
			case '.js':
			case '.jsx':
			case '.mjs':
			case '.cjs':
				return 'javascript';
			case '.py':
			case '.pyi':
				return 'python';
			case '.rs':
				return 'rust';
			case '.go':
				return 'go';
			case '.cpp':
			case '.cc':
			case '.c':
			case '.h':
			case '.hpp':
				return 'cpp';
			case '.java':
				return 'java';
			default:
				return 'generic';
		}
	}

	private _extractSymbolsByLanguage(language: string, content: string): IFloatAstNode[] {
		const lines = content.split('\n');
		const symbols: IFloatAstNode[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNum = i + 1;

			if (language === 'typescript' || language === 'javascript') {
				// Functions
				const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/);
				if (fnMatch) {
					symbols.push(this._createAstNode(fnMatch[1], 'function', language, lineNum, lineNum, `function ${fnMatch[1]}(${fnMatch[2]})`));
				}
				// Classes
				const classMatch = line.match(/(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/);
				if (classMatch) {
					symbols.push(this._createAstNode(classMatch[1], 'class', language, lineNum, lineNum, `class ${classMatch[1]}`));
				}
				// Interfaces
				const ifaceMatch = line.match(/(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/);
				if (ifaceMatch) {
					symbols.push(this._createAstNode(ifaceMatch[1], 'interface', language, lineNum, lineNum, `interface ${ifaceMatch[1]}`));
				}
			} else if (language === 'python') {
				const pyFnMatch = line.match(/^\s*(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
				if (pyFnMatch) {
					symbols.push(this._createAstNode(pyFnMatch[1], 'function', language, lineNum, lineNum, `def ${pyFnMatch[1]}(${pyFnMatch[2]})`));
				}
				const pyClassMatch = line.match(/^\s*class\s+([a-zA-Z0-9_]+)/);
				if (pyClassMatch) {
					symbols.push(this._createAstNode(pyClassMatch[1], 'class', language, lineNum, lineNum, `class ${pyClassMatch[1]}`));
				}
			} else if (language === 'rust') {
				const rustFnMatch = line.match(/(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
				if (rustFnMatch) {
					symbols.push(this._createAstNode(rustFnMatch[1], 'function', language, lineNum, lineNum, `fn ${rustFnMatch[1]}(${rustFnMatch[2]})`));
				}
				const rustStructMatch = line.match(/(?:pub\s+)?struct\s+([a-zA-Z0-9_]+)/);
				if (rustStructMatch) {
					symbols.push(this._createAstNode(rustStructMatch[1], 'class', language, lineNum, lineNum, `struct ${rustStructMatch[1]}`));
				}
			} else if (language === 'go') {
				const goFnMatch = line.match(/func\s+(?:\([^\)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
				if (goFnMatch) {
					symbols.push(this._createAstNode(goFnMatch[1], 'function', language, lineNum, lineNum, `func ${goFnMatch[1]}(${goFnMatch[2]})`));
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
