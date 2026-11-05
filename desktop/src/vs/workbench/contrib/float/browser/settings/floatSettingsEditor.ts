/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';

export interface IFloatAiModelConfig {
	id: string;
	name: string;
	provider: 'anthropic' | 'openai' | 'google' | 'ollama' | 'deepseek';
	contextWindow: number;
	inputCostPerMillion: number;
	outputCostPerMillion: number;
	supportsStreaming: boolean;
	supportsVision: boolean;
	isDefault?: boolean;
}

export interface IFloatRulesConfig {
	enabled: boolean;
	rulesFilePath: string;
	customRulesText: string;
	includeGitignorePatterns: boolean;
	strictCodeStyleEnforcement: boolean;
}

export class FloatSettingsEditor implements IDisposable {
	private _activeModelId: string = 'claude-3-7-sonnet';
	private readonly _availableModels: IFloatAiModelConfig[] = [
		{
			id: 'claude-3-7-sonnet',
			name: 'Claude 3.7 Sonnet (Hybrid Reasoning)',
			provider: 'anthropic',
			contextWindow: 200000,
			inputCostPerMillion: 3.0,
			outputCostPerMillion: 15.0,
			supportsStreaming: true,
			supportsVision: true,
			isDefault: true
		},
		{
			id: 'gpt-4o',
			name: 'GPT-4o (Omni Fast)',
			provider: 'openai',
			contextWindow: 128000,
			inputCostPerMillion: 2.5,
			outputCostPerMillion: 10.0,
			supportsStreaming: true,
			supportsVision: true
		},
		{
			id: 'gemini-2-5-pro',
			name: 'Gemini 2.5 Pro (1M Token Context)',
			provider: 'google',
			contextWindow: 1000000,
			inputCostPerMillion: 1.25,
			outputCostPerMillion: 5.0,
			supportsStreaming: true,
			supportsVision: true
		},
		{
			id: 'deepseek-r1',
			name: 'DeepSeek R1 (Open Reasoning)',
			provider: 'deepseek',
			contextWindow: 64000,
			inputCostPerMillion: 0.55,
			outputCostPerMillion: 2.19,
			supportsStreaming: true,
			supportsVision: false
		},
		{
			id: 'ollama-qwen-coder',
			name: 'Ollama: Qwen 2.5 Coder 32B (Local 0.00 USD)',
			provider: 'ollama',
			contextWindow: 32000,
			inputCostPerMillion: 0.0,
			outputCostPerMillion: 0.0,
			supportsStreaming: true,
			supportsVision: false
		}
	];

	private _byokKeys = new Map<string, string>();
	private _rulesConfig: IFloatRulesConfig = {
		enabled: true,
		rulesFilePath: '.floatrules',
		customRulesText: '# FLOAT Project Guidelines\n- Write clean, type-safe TypeScript\n- Preserve existing comments\n- Never introduce any types',
		includeGitignorePatterns: true,
		strictCodeStyleEnforcement: true
	};

	public getActiveModel(): IFloatAiModelConfig {
		return this._availableModels.find(m => m.id === this._activeModelId) || this._availableModels[0];
	}

	public setActiveModel(modelId: string): boolean {
		const model = this._availableModels.find(m => m.id === modelId);
		if (model) {
			this._activeModelId = modelId;
			return true;
		}
		return false;
	}

	public getAvailableModels(): IFloatAiModelConfig[] {
		return [...this._availableModels];
	}

	public setApiKey(provider: string, key: string): void {
		this._byokKeys.set(provider.toLowerCase(), key);
	}

	public getApiKey(provider: string): string | undefined {
		return this._byokKeys.get(provider.toLowerCase());
	}

	public hasApiKey(provider: string): boolean {
		const k = this._byokKeys.get(provider.toLowerCase());
		return !!(k && k.length > 5);
	}

	public getRulesConfig(): IFloatRulesConfig {
		return { ...this._rulesConfig };
	}

	public updateRulesConfig(updates: Partial<IFloatRulesConfig>): void {
		this._rulesConfig = { ...this._rulesConfig, ...updates };
	}

	public dispose(): void {
		this._byokKeys.clear();
	}
}
