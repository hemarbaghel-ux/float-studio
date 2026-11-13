/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type * as tsType from 'typescript';
import * as path from '../../../../../base/common/path.js';
import { IShadowDiagnostic, IShadowValidationOptions } from './floatShadowTypes.js';

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

function getNodeFs(): any | null {
	try {
		if (typeof process !== 'undefined' && (process as any).versions?.node) {
			const req = (globalThis as any).require;
			if (typeof req === 'function') {
				return req('fs');
			}
		}
	} catch {
		// Browser sandbox
	}
	return null;
}

export class FloatShadowCompiler {
	/**
	 * Run fast syntactic AST parsing for a single file in memory
	 */
	static checkSyntax(filePath: string, content: string): IShadowDiagnostic[] {
		const diagnostics: IShadowDiagnostic[] = [];
		const normalized = filePath.replace(/\\/g, '/');

		if (normalized.endsWith('.json')) {
			try {
				JSON.parse(content);
			} catch (err: any) {
				let line = 1;
				let column = 1;
				const posMatch = err.message.match(/position\s+(\d+)/i);
				if (posMatch) {
					const pos = parseInt(posMatch[1], 10);
					const linesUpTo = content.slice(0, pos).split('\n');
					line = linesUpTo.length;
					column = linesUpTo[linesUpTo.length - 1].length + 1;
				}
				diagnostics.push({
					filePath: normalized,
					line,
					column,
					code: 'JSON_SYNTAX_ERROR',
					message: `JSON Syntax Error: ${err.message}`,
					severity: 'error',
					source: 'Float Shadow JSON Parser'
				});
			}
			return diagnostics;
		}

		if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(normalized)) {
			const ts = getTs();
			if (!ts) {
				return diagnostics;
			}
			try {
				const isTsx = /\.(tsx|jsx)$/i.test(normalized);
				const isJs = /\.(js|jsx|mjs|cjs)$/i.test(normalized);
				const sourceFile = ts.createSourceFile(
					normalized,
					content,
					ts.ScriptTarget.Latest,
					true,
					isTsx ? ts.ScriptKind.TSX : isJs ? ts.ScriptKind.JS : ts.ScriptKind.TS
				);

				const parseDiags = (sourceFile as any).parseDiagnostics || [];
				for (const diag of parseDiags) {
					let line = 1;
					let column = 1;
					if (diag.start !== undefined) {
						const pos = sourceFile.getLineAndCharacterOfPosition(diag.start);
						line = pos.line + 1;
						column = pos.character + 1;
					}
					const msg = typeof diag.messageText === 'string'
						? diag.messageText
						: diag.messageText.messageText;

					diagnostics.push({
						filePath: normalized,
						line,
						column,
						code: `TS${diag.code}`,
						message: `Syntax Error: ${msg}`,
						severity: 'error',
						source: 'Float Shadow TypeScript Syntax Parser'
					});
				}
			} catch (err: any) {
				diagnostics.push({
					filePath: normalized,
					line: 1,
					column: 1,
					code: 'TS_PARSE_EXCEPTION',
					message: `Parse Error: ${err.message}`,
					severity: 'error',
					source: 'Float Shadow TypeScript Syntax Parser'
				});
			}
			return diagnostics;
		}

		if (normalized.endsWith('.py')) {
			const lines = content.split('\n');
			const bracketStack: { char: string; line: number; col: number }[] = [];
			const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

			for (let i = 0; i < lines.length; i++) {
				const lineText = lines[i];
				for (let c = 0; c < lineText.length; c++) {
					const ch = lineText[c];
					if (ch === '(' || ch === '[' || ch === '{') {
						bracketStack.push({ char: ch, line: i + 1, col: c + 1 });
					} else if (ch === ')' || ch === ']' || ch === '}') {
						const expected = pairs[ch];
						const last = bracketStack.pop();
						if (!last || last.char !== expected) {
							diagnostics.push({
								filePath: normalized,
								line: i + 1,
								column: c + 1,
								code: 'PY_UNMATCHED_BRACKET',
								message: `Unmatched closing bracket '${ch}'`,
								severity: 'error',
								source: 'Float Shadow Python Validator'
							});
							break;
						}
					}
				}
			}

			if (bracketStack.length > 0) {
				const unclosed = bracketStack[bracketStack.length - 1];
				diagnostics.push({
					filePath: normalized,
					line: unclosed.line,
					column: unclosed.col,
					code: 'PY_UNCLOSED_BRACKET',
					message: `Unclosed bracket '${unclosed.char}' opened on line ${unclosed.line}`,
					severity: 'error',
					source: 'Float Shadow Python Validator'
				});
			}
			return diagnostics;
		}

		return diagnostics;
	}

	/**
	 * Run project-aware semantic typecheck across virtual shadow files and underlying project files.
	 * Resolves cross-file module imports, respects tsconfig.json, and produces high-fidelity diagnostics.
	 */
	static checkVirtualFiles(
		virtualFiles: Map<string, string>,
		options: IShadowValidationOptions = {}
	): IShadowDiagnostic[] {
		const diagnostics: IShadowDiagnostic[] = [];
		const maxDiags = options.maxDiagnostics ?? 50;

		// 1. Run syntax checks on all virtual files
		for (const [filePath, content] of virtualFiles.entries()) {
			if (diagnostics.length >= maxDiags) break;
			const syntaxErrors = this.checkSyntax(filePath, content);
			diagnostics.push(...syntaxErrors);
		}

		if (options.checkTypes === false) {
			return diagnostics.slice(0, maxDiags);
		}

		// 2. Filter TS/JS files for semantic compilation
		const tsFiles = Array.from(virtualFiles.keys()).filter(p =>
			/\.(ts|tsx|js|jsx)$/i.test(p) && !p.includes('node_modules')
		);

		if (tsFiles.length === 0) {
			return diagnostics.slice(0, maxDiags);
		}

		const ts = getTs();
		if (!ts) {
			return diagnostics.slice(0, maxDiags);
		}

		try {
			const baseWorkspace = options.baseWorkspacePath;
			let compilerOptions: any = {
				target: ts.ScriptTarget.ES2022,
				module: ts.ModuleKind.ESNext,
				moduleResolution: ts.ModuleResolutionKind.Bundler,
				allowJs: true,
				checkJs: false,
				noEmit: true,
				jsx: ts.JsxEmit.ReactJSX,
				strict: false,
				skipLibCheck: true,
				noImplicitAny: false,
				suppressImplicitAnyIndexErrors: true
			};

			// Load real tsconfig.json if present
			const nodeFs = getNodeFs();
			let rawCompilerOptions: any = null;
			if (virtualFiles.has('tsconfig.json')) {
				try {
					const parsed = JSON.parse(virtualFiles.get('tsconfig.json')!);
					rawCompilerOptions = parsed.compilerOptions;
				} catch {}
			} else if (baseWorkspace && nodeFs?.existsSync(path.join(baseWorkspace, 'tsconfig.json'))) {
				try {
					const raw = nodeFs.readFileSync(path.join(baseWorkspace, 'tsconfig.json'), 'utf8');
					const parsed = JSON.parse(raw);
					rawCompilerOptions = parsed.compilerOptions;
				} catch {}
			}

			if (rawCompilerOptions) {
				const converted = ts.convertCompilerOptionsFromJson(rawCompilerOptions, baseWorkspace || '/');
				if (converted && converted.options) {
					compilerOptions = { ...compilerOptions, ...converted.options, noEmit: true };
				}
			}

			// Helper to resolve physical project path
			const resolveDisk = (normPath: string): string | null => {
				if (!nodeFs) return null;
				if (path.isAbsolute(normPath) && nodeFs.existsSync(normPath)) return normPath;
				const leadingSlash = '/' + normPath;
				if (path.isAbsolute(leadingSlash) && nodeFs.existsSync(leadingSlash)) return leadingSlash;
				if (!baseWorkspace) return null;
				const full = path.resolve(baseWorkspace, normPath);
				if (nodeFs.existsSync(full)) return full;
				return null;
			};

			// In-memory compiler host backed by virtualFiles with disk fallback for unchanged project files
			const host: any = {
				getSourceFile: (fileName: string, languageVersion: any) => {
					const norm = fileName.replace(/\\/g, '/').replace(/^\.\//, '');
					let content: string | undefined = undefined;

					if (virtualFiles.has(norm)) {
						content = virtualFiles.get(norm);
					} else {
						for (const [k, v] of virtualFiles.entries()) {
							if (k.endsWith(norm) || norm.endsWith(k)) {
								content = v;
								break;
							}
						}
					}

					// Disk fallback for unchanged project files
					if (content === undefined && nodeFs) {
						if (nodeFs.existsSync(fileName)) {
							try {
								content = nodeFs.readFileSync(fileName, 'utf8');
							} catch {}
						} else {
							const disk = resolveDisk(norm);
							if (disk) {
								try {
									content = nodeFs.readFileSync(disk, 'utf8');
								} catch {}
							}
						}
					}

					if (content !== undefined) {
						const isTsx = /\.(tsx|jsx)$/i.test(norm);
						return ts.createSourceFile(
							fileName,
							content,
							languageVersion,
							true,
							isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
						);
					}

					if (fileName.includes('lib.d.ts') || fileName.includes('lib.es5.d.ts')) {
						return ts.createSourceFile(
							fileName,
							'declare var console: any; declare var setTimeout: any; declare var process: any;',
							languageVersion,
							true
						);
					}

					return undefined;
				},
				getDefaultLibFileName: () => 'lib.d.ts',
				writeFile: () => {},
				getCurrentDirectory: () => baseWorkspace || '/',
				getDirectories: () => [],
				getCanonicalFileName: (fileName: string) => fileName.replace(/\\/g, '/'),
				useCaseSensitiveFileNames: () => false,
				getNewLine: () => '\n',
				fileExists: (fileName: string) => {
					const norm = fileName.replace(/\\/g, '/').replace(/^\.\//, '');
					if (virtualFiles.has(norm)) return true;
					for (const k of virtualFiles.keys()) {
						if (k.endsWith(norm) || norm.endsWith(k)) return true;
					}
					if (nodeFs?.existsSync(fileName)) return true;
					return resolveDisk(norm) !== null;
				},
				readFile: (fileName: string) => {
					const norm = fileName.replace(/\\/g, '/').replace(/^\.\//, '');
					if (virtualFiles.has(norm)) return virtualFiles.get(norm);
					if (nodeFs?.existsSync(fileName)) {
						try {
							return nodeFs.readFileSync(fileName, 'utf8');
						} catch {}
					}
					const disk = resolveDisk(norm);
					if (disk && nodeFs) {
						try {
							return nodeFs.readFileSync(disk, 'utf8');
						} catch {}
					}
					return undefined;
				},
				resolveModuleNames: (moduleNames: string[], containingFile: string) => {
					return moduleNames.map(moduleName => {
						if (moduleName.startsWith('.')) {
							const normContaining = containingFile.replace(/\\/g, '/');
							const slashIdx = normContaining.lastIndexOf('/');
							let containingDir = slashIdx >= 0 ? normContaining.substring(0, slashIdx) : '';
							const normBase = baseWorkspace ? baseWorkspace.replace(/\\/g, '/') : '';
							if (normBase && containingDir.startsWith(normBase)) {
								containingDir = containingDir.substring(normBase.length).replace(/^\/+/,'');
							}
							let resolved = (containingDir ? `${containingDir}/${moduleName}` : moduleName)
								.replace(/\/+/g, '/')
								.replace(/^\.\//, '');
							while (resolved.includes('/./')) resolved = resolved.replace('/./', '/');

							const noJs = resolved.replace(/\.js$/, '');
							const candidateSuffixes = [resolved, noJs, noJs + '.ts', noJs + '.tsx', noJs + '.d.ts', resolved + '.ts', noJs + '/index.ts'];

							for (const cand of candidateSuffixes) {
								const cleanCand = cand.replace(/^\//, '');
								if (virtualFiles.has(cleanCand)) {
									return {
										resolvedFileName: cleanCand,
										isExternalLibraryImport: false,
										extension: cleanCand.endsWith('tsx') ? ts.Extension.Tsx : ts.Extension.Ts
									};
								}
								if (baseWorkspace) {
									const disk = resolveDisk(cleanCand);
									if (disk) {
										return {
											resolvedFileName: disk,
											isExternalLibraryImport: false,
											extension: disk.endsWith('tsx') ? ts.Extension.Tsx : ts.Extension.Ts
										};
									}
								}
							}
						}

						return undefined;
					});
				}
			};

			const program = ts.createProgram(tsFiles, compilerOptions, host);
			const semanticDiags = program.getSemanticDiagnostics();

			for (const diag of semanticDiags) {
				if (diagnostics.length >= maxDiags) break;
				if (!diag.file) continue;

				if (diag.file.fileName.includes('lib.d.ts')) continue;

				let line = 1;
				let column = 1;
				if (diag.start !== undefined) {
					const pos = diag.file.getLineAndCharacterOfPosition(diag.start);
					line = pos.line + 1;
					column = pos.character + 1;
				}

				const msg = typeof diag.messageText === 'string'
					? diag.messageText
					: diag.messageText.messageText;

				const severity = diag.category === ts.DiagnosticCategory.Error
					? 'error'
					: diag.category === ts.DiagnosticCategory.Warning
						? 'warning'
						: 'info';

				// Filter out only uninstalled external non-relative modules (e.g. 'react', 'lodash' when not installed)
				// Relative project imports MUST NOT be filtered!
				if (diag.code === 2307 && !msg.includes("'./") && !msg.includes("'../") && !msg.includes("'@/")) {
					continue;
				}

				diagnostics.push({
					filePath: diag.file.fileName.replace(/\\/g, '/').replace(/^\.\//, ''),
					line,
					column,
					code: `TS${diag.code}`,
					message: msg,
					severity,
					source: 'Float Shadow TypeScript Compiler',
					raw: `${diag.file.fileName}(${line},${column}): TS${diag.code}: ${msg}`
				});
			}
		} catch (err: any) {
			console.warn('[FloatShadowCompiler] Internal failure during semantic check:', err?.message || err);
			// Do NOT silently report clean when compiler fails internally!
			diagnostics.push({
				filePath: 'compiler',
				line: 1,
				column: 1,
				code: 'TS_INTERNAL_COMPILATION_ERROR',
				message: `Internal compiler error during shadow validation: ${err?.message || err}`,
				severity: 'error',
				source: 'Float Shadow TypeScript Compiler'
			});
		}

		return diagnostics.slice(0, maxDiags);
	}

	/**
	 * Formats diagnostics into an actionable high-signal instruction block for the AI model
	 */
	static formatDiagnosticsForPrompt(diagnostics: IShadowDiagnostic[]): string {
		if (diagnostics.length === 0) {
			return 'All files compiled cleanly with 0 errors or warnings.';
		}

		const errors = diagnostics.filter(d => d.severity === 'error');
		const warnings = diagnostics.filter(d => d.severity === 'warning');

		const lines: string[] = [
			`[SHADOW WORKSPACE SPECULATIVE COMPILATION REPORT]`,
			`Found ${errors.length} compiler error(s) and ${warnings.length} warning(s) in speculative changes:`,
			''
		];

		for (const d of diagnostics.slice(0, 10)) {
			lines.push(`- ${d.filePath}:${d.line}:${d.column} [${d.code}] (${d.severity.toUpperCase()}): ${d.message}`);
		}

		if (diagnostics.length > 10) {
			lines.push(`... and ${diagnostics.length - 10} additional issue(s)`);
		}

		lines.push('');
		lines.push('INSTRUCTION: You must fix all compiler errors above before finalizing the proposal. Ensure all imported variables, functions, types, and properties are correctly declared and valid.');

		return lines.join('\n');
	}
}