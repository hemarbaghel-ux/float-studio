/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../../../../editor/common/model.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import {
	InlineCompletionsProvider,
	InlineCompletions,
	InlineCompletion,
	InlineCompletionContext
} from '../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { IFloatService } from '../../common/floatService.js';
import {
	IFloatInlineCompletionContext,
	IFloatAutocompleteCacheEntry,
	IFloatAutocompleteConfig,
	IFloatAutocompleteTelemetry
} from './floatAutocompleteTypes.js';

export class FloatPredictiveAutocomplete extends Disposable implements InlineCompletionsProvider {
	private _config: IFloatAutocompleteConfig = {
		enabled: true,
		debounceMs: 75,
		maxPrefixChars: 2000,
		maxSuffixChars: 1000,
		enableForwardStability: true
	};

	private _telemetry: IFloatAutocompleteTelemetry = {
		requestsCount: 0,
		cacheHitsCount: 0,
		completionsShownCount: 0,
		completionsAcceptedCount: 0,
		completionsRejectedCount: 0,
		averageLatencyMs: 0
	};

	private _cache: IFloatAutocompleteCacheEntry | null = null;
	private _activeAbortController: AbortController | null = null;
	private _debounceResolver: ((proceed: boolean) => void) | null = null;
	private _debounceTimer: any = null;

	constructor(
		@IFloatService private readonly _floatService: IFloatService,
		@ILanguageFeaturesService languageFeaturesService?: ILanguageFeaturesService
	) {
		super();
		if (languageFeaturesService) {
			this._register(languageFeaturesService.inlineCompletionsProvider.register('*', this));
		}
	}

	public get config(): IFloatAutocompleteConfig {
		return this._config;
	}

	public setConfig(update: Partial<IFloatAutocompleteConfig>): void {
		this._config = { ...this._config, ...update };
	}

	public get telemetry(): IFloatAutocompleteTelemetry {
		return { ...this._telemetry };
	}

	public clearCache(): void {
		this._cache = null;
	}

	private async _debounce(): Promise<boolean> {
		if (this._config.debounceMs <= 0) {
			return true;
		}

		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
			this._debounceTimer = null;
		}
		if (this._debounceResolver) {
			this._debounceResolver(false);
			this._debounceResolver = null;
		}

		return new Promise<boolean>((resolve) => {
			this._debounceResolver = resolve;
			this._debounceTimer = setTimeout(() => {
				this._debounceTimer = null;
				this._debounceResolver = null;
				resolve(true);
			}, this._config.debounceMs);
		});
	}

	/**
	 * Extracts bounded prefix and suffix context around cursor position
	 */
	public extractContext(model: ITextModel, position: Position): IFloatInlineCompletionContext {
		const fullText = model.getValue();
		const offset = model.getOffsetAt(position);

		const rawPrefix = fullText.slice(0, offset);
		const rawSuffix = fullText.slice(offset);

		const prefix = rawPrefix.slice(-this._config.maxPrefixChars);
		const suffix = rawSuffix.slice(0, this._config.maxSuffixChars);

		const lineContent = model.getLineContent(position.lineNumber);
		const indentMatch = lineContent.match(/^(\s*)/);
		const indentation = indentMatch ? indentMatch[1] : '';

		return {
			prefix,
			suffix,
			lineText: lineContent,
			lineNumber: position.lineNumber,
			column: position.column,
			indentation,
			fileName: model.uri.path.split('/').pop() || 'file',
			languageId: model.getLanguageId()
		};
	}

	/**
	 * Sanitizes raw model output for clean inline insertion
	 */
	public sanitizeCompletion(rawCompletion: string): string {
		if (!rawCompletion) return '';

		let cleaned = rawCompletion;

		// Strip markdown code fences if output by the model
		cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\r?\n?/i, '');
		cleaned = cleaned.replace(/\r?\n?```$/i, '');

		// Normalize line endings to LF
		cleaned = cleaned.replace(/\r\n/g, '\n');

		return cleaned;
	}

	/**
	 * Main Code-OSS InlineCompletionsProvider entrypoint
	 */
	public async provideInlineCompletions(
		model: ITextModel,
		position: Position,
		context: InlineCompletionContext,
		token: CancellationToken
	): Promise<InlineCompletions | undefined> {
		if (!this._config.enabled) {
			return undefined;
		}

		const ctx = this.extractContext(model, position);
		const filePath = model.uri.path;

		// 1. Cursor Tab Forward Cache Matching
		// If user typed through part of our previously returned completion, slide it forward!
		if (this._cache && this._cache.filePath === filePath && this._cache.lineNumber === position.lineNumber) {
			if (ctx.prefix.startsWith(this._cache.prefix)) {
				const typedChars = ctx.prefix.slice(this._cache.prefix.length);
				if (this._cache.completion.startsWith(typedChars)) {
					const remaining = this._cache.completion.slice(typedChars.length);
					if (remaining.length > 0) {
						this._telemetry.cacheHitsCount++;
						const insertRange = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
						return {
							items: [
								{
									insertText: remaining,
									range: insertRange
								}
							],
							enableForwardStability: true
						};
					}
				}
			}
		}

		// Invalidate previous cache on cache miss
		this._cache = null;

		// Cancel in-flight network request on new keystroke
		if (this._activeAbortController) {
			this._activeAbortController.abort();
			this._activeAbortController = null;
		}

		// 2. Typing Debounce (50-150ms idle pause before firing API call)
		const proceed = await this._debounce();
		if (!proceed || token.isCancellationRequested) {
			return undefined;
		}

		// 3. Request Completion from Model Client
		this._activeAbortController = new AbortController();
		const signal = this._activeAbortController.signal;
		this._telemetry.requestsCount++;
		const reqStart = Date.now();

		try {
			const result = await this._floatService.completeCode(
				{
					prefix: ctx.prefix,
					suffix: ctx.suffix,
					language: ctx.languageId,
					fileName: ctx.fileName,
					model: this._config.modelId
				},
				undefined,
				undefined,
				signal
			);

			const latency = Date.now() - reqStart;
			this._updateAverageLatency(latency);

			if (token.isCancellationRequested || result.cancelled || !result.completion) {
				return undefined;
			}

			const cleanCompletion = this.sanitizeCompletion(result.completion);
			if (!cleanCompletion) {
				return undefined;
			}

			// Store in forward cache for smooth typing stability
			this._cache = {
				filePath,
				prefix: ctx.prefix,
				completion: cleanCompletion,
				lineNumber: position.lineNumber,
				column: position.column,
				timestamp: Date.now()
			};

			const insertRange = new Range(position.lineNumber, position.column, position.lineNumber, position.column);

			const item: InlineCompletion = {
				insertText: cleanCompletion,
				range: insertRange
			};

			this._telemetry.completionsShownCount++;

			return {
				items: [item],
				enableForwardStability: this._config.enableForwardStability
			};
		} catch (err: any) {
			if (signal.aborted || token.isCancellationRequested) {
				return undefined;
			}
			return undefined;
		} finally {
			this._activeAbortController = null;
		}
	}

	public handleItemDidShow(_completions: InlineCompletions, _item: InlineCompletion, _updatedInsertText: string): void {
		// Telemetry hook
	}

	public handlePartialAccept(_completions: InlineCompletions, _item: InlineCompletion, _acceptedCharacters: number): void {
		this._telemetry.completionsAcceptedCount++;
	}

	public handleRejection(_completions: InlineCompletions, _item: InlineCompletion): void {
		this._telemetry.completionsRejectedCount++;
		this._cache = null;
	}

	public freeInlineCompletions(_completions: InlineCompletions): void {
		// Clean up lifecycle resources
	}

	private _updateAverageLatency(newLatency: number): void {
		if (this._telemetry.requestsCount <= 1) {
			this._telemetry.averageLatencyMs = newLatency;
		} else {
			this._telemetry.averageLatencyMs = Math.round(
				(this._telemetry.averageLatencyMs * (this._telemetry.requestsCount - 1) + newLatency) / this._telemetry.requestsCount
			);
		}
	}
}
