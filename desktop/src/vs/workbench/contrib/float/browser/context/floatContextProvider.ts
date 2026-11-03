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
				const indexed = indexer.getIndexedFiles();
				const summary = `[Codebase Overview: ${indexed.length} files indexed]`;
				if (currentChars + summary.length <= this._maxChars) {
					resolvedFiles.push({ path: '@codebase', excerpt: summary });
					currentChars += summary.length;
				}
			} else if (m.type === 'symbol' && m.value) {
				const symbols = this._floatService.getBrainService().findSymbols(m.value, 5);
				const symText = `[Symbols for ${m.value}: ${symbols.map(s => `${s.name} in ${s.filePath}:${s.line}`).join(', ')}]`;
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
