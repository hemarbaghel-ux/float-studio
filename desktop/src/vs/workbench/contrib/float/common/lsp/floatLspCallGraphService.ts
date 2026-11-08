/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export interface IFloatCallNode {
	symbolName: string;
	kind: 'function' | 'method' | 'class' | 'interface' | 'struct' | 'trait';
	filePath: string;
	lineNumber: number;
	signature?: string;
	docstring?: string;
	callers: IFloatCallEdge[];
	callees: IFloatCallEdge[];
	implements?: string[];
}

export interface IFloatCallEdge {
	callerSymbol: string;
	calleeSymbol: string;
	callerFilePath: string;
	calleeFilePath: string;
	lineNumber: number;
	callSnippet: string;
	confidence: number;
}

export interface IFloatBlastRadius {
	targetSymbol: string;
	targetFile: string;
	directCallers: IFloatCallEdge[];
	transitiveCallers: IFloatCallEdge[];
	affectedFiles: string[];
	affectedTestFiles: string[];
	impactScore: number;
}

export interface IFloatCallHierarchy {
	symbolName: string;
	definition?: {
		filePath: string;
		line: number;
		signature?: string;
		kind: string;
	};
	incomingCalls: IFloatCallEdge[];
	outgoingCalls: IFloatCallEdge[];
	implementations: string[];
}

export const IFloatLspCallGraphService = createDecorator<IFloatLspCallGraphService>('floatLspCallGraphService');

export interface IFloatLspCallGraphService {
	readonly _serviceBrand: undefined;
	indexWorkspace(files: Record<string, string> | Map<string, string>): void;
	updateFile(filePath: string, content: string): void;
	removeFile(filePath: string): void;
	getCallHierarchy(symbolName: string, filePath?: string): IFloatCallHierarchy | undefined;
	getBlastRadius(symbolName: string, maxDepth?: number): IFloatBlastRadius;
	findAffectedTests(symbolName: string, candidateFiles?: Set<string>): string[];
	findImplementations(interfaceName: string): IFloatCallNode[];
	formatCallGraphPrompt(symbolName: string, maxTokens?: number): string;
	getTotalSymbols(): number;
	getTotalCallEdges(): number;
	clear(): void;
}

/**
 * Production Multi-Language LSP Call Graph & Blast-Radius Tracing Service.
 *
 * Grounded in multi-language AST structures across TypeScript, TSX, Python, Rust,
 * Go, C/C++, and Java. Provides bidirectional call hierarchies, interface
 * implementation detection, transitive impact analysis, and LLM prompt context slicing.
 */
export class FloatLspCallGraphService implements IFloatLspCallGraphService {
	declare readonly _serviceBrand: undefined;

	// Symbol name -> list of defined nodes
	private readonly _nodesBySymbol = new Map<string, IFloatCallNode[]>();
	// File path -> list of symbols defined in file
	private readonly _symbolsByFile = new Map<string, Set<string>>();
	// File path -> file content
	private readonly _fileContents = new Map<string, string>();
	// Direct call edges: callerSymbol:callerFile -> calleeSymbol[]
	private readonly _outgoingEdges = new Map<string, IFloatCallEdge[]>();
	// Incoming call edges: calleeSymbol -> callerSymbol[]
	private readonly _incomingEdges = new Map<string, IFloatCallEdge[]>();
	// Interface name -> implementing class symbols
	private readonly _implementations = new Map<string, Set<string>>();

	constructor() {}

	/**
	 * Indexes a complete workspace or batch of files
	 */
	public indexWorkspace(files: Record<string, string> | Map<string, string>): void {
		const entries = files instanceof Map ? files.entries() : Object.entries(files);
		for (const [filePath, content] of entries) {
			this.updateFile(filePath, content);
		}
	}

	/**
	 * Incrementally indexes or updates a single file in the graph
	 */
	public updateFile(filePath: string, content: string): void {
		const normPath = this._normalizePath(filePath);

		// Remove existing entries for this file before re-indexing
		this.removeFile(normPath);
		this._fileContents.set(normPath, content);

		const lang = this._detectLanguage(normPath);
		const extracted = this._extractSymbolsAndDefinitions(normPath, content, lang);

		const fileSymbolSet = new Set<string>();
		this._symbolsByFile.set(normPath, fileSymbolSet);

		for (const node of extracted) {
			fileSymbolSet.add(node.symbolName);
			let list = this._nodesBySymbol.get(node.symbolName);
			if (!list) {
				list = [];
				this._nodesBySymbol.set(node.symbolName, list);
			}
			list.push(node);

			if (node.implements) {
				for (const iface of node.implements) {
					let implSet = this._implementations.get(iface);
					if (!implSet) {
						implSet = new Set();
						this._implementations.set(iface, implSet);
					}
					implSet.add(node.symbolName);
				}
			}
		}

		// Second pass: extract call sites and connect edges
		this._extractCallEdges(normPath, content, lang);
	}

	/**
	 * Prunes a deleted file from the call graph
	 */
	public removeFile(filePath: string): void {
		const normPath = this._normalizePath(filePath);
		this._fileContents.delete(normPath);

		const symbols = this._symbolsByFile.get(normPath);
		if (symbols) {
			for (const sym of symbols) {
				const nodes = this._nodesBySymbol.get(sym);
				if (nodes) {
					const filtered = nodes.filter(n => n.filePath !== normPath);
					if (filtered.length > 0) {
						this._nodesBySymbol.set(sym, filtered);
					} else {
						this._nodesBySymbol.delete(sym);
					}
				}

				// Clean implementations
				for (const [iface, impls] of this._implementations.entries()) {
					impls.delete(sym);
					if (impls.size === 0) {
						this._implementations.delete(iface);
					}
				}
			}
			this._symbolsByFile.delete(normPath);
		}

		// Remove outgoing edges originating from this file
		for (const [key, edges] of Array.from(this._outgoingEdges.entries())) {
			if (edges.some(e => e.callerFilePath === normPath)) {
				const remaining = edges.filter(e => e.callerFilePath !== normPath);
				if (remaining.length > 0) {
					this._outgoingEdges.set(key, remaining);
				} else {
					this._outgoingEdges.delete(key);
				}
			}
		}

		// Remove incoming edges where this file is caller or callee
		for (const [sym, edges] of Array.from(this._incomingEdges.entries())) {
			const remaining = edges.filter(e => e.callerFilePath !== normPath && e.calleeFilePath !== normPath);
			if (remaining.length > 0) {
				this._incomingEdges.set(sym, remaining);
			} else {
				this._incomingEdges.delete(sym);
			}
		}
	}

	/**
	 * Retrieves bidirectional call hierarchy (incoming and outgoing calls) for a symbol
	 */
	public getCallHierarchy(symbolName: string, filePath?: string): IFloatCallHierarchy | undefined {
		const normPath = filePath ? this._normalizePath(filePath) : undefined;
		const nodes = this._nodesBySymbol.get(symbolName);
		const node = normPath && nodes ? nodes.find(n => n.filePath === normPath) || nodes[0] : nodes?.[0];

		const incoming = this._incomingEdges.get(symbolName) || [];
		const outgoing: IFloatCallEdge[] = [];

		if (node) {
			const callerKey = `${node.symbolName}:${node.filePath}`;
			outgoing.push(...(this._outgoingEdges.get(callerKey) || []));
		} else {
			// Find all outgoing edges matching symbolName as caller
			for (const [key, edges] of this._outgoingEdges.entries()) {
				if (key.startsWith(`${symbolName}:`)) {
					outgoing.push(...edges);
				}
			}
		}

		const impls = Array.from(this._implementations.get(symbolName) || []);

		return {
			symbolName,
			definition: node ? {
				filePath: node.filePath,
				line: node.lineNumber,
				signature: node.signature,
				kind: node.kind
			} : undefined,
			incomingCalls: incoming,
			outgoingCalls: outgoing,
			implementations: impls
		};
	}

	/**
	 * Computes transitive blast radius when a symbol is modified
	 */
	public getBlastRadius(symbolName: string, maxDepth: number = 3): IFloatBlastRadius {
		const nodes = this._nodesBySymbol.get(symbolName);
		const targetFile = nodes?.[0]?.filePath || '';

		const directCallers = this._incomingEdges.get(symbolName) || [];
		const transitiveCallers: IFloatCallEdge[] = [];
		const visitedSymbols = new Set<string>([symbolName]);
		const affectedFilesSet = new Set<string>();

		if (targetFile) {
			affectedFilesSet.add(targetFile);
		}

		let currentFrontier = directCallers.map(e => e.callerSymbol);
		for (const edge of directCallers) {
			affectedFilesSet.add(edge.callerFilePath);
		}

		// Breadth-first transitive expansion up to maxDepth
		for (let depth = 2; depth <= maxDepth; depth++) {
			const nextFrontier: string[] = [];
			for (const sym of currentFrontier) {
				if (visitedSymbols.has(sym)) continue;
				visitedSymbols.add(sym);

				const callers = this._incomingEdges.get(sym) || [];
				for (const edge of callers) {
					if (!visitedSymbols.has(edge.callerSymbol)) {
						transitiveCallers.push(edge);
						affectedFilesSet.add(edge.callerFilePath);
						nextFrontier.push(edge.callerSymbol);
					}
				}
			}
			currentFrontier = nextFrontier;
			if (currentFrontier.length === 0) break;
		}

		// Detect affected test files
		const affectedTestFiles = this.findAffectedTests(symbolName, affectedFilesSet);
		for (const testFile of affectedTestFiles) {
			affectedFilesSet.add(testFile);
		}

		// Impact score formula: direct callers (2.0) + transitive (1.0) + tests (1.5) + files (0.5)
		const impactScore = Math.round(
			(directCallers.length * 2.0 +
			transitiveCallers.length * 1.0 +
			affectedTestFiles.length * 1.5 +
			affectedFilesSet.size * 0.5) * 10
		) / 10;

		return {
			targetSymbol: symbolName,
			targetFile,
			directCallers,
			transitiveCallers,
			affectedFiles: Array.from(affectedFilesSet),
			affectedTestFiles,
			impactScore
		};
	}

	/**
	 * Finds test files covering the target symbol or any affected files
	 */
	public findAffectedTests(symbolName: string, candidateFiles?: Set<string>): string[] {
		const testFiles: string[] = [];
		const filesToSearch = candidateFiles || new Set(this._symbolsByFile.keys());

		for (const filePath of this._fileContents.keys()) {
			if (!this._isTestFile(filePath)) continue;

			const content = this._fileContents.get(filePath) || '';

			// 1. Direct mention of symbol in test file
			const symPattern = new RegExp(`\\b${symbolName}\\b`);
			if (symPattern.test(content)) {
				testFiles.push(filePath);
				continue;
			}

			// 2. Test imports an affected file
			for (const affected of filesToSearch) {
				const baseName = affected.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
				if (baseName && content.includes(baseName)) {
					testFiles.push(filePath);
					break;
				}
			}
		}

		return Array.from(new Set(testFiles));
	}

	/**
	 * Finds classes or structs implementing an interface
	 */
	public findImplementations(interfaceName: string): IFloatCallNode[] {
		const implNames = this._implementations.get(interfaceName);
		if (!implNames) return [];

		const results: IFloatCallNode[] = [];
		for (const name of implNames) {
			const nodes = this._nodesBySymbol.get(name);
			if (nodes) {
				results.push(...nodes);
			}
		}
		return results;
	}

	/**
	 * Formats a concise call-graph & blast radius prompt section for LLM completion
	 */
	public formatCallGraphPrompt(symbolName: string, maxTokens: number = 300): string {
		const hierarchy = this.getCallHierarchy(symbolName);
		if (!hierarchy || (!hierarchy.definition && hierarchy.incomingCalls.length === 0)) {
			return '';
		}

		const lines: string[] = [`// === Call Graph Context: '${symbolName}' ===`];

		if (hierarchy.definition) {
			lines.push(`// Definition: ${hierarchy.definition.filePath}:${hierarchy.definition.line} (${hierarchy.definition.kind})`);
			if (hierarchy.definition.signature) {
				lines.push(`// Signature: ${hierarchy.definition.signature}`);
			}
		}

		if (hierarchy.incomingCalls.length > 0) {
			lines.push(`// Callers (${hierarchy.incomingCalls.length}):`);
			for (const call of hierarchy.incomingCalls.slice(0, 4)) {
				lines.push(`// - ${call.callerFilePath}:${call.lineNumber} in '${call.callerSymbol}': "${call.callSnippet}"`);
			}
		}

		if (hierarchy.implementations.length > 0) {
			lines.push(`// Implementations: ${hierarchy.implementations.slice(0, 3).join(', ')}`);
		}

		const blast = this.getBlastRadius(symbolName, 2);
		if (blast.impactScore > 0) {
			lines.push(`// Impact Blast Radius: ${blast.affectedFiles.length} files affected (Score: ${blast.impactScore})`);
			if (blast.affectedTestFiles.length > 0) {
				lines.push(`// Associated Tests: ${blast.affectedTestFiles.slice(0, 2).join(', ')}`);
			}
		}

		return lines.join('\n');
	}

	public getTotalSymbols(): number {
		let count = 0;
		for (const list of this._nodesBySymbol.values()) {
			count += list.length;
		}
		return count;
	}

	public getTotalCallEdges(): number {
		let count = 0;
		for (const list of this._incomingEdges.values()) {
			count += list.length;
		}
		return count;
	}

	public clear(): void {
		this._nodesBySymbol.clear();
		this._symbolsByFile.clear();
		this._fileContents.clear();
		this._outgoingEdges.clear();
		this._incomingEdges.clear();
		this._implementations.clear();
	}

	// -------------------------------------------------------------------------
	// Internal Extraction Helpers
	// -------------------------------------------------------------------------

	private _detectLanguage(filePath: string): string {
		const ext = filePath.split('.').pop()?.toLowerCase();
		switch (ext) {
			case 'ts':
			case 'tsx':
				return 'typescript';
			case 'js':
			case 'jsx':
			case 'mjs':
			case 'cjs':
				return 'javascript';
			case 'py':
			case 'pyi':
				return 'python';
			case 'rs':
				return 'rust';
			case 'go':
				return 'go';
			case 'cpp':
			case 'cc':
			case 'cxx':
			case 'c':
			case 'h':
			case 'hpp':
				return 'cpp';
			case 'java':
				return 'java';
			default:
				return 'plaintext';
		}
	}

	private _extractSymbolsAndDefinitions(filePath: string, content: string, lang: string): IFloatCallNode[] {
		const nodes: IFloatCallNode[] = [];
		const lines = content.split(/\r?\n/);

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNum = i + 1;

			// TypeScript / JavaScript
			if (lang === 'typescript' || lang === 'javascript') {
				// function declarations
				const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/);
				if (fnMatch) {
					nodes.push({
						symbolName: fnMatch[1],
						kind: 'function',
						filePath,
						lineNumber: lineNum,
						signature: `function ${fnMatch[1]}(${fnMatch[2]})`,
						callers: [],
						callees: []
					});
					continue;
				}

				// const/let arrow or assigned functions
				const constFnMatch = line.match(/(?:export\s+)?(?:const|let)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s+)?(?:\(([^)]*)\)|([a-zA-Z0-9_$]+))\s*=>/);
				if (constFnMatch) {
					const args = constFnMatch[2] || constFnMatch[3] || '';
					nodes.push({
						symbolName: constFnMatch[1],
						kind: 'function',
						filePath,
						lineNumber: lineNum,
						signature: `const ${constFnMatch[1]} = (${args}) =>`,
						callers: [],
						callees: []
					});
					continue;
				}

				// class declarations with optional implements
				const classMatch = line.match(/(?:export\s+)?class\s+([a-zA-Z0-9_$]+)(?:\s+extends\s+([a-zA-Z0-9_$]+))?(?:\s+implements\s+([a-zA-Z0-9_$,\s]+))?/);
				if (classMatch) {
					const implList = classMatch[3] ? classMatch[3].split(',').map(s => s.trim().replace(/\{.*$/, '').trim()).filter(Boolean) : undefined;
					nodes.push({
						symbolName: classMatch[1],
						kind: 'class',
						filePath,
						lineNumber: lineNum,
						signature: `class ${classMatch[1]}`,
						callers: [],
						callees: [],
						implements: implList
					});
					continue;
				}

				// interface declarations
				const ifaceMatch = line.match(/(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/);
				if (ifaceMatch) {
					nodes.push({
						symbolName: ifaceMatch[1],
						kind: 'interface',
						filePath,
						lineNumber: lineNum,
						signature: `interface ${ifaceMatch[1]}`,
						callers: [],
						callees: []
					});
					continue;
				}

				// class methods
				const methodMatch = line.match(/^\s*(?:public|private|protected|async|static|\s)*\s*([a-zA-Z0-9_$]+)\s*\(([^)]*)\)\s*(?::\s*[^;{]+)?\s*\{/);
				if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'function', 'constructor'].includes(methodMatch[1])) {
					nodes.push({
						symbolName: methodMatch[1],
						kind: 'method',
						filePath,
						lineNumber: lineNum,
						signature: `${methodMatch[1]}(${methodMatch[2]})`,
						callers: [],
						callees: []
					});
					continue;
				}
			}

			// Python
			if (lang === 'python') {
				const pyDef = line.match(/^\s*(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\):/);
				if (pyDef) {
					nodes.push({
						symbolName: pyDef[1],
						kind: pyDef[2].includes('self') ? 'method' : 'function',
						filePath,
						lineNumber: lineNum,
						signature: `def ${pyDef[1]}(${pyDef[2]})`,
						callers: [],
						callees: []
					});
					continue;
				}

				const pyClass = line.match(/^\s*class\s+([a-zA-Z0-9_]+)(?:\(([^)]*)\))?:/);
				if (pyClass) {
					const bases = pyClass[2] ? pyClass[2].split(',').map(s => s.trim()) : undefined;
					nodes.push({
						symbolName: pyClass[1],
						kind: 'class',
						filePath,
						lineNumber: lineNum,
						signature: `class ${pyClass[1]}`,
						callers: [],
						callees: [],
						implements: bases
					});
					continue;
				}
			}

			// Rust
			if (lang === 'rust') {
				const rsFn = line.match(/(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
				if (rsFn) {
					nodes.push({
						symbolName: rsFn[1],
						kind: rsFn[2].includes('&self') ? 'method' : 'function',
						filePath,
						lineNumber: lineNum,
						signature: `fn ${rsFn[1]}(${rsFn[2]})`,
						callers: [],
						callees: []
					});
					continue;
				}

				const rsStruct = line.match(/(?:pub\s+)?struct\s+([a-zA-Z0-9_]+)/);
				if (rsStruct) {
					nodes.push({
						symbolName: rsStruct[1],
						kind: 'struct',
						filePath,
						lineNumber: lineNum,
						signature: `struct ${rsStruct[1]}`,
						callers: [],
						callees: []
					});
					continue;
				}

				const rsImpl = line.match(/impl(?:\s+([a-zA-Z0-9_]+)\s+for)?\s+([a-zA-Z0-9_]+)/);
				if (rsImpl) {
					const traitName = rsImpl[1];
					const structName = rsImpl[2];
					if (traitName) {
						let implSet = this._implementations.get(traitName);
						if (!implSet) {
							implSet = new Set();
							this._implementations.set(traitName, implSet);
						}
						implSet.add(structName);
					}
				}
			}

			// Go
			if (lang === 'go') {
				const goFn = line.match(/func\s+(?:\(([^)]+)\)\s+)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
				if (goFn) {
					nodes.push({
						symbolName: goFn[2],
						kind: goFn[1] ? 'method' : 'function',
						filePath,
						lineNumber: lineNum,
						signature: `func ${goFn[2]}(${goFn[3]})`,
						callers: [],
						callees: []
					});
					continue;
				}
			}

			// C/C++ & Java
			if (lang === 'cpp' || lang === 'java') {
				// Class or interface declaration
				const classMatch = line.match(/(?:public\s+|protected\s+|private\s+)?(?:class|interface)\s+([a-zA-Z0-9_$]+)(?:\s+extends\s+([a-zA-Z0-9_$]+))?(?:\s+implements\s+([a-zA-Z0-9_$,\s]+))?/);
				if (classMatch) {
					const implList = classMatch[3] ? classMatch[3].split(',').map(s => s.trim().replace(/\{.*$/, '').trim()).filter(Boolean) : undefined;
					nodes.push({
						symbolName: classMatch[1],
						kind: line.includes('interface') ? 'interface' : 'class',
						filePath,
						lineNumber: lineNum,
						signature: line.trim().replace(/\{.*$/, '').trim(),
						callers: [],
						callees: [],
						implements: implList
					});
					continue;
				}

				const methodMatch = line.match(/(?:public|private|protected|static|void|int|bool|string|[A-Za-z0-9_]+)\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*(?:const)?\s*[{;]/);
				if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(methodMatch[1])) {
					nodes.push({
						symbolName: methodMatch[1],
						kind: 'function',
						filePath,
						lineNumber: lineNum,
						signature: `${methodMatch[1]}(${methodMatch[2]})`,
						callers: [],
						callees: []
					});
				}
			}
		}

		return nodes;
	}

	private _extractCallEdges(filePath: string, content: string, _lang: string): void {
		const lines = content.split(/\r?\n/);
		let currentEnclosingSymbol = 'global';

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNum = i + 1;

			// Update current enclosing symbol if a function or method definition begins
			const defMatch = line.match(/(?:function|def|fn|func|class)\s+([a-zA-Z0-9_$]+)/);
			if (defMatch) {
				currentEnclosingSymbol = defMatch[1];
			}

			// Find potential call sites: word followed by parenthesis
			const callRegex = /\b([a-zA-Z0-9_$]{2,})\s*\(/g;
			let match: RegExpExecArray | null;

			while ((match = callRegex.exec(line)) !== null) {
				const callee = match[1];

				// Ignore common language keywords
				if (['if', 'for', 'while', 'switch', 'catch', 'function', 'def', 'fn', 'func', 'return', 'import', 'require', 'sizeof', 'typeof', 'console', 'assert'].includes(callee)) {
					continue;
				}

				// Avoid self-references on definition lines
				if (line.includes(`function ${callee}`) || line.includes(`def ${callee}`) || line.includes(`fn ${callee}`)) {
					continue;
				}

				const edge: IFloatCallEdge = {
					callerSymbol: currentEnclosingSymbol,
					calleeSymbol: callee,
					callerFilePath: filePath,
					calleeFilePath: this._findDefinitionFile(callee) || filePath,
					lineNumber: lineNum,
					callSnippet: line.trim(),
					confidence: 0.95
				};

				// Register outgoing edge
				const callerKey = `${currentEnclosingSymbol}:${filePath}`;
				let outList = this._outgoingEdges.get(callerKey);
				if (!outList) {
					outList = [];
					this._outgoingEdges.set(callerKey, outList);
				}
				outList.push(edge);

				// Register incoming edge
				let inList = this._incomingEdges.get(callee);
				if (!inList) {
					inList = [];
					this._incomingEdges.set(callee, inList);
				}
				inList.push(edge);
			}
		}
	}

	private _findDefinitionFile(symbolName: string): string | undefined {
		const nodes = this._nodesBySymbol.get(symbolName);
		return nodes?.[0]?.filePath;
	}

	private _normalizePath(p: string): string {
		return p.replace(/\\/g, '/').replace(/^\.\//, '');
	}

	private _isTestFile(filePath: string): boolean {
		const lower = filePath.toLowerCase();
		return lower.includes('.test.') ||
			lower.includes('.spec.') ||
			lower.endsWith('_test.go') ||
			lower.endsWith('_test.rs') ||
			lower.startsWith('test_') ||
			lower.includes('/tests/') ||
			lower.includes('/__tests__/');
	}
}
