/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type * as tsType from 'typescript';

let _tsModule: typeof tsType | null | undefined = undefined;
function getTs(): typeof tsType | null {
	if (_tsModule !== undefined) {
		return _tsModule ?? null;
	}
	try {
		if (typeof process !== 'undefined' && (process as any).versions?.node) {
			const req = (globalThis as any).require;
			if (typeof req === 'function') {
				_tsModule = req('typescript');
				return _tsModule ?? null;
			}
		}
	} catch {
		// Browser sandbox
	}
	_tsModule = null;
	return _tsModule ?? null;
}

export interface ISemanticCodeChunk {
	id: string;
	filePath: string;
	symbolName?: string;
	symbolKind?: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'method' | 'variable' | 'block' | 'struct' | 'trait' | 'impl' | 'module' | 'section';
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
	 * Parses a source file into semantic AST chunks across TypeScript, Python, Rust, Go, C/C++, Java, C#, and Markdown
	 */
	public static chunkFile(filePath: string, content: string): ISemanticCodeChunk[] {
		const normPath = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
		const ext = normPath.split('.').pop()?.toLowerCase() || '';

		if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
			return this._chunkTypeScript(normPath, content);
		} else if (ext === 'py' || ext === 'pyi') {
			return this._chunkPython(normPath, content);
		} else if (ext === 'rs') {
			return this._chunkRust(normPath, content);
		} else if (ext === 'go') {
			return this._chunkGo(normPath, content);
		} else if (['c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hxx'].includes(ext)) {
			return this._chunkCpp(normPath, content);
		} else if (['java', 'cs'].includes(ext)) {
			return this._chunkJavaAndCSharp(normPath, content);
		} else if (['md', 'markdown'].includes(ext)) {
			return this._chunkMarkdown(normPath, content);
		} else {
			return this._chunkGeneric(normPath, content);
		}
	}

	private static _chunkTypeScript(filePath: string, content: string): ISemanticCodeChunk[] {
		const ts = getTs();
		if (!ts) {
			return this._chunkGeneric(filePath, content);
		}
		const chunks: ISemanticCodeChunk[] = [];
		const isTsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');
		const isJs = filePath.endsWith('.js') || filePath.endsWith('.jsx') || filePath.endsWith('.mjs');

		let sourceFile: tsType.SourceFile;
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

		const pushChunk = (
			name: string,
			kind: NonNullable<ISemanticCodeChunk['symbolKind']>,
			node: tsType.Node,
			containerName?: string,
			contentOverride?: string
		): void => {
			const startPosition = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
			const endPosition = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
			const nodeContent = contentOverride ?? node.getText(sourceFile);
			chunks.push({
				id: `${filePath}#${name}-${++chunkIndex}`,
				filePath,
				symbolName: name,
				symbolKind: kind,
				containerName,
				startLine: startPosition.line + 1,
				endLine: endPosition.line + 1,
				content: nodeContent,
				tokens: tokenizeCode(`${name} ${containerName || ''} ${nodeContent}`)
			});
		};

		const visitNode = (node: tsType.Node, containerName?: string): void => {
			// A single VariableStatement may declare several independent symbols.
			// Index each identifier separately and classify callable initializers as functions.
			if (ts.isVariableStatement(node)) {
				const modifiers = node.modifiers?.map(modifier => modifier.getText(sourceFile)).join(' ') ?? '';
				const declarationKeyword = node.declarationList.flags & ts.NodeFlags.Const
					? 'const'
					: node.declarationList.flags & ts.NodeFlags.Let
						? 'let'
						: 'var';

				for (const declaration of node.declarationList.declarations) {
					if (!ts.isIdentifier(declaration.name)) {
						continue;
					}
					if (!declaration.initializer && !modifiers.includes('export')) {
						continue;
					}

					const name = declaration.name.text;
					const initializer = declaration.initializer;
					let kind: ISemanticCodeChunk['symbolKind'] = 'variable';
					if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
						kind = 'function';
					} else if (initializer && ts.isClassExpression(initializer)) {
						kind = 'class';
					}

					const declarationText = `${modifiers ? modifiers + ' ' : ''}${declarationKeyword} ${declaration.getText(sourceFile)};`;
					pushChunk(name, kind, declaration, containerName, declarationText);

					// Class expressions assigned to variables also expose their methods as
					// child chunks, using the variable name as their containing symbol.
					if (initializer && ts.isClassExpression(initializer)) {
						ts.forEachChild(initializer, child => visitNode(child, name));
					}
				}
				return;
			}

			let name: string | undefined;
			let kind: ISemanticCodeChunk['symbolKind'] | undefined;
			let recurseWithContainer = false;

			if (ts.isFunctionDeclaration(node)) {
				name = node.name?.text ?? (node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? 'default' : undefined);
				kind = 'function';
			} else if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
				name = node.name?.text ?? (ts.isClassDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? 'default' : undefined);
				kind = 'class';
				recurseWithContainer = true;
			} else if (ts.isInterfaceDeclaration(node)) {
				name = node.name.text;
				kind = 'interface';
				recurseWithContainer = true;
			} else if (ts.isTypeAliasDeclaration(node)) {
				name = node.name.text;
				kind = 'type';
			} else if (ts.isEnumDeclaration(node)) {
				name = node.name.text;
				kind = 'enum';
			} else if (
				ts.isMethodDeclaration(node) ||
				ts.isMethodSignature(node) ||
				ts.isConstructorDeclaration(node) ||
				ts.isGetAccessorDeclaration(node) ||
				ts.isSetAccessorDeclaration(node)
			) {
				name = ts.isConstructorDeclaration(node)
					? 'constructor'
					: node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name))
						? node.name.text
						: undefined;
				kind = 'method';
			} else if (ts.isPropertyDeclaration(node) && node.initializer &&
				(ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
				name = node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
					? node.name.text
					: undefined;
				kind = 'function';
			} else if (ts.isModuleDeclaration(node)) {
				name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : undefined;
				kind = 'module';
				recurseWithContainer = true;
			} else if (ts.isExportAssignment(node) &&
				(ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression) || ts.isClassExpression(node.expression))) {
				name = 'default';
				kind = ts.isClassExpression(node.expression) ? 'class' : 'function';
			}

			if (name && kind) {
				pushChunk(name, kind, node, containerName);
				if (recurseWithContainer) {
					ts.forEachChild(node, child => visitNode(child, name));
				} else if (ts.isExportAssignment(node) && ts.isClassExpression(node.expression)) {
					ts.forEachChild(node.expression, child => visitNode(child, name));
				}
				return;
			}

			ts.forEachChild(node, child => visitNode(child, containerName));
		};

		ts.forEachChild(sourceFile, node => visitNode(node));

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

	private static _chunkRust(filePath: string, content: string): ISemanticCodeChunk[] {
		const chunks: ISemanticCodeChunk[] = [];
		const lines = content.split(/\r?\n/);
		let chunkIndex = 0;

		let currentSymbol: { name: string; kind: ISemanticCodeChunk['symbolKind']; startLine: number; lines: string[]; braces: number } | null = null;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNum = i + 1;

			const fnMatch = line.match(/^\s*(?:pub(?:\s*\([^)]*\))?\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)/);
			const structMatch = line.match(/^\s*(?:pub(?:\s*\([^)]*\))?\s+)?struct\s+([a-zA-Z0-9_]+)/);
			const enumMatch = line.match(/^\s*(?:pub(?:\s*\([^)]*\))?\s+)?enum\s+([a-zA-Z0-9_]+)/);
			const traitMatch = line.match(/^\s*(?:pub(?:\s*\([^)]*\))?\s+)?trait\s+([a-zA-Z0-9_]+)/);
			const implMatch = line.match(/^\s*impl(?:<[^>]*>)?\s+(?:([a-zA-Z0-9_]+)\s+for\s+)?([a-zA-Z0-9_]+)/);

			const match = fnMatch || structMatch || enumMatch || traitMatch || implMatch;

			if (match && !currentSymbol) {
				let name = '';
				let kind: ISemanticCodeChunk['symbolKind'] = 'function';

				if (fnMatch) { name = fnMatch[1]; kind = 'function'; }
				else if (structMatch) { name = structMatch[1]; kind = 'struct'; }
				else if (enumMatch) { name = enumMatch[1]; kind = 'enum'; }
				else if (traitMatch) { name = traitMatch[1]; kind = 'trait'; }
				else if (implMatch) { name = implMatch[2] ? `${implMatch[1] ? implMatch[1] + '_for_' : ''}${implMatch[2]}` : 'impl'; kind = 'impl'; }

				const openBraces = (line.match(/{/g) || []).length;
				const closeBraces = (line.match(/}/g) || []).length;

				currentSymbol = {
					name,
					kind,
					startLine: lineNum,
					lines: [line],
					braces: openBraces - closeBraces
				};

				if (currentSymbol.braces <= 0 && (line.includes(';') || line.includes('}'))) {
					const nodeContent = currentSymbol.lines.join('\n');
					chunks.push({
						id: `${filePath}#${currentSymbol.name}-${++chunkIndex}`,
						filePath,
						symbolName: currentSymbol.name,
						symbolKind: currentSymbol.kind,
						startLine: currentSymbol.startLine,
						endLine: lineNum,
						content: nodeContent,
						tokens: tokenizeCode(`${currentSymbol.name} ${nodeContent}`)
					});
					currentSymbol = null;
				}
			} else if (currentSymbol) {
				currentSymbol.lines.push(line);
				const openBraces = (line.match(/{/g) || []).length;
				const closeBraces = (line.match(/}/g) || []).length;
				currentSymbol.braces += (openBraces - closeBraces);

				if (currentSymbol.braces <= 0) {
					const nodeContent = currentSymbol.lines.join('\n');
					chunks.push({
						id: `${filePath}#${currentSymbol.name}-${++chunkIndex}`,
						filePath,
						symbolName: currentSymbol.name,
						symbolKind: currentSymbol.kind,
						startLine: currentSymbol.startLine,
						endLine: lineNum,
						content: nodeContent,
						tokens: tokenizeCode(`${currentSymbol.name} ${nodeContent}`)
					});
					currentSymbol = null;
				}
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

	private static _chunkGo(filePath: string, content: string): ISemanticCodeChunk[] {
		const chunks: ISemanticCodeChunk[] = [];
		const lines = content.split(/\r?\n/);
		let chunkIndex = 0;

		let currentSymbol: { name: string; kind: ISemanticCodeChunk['symbolKind']; startLine: number; lines: string[]; braces: number } | null = null;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNum = i + 1;

			const funcMatch = line.match(/^func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)/);
			const typeStructMatch = line.match(/^type\s+([a-zA-Z0-9_]+)\s+struct/);
			const typeInterfaceMatch = line.match(/^type\s+([a-zA-Z0-9_]+)\s+interface/);

			const match = funcMatch || typeStructMatch || typeInterfaceMatch;

			if (match && !currentSymbol) {
				let name = '';
				let kind: ISemanticCodeChunk['symbolKind'] = 'function';

				if (funcMatch) { name = funcMatch[1]; kind = 'function'; }
				else if (typeStructMatch) { name = typeStructMatch[1]; kind = 'struct'; }
				else if (typeInterfaceMatch) { name = typeInterfaceMatch[1]; kind = 'interface'; }

				const openBraces = (line.match(/{/g) || []).length;
				const closeBraces = (line.match(/}/g) || []).length;

				currentSymbol = {
					name,
					kind,
					startLine: lineNum,
					lines: [line],
					braces: openBraces - closeBraces
				};

				if (currentSymbol.braces <= 0 && line.includes('}')) {
					const nodeContent = currentSymbol.lines.join('\n');
					chunks.push({
						id: `${filePath}#${currentSymbol.name}-${++chunkIndex}`,
						filePath,
						symbolName: currentSymbol.name,
						symbolKind: currentSymbol.kind,
						startLine: currentSymbol.startLine,
						endLine: lineNum,
						content: nodeContent,
						tokens: tokenizeCode(`${currentSymbol.name} ${nodeContent}`)
					});
					currentSymbol = null;
				}
			} else if (currentSymbol) {
				currentSymbol.lines.push(line);
				const openBraces = (line.match(/{/g) || []).length;
				const closeBraces = (line.match(/}/g) || []).length;
				currentSymbol.braces += (openBraces - closeBraces);

				if (currentSymbol.braces <= 0) {
					const nodeContent = currentSymbol.lines.join('\n');
					chunks.push({
						id: `${filePath}#${currentSymbol.name}-${++chunkIndex}`,
						filePath,
						symbolName: currentSymbol.name,
						symbolKind: currentSymbol.kind,
						startLine: currentSymbol.startLine,
						endLine: lineNum,
						content: nodeContent,
						tokens: tokenizeCode(`${currentSymbol.name} ${nodeContent}`)
					});
					currentSymbol = null;
				}
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

	private static _chunkCpp(filePath: string, content: string): ISemanticCodeChunk[] {
		const chunks: ISemanticCodeChunk[] = [];
		const lines = content.split(/\r?\n/);
		let chunkIndex = 0;

		let currentSymbol: { name: string; kind: ISemanticCodeChunk['symbolKind']; startLine: number; lines: string[]; braces: number } | null = null;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNum = i + 1;

			const classMatch = line.match(/^\s*(?:class|struct)\s+([a-zA-Z0-9_]+)/);
			const funcMatch = line.match(/^\s*(?:[a-zA-Z0-9_:<>&*]+\s+)+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*(?:const)?\s*\{/);

			const match = classMatch || funcMatch;

			if (match && !currentSymbol) {
				const name = classMatch ? classMatch[1] : funcMatch![1];
				const kind = classMatch ? 'class' : 'function';

				const openBraces = (line.match(/{/g) || []).length;
				const closeBraces = (line.match(/}/g) || []).length;

				currentSymbol = {
					name,
					kind,
					startLine: lineNum,
					lines: [line],
					braces: openBraces - closeBraces
				};

				if (currentSymbol.braces <= 0 && line.includes('}')) {
					const nodeContent = currentSymbol.lines.join('\n');
					chunks.push({
						id: `${filePath}#${currentSymbol.name}-${++chunkIndex}`,
						filePath,
						symbolName: currentSymbol.name,
						symbolKind: currentSymbol.kind,
						startLine: currentSymbol.startLine,
						endLine: lineNum,
						content: nodeContent,
						tokens: tokenizeCode(`${currentSymbol.name} ${nodeContent}`)
					});
					currentSymbol = null;
				}
			} else if (currentSymbol) {
				currentSymbol.lines.push(line);
				const openBraces = (line.match(/{/g) || []).length;
				const closeBraces = (line.match(/}/g) || []).length;
				currentSymbol.braces += (openBraces - closeBraces);

				if (currentSymbol.braces <= 0) {
					const nodeContent = currentSymbol.lines.join('\n');
					chunks.push({
						id: `${filePath}#${currentSymbol.name}-${++chunkIndex}`,
						filePath,
						symbolName: currentSymbol.name,
						symbolKind: currentSymbol.kind,
						startLine: currentSymbol.startLine,
						endLine: lineNum,
						content: nodeContent,
						tokens: tokenizeCode(`${currentSymbol.name} ${nodeContent}`)
					});
					currentSymbol = null;
				}
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

	private static _chunkJavaAndCSharp(filePath: string, content: string): ISemanticCodeChunk[] {
		const chunks: ISemanticCodeChunk[] = [];
		const lines = content.split(/\r?\n/);
		let chunkIndex = 0;

		let currentSymbol: { name: string; kind: ISemanticCodeChunk['symbolKind']; startLine: number; lines: string[]; braces: number } | null = null;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNum = i + 1;

			const classMatch = line.match(/^\s*(?:public|private|protected|internal|static|final|abstract)?\s*(?:class|interface|record|enum)\s+([a-zA-Z0-9_]+)/);
			const methodMatch = line.match(/^\s*(?:public|private|protected|internal|static|final|async|override|virtual)?\s+[a-zA-Z0-9_<>[\]?]+\s+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{/);

			const match = classMatch || methodMatch;

			if (match && !currentSymbol) {
				const name = classMatch ? classMatch[1] : methodMatch![1];
				const kind = classMatch ? 'class' : 'method';

				const openBraces = (line.match(/{/g) || []).length;
				const closeBraces = (line.match(/}/g) || []).length;

				currentSymbol = {
					name,
					kind,
					startLine: lineNum,
					lines: [line],
					braces: openBraces - closeBraces
				};

				if (currentSymbol.braces <= 0 && line.includes('}')) {
					const nodeContent = currentSymbol.lines.join('\n');
					chunks.push({
						id: `${filePath}#${currentSymbol.name}-${++chunkIndex}`,
						filePath,
						symbolName: currentSymbol.name,
						symbolKind: currentSymbol.kind,
						startLine: currentSymbol.startLine,
						endLine: lineNum,
						content: nodeContent,
						tokens: tokenizeCode(`${currentSymbol.name} ${nodeContent}`)
					});
					currentSymbol = null;
				}
			} else if (currentSymbol) {
				currentSymbol.lines.push(line);
				const openBraces = (line.match(/{/g) || []).length;
				const closeBraces = (line.match(/}/g) || []).length;
				currentSymbol.braces += (openBraces - closeBraces);

				if (currentSymbol.braces <= 0) {
					const nodeContent = currentSymbol.lines.join('\n');
					chunks.push({
						id: `${filePath}#${currentSymbol.name}-${++chunkIndex}`,
						filePath,
						symbolName: currentSymbol.name,
						symbolKind: currentSymbol.kind,
						startLine: currentSymbol.startLine,
						endLine: lineNum,
						content: nodeContent,
						tokens: tokenizeCode(`${currentSymbol.name} ${nodeContent}`)
					});
					currentSymbol = null;
				}
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

	private static _chunkMarkdown(filePath: string, content: string): ISemanticCodeChunk[] {
		const chunks: ISemanticCodeChunk[] = [];
		const lines = content.split(/\r?\n/);
		let chunkIndex = 0;

		let currentSection: { name: string; startLine: number; lines: string[] } | null = null;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNum = i + 1;
			const headerMatch = line.match(/^#{1,4}\s+(.+)$/);

			if (headerMatch) {
				if (currentSection) {
					const sectionContent = currentSection.lines.join('\n');
					chunks.push({
						id: `${filePath}#section-${++chunkIndex}`,
						filePath,
						symbolName: currentSection.name,
						symbolKind: 'section',
						startLine: currentSection.startLine,
						endLine: lineNum - 1,
						content: sectionContent,
						tokens: tokenizeCode(`${currentSection.name} ${sectionContent}`)
					});
				}

				currentSection = {
					name: headerMatch[1].trim(),
					startLine: lineNum,
					lines: [line]
				};
			} else if (currentSection) {
				currentSection.lines.push(line);
			}
		}

		if (currentSection) {
			const sectionContent = currentSection.lines.join('\n');
			chunks.push({
				id: `${filePath}#section-${++chunkIndex}`,
				filePath,
				symbolName: currentSection.name,
				symbolKind: 'section',
				startLine: currentSection.startLine,
				endLine: lines.length,
				content: sectionContent,
				tokens: tokenizeCode(`${currentSection.name} ${sectionContent}`)
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
		const blockSize = 50;
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
