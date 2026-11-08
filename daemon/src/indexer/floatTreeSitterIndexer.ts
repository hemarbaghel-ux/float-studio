/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as path from 'path';
import ts from 'typescript';
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

		const symbols = this._extractSymbolsByLanguage(filePath, language, content);

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

	private _extractSymbolsByLanguage(filePath: string, language: string, content: string): IFloatAstNode[] {
		// TypeScript/JavaScript use the TypeScript compiler's real syntax tree. Other
		// language profiles remain explicitly best-effort until their parser runtimes
		// and grammar versions are bundled with the daemon.
		if (language === 'typescript') {
			return this._extractTypeScriptSymbols(filePath, content);
		}

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

	private _extractTypeScriptSymbols(filePath: string, content: string): IFloatAstNode[] {
		const extension = path.extname(filePath).toLowerCase();
		const scriptKind = extension === '.tsx'
			? ts.ScriptKind.TSX
			: extension === '.jsx'
				? ts.ScriptKind.JSX
				: ['.js', '.mjs', '.cjs'].includes(extension)
					? ts.ScriptKind.JS
					: ts.ScriptKind.TS;
		const sourceFile = ts.createSourceFile(
			filePath,
			content,
			ts.ScriptTarget.Latest,
			true,
			scriptKind
		);
		const symbols: IFloatAstNode[] = [];

		const readName = (name: ts.PropertyName | ts.BindingName | undefined): string | undefined => {
			if (
				name &&
				(ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
			) {
				return name.text;
			}
			return undefined;
		};

		const addSymbol = (node: ts.Node, name: string | undefined, kind: IFloatAstNode['kind']): void => {
			if (!name) {
				return;
			}
			const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
			const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
			const nodeText = node.getText(sourceFile);
			const signature = nodeText.split(/\\r?\\n/, 1)[0].trim().slice(0, 500);
			const hash = crypto.createHash('sha256')
				.update(`${name}:${kind}:${nodeText}`, 'utf8')
				.digest('hex');
			symbols.push({
				id: `${name}-${start.line + 1}-${hash.substring(0, 8)}`,
				name,
				kind,
				language: 'typescript',
				startLine: start.line + 1,
				endLine: end.line + 1,
				signature,
				hash
			});
		};

		const visit = (node: ts.Node): void => {
			if (ts.isFunctionDeclaration(node)) {
				addSymbol(node, readName(node.name), 'function');
			} else if (ts.isClassDeclaration(node)) {
				addSymbol(node, readName(node.name), 'class');
			} else if (ts.isInterfaceDeclaration(node)) {
				addSymbol(node, readName(node.name), 'interface');
			} else if (ts.isTypeAliasDeclaration(node)) {
				addSymbol(node, readName(node.name), 'type');
			} else if (ts.isEnumDeclaration(node)) {
				addSymbol(node, readName(node.name), 'enum');
			} else if (ts.isModuleDeclaration(node)) {
				addSymbol(node, readName(node.name), 'module');
			} else if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node) ||
				ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
				addSymbol(node, readName(node.name), 'method');
			} else if (ts.isConstructorDeclaration(node)) {
				addSymbol(node, 'constructor', 'method');
			} else if (ts.isVariableDeclaration(node)) {
				const initializer = node.initializer;
				const isCallable = !!initializer && (
					ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)
				);
				addSymbol(node, readName(node.name), isCallable ? 'function' : 'variable');
			} else if (ts.isPropertyDeclaration(node)) {
				const initializer = node.initializer;
				if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
					addSymbol(node, readName(node.name), 'method');
				}
			}

			ts.forEachChild(node, visit);
		};

		ts.forEachChild(sourceFile, visit);
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
