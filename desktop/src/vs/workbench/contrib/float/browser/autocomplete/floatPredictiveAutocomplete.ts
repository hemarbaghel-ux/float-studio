/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../../../../editor/common/model.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
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
	IFloatAutocompleteTelemetry,
	IRecentEditRecord,
	ICursorJumpRecommendation
} from './floatAutocompleteTypes.js';
import { isFloatAutocompleteGloballyEnabled } from './floatAutocompleteActions.js';
import { FloatNextActionSpeculator } from './floatNextActionSpeculator.js';
import { FloatAutocompleteContextResolver } from './floatAutocompleteContextResolver.js';
import { IFloatDaemonRuntimeService } from '../../common/daemon/floatDaemonRuntimeService.js';

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
		averageLatencyMs: 0,
		averageCacheHitLatencyMs: 0,
		averageModelNetworkLatencyMs: 0,
		averageTotalLatencyMs: 0
	};

	private _cache: IFloatAutocompleteCacheEntry | null = null;
	private _activeAbortController: AbortController | null = null;
	private _debounceResolver: ((proceed: boolean) => void) | null = null;
	private _debounceTimer: any = null;
	private readonly _speculator = new FloatNextActionSpeculator();
	private readonly _daemonContextResolver: FloatAutocompleteContextResolver;

	private readonly _onDidShowCursorJump = this._register(new Emitter<{ position: Position; recommendation: ICursorJumpRecommendation }>());
	public readonly onDidShowCursorJump: Event<{ position: Position; recommendation: ICursorJumpRecommendation }> = this._onDidShowCursorJump.event;

	private readonly _onDidHideCursorJump = this._register(new Emitter<void>());
	public readonly onDidHideCursorJump: Event<void> = this._onDidHideCursorJump.event;

	constructor(
		private readonly _floatService: IFloatService,
		languageFeaturesService?: ILanguageFeaturesService,
		daemonRuntimeService?: IFloatDaemonRuntimeService
	) {
		super();
		this._daemonContextResolver = new FloatAutocompleteContextResolver(daemonRuntimeService);
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

	public get speculator(): FloatNextActionSpeculator {
		return this._speculator;
	}

	public recordUserEdit(edit: IRecentEditRecord): void {
		this._speculator.recordEdit(edit);
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
	 * Sanitizes raw model output for clean inline insertion and deduplicates suffix overlap
	 */
	public sanitizeCompletion(rawCompletion: string, suffix?: string): string {
		if (!rawCompletion) return '';

		let cleaned = rawCompletion;

		// Strip markdown code fences if output by the model
		cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\r?\n?/i, '');
		cleaned = cleaned.replace(/\r?\n?```$/i, '');

		// Normalize line endings to LF
		cleaned = cleaned.replace(/\r\n/g, '\n');

		// Deduplicate suffix overlap to prevent repeating existing code below cursor
		if (suffix) {
			cleaned = this._speculator.deduplicateSuffix(cleaned, suffix);
		}

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
		const callStart = Date.now();

		// Check both internal config, global toggle action state, and caller cancellation token
		if (!this._config.enabled || !isFloatAutocompleteGloballyEnabled() || token?.isCancellationRequested) {
			return undefined;
		}

		const ctx = this.extractContext(model, position);
		const filePath = model.uri.path;

		// 1. Cursor Tab Forward Cache Matching (<1ms local cache-hit latency)
		if (this._cache && this._cache.filePath === filePath && this._cache.lineNumber === position.lineNumber) {
			if (ctx.prefix.startsWith(this._cache.prefix)) {
				const typedChars = ctx.prefix.slice(this._cache.prefix.length);
				if (this._cache.completion.startsWith(typedChars)) {
					const remaining = this._cache.completion.slice(typedChars.length);
					if (remaining.length > 0) {
						const cacheHitLatency = Date.now() - callStart;
						this._telemetry.cacheHitsCount++;
						this._updateCacheHitLatency(cacheHitLatency);
						this._telemetry.lastMeasurement = {
							type: 'cache_hit',
							cacheHitLatencyMs: cacheHitLatency,
							totalLatencyMs: cacheHitLatency
						};

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

		// Invalidate cache on cache miss
		this._cache = null;

		// Cancel any prior in-flight request on new keystroke
		if (this._activeAbortController) {
			this._activeAbortController.abort();
			this._activeAbortController = null;
		}

		// 2. Typing Debounce (50-150ms idle pause before firing API call)
		const debounceStart = Date.now();
		const proceed = await this._debounce();
		const debounceDuration = Date.now() - debounceStart;

		if (!proceed || token.isCancellationRequested) {
			return undefined;
		}

		// 3. Request Completion from Model Client with Cross-File Diff Prompting
		this._activeAbortController = new AbortController();
		const signal = this._activeAbortController.signal;
		const cancelSub = token?.onCancellationRequested?.(() => {
			this._activeAbortController?.abort();
		});
		this._telemetry.requestsCount++;
		const netStart = Date.now();

		try {
			const relatedContext = await this._daemonContextResolver.resolveRelatedContext(
				ctx.prefix,
				ctx.suffix,
				filePath
			);
			if (token.isCancellationRequested || signal.aborted) {
				return undefined;
			}

			const speculativeContext = this._speculator.buildPromptContext(ctx);
			const promptParts = [relatedContext, speculativeContext].filter(Boolean);
			const fullPrefix = promptParts.length > 0
				? `${promptParts.join('\n')}\n${ctx.prefix}`
				: ctx.prefix;

			const result = await this._floatService.completeCode(
				{
					prefix: fullPrefix,
					suffix: ctx.suffix,
					language: ctx.languageId,
					fileName: ctx.fileName,
					model: this._config.modelId
				},
				undefined,
				undefined,
				signal
			);

			const modelNetLatency = Date.now() - netStart;
			const totalLatency = debounceDuration + modelNetLatency;

			this._updateModelLatency(modelNetLatency, totalLatency);
			this._telemetry.lastMeasurement = {
				type: 'model_network',
				debounceLatencyMs: debounceDuration,
				modelNetworkLatencyMs: modelNetLatency,
				totalLatencyMs: totalLatency
			};

			if (token.isCancellationRequested || result.cancelled || !result.completion) {
				return undefined;
			}

			const cleanCompletion = this.sanitizeCompletion(result.completion, ctx.suffix);
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

			// Predict cursor jump recommendation if signature was modified
			const jump = this._speculator.predictCursorJump(ctx);
			if (jump) {
				(item as any).cursorJump = jump;
			}

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
			cancelSub?.dispose?.();
			this._activeAbortController = null;
		}
	}

	public handleItemDidShow(_completions: InlineCompletions, item: InlineCompletion, _updatedInsertText: string): void {
		if ((item as any).cursorJump) {
			const pos = item.range instanceof Range ? item.range.getEndPosition() : new Position((item.range as any).endLineNumber || 1, (item.range as any).endColumn || 1);
			this._onDidShowCursorJump.fire({
				position: pos,
				recommendation: (item as any).cursorJump
			});
		}
	}

	public handlePartialAccept(_completions: InlineCompletions, _item: InlineCompletion, _acceptedCharacters: number): void {
		this._telemetry.completionsAcceptedCount++;
	}

	public handleRejection(_completions: InlineCompletions, _item: InlineCompletion): void {
		this._telemetry.completionsRejectedCount++;
		this._cache = null;
		this._onDidHideCursorJump.fire();
	}

	public freeInlineCompletions(_completions: InlineCompletions): void {
		this._onDidHideCursorJump.fire();
	}

	private _updateCacheHitLatency(latency: number): void {
		if (this._telemetry.cacheHitsCount <= 1) {
			this._telemetry.averageCacheHitLatencyMs = latency;
		} else {
			this._telemetry.averageCacheHitLatencyMs = Math.round(
				(this._telemetry.averageCacheHitLatencyMs * (this._telemetry.cacheHitsCount - 1) + latency) / this._telemetry.cacheHitsCount
			);
		}
	}

	private _updateModelLatency(modelLatency: number, totalLatency: number): void {
		const n = this._telemetry.requestsCount;
		if (n <= 1) {
			this._telemetry.averageModelNetworkLatencyMs = modelLatency;
			this._telemetry.averageTotalLatencyMs = totalLatency;
			this._telemetry.averageLatencyMs = totalLatency;
		} else {
			this._telemetry.averageModelNetworkLatencyMs = Math.round(
				(this._telemetry.averageModelNetworkLatencyMs * (n - 1) + modelLatency) / n
			);
			this._telemetry.averageTotalLatencyMs = Math.round(
				(this._telemetry.averageTotalLatencyMs * (n - 1) + totalLatency) / n
			);
			this._telemetry.averageLatencyMs = this._telemetry.averageTotalLatencyMs;
		}
	}
}
