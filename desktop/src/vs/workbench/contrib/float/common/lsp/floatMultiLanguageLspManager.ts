/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IMarkerService, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';

export interface IFloatLanguageToolchainConfig {
	languageId: string;
	languageName: string;
	fileExtensions: string[];
	lspServerName: string;
	supportsDiagnostics: boolean;
	supportsHover: boolean;
	supportsDefinitions: boolean;
	supportsReferences: boolean;
	supportsDocumentSymbols: boolean;
}

export interface IFloatDiagnosticItem {
	resource: URI;
	message: string;
	severity: MarkerSeverity;
	startLineNumber: number;
	startColumn: number;
	endLineNumber: number;
	endColumn: number;
	source?: string;
	code?: string;
	languageId?: string;
}

export interface IFloatSemanticSymbol {
	name: string;
	kind: 'function' | 'class' | 'interface' | 'method' | 'variable' | 'type';
	range: { startLine: number; startCol: number; endLine: number; endCol: number };
	containerName?: string;
	signature?: string;
	docstring?: string;
}

export interface IFloatCallSite {
	targetSymbol: string;
	callerFile: string;
	lineNumber: number;
	callCodeSnippet: string;
}

export interface IFloatWorkspaceHealthReport {
	totalDiagnostics: number;
	errorCount: number;
	warningCount: number;
	isClean: boolean;
	breakdownByLanguage: Record<string, { errors: number; warnings: number }>;
}

export class FloatMultiLanguageLspManager implements IDisposable {
	private readonly _toolchains = new Map<string, IFloatLanguageToolchainConfig>();
	private readonly _extensionToLanguage = new Map<string, string>();
	private readonly _callSiteIndex = new Map<string, IFloatCallSite[]>();
	private _markerServiceListener: IDisposable | null = null;

	constructor(private readonly _markerService?: IMarkerService) {
		this._registerDefaultToolchains();
		this._setupMarkerListener();
	}

	private _registerDefaultToolchains(): void {
		const defaults: IFloatLanguageToolchainConfig[] = [
			{
				languageId: 'typescript',
				languageName: 'TypeScript / JavaScript',
				fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
				lspServerName: 'tsserver / vtsls',
				supportsDiagnostics: true,
				supportsHover: true,
				supportsDefinitions: true,
				supportsReferences: true,
				supportsDocumentSymbols: true
			},
			{
				languageId: 'python',
				languageName: 'Python',
				fileExtensions: ['.py', '.pyi'],
				lspServerName: 'pyright / pylance',
				supportsDiagnostics: true,
				supportsHover: true,
				supportsDefinitions: true,
				supportsReferences: true,
				supportsDocumentSymbols: true
			},
			{
				languageId: 'rust',
				languageName: 'Rust',
				fileExtensions: ['.rs'],
				lspServerName: 'rust-analyzer',
				supportsDiagnostics: true,
				supportsHover: true,
				supportsDefinitions: true,
				supportsReferences: true,
				supportsDocumentSymbols: true
			},
			{
				languageId: 'go',
				languageName: 'Go',
				fileExtensions: ['.go'],
				lspServerName: 'gopls',
				supportsDiagnostics: true,
				supportsHover: true,
				supportsDefinitions: true,
				supportsReferences: true,
				supportsDocumentSymbols: true
			},
			{
				languageId: 'cpp',
				languageName: 'C / C++',
				fileExtensions: ['.cpp', '.cc', '.cxx', '.c', '.h', '.hpp'],
				lspServerName: 'clangd',
				supportsDiagnostics: true,
				supportsHover: true,
				supportsDefinitions: true,
				supportsReferences: true,
				supportsDocumentSymbols: true
			},
			{
				languageId: 'java',
				languageName: 'Java',
				fileExtensions: ['.java'],
				lspServerName: 'jdtls',
				supportsDiagnostics: true,
				supportsHover: true,
				supportsDefinitions: true,
				supportsReferences: true,
				supportsDocumentSymbols: true
			},
			{
				languageId: 'json',
				languageName: 'JSON / JSONC',
				fileExtensions: ['.json', '.jsonc'],
				lspServerName: 'vscode-json-language-features',
				supportsDiagnostics: true,
				supportsHover: true,
				supportsDefinitions: false,
				supportsReferences: false,
				supportsDocumentSymbols: true
			},
			{
				languageId: 'markdown',
				languageName: 'Markdown',
				fileExtensions: ['.md', '.markdown'],
				lspServerName: 'markdown-language-features',
				supportsDiagnostics: true,
				supportsHover: true,
				supportsDefinitions: true,
				supportsReferences: true,
				supportsDocumentSymbols: true
			}
		];

		for (const config of defaults) {
			this.registerLanguageToolchain(config);
		}
	}

	public registerLanguageToolchain(config: IFloatLanguageToolchainConfig): void {
		this._toolchains.set(config.languageId, config);
		for (const ext of config.fileExtensions) {
			this._extensionToLanguage.set(ext.toLowerCase(), config.languageId);
		}
	}

	public getSupportedLanguages(): string[] {
		return Array.from(this._toolchains.keys());
	}

	public getLanguageForResource(resource: URI | string): string {
		const pathStr = typeof resource === 'string' ? resource : resource.path;
		const dotIdx = pathStr.lastIndexOf('.');
		if (dotIdx !== -1) {
			const ext = pathStr.substring(dotIdx).toLowerCase();
			return this._extensionToLanguage.get(ext) || 'plaintext';
		}
		return 'plaintext';
	}

	private _setupMarkerListener(): void {
		if (!this._markerService) {
			return;
		}

		if (typeof this._markerService.onMarkerChanged === 'function') {
			this._markerServiceListener = this._markerService.onMarkerChanged(() => {
				// Marker state updated
			});
		}
	}

	public getDiagnostics(resource?: URI): IFloatDiagnosticItem[] {
		if (!this._markerService || typeof this._markerService.read !== 'function') {
			return [];
		}

		const markers = this._markerService.read(resource ? { resource } : undefined);
		return markers.map(m => ({
			resource: m.resource,
			message: m.message,
			severity: m.severity,
			startLineNumber: m.startLineNumber,
			startColumn: m.startColumn,
			endLineNumber: m.endLineNumber,
			endColumn: m.endColumn,
			source: m.source,
			code: typeof m.code === 'string' ? m.code : m.code?.value,
			languageId: this.getLanguageForResource(m.resource)
		}));
	}

	public getWorkspaceHealthReport(): IFloatWorkspaceHealthReport {
		const diagnostics = this.getDiagnostics();
		let errorCount = 0;
		let warningCount = 0;
		const breakdown: Record<string, { errors: number; warnings: number }> = {};

		for (const lang of this.getSupportedLanguages()) {
			breakdown[lang] = { errors: 0, warnings: 0 };
		}

		for (const diag of diagnostics) {
			const lang = diag.languageId || 'plaintext';
			if (!breakdown[lang]) {
				breakdown[lang] = { errors: 0, warnings: 0 };
			}

			if (diag.severity === MarkerSeverity.Error) {
				errorCount++;
				breakdown[lang].errors++;
			} else if (diag.severity === MarkerSeverity.Warning) {
				warningCount++;
				breakdown[lang].warnings++;
			}
		}

		return {
			totalDiagnostics: diagnostics.length,
			errorCount,
			warningCount,
			isClean: errorCount === 0,
			breakdownByLanguage: breakdown
		};
	}

	public formatDiagnosticsPrompt(filterErrorsOnly: boolean = true): string {
		const diags = this.getDiagnostics();
		const relevant = filterErrorsOnly
			? diags.filter(d => d.severity === MarkerSeverity.Error)
			: diags;

		if (relevant.length === 0) {
			return 'Workspace Diagnostics: CLEAN (0 compilation errors)';
		}

		const lines: string[] = ['### Active Language Toolchain Diagnostics:'];
		for (const d of relevant) {
			const sevStr = d.severity === MarkerSeverity.Error ? 'ERROR' : 'WARNING';
			const codeStr = d.code ? ` [${d.code}]` : '';
			const sourceStr = d.source ? ` (${d.source})` : '';
			const langStr = d.languageId ? ` <${d.languageId}>` : '';
			lines.push(`- ${d.resource.fsPath || d.resource.path}:${d.startLineNumber}:${d.startColumn} [${sevStr}]${codeStr}${sourceStr}${langStr}: ${d.message}`);
		}
		return lines.join('\n');
	}

	public extractSemanticSymbols(fileUri: URI | string, content: string): IFloatSemanticSymbol[] {
		const lang = this.getLanguageForResource(fileUri);
		const symbols: IFloatSemanticSymbol[] = [];
		const lines = content.split('\n');

		// Fast Regex-based symbol extraction across multiple grammar profiles
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNum = i + 1;

			// TypeScript / JavaScript
			if (lang === 'typescript') {
				const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
				if (fnMatch) {
					symbols.push({ name: fnMatch[1], kind: 'function', range: { startLine: lineNum, startCol: line.indexOf(fnMatch[1]) + 1, endLine: lineNum, endCol: line.length } });
				}
				const classMatch = line.match(/(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/);
				if (classMatch) {
					symbols.push({ name: classMatch[1], kind: 'class', range: { startLine: lineNum, startCol: line.indexOf(classMatch[1]) + 1, endLine: lineNum, endCol: line.length } });
				}
				const ifaceMatch = line.match(/(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/);
				if (ifaceMatch) {
					symbols.push({ name: ifaceMatch[1], kind: 'interface', range: { startLine: lineNum, startCol: line.indexOf(ifaceMatch[1]) + 1, endLine: lineNum, endCol: line.length } });
				}
			}

			// Python
			if (lang === 'python') {
				const pyFnMatch = line.match(/^\s*(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/);
				if (pyFnMatch) {
					symbols.push({ name: pyFnMatch[1], kind: 'function', range: { startLine: lineNum, startCol: line.indexOf(pyFnMatch[1]) + 1, endLine: lineNum, endCol: line.length } });
				}
				const pyClassMatch = line.match(/^\s*class\s+([a-zA-Z0-9_]+)/);
				if (pyClassMatch) {
					symbols.push({ name: pyClassMatch[1], kind: 'class', range: { startLine: lineNum, startCol: line.indexOf(pyClassMatch[1]) + 1, endLine: lineNum, endCol: line.length } });
				}
			}

			// Rust
			if (lang === 'rust') {
				const rustFnMatch = line.match(/(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)/);
				if (rustFnMatch) {
					symbols.push({ name: rustFnMatch[1], kind: 'function', range: { startLine: lineNum, startCol: line.indexOf(rustFnMatch[1]) + 1, endLine: lineNum, endCol: line.length } });
				}
				const rustStructMatch = line.match(/(?:pub\s+)?struct\s+([a-zA-Z0-9_]+)/);
				if (rustStructMatch) {
					symbols.push({ name: rustStructMatch[1], kind: 'class', range: { startLine: lineNum, startCol: line.indexOf(rustStructMatch[1]) + 1, endLine: lineNum, endCol: line.length } });
				}
			}

			// Go
			if (lang === 'go') {
				const goFnMatch = line.match(/func\s+(?:\([^\)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/);
				if (goFnMatch) {
					symbols.push({ name: goFnMatch[1], kind: 'function', range: { startLine: lineNum, startCol: line.indexOf(goFnMatch[1]) + 1, endLine: lineNum, endCol: line.length } });
				}
			}
		}

		return symbols;
	}

	public indexCallSites(callerFilePath: string, fileContent: string, knownSymbols: string[]): void {
		const lines = fileContent.split('\n');
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			for (const sym of knownSymbols) {
				const regex = new RegExp(`\\b${sym}\\s*\\(`, 'g');
				if (regex.test(line)) {
					if (!this._callSiteIndex.has(sym)) {
						this._callSiteIndex.set(sym, []);
					}
					this._callSiteIndex.get(sym)!.push({
						targetSymbol: sym,
						callerFile: callerFilePath,
						lineNumber: i + 1,
						callCodeSnippet: line.trim()
					});
				}
			}
		}
	}

	public findCallSites(symbolName: string): IFloatCallSite[] {
		return this._callSiteIndex.get(symbolName) || [];
	}

	public dispose(): void {
		if (this._markerServiceListener) {
			this._markerServiceListener.dispose();
			this._markerServiceListener = null;
		}
		this._toolchains.clear();
		this._callSiteIndex.clear();
	}
}
