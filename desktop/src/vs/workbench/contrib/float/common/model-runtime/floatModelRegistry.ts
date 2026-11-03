/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatModelInfo } from '../protocols/floatProtocol.js';

/**
 * Native Desktop Model Registry
 * Strictly aligned with FLOAT server verified models (OpenAI Responses protocol: gpt-6-astra & gpt-6.1-sol).
 * Unsupported models (Gemini, Claude, GPT-4o) have been removed to prevent routing and validation errors.
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
