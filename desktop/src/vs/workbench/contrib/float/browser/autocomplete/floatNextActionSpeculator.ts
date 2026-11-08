/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	IFloatInlineCompletionContext,
	ICursorJumpRecommendation,
	IRecentEditRecord,
	INextActionSpeculationResult
} from './floatAutocompleteTypes.js';
import type { FloatLspCallGraphService } from '../../common/lsp/floatLspCallGraphService.js';

/**
 * Copilot++ / Cursor Tab Speculative Next-Edit Engine.
 *
 * Slices AST and cross-file context around the cursor, calculates forward stability,
 * deduplicates suffix overlap, and predicts next-action cursor jumps across call sites,
 * interface implementations, and unit test suites.
 */
export class FloatNextActionSpeculator {
	private readonly _recentEdits: IRecentEditRecord[] = [];
	private readonly _maxRecentEdits = 25;

	/**
	 * Records a user edit event for cross-file and multi-location speculation
	 */
	public recordEdit(edit: IRecentEditRecord): void {
		this._recentEdits.unshift(edit);
		if (this._recentEdits.length > this._maxRecentEdits) {
			this._recentEdits.pop();
		}
	}

	public get recentEdits(): readonly IRecentEditRecord[] {
		return this._recentEdits;
	}

	public clearRecentEdits(): void {
		this._recentEdits.length = 0;
	}

	/**
	 * Deduplicates completion text against the immediate suffix to prevent repeating existing code
	 */
	public deduplicateSuffix(completion: string, suffix: string): string {
		if (!completion || !suffix) return completion;

		const cleanComp = completion.replace(/\r\n/g, '\n');
		const cleanSuffix = suffix.replace(/\r\n/g, '\n').trimStart();

		// Check if suffix begins with the tail of completion
		const compLines = cleanComp.split('\n');
		const suffixLines = cleanSuffix.split('\n');

		// If the entire completion matches the beginning of suffix, do not repeat
		if (cleanSuffix.startsWith(cleanComp.trim())) {
			return '';
		}

		// Check multi-line overlap: if the last line(s) of completion match the first line(s) of suffix
		for (let i = 1; i <= Math.min(compLines.length, suffixLines.length); i++) {
			const compTail = compLines.slice(-i).map(l => l.trim()).join('\n');
			const suffixHead = suffixLines.slice(0, i).map(l => l.trim()).join('\n');

			if (compTail.length > 0 && compTail === suffixHead) {
				return compLines.slice(0, -i).join('\n');
			}
		}

		return cleanComp;
	}

	/**
	 * Builds an AST-aware prompt context slice including recent multi-file edits and symbols
	 */
	public buildPromptContext(
		context: IFloatInlineCompletionContext,
		openFiles?: Map<string, string>,
		callGraph?: FloatLspCallGraphService
	): string {
		const parts: string[] = [];

		// 1. Recent cross-file edits summary (Cursor diff context)
		if (this._recentEdits.length > 0) {
			parts.push('// Recent edits in workspace:');
			const recentByFile = new Map<string, IRecentEditRecord[]>();
			for (const edit of this._recentEdits.slice(0, 5)) {
				const list = recentByFile.get(edit.filePath) || [];
				list.push(edit);
				recentByFile.set(edit.filePath, list);
			}

			for (const [file, edits] of recentByFile.entries()) {
				parts.push(`// File: ${file}`);
				for (const e of edits) {
					if (e.oldText !== e.newText) {
						parts.push(`// - Line ${e.startLine}: "${e.oldText.trim()}" -> "${e.newText.trim()}"`);
					}
				}
			}
			parts.push('');
		}

		// 2. Call Graph & Blast Radius Context if available
		if (callGraph && this._recentEdits.length > 0) {
			const latest = this._recentEdits[0];
			const fnMatch = latest.newText.match(/(?:function|const|let|def|fn|func)\s+([a-zA-Z0-9_$]+)/);
			const symName = fnMatch ? fnMatch[1] : null;
			if (symName) {
				const cgPrompt = callGraph.formatCallGraphPrompt(symName, 250);
				if (cgPrompt) {
					parts.push(cgPrompt);
					parts.push('');
				}
			}
		}

		// 3. Referenced symbol definitions from open files
		if (openFiles && openFiles.size > 0) {
			for (const [filePath, content] of openFiles.entries()) {
				if (filePath.endsWith(context.fileName)) continue;

				// Scan for exported functions or types in open files
				const exportMatches = content.match(/export\s+(?:interface|type|class|function|const)\s+([a-zA-Z0-9_]+)/g);
				if (exportMatches && exportMatches.length > 0) {
					parts.push(`// Context from ${filePath}: ${exportMatches.slice(0, 3).join(', ')}`);
				}
			}
		}

		return parts.join('\n');
	}

	/**
	 * Computes high-confidence next-action speculation based on recent AST edits,
	 * LSP call hierarchies, interface implementations, and unit test associations.
	 */
	public speculateNextAction(
		context: IFloatInlineCompletionContext,
		openFiles?: Map<string, string>,
		callGraph?: FloatLspCallGraphService
	): INextActionSpeculationResult | undefined {
		if (this._recentEdits.length === 0) return undefined;

		const latestEdit = this._recentEdits[0];

		// Case A: Function / Method signature modified
		const fnMatch = latestEdit.newText.match(/(?:function|const|let)\s+([a-zA-Z0-9_$]+)\s*=\s*\(([^)]*)\)|function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/);
		const fnName = fnMatch ? (fnMatch[1] || fnMatch[3]) : null;
		const newArgs = fnMatch ? (fnMatch[2] || fnMatch[4] || '').trim() : '';

		const oldFnMatch = latestEdit.oldText.match(/(?:function|const|let)\s+([a-zA-Z0-9_$]+)\s*=\s*\(([^)]*)\)|function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/);
		const oldArgs = oldFnMatch ? (oldFnMatch[2] || oldFnMatch[4] || '').trim() : '';

		if (fnName) {
			// Check if new parameters were added
			const paramAdded = (newArgs.includes(',') && !oldArgs.includes(',')) || (newArgs.length > 0 && oldArgs.length === 0);

			// 1. Check via LSP Call Graph first (authoritative project-wide graph)
			if (callGraph) {
				const hierarchy = callGraph.getCallHierarchy(fnName);
				if (hierarchy && hierarchy.incomingCalls.length > 0) {
					const primaryCall = hierarchy.incomingCalls.find(c =>
						!(c.callerFilePath.endsWith(context.fileName) && c.lineNumber === context.lineNumber)
					);

					if (primaryCall) {
						let patch = primaryCall.callSnippet;
						if (paramAdded) {
							const callInfo = this._extractCallExpression(patch, fnName);
							if (callInfo) {
								const updatedArgs = callInfo.args.trim().length > 0 ? `${callInfo.args}, /* updated */` : '/* updated */';
								patch = patch.replace(callInfo.fullCall, `${fnName}(${updatedArgs})`);
							}
						}

						const jump: ICursorJumpRecommendation = {
							targetFilePath: primaryCall.callerFilePath,
							targetLine: primaryCall.lineNumber,
							targetColumn: 1,
							reason: `Update call site of '${fnName}' in ${primaryCall.callerSymbol} to match new signature`,
							suggestedReplacement: patch,
							confidence: 0.96
						};

						return {
							ghostText: patch,
							cursorJump: jump,
							source: 'model',
							confidence: 0.96,
							actionType: 'call_site_update',
							targetLocation: { filePath: primaryCall.callerFilePath, line: primaryCall.lineNumber, column: 1 },
							suggestedPatch: patch,
							explanation: jump.reason
						};
					}
				}

				// Check if an associated test file exists
				const testFiles = callGraph.findAffectedTests(fnName);
				if (testFiles.length > 0) {
					const testFile = testFiles[0];
					const jump: ICursorJumpRecommendation = {
						targetFilePath: testFile,
						targetLine: 1,
						targetColumn: 1,
						reason: `Update test assertions in '${testFile}' for '${fnName}'`,
						suggestedReplacement: `// Test updated for ${fnName}`,
						confidence: 0.90
					};

					return {
						ghostText: `// Test coverage for ${fnName}`,
						cursorJump: jump,
						source: 'model',
						confidence: 0.90,
						actionType: 'test_file_update',
						targetLocation: { filePath: testFile, line: 1, column: 1 },
						suggestedPatch: `// Test updated for ${fnName}`,
						explanation: jump.reason
					};
				}
			}

			// 2. Fallback: Scan open files for call sites
			if (openFiles) {
				for (const [filePath, content] of openFiles.entries()) {
					const lines = content.split(/\r?\n/);
					for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
						const line = lines[lineIdx];
						if (line.includes(`${fnName}(`) && !line.includes(`function ${fnName}`) && !line.includes(`${fnName} =`)) {
							if (filePath.endsWith(context.fileName) && lineIdx + 1 === context.lineNumber) {
								continue;
							}

							const colIdx = line.indexOf(`${fnName}(`);
							let patch = line.trim();
							if (paramAdded) {
								const callInfo = this._extractCallExpression(patch, fnName);
								if (callInfo) {
									const updatedArgs = callInfo.args.trim().length > 0 ? `${callInfo.args}, /* updated */` : '/* updated */';
									patch = patch.replace(callInfo.fullCall, `${fnName}(${updatedArgs})`);
								}
							}

							const jump: ICursorJumpRecommendation = {
								targetFilePath: filePath,
								targetLine: lineIdx + 1,
								targetColumn: colIdx >= 0 ? colIdx + 1 : 1,
								reason: `Update call site of '${fnName}' to match new signature`,
								suggestedReplacement: patch,
								confidence: 0.88
							};

							return {
								ghostText: patch,
								cursorJump: jump,
								source: 'model',
								confidence: 0.88,
								actionType: 'call_site_update',
								targetLocation: { filePath, line: lineIdx + 1, column: colIdx >= 0 ? colIdx + 1 : 1 },
								suggestedPatch: patch,
								explanation: jump.reason
							};
						}
					}
				}
			}
		}

		// Case B: Interface or Trait declaration modified
		let ifaceName: string | null = null;
		const ifaceMatch = (latestEdit.newText + '\n' + latestEdit.oldText).match(/(?:interface|trait)\s+([a-zA-Z0-9_$]+)/);
		if (ifaceMatch) {
			ifaceName = ifaceMatch[1];
		} else if (context.prefix) {
			const prefixMatches = [...context.prefix.matchAll(/(?:interface|trait)\s+([a-zA-Z0-9_$]+)/g)];
			if (prefixMatches.length > 0) {
				ifaceName = prefixMatches[prefixMatches.length - 1][1];
			}
		}

		if (ifaceName && callGraph) {
			const impls = callGraph.findImplementations(ifaceName);
			if (impls.length > 0) {
				const primaryImpl = impls[0];
				// Extract added method signature from lines added in newText
				const oldLines = new Set(latestEdit.oldText.split(/\r?\n/).map(l => l.trim()));
				const newLines = latestEdit.newText.split(/\r?\n/).map(l => l.trim());
				const addedLines = newLines.filter(l => !oldLines.has(l));

				let addedMethod = null;
				for (const line of addedLines) {
					const m = line.match(/([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*:\s*[^;{]+;?/);
					if (m) {
						addedMethod = m;
						break;
					}
				}
				if (!addedMethod) {
					addedMethod = latestEdit.newText.match(/([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*:\s*[^;{]+;?/);
				}

				const methodStub = addedMethod
					? `\n\tpublic ${addedMethod[0].replace(/;\s*$/, '').trim()} {\n\t\tthrow new Error('Not implemented');\n\t}`
					: `\n\t// Implement ${ifaceName} contract updates`;

				const jump: ICursorJumpRecommendation = {
					targetFilePath: primaryImpl.filePath,
					targetLine: primaryImpl.lineNumber + 1,
					targetColumn: 1,
					reason: `Implement newly declared members in '${primaryImpl.symbolName}' from '${ifaceName}'`,
					suggestedReplacement: methodStub,
					confidence: 0.94
				};

				return {
					ghostText: methodStub,
					cursorJump: jump,
					source: 'model',
					confidence: 0.94,
					actionType: 'interface_implementation',
					targetLocation: { filePath: primaryImpl.filePath, line: primaryImpl.lineNumber + 1, column: 1 },
					suggestedPatch: methodStub,
					explanation: jump.reason
				};
			}
		}

		return undefined;
	}

	/**
	 * Predicts if the user should jump to another location after accepting an edit.
	 */
	public predictCursorJump(
		context: IFloatInlineCompletionContext,
		openFiles?: Map<string, string>,
		callGraph?: FloatLspCallGraphService
	): ICursorJumpRecommendation | undefined {
		const speculation = this.speculateNextAction(context, openFiles, callGraph);
		return speculation?.cursorJump;
	}
	/**
	 * Extracts balanced function call expression and argument substring, handling nested parens and strings
	 */
	private _extractCallExpression(text: string, fnName: string): { fullCall: string; args: string } | null {
		const regex = new RegExp(`\\b${fnName}\\s*\\(`, 'g');
		const match = regex.exec(text);
		if (!match) return null;

		const startIdx = match.index;
		const openParenIdx = startIdx + match[0].length - 1;
		let depth = 0;
		let inQuote = null;

		for (let i = openParenIdx; i < text.length; i++) {
			const ch = text[i];
			if (inQuote) {
				if (ch === inQuote && text[i - 1] !== '\\') {
					inQuote = null;
				}
			} else if (ch === '"' || ch === "'" || ch === '`') {
				inQuote = ch;
			} else if (ch === '(') {
				depth++;
			} else if (ch === ')') {
				depth--;
				if (depth === 0) {
					const fullCall = text.slice(startIdx, i + 1);
					const args = text.slice(openParenIdx + 1, i);
					return { fullCall, args };
				}
			}
		}

		return null;
	}
}
