/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IFloatInlineCompletionContext {
	prefix: string;
	suffix: string;
	lineText: string;
	lineNumber: number;
	column: number;
	indentation: string;
	fileName: string;
	languageId: string;
}

export interface IFloatAutocompleteCacheEntry {
	filePath: string;
	prefix: string;
	suffix: string;
	completion: string;
	lineNumber: number;
	column: number;
	timestamp: number;
}

export interface IFloatAutocompleteConfig {
	enabled: boolean;
	debounceMs: number;
	maxPrefixChars: number;
	maxSuffixChars: number;
	enableForwardStability: boolean;
	modelId?: string;
}

export interface IFloatAutocompleteLatencyMeasurement {
	type: 'cache_hit' | 'model_network';
	cacheHitLatencyMs?: number;
	debounceLatencyMs?: number;
	contextRetrievalLatencyMs?: number;
	modelNetworkLatencyMs?: number;
	totalLatencyMs: number;
}

export interface IFloatAutocompleteTelemetry {
	requestsCount: number;
	cacheHitsCount: number;
	completionsShownCount: number;
	completionsAcceptedCount: number;
	completionsRejectedCount: number;
	averageLatencyMs: number;
	averageCacheHitLatencyMs: number;
	averageModelNetworkLatencyMs: number;
	averageTotalLatencyMs: number;
	lastMeasurement?: IFloatAutocompleteLatencyMeasurement;
}

export interface ICursorJumpRecommendation {
	targetFilePath: string;
	targetLine: number;
	targetColumn: number;
	reason: string;
	suggestedReplacement?: string;
	confidence: number;
}

export interface IRecentEditRecord {
	filePath: string;
	timestamp: number;
	startLine: number;
	startColumn: number;
	endLine: number;
	endColumn: number;
	oldText: string;
	newText: string;
}

export interface INextActionSpeculationResult {
	ghostText: string;
	cursorJump?: ICursorJumpRecommendation;
	source: 'cache' | 'model';
	confidence: number;
}
