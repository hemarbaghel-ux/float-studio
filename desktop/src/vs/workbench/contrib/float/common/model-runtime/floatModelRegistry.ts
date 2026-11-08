/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatModelInfo } from '../protocols/floatProtocol.js';

/**
 * Native Desktop Model Registry
 * Strictly aligned with FLOAT server verified models (GPT-6 Astra, GPT-6.1 Sol, Gemini 3.8 Flash).
 * Dynamically extensible for local Ollama and BYOK models.
 */
export const FLOAT_MODELS: IFloatModelInfo[] = [
	{
		id: 'gpt-6.1-sol',
		name: 'GPT-6.1 Sol',
		provider: 'openai',
		upstreamModelId: 'gpt-6.1-sol',
		isRoutingAlias: false,
		contextWindow: 1050000,
		supportsStreaming: true,
		isDefault: true,
		capabilities: {
			coding: true,
			reasoning: true,
			vision: true,
			tools: true,
			streaming: true
		}
	},
	{
		id: 'gemini-3.8-flash',
		name: 'Gemini 3.8 Flash',
		provider: 'google',
		upstreamModelId: 'gemini-3.8-flash',
		isRoutingAlias: false,
		contextWindow: 1048576,
		supportsStreaming: true,
		capabilities: {
			coding: true,
			reasoning: true,
			vision: true,
			tools: true,
			streaming: true
		}
	},
	{
		id: 'gpt-6-astra',
		name: 'GPT-6 Astra',
		provider: 'openai',
		upstreamModelId: 'gpt-6-astra',
		isRoutingAlias: false,
		contextWindow: 1050000,
		supportsStreaming: true,
		capabilities: {
			coding: true,
			reasoning: true,
			vision: true,
			tools: true,
			streaming: true
		}
	},
	{
		id: 'auto',
		name: 'Auto (GPT-6 Astra)',
		provider: 'openai',
		upstreamModelId: 'gpt-6-astra',
		isRoutingAlias: true,
		contextWindow: 1050000,
		supportsStreaming: true,
		capabilities: {
			coding: true,
			reasoning: true,
			vision: true,
			tools: true,
			streaming: true
		}
	}
];

export function getFloatModel(id: string): IFloatModelInfo | undefined {
	return FLOAT_MODELS.find(m => m.id === id);
}

export function getDefaultFloatModel(): IFloatModelInfo {
	return FLOAT_MODELS.find(m => m.isDefault) || FLOAT_MODELS[0];
}

export function registerDynamicModel(model: IFloatModelInfo): void {
	const existingIdx = FLOAT_MODELS.findIndex(m => m.id === model.id);
	if (existingIdx >= 0) {
		FLOAT_MODELS[existingIdx] = model;
	} else {
		FLOAT_MODELS.push(model);
	}
}

export function getAllFloatModels(): IFloatModelInfo[] {
	return [...FLOAT_MODELS];
}

/**
 * Calculates estimated USD inference cost for a model turn.
 * Local Ollama models are strictly $0.00.
 */
export function calculateModelCost(modelId: string, promptTokens: number, completionTokens: number): number {
	if (modelId.startsWith('ollama/') || modelId.includes('local')) {
		return 0.0;
	}

	const normalized = modelId.toLowerCase();
	let promptCostPerMillion = 1.5;
	let completionCostPerMillion = 6.0;

	if (normalized.includes('claude-3-5') || normalized.includes('sonnet')) {
		promptCostPerMillion = 3.0;
		completionCostPerMillion = 15.0;
	} else if (normalized.includes('deepseek')) {
		promptCostPerMillion = 0.14;
		completionCostPerMillion = 0.28;
	} else if (normalized.includes('gemini')) {
		// Google's standard paid-tier Gemini 3.8 Flash list price as of 2026-11-06.
		// Eligible free-tier requests may incur no charge within the account's quota.
		promptCostPerMillion = 0.75;
		completionCostPerMillion = 3.75;
	}

	const promptCost = (promptTokens / 1_000_000) * promptCostPerMillion;
	const completionCost = (completionTokens / 1_000_000) * completionCostPerMillion;
	return Math.round((promptCost + completionCost) * 100000) / 100000;
}
