/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IStatusbarService, StatusbarAlignment, IStatusbarEntryAccessor, IStatusbarEntry } from '../../../../services/statusbar/browser/statusbar.js';
import { IFloatAuthService } from '../../common/auth/floatAuthService.js';
import { getDefaultFloatModel, calculateModelCost } from '../../common/model-runtime/floatModelRegistry.js';

export interface IFloatSessionTelemetry {
	currentModelId: string;
	totalPromptTokens: number;
	totalCompletionTokens: number;
	totalCostUsd: number;
	requestCount: number;
	lastLatencyMs: number;
	isLocalOllama: boolean;
}

export class FloatCostStatusContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.floatCostStatus';

	private _entryAccessor: IStatusbarEntryAccessor | null = null;
	private _telemetry: IFloatSessionTelemetry = {
		currentModelId: getDefaultFloatModel().id,
		totalPromptTokens: 0,
		totalCompletionTokens: 0,
		totalCostUsd: 0.0,
		requestCount: 0,
		lastLatencyMs: 0,
		isLocalOllama: false
	};

	constructor(
		@IStatusbarService private readonly _statusbarService?: IStatusbarService,
		@IFloatAuthService private readonly _authService?: IFloatAuthService
	) {
		super();
		this._registerStatusEntry();

		if (this._authService) {
			this._register(this._authService.onDidChangeAuthState(() => this._updateStatusEntry()));
			this._register(this._authService.onDidChangeBYOKKey(() => this._updateStatusEntry()));
		}
	}

	public getTelemetry(): IFloatSessionTelemetry {
		return { ...this._telemetry };
	}

	public recordUsage(modelId: string, promptTokens: number, completionTokens: number, latencyMs: number = 0): void {
		const isLocal = modelId.startsWith('ollama/') || modelId.includes('local');
		const cost = calculateModelCost(modelId, promptTokens, completionTokens);

		this._telemetry.currentModelId = modelId;
		this._telemetry.totalPromptTokens += promptTokens;
		this._telemetry.totalCompletionTokens += completionTokens;
		this._telemetry.totalCostUsd = Math.round((this._telemetry.totalCostUsd + cost) * 100000) / 100000;
		this._telemetry.requestCount += 1;
		this._telemetry.lastLatencyMs = latencyMs;
		this._telemetry.isLocalOllama = isLocal;

		this._updateStatusEntry();
	}

	public resetSessionTelemetry(): void {
		this._telemetry = {
			currentModelId: getDefaultFloatModel().id,
			totalPromptTokens: 0,
			totalCompletionTokens: 0,
			totalCostUsd: 0.0,
			requestCount: 0,
			lastLatencyMs: 0,
			isLocalOllama: false
		};
		this._updateStatusEntry();
	}

	private _formatEntry(): IStatusbarEntry {
		const totalTokens = this._telemetry.totalPromptTokens + this._telemetry.totalCompletionTokens;
		const costFormatted = this._telemetry.isLocalOllama
			? '$0.00 (Local Free)'
			: `$${this._telemetry.totalCostUsd.toFixed(4)}`;

		const modelDisplay = this._telemetry.currentModelId.startsWith('ollama/')
			? this._telemetry.currentModelId.replace('ollama/', '🦙 ')
			: `⚡ ${this._telemetry.currentModelId}`;

		const text = totalTokens > 0
			? `${modelDisplay} | ${totalTokens.toLocaleString()} tok (${costFormatted})`
			: `${modelDisplay} | Ready`;

		const tooltip = [
			`FLOAT AI Model & Usage Telemetry`,
			`---------------------------------`,
			`Active Model: ${this._telemetry.currentModelId}`,
			`Inference Mode: ${this._telemetry.isLocalOllama ? 'Offline Local (Ollama)' : 'Cloud Gateway / BYOK'}`,
			`Requests: ${this._telemetry.requestCount}`,
			`Prompt Tokens: ${this._telemetry.totalPromptTokens.toLocaleString()}`,
			`Completion Tokens: ${this._telemetry.totalCompletionTokens.toLocaleString()}`,
			`Total Tokens: ${totalTokens.toLocaleString()}`,
			`Estimated Session Cost: ${costFormatted}`,
			`Last Response Latency: ${this._telemetry.lastLatencyMs}ms`
		].join('\n');

		return {
			name: 'FLOAT Cost & Model Telemetry',
			text,
			ariaLabel: text,
			tooltip,
			command: 'float.action.openModelSettings'
		};
	}

	private _registerStatusEntry(): void {
		if (this._statusbarService) {
			this._entryAccessor = this._statusbarService.addEntry(
				this._formatEntry(),
				FloatCostStatusContribution.ID,
				StatusbarAlignment.RIGHT,
				100
			);
		}
	}

	private _updateStatusEntry(): void {
		if (this._entryAccessor) {
			this._entryAccessor.update(this._formatEntry());
		}
	}

	override dispose(): void {
		if (this._entryAccessor) {
			this._entryAccessor.dispose();
			this._entryAccessor = null;
		}
		super.dispose();
	}
}
