/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { parseFloatMentions, IFloatMention } from './floatMentionParser.js';
import { IFloatService } from '../../common/floatService.js';

export interface IFloatResolvedContext {
	readonly files: { path: string; excerpt: string }[];
	readonly totalChars: number;
}

export class FloatContextProvider {
	private readonly _maxChars: number = 24000;

	constructor(
		@IFloatService private readonly _floatService: IFloatService
	) {}

	public resolveContext(prompt: string, activeFilePath?: string): IFloatResolvedContext {
		const mentions: IFloatMention[] = parseFloatMentions(prompt);
		const resolvedFiles: { path: string; excerpt: string }[] = [];
		let currentChars = 0;

		const indexer = this._floatService.getWorkspaceIndexer();

		for (const m of mentions) {
			if (m.type === 'file' && m.value) {
				if (!indexer.isExcluded(m.value)) {
					const excerpt = `[Context File: ${m.value}]`;
					if (currentChars + excerpt.length <= this._maxChars) {
						resolvedFiles.push({ path: m.value, excerpt });
						currentChars += excerpt.length;
					}
				}
			} else if (m.type === 'codebase') {
				// Query semantic vector index for bounded codebase context
				const remainingBudget = Math.max(1000, this._maxChars - currentChars);
				const cleanQuery = prompt.replace(/@codebase/gi, '').trim() || m.value || 'overview';
				const bounded = indexer.retrieveBoundedContext(cleanQuery, remainingBudget);

				let summary = `[Codebase Overview: ${indexer.getIndexedFiles().length} files indexed]`;
				if (bounded.chunks.length > 0) {
					summary = `[Codebase Semantic Context: ${bounded.chunks.length} relevant chunks]\n${bounded.formattedText}`;
				}

				if (currentChars + summary.length <= this._maxChars) {
					resolvedFiles.push({ path: '@codebase', excerpt: summary });
					currentChars += summary.length;
				}
			} else if (m.type === 'symbol' && m.value) {
				// First check semantic vector chunks for actual implementation snippet
				const symbolChunks = indexer.searchCodebase(m.value, 3);
				let symText = '';
				if (symbolChunks.length > 0 && symbolChunks[0].chunk.content) {
					const top = symbolChunks[0].chunk;
					symText = `[Symbol Implementation for ${m.value} (${top.filePath}:L${top.startLine}-L${top.endLine})]\n${top.content}`;
				} else {
					const symbols = this._floatService.getBrainService().findSymbols(m.value, 5);
					symText = `[Symbols for ${m.value}: ${symbols.map(s => `${s.name} in ${s.filePath}:${s.line}`).join(', ')}]`;
				}

				if (currentChars + symText.length <= this._maxChars) {
					resolvedFiles.push({ path: `@symbol:${m.value}`, excerpt: symText });
					currentChars += symText.length;
				}
			}
		}

		if (activeFilePath && !resolvedFiles.some(f => f.path === activeFilePath)) {
			if (!indexer.isExcluded(activeFilePath)) {
				const activeContext = `[Active Editor File: ${activeFilePath}]`;
				if (currentChars + activeContext.length <= this._maxChars) {
					resolvedFiles.unshift({ path: activeFilePath, excerpt: activeContext });
					currentChars += activeContext.length;
				}
			}
		}

		return {
			files: resolvedFiles,
			totalChars: currentChars
		};
	}
}
