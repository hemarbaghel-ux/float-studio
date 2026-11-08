/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);

export type FloatSymbolKind =
	| 'function'
	| 'class'
	| 'interface'
	| 'method'
	| 'variable'
	| 'type'
	| 'module'
	| 'struct'
	| 'enum'
	| 'trait'
	| 'property';

export interface IFloatSourceRange {
	startLine: number;
	startColumn: number;
	endLine: number;
	endColumn: number;
	text?: string;
}

export interface IFloatAstSymbol {
	id: string;
	name: string;
	kind: FloatSymbolKind;
	language: string;
	range: IFloatSourceRange;
	signature?: string;
	docstring?: string;
	parentSymbolId?: string;
	parentName?: string;
	children?: IFloatAstSymbol[];
	hash: string;
}

export interface IFloatImportReference {
	sourceModule: string;
	importedSymbols: string[];
	isDefault: boolean;
	isNamespace: boolean;
	range: IFloatSourceRange;
}

export interface IFloatSyntaxDiagnostic {
	message: string;
	range: IFloatSourceRange;
	severity: 'error' | 'warning';
}

export interface IFloatLanguageSupportInfo {
	languageId: string;
	parserType: 'tree-sitter-wasm' | 'fallback-lexer';
	supported: boolean;
	grammarVersion?: string;
}

export interface IFloatParsedAst {
	filePath: string;
	languageId: string;
	content: string;
	tree: any; // Tree-Sitter Tree or Fallback Tree
	isFallback: boolean;
	timestamp: number;
}

export interface IFloatSyntaxParser {
	parseFile(filePath: string, content: string, oldTree?: any): Promise<IFloatParsedAst>;
	extractSymbols(parsed: IFloatParsedAst): IFloatAstSymbol[];
	extractImports(parsed: IFloatParsedAst): IFloatImportReference[];
	extractReferences(parsed: IFloatParsedAst, symbolName: string): IFloatSourceRange[];
	getEnclosingScope(parsed: IFloatParsedAst, line: number, column: number): IFloatAstSymbol | null;
	getSyntaxDiagnostics(parsed: IFloatParsedAst): IFloatSyntaxDiagnostic[];
	getLanguageSupport(languageId: string): IFloatLanguageSupportInfo;
}

// Tree-Sitter WASM runtime singleton
let _treeSitterModule: any = null;
let _isTreeSitterInitialized = false;
let _initPromise: Promise<void> | null = null;

function resolveTreeSitterWasmDir(): string {
	const candidates = [
		path.resolve(__dirname, '../../wasm'),
		path.resolve(process.cwd(), 'daemon/wasm'),
		path.resolve(process.cwd(), 'desktop/node_modules/@vscode/tree-sitter-wasm/wasm'),
		path.resolve(process.cwd(), 'node_modules/@vscode/tree-sitter-wasm/wasm')
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'tree-sitter.wasm'))) {
			return candidate;
		}
	}
	throw new Error(`Tree-Sitter WASM directory not found in candidate paths.`);
}

function loadTreeSitterModuleSync(): any {
	if (_treeSitterModule) {
		return _treeSitterModule;
	}

	const wasmDir = resolveTreeSitterWasmDir();
	const scriptPath = path.join(wasmDir, 'tree-sitter.js');
	const content = fs.readFileSync(scriptPath, 'utf8');

	const factoryMatch = content.match(/\(function \(global, factory\) \{([\s\S]*?)\}\)\(this, \(function \(\) \{([\s\S]*)\}\)\);/);
	if (factoryMatch) {
		const factoryBody = factoryMatch[2];
		const factoryFn = new Function('require', '__filename', '__dirname', factoryBody);
		_treeSitterModule = factoryFn(require, scriptPath, wasmDir);
		return _treeSitterModule;
	}

	throw new Error('Failed to load TreeSitter WASM engine from: ' + scriptPath);
}

export async function initTreeSitterRuntime(): Promise<any> {
	if (_isTreeSitterInitialized && _treeSitterModule) {
		return _treeSitterModule;
	}
	if (_initPromise) {
		await _initPromise;
		return _treeSitterModule;
	}

	_initPromise = (async () => {
		const mod = loadTreeSitterModuleSync();
		const wasmDir = resolveTreeSitterWasmDir();
		await mod.Parser.init({
			locateFile: (file: string) => path.join(wasmDir, file)
		});
		_isTreeSitterInitialized = true;
	})();

	await _initPromise;
	return _treeSitterModule;
}

export class FloatTreeSitterSyntaxParser implements IFloatSyntaxParser {
	private readonly _wasmDir: string;
	private readonly _loadedLanguages = new Map<string, any>();
	private _parserInstance: any = null;
	private readonly _fallbackParser = new FloatFallbackSyntaxParser();

	private static readonly EXT_TO_LANG: Record<string, string> = {
		'.ts': 'typescript',
		'.tsx': 'tsx',
		'.js': 'javascript',
		'.jsx': 'javascript',
		'.mjs': 'javascript',
		'.cjs': 'javascript',
		'.py': 'python',
		'.pyi': 'python',
		'.rs': 'rust',
		'.go': 'go',
		'.cpp': 'cpp',
		'.cc': 'cpp',
		'.cxx': 'cpp',
		'.c': 'cpp',
		'.h': 'cpp',
		'.hpp': 'cpp',
		'.java': 'java'
	};

	private static readonly LANG_TO_WASM: Record<string, string> = {
		'typescript': 'tree-sitter-typescript.wasm',
		'tsx': 'tree-sitter-tsx.wasm',
		'javascript': 'tree-sitter-javascript.wasm',
		'python': 'tree-sitter-python.wasm',
		'rust': 'tree-sitter-rust.wasm',
		'go': 'tree-sitter-go.wasm',
		'cpp': 'tree-sitter-cpp.wasm',
		'java': 'tree-sitter-java.wasm'
	};

	constructor() {
		this._wasmDir = resolveTreeSitterWasmDir();
	}

	public getLanguageId(filePath: string): string {
		const ext = path.extname(filePath).toLowerCase();
		return FloatTreeSitterSyntaxParser.EXT_TO_LANG[ext] || 'generic';
	}

	public supportsLanguage(languageId: string): boolean {
		return !!FloatTreeSitterSyntaxParser.LANG_TO_WASM[languageId];
	}

	public getLanguageSupport(languageId: string): IFloatLanguageSupportInfo {
		if (FloatTreeSitterSyntaxParser.LANG_TO_WASM[languageId]) {
			return {
				languageId,
				parserType: 'tree-sitter-wasm',
				supported: true,
				grammarVersion: 'tree-sitter-wasm-0.1.4'
			};
		}
		return {
			languageId,
			parserType: 'fallback-lexer',
			supported: false
		};
	}

	private async _getParserForLanguage(languageId: string): Promise<any> {
		const wasmFileName = FloatTreeSitterSyntaxParser.LANG_TO_WASM[languageId];
		if (!wasmFileName) {
			return null;
		}

		const mod = await initTreeSitterRuntime();
		if (!this._parserInstance) {
			this._parserInstance = new mod.Parser();
		}

		let langObj = this._loadedLanguages.get(languageId);
		if (!langObj) {
			const wasmPath = path.join(this._wasmDir, wasmFileName);
			if (!fs.existsSync(wasmPath)) {
				return null;
			}
			langObj = await mod.Language.load(wasmPath);
			this._loadedLanguages.set(languageId, langObj);
		}

		this._parserInstance.setLanguage(langObj);
		return this._parserInstance;
	}

	public async parseFile(filePath: string, content: string, oldTree?: any): Promise<IFloatParsedAst> {
		const languageId = this.getLanguageId(filePath);
		const parser = await this._getParserForLanguage(languageId);

		if (!parser) {
			// Transparent fallback for unsupported languages, clearly flagged
			return this._fallbackParser.parseFile(filePath, content);
		}

		try {
			const tree = parser.parse(content, oldTree || null);
			return {
				filePath,
				languageId,
				content,
				tree,
				isFallback: false,
				timestamp: Date.now()
			};
		} catch (err) {
			// Malformed files must not crash indexing; fallback safely
			return {
				filePath,
				languageId,
				content,
				tree: null,
				isFallback: true,
				timestamp: Date.now()
			};
		}
	}

	public extractSymbols(parsed: IFloatParsedAst): IFloatAstSymbol[] {
		if (parsed.isFallback || !parsed.tree) {
			return this._fallbackParser.extractSymbols(parsed);
		}

		const symbols: IFloatAstSymbol[] = [];
		const root = parsed.tree.rootNode;
		if (!root) return symbols;

		this._traverseAst(root, parsed.languageId, parsed.content, null, symbols);
		return symbols;
	}

	private _traverseAst(
		node: any,
		languageId: string,
		sourceCode: string,
		parent: IFloatAstSymbol | null,
		outSymbols: IFloatAstSymbol[]
	): void {
		const symbolInfo = this._inspectNodeAsSymbol(node, languageId, sourceCode);

		let currentParent = parent;
		if (symbolInfo) {
			if (parent) {
				symbolInfo.parentSymbolId = parent.id;
				symbolInfo.parentName = parent.name;
				if (!parent.children) parent.children = [];
				parent.children.push(symbolInfo);
			}
			outSymbols.push(symbolInfo);
			currentParent = symbolInfo;
		}

		for (let i = 0; i < node.childCount; i++) {
			const child = node.child(i);
			if (child) {
				this._traverseAst(child, languageId, sourceCode, currentParent, outSymbols);
			}
		}
	}

	private _inspectNodeAsSymbol(node: any, languageId: string, sourceCode: string): IFloatAstSymbol | null {
		const type = node.type;

		// 1. Python
		if (languageId === 'python') {
			if (type === 'function_definition') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'function', languageId, node, sourceCode);
				}
			}
			if (type === 'class_definition') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'class', languageId, node, sourceCode);
				}
			}
		}

		// 2. TypeScript / JavaScript / TSX
		if (languageId === 'typescript' || languageId === 'javascript' || languageId === 'tsx') {
			if (type === 'function_declaration' || type === 'function') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'function', languageId, node, sourceCode);
				}
			}
			if (type === 'class_declaration' || type === 'class') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'class', languageId, node, sourceCode);
				}
			}
			if (type === 'interface_declaration') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'interface', languageId, node, sourceCode);
				}
			}
			if (type === 'method_definition') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'method', languageId, node, sourceCode);
				}
			}
			if (type === 'type_alias_declaration') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'type', languageId, node, sourceCode);
				}
			}
			if (type === 'enum_declaration') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'enum', languageId, node, sourceCode);
				}
			}
		}

		// 3. Rust
		if (languageId === 'rust') {
			if (type === 'function_item') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'function', languageId, node, sourceCode);
				}
			}
			if (type === 'struct_item') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'struct', languageId, node, sourceCode);
				}
			}
			if (type === 'enum_item') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'enum', languageId, node, sourceCode);
				}
			}
			if (type === 'trait_item') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'trait', languageId, node, sourceCode);
				}
			}
		}

		// 4. Go
		if (languageId === 'go') {
			if (type === 'function_declaration') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'function', languageId, node, sourceCode);
				}
			}
			if (type === 'method_declaration') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'method', languageId, node, sourceCode);
				}
			}
			if (type === 'type_declaration') {
				// Search for type_spec child
				for (let i = 0; i < node.childCount; i++) {
					const child = node.child(i);
					if (child && child.type === 'type_spec') {
						const nameNode = child.childForFieldName('name');
						if (nameNode) {
							return this._buildSymbol(nameNode.text, 'struct', languageId, node, sourceCode);
						}
					}
				}
			}
		}

		// 5. C/C++
		if (languageId === 'cpp') {
			if (type === 'function_definition') {
				const decl = node.childForFieldName('declarator');
				const name = decl ? decl.text.split('(')[0].trim() : 'anonymous_function';
				return this._buildSymbol(name, 'function', languageId, node, sourceCode);
			}
			if (type === 'class_specifier' || type === 'struct_specifier') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, type === 'class_specifier' ? 'class' : 'struct', languageId, node, sourceCode);
				}
			}
		}

		// 6. Java
		if (languageId === 'java') {
			if (type === 'method_declaration') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'method', languageId, node, sourceCode);
				}
			}
			if (type === 'class_declaration') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'class', languageId, node, sourceCode);
				}
			}
			if (type === 'interface_declaration') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					return this._buildSymbol(nameNode.text, 'interface', languageId, node, sourceCode);
				}
			}
		}

		return null;
	}

	private _buildSymbol(
		name: string,
		kind: FloatSymbolKind,
		languageId: string,
		node: any,
		sourceCode: string
	): IFloatAstSymbol {
		const startPos = node.startPosition;
		const endPos = node.endPosition;
		const startLine = startPos.row + 1;
		const startColumn = startPos.column + 1;
		const endLine = endPos.row + 1;
		const endColumn = endPos.column + 1;

		const lines = sourceCode.split('\n');
		const signature = (lines[startLine - 1] || '').trim();

		// Extract docstring if previous sibling is comment or docstring
		let docstring: string | undefined;
		const prevSibling = node.previousNamedSibling;
		if (prevSibling && (prevSibling.type === 'comment' || prevSibling.type === 'expression_statement')) {
			docstring = prevSibling.text.trim();
		}

		const hash = crypto.createHash('sha256').update(`${name}:${kind}:${startLine}:${endLine}`, 'utf8').digest('hex');
		const id = `${name}-${startLine}-${hash.substring(0, 8)}`;

		return {
			id,
			name,
			kind,
			language: languageId,
			range: {
				startLine,
				startColumn,
				endLine,
				endColumn,
				text: node.text
			},
			signature,
			docstring,
			hash
		};
	}

	public extractImports(parsed: IFloatParsedAst): IFloatImportReference[] {
		if (parsed.isFallback || !parsed.tree) {
			return this._fallbackParser.extractImports(parsed);
		}

		const imports: IFloatImportReference[] = [];
		const root = parsed.tree.rootNode;
		if (!root) return imports;

		for (let i = 0; i < root.childCount; i++) {
			const node = root.child(i);
			if (!node) continue;

			// TypeScript/JavaScript import
			if ((parsed.languageId === 'typescript' || parsed.languageId === 'javascript' || parsed.languageId === 'tsx') && node.type === 'import_statement') {
				const sourceNode = node.childForFieldName('source');
				const sourceModule = sourceNode ? sourceNode.text.replace(/['"]/g, '') : '';
				imports.push({
					sourceModule,
					importedSymbols: [node.text],
					isDefault: node.text.includes('default') || !node.text.includes('{'),
					isNamespace: node.text.includes('* as'),
					range: {
						startLine: node.startPosition.row + 1,
						startColumn: node.startPosition.column + 1,
						endLine: node.endPosition.row + 1,
						endColumn: node.endPosition.column + 1,
						text: node.text
					}
				});
			} else if (parsed.languageId === 'python' && (node.type === 'import_statement' || node.type === 'import_from_statement')) {
				const moduleName = node.childForFieldName('module_name')?.text || node.text;
				imports.push({
					sourceModule: moduleName.replace(/['"]/g, '').trim(),
					importedSymbols: [node.text],
					isDefault: false,
					isNamespace: node.text.includes('*'),
					range: {
						startLine: node.startPosition.row + 1,
						startColumn: node.startPosition.column + 1,
						endLine: node.endPosition.row + 1,
						endColumn: node.endPosition.column + 1,
						text: node.text
					}
				});
			} else if (parsed.languageId === 'rust' && node.type === 'use_declaration') {
				imports.push({
					sourceModule: node.text.replace(/^use\s+|;$/g, '').trim(),
					importedSymbols: [node.text],
					isDefault: false,
					isNamespace: node.text.includes('*'),
					range: {
						startLine: node.startPosition.row + 1,
						startColumn: node.startPosition.column + 1,
						endLine: node.endPosition.row + 1,
						endColumn: node.endPosition.column + 1,
						text: node.text
					}
				});
			} else if (parsed.languageId === 'go' && node.type === 'import_declaration') {
				imports.push({
					sourceModule: node.text.replace(/['"]/g, '').trim(),
					importedSymbols: [node.text],
					isDefault: false,
					isNamespace: false,
					range: {
						startLine: node.startPosition.row + 1,
						startColumn: node.startPosition.column + 1,
						endLine: node.endPosition.row + 1,
						endColumn: node.endPosition.column + 1,
						text: node.text
					}
				});
			}
		}

		return imports;
	}

	public extractReferences(parsed: IFloatParsedAst, symbolName: string): IFloatSourceRange[] {
		const refs: IFloatSourceRange[] = [];
		if (!parsed.tree) return refs;

		const root = parsed.tree.rootNode;
		if (!root) return refs;

		const walk = (node: any) => {
			if (node.type === 'identifier' || node.type === 'type_identifier' || node.type === 'field_identifier') {
				if (node.text === symbolName) {
					refs.push({
						startLine: node.startPosition.row + 1,
						startColumn: node.startPosition.column + 1,
						endLine: node.endPosition.row + 1,
						endColumn: node.endPosition.column + 1,
						text: node.text
					});
				}
			}
			for (let i = 0; i < node.childCount; i++) {
				walk(node.child(i));
			}
		};

		walk(root);
		return refs;
	}

	public getEnclosingScope(parsed: IFloatParsedAst, line: number, column: number): IFloatAstSymbol | null {
		const symbols = this.extractSymbols(parsed);
		let bestMatch: IFloatAstSymbol | null = null;
		let minRangeSize = Infinity;

		for (const sym of symbols) {
			const inRange =
				(line > sym.range.startLine || (line === sym.range.startLine && column >= sym.range.startColumn)) &&
				(line < sym.range.endLine || (line === sym.range.endLine && column <= sym.range.endColumn));

			if (inRange) {
				const rangeSize = sym.range.endLine - sym.range.startLine;
				if (rangeSize < minRangeSize) {
					minRangeSize = rangeSize;
					bestMatch = sym;
				}
			}
		}

		return bestMatch;
	}

	public getSyntaxDiagnostics(parsed: IFloatParsedAst): IFloatSyntaxDiagnostic[] {
		const diagnostics: IFloatSyntaxDiagnostic[] = [];
		if (!parsed.tree) return diagnostics;

		const root = parsed.tree.rootNode;
		if (!root) return diagnostics;

		const walk = (node: any) => {
			if (node.type === 'ERROR' || node.isMissing()) {
				diagnostics.push({
					message: node.type === 'ERROR' ? `Syntax error near '${node.text}'` : `Missing syntax token`,
					severity: 'error',
					range: {
						startLine: node.startPosition.row + 1,
						startColumn: node.startPosition.column + 1,
						endLine: node.endPosition.row + 1,
						endColumn: node.endPosition.column + 1,
						text: node.text
					}
				});
			}
			for (let i = 0; i < node.childCount; i++) {
				walk(node.child(i));
			}
		};

		walk(root);
		return diagnostics;
	}
}

/**
 * Fallback Parser: Explicitly identifies itself as 'fallback-lexer'.
 * Never labels itself as Tree-Sitter. Used only when WASM grammar is missing or file is generic.
 */
export class FloatFallbackSyntaxParser implements IFloatSyntaxParser {
	public async parseFile(filePath: string, content: string): Promise<IFloatParsedAst> {
		return {
			filePath,
			languageId: path.extname(filePath).slice(1) || 'generic',
			content,
			tree: { fallbackLines: content.split('\n') },
			isFallback: true,
			timestamp: Date.now()
		};
	}

	public getLanguageSupport(languageId: string): IFloatLanguageSupportInfo {
		return {
			languageId,
			parserType: 'fallback-lexer',
			supported: false
		};
	}

	public extractSymbols(parsed: IFloatParsedAst): IFloatAstSymbol[] {
		const symbols: IFloatAstSymbol[] = [];
		const lines = parsed.content.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNum = i + 1;
			const fnMatch = line.match(/(?:function|def|fn)\s+([a-zA-Z0-9_$]+)/);
			if (fnMatch) {
				const name = fnMatch[1];
				const hash = crypto.createHash('sha256').update(`${name}:function:${lineNum}`, 'utf8').digest('hex');
				symbols.push({
					id: `fallback-${name}-${lineNum}`,
					name,
					kind: 'function',
					language: parsed.languageId,
					range: { startLine: lineNum, startColumn: 1, endLine: lineNum, endColumn: line.length + 1, text: line },
					signature: line.trim(),
					hash
				});
			}
		}

		return symbols;
	}

	public extractImports(parsed: IFloatParsedAst): IFloatImportReference[] {
		const imports: IFloatImportReference[] = [];
		const lines = parsed.content.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNum = i + 1;
			const impMatch = line.match(/(?:import|require)\s+['"]([^'"]+)['"]/);
			if (impMatch) {
				imports.push({
					sourceModule: impMatch[1],
					importedSymbols: [impMatch[1]],
					isDefault: true,
					isNamespace: false,
					range: { startLine: lineNum, startColumn: 1, endLine: lineNum, endColumn: line.length + 1, text: line }
				});
			}
		}

		return imports;
	}

	public extractReferences(parsed: IFloatParsedAst, symbolName: string): IFloatSourceRange[] {
		const refs: IFloatSourceRange[] = [];
		const lines = parsed.content.split('\n');
		for (let i = 0; i < lines.length; i++) {
			const col = lines[i].indexOf(symbolName);
			if (col !== -1) {
				refs.push({
					startLine: i + 1,
					startColumn: col + 1,
					endLine: i + 1,
					endColumn: col + 1 + symbolName.length,
					text: symbolName
				});
			}
		}
		return refs;
	}

	public getEnclosingScope(parsed: IFloatParsedAst, line: number, column: number): IFloatAstSymbol | null {
		const syms = this.extractSymbols(parsed);
		return syms.find(s => s.range.startLine === line) || null;
	}

	public getSyntaxDiagnostics(parsed: IFloatParsedAst): IFloatSyntaxDiagnostic[] {
		return [];
	}
}
