/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import ts from 'typescript';

export interface ISemanticCodeChunk {
	id: string;
	filePath: string;
	symbolName?: string;
	symbolKind?: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'method' | 'variable' | 'block';
	containerName?: string;
	startLine: number;
	endLine: number;
	content: string;
	docComment?: string;
	tokens: string[];
}

export function tokenizeCode(text: string): string[] {
	const rawTokens = text
		.split(/[^a-zA-Z0-9_$]+/u)
		.map(t => t.trim().toLowerCase())
		.filter(t => t.length > 1 && !/^\d+$/.test(t));

	const splitTokens = text
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(/[^a-zA-Z0-9_$]+/u)
		.map(t => t.trim().toLowerCase())
		.filter(t => t.length > 1 && !/^\d+$/.test(t));

	return Array.from(new Set([...rawTokens, ...splitTokens]));
}

export class FloatSemanticChunker {
	/**
	 * Parses a source file into semantic AST chunks
	 */
	public static chunkFile(filePath: string, content: string): ISemanticCodeChunk[] {
		const normPath = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
		const ext = normPath.split('.').pop()?.toLowerCase() || '';

		if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
			return this._chunkTypeScript(normPath, content);
		} else if (ext === 'py') {
			return this._chunkPython(normPath, content);
		} else {
			return this._chunkGeneric(normPath, content);
		}
	}

	private static _chunkTypeScript(filePath: string, content: string): ISemanticCodeChunk[] {
		const chunks: ISemanticCodeChunk[] = [];
		const isTsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');
		const isJs = filePath.endsWith('.js') || filePath.endsWith('.jsx') || filePath.endsWith('.mjs');

		let sourceFile: ts.SourceFile;
		try {
			sourceFile = ts.createSourceFile(
				filePath,
				content,
				ts.ScriptTarget.Latest,
				true,
				isTsx ? ts.ScriptKind.TSX : isJs ? ts.ScriptKind.JS : ts.ScriptKind.TS
			);
		} catch {
			return this._chunkGeneric(filePath, content);
		}

		let chunkIndex = 0;

		const visitNode = (node: ts.Node, containerName?: string) => {
			let name: string | undefined;
			let kind: ISemanticCodeChunk['symbolKind'] | undefined;

			if (ts.isFunctionDeclaration(node) && node.name) {
				name = node.name.text;
				kind = 'function';
			} else if (ts.isClassDeclaration(node) && node.name) {
				name = node.name.text;
				kind = 'class';
			} else if (ts.isInterfaceDeclaration(node)) {
				name = node.name.text;
				kind = 'interface';
			} else if (ts.isTypeAliasDeclaration(node)) {
				name = node.name.text;
				kind = 'type';
			} else if (ts.isEnumDeclaration(node)) {
				name = node.name.text;
				kind = 'enum';
			} else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
				name = node.name.text;
				kind = 'method';
			} else if (ts.isVariableStatement(node)) {
				const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
				for (const decl of node.declarationList.declarations) {
					if (ts.isIdentifier(decl.name) && (isExported || decl.initializer)) {
						name = decl.name.text;
						kind = 'variable';
						break;
					}
				}
			}

			if (name && kind) {
				const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
				const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
				const nodeContent = node.getText(sourceFile);

				chunks.push({
					id: `${filePath}#${name}-${++chunkIndex}`,
					filePath,
					symbolName: name,
					symbolKind: kind,
					containerName,
					startLine: start.line + 1,
					endLine: end.line + 1,
					content: nodeContent,
					tokens: tokenizeCode(`${name} ${containerName || ''} ${nodeContent}`)
				});

				// If class, also chunk its methods with containerName
				if (kind === 'class') {
					ts.forEachChild(node, child => visitNode(child, name));
					return;
				}
			} else {
				ts.forEachChild(node, child => visitNode(child, containerName));
			}
		};

		ts.forEachChild(sourceFile, node => visitNode(node));

		// If no AST symbols found (or file is script), fallback to top-level blocks
		if (chunks.length === 0) {
			return this._chunkGeneric(filePath, content);
		}

		return chunks;
	}

	private static _chunkPython(filePath: string, content: string): ISemanticCodeChunk[] {
		const chunks: ISemanticCodeChunk[] = [];
		const lines = content.split(/\r?\n/);
		let chunkIndex = 0;

		let currentSymbol: { name: string; kind: 'function' | 'class'; startLine: number; indent: number; lines: string[] } | null = null;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNum = i + 1;
			const trimmed = line.trim();

			const classMatch = line.match(/^(\s*)class\s+([a-zA-Z0-9_]+)/);
			const defMatch = line.match(/^(\s*)def\s+([a-zA-Z0-9_]+)/);

			if (classMatch || defMatch) {
				if (currentSymbol) {
					const nodeContent = currentSymbol.lines.join('\n');
					chunks.push({
						id: `${filePath}#${currentSymbol.name}-${++chunkIndex}`,
						filePath,
						symbolName: currentSymbol.name,
						symbolKind: currentSymbol.kind,
						startLine: currentSymbol.startLine,
						endLine: lineNum - 1,
						content: nodeContent,
						tokens: tokenizeCode(`${currentSymbol.name} ${nodeContent}`)
					});
				}

				const indent = (classMatch ? classMatch[1] : defMatch![1]).length;
				const name = classMatch ? classMatch[2] : defMatch![2];
				const kind = classMatch ? 'class' : 'function';

				currentSymbol = {
					name,
					kind,
					startLine: lineNum,
					indent,
					lines: [line]
				};
			} else if (currentSymbol) {
				currentSymbol.lines.push(line);
			}
		}

		if (currentSymbol) {
			const nodeContent = currentSymbol.lines.join('\n');
			chunks.push({
				id: `${filePath}#${currentSymbol.name}-${++chunkIndex}`,
				filePath,
				symbolName: currentSymbol.name,
				symbolKind: currentSymbol.kind,
				startLine: currentSymbol.startLine,
				endLine: lines.length,
				content: nodeContent,
				tokens: tokenizeCode(`${currentSymbol.name} ${nodeContent}`)
			});
		}

		if (chunks.length === 0) {
			return this._chunkGeneric(filePath, content);
		}

		return chunks;
	}

	private static _chunkGeneric(filePath: string, content: string): ISemanticCodeChunk[] {
		const chunks: ISemanticCodeChunk[] = [];
		const lines = content.split(/\r?\n/);
		const blockSize = 50; // lines per block
		const overlap = 10;

		let start = 0;
		let chunkIndex = 0;

		while (start < lines.length) {
			const end = Math.min(start + blockSize, lines.length);
			const blockLines = lines.slice(start, end);
			const nodeContent = blockLines.join('\n');

			chunks.push({
				id: `${filePath}#block-${++chunkIndex}`,
				filePath,
				symbolKind: 'block',
				startLine: start + 1,
				endLine: end,
				content: nodeContent,
				tokens: tokenizeCode(`${filePath} ${nodeContent}`)
			});

			if (end >= lines.length) break;
			start += (blockSize - overlap);
		}

		return chunks;
	}
}
