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

/**
 * Copilot++ / Cursor Tab Speculative Next-Edit Engine.
 *
 * Slices AST and cross-file context around the cursor, calculates forward stability,
 * deduplicates suffix overlap, and predicts next-action cursor jumps across call sites.
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
		openFiles?: Map<string, string>
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

		// 2. Referenced symbol definitions from open files
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
	 * Predicts if the user should jump to another location after accepting an edit.
	 * E.g., when a function signature was edited, find its call sites that need updating.
	 */
	public predictCursorJump(
		context: IFloatInlineCompletionContext,
		openFiles?: Map<string, string>
	): ICursorJumpRecommendation | undefined {
		if (this._recentEdits.length === 0) return undefined;

		const latestEdit = this._recentEdits[0];

		// Check if the edit modified a function or method signature
		const fnMatch = latestEdit.newText.match(/(?:function|const|let)\s+([a-zA-Z0-9_]+)\s*=\s*\(([^)]*)\)|function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
		const fnName = fnMatch ? (fnMatch[1] || fnMatch[3]) : null;

		if (!fnName) return undefined;

		// Scan open files for call sites of fnName
		if (openFiles) {
			for (const [filePath, content] of openFiles.entries()) {
				const lines = content.split(/\r?\n/);
				for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
					const line = lines[lineIdx];
					// Check if line calls fnName, but is not the definition itself
					if (line.includes(`${fnName}(`) && !line.includes(`function ${fnName}`) && !line.includes(`${fnName} =`)) {
						// Don't recommend jump to current cursor line
						if (filePath.endsWith(context.fileName) && lineIdx + 1 === context.lineNumber) {
							continue;
						}

						const colIdx = line.indexOf(`${fnName}(`);
						return {
							targetFilePath: filePath,
							targetLine: lineIdx + 1,
							targetColumn: colIdx >= 0 ? colIdx + 1 : 1,
							reason: `Update call site of '${fnName}' to match new signature`,
							suggestedReplacement: undefined,
							confidence: 0.88
						};
					}
				}
			}
		}

		return undefined;
	}
}
