/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatModelInfo } from '../protocols/floatProtocol.js';

export const FLOAT_MODELS: IFloatModelInfo[] = [
	{
		id: 'gemini-2.5-flash',
		name: 'Gemini 2.5 Flash',
		provider: 'google',
		contextWindow: 1048576,
		supportsStreaming: true,
		isDefault: true
	},
	{
		id: 'gpt-4o',
		name: 'GPT-4o',
		provider: 'openai',
		contextWindow: 128000,
		supportsStreaming: true
	},
	{
		id: 'claude-3-5-sonnet',
		name: 'Claude 3.5 Sonnet',
		provider: 'anthropic',
		contextWindow: 200000,
		supportsStreaming: true
	},
	{
		id: 'gpt-4o-mini',
		name: 'GPT-4o Mini',
		provider: 'openai',
		contextWindow: 128000,
		supportsStreaming: true
	}
];

export function getFloatModel(id: string): IFloatModelInfo | undefined {
	return FLOAT_MODELS.find(m => m.id === id);
}

export function getDefaultFloatModel(): IFloatModelInfo {
	return FLOAT_MODELS.find(m => m.isDefault) || FLOAT_MODELS[0];
}
