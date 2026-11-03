/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFloatChatMessage, IFloatModelInfo, IFloatProposal } from './protocols/floatProtocol.js';
import { FloatProposalSession } from './proposals/floatProposal.js';
import { FloatCheckpointService } from './checkpoints/floatCheckpointService.js';
import { FloatBrainService } from './brain/floatBrainService.js';
import { FloatWorkspaceIndexer } from './workspace/floatWorkspaceIndexer.js';
import { FloatModelClient, IFloatStreamCallbacks } from './model-runtime/floatModelClient.js';
import { FLOAT_MODELS, getDefaultFloatModel, getFloatModel } from './model-runtime/floatModelRegistry.js';
import { FloatBoundedAgentLoop } from './agent-runtime/floatAgentLoop.js';
import { FloatAuthService, IFloatAuthService } from './auth/floatAuthService.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export const IFloatService = createDecorator<IFloatService>('floatService');

export interface IFloatService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeActiveModel: Event<IFloatModelInfo>;
	readonly onDidCreateProposal: Event<IFloatProposal>;

	getActiveModel(): IFloatModelInfo;
	setActiveModel(modelId: string): boolean;
	getAvailableModels(): IFloatModelInfo[];

	getAuthService(): IFloatAuthService;
	getModelClient(): FloatModelClient;
	getProposalSession(): FloatProposalSession;
	getCheckpointService(): FloatCheckpointService;
	getBrainService(): FloatBrainService;
	getWorkspaceIndexer(): FloatWorkspaceIndexer;
	createAgentLoop(maxIterations?: number): FloatBoundedAgentLoop;

	streamChat(
		messages: IFloatChatMessage[],
		callbacks: IFloatStreamCallbacks,
		authToken?: string,
		projectId?: string,
		contextItems?: Array<{ path: string; content: string }>,
		conversationId?: string
	): Promise<void>;
	cancelActiveStream(): void;
}

export class FloatService extends Disposable implements IFloatService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeActiveModel = this._register(new Emitter<IFloatModelInfo>());
	public readonly onDidChangeActiveModel: Event<IFloatModelInfo> = this._onDidChangeActiveModel.event;

	private readonly _onDidCreateProposal = this._register(new Emitter<IFloatProposal>());
	public readonly onDidCreateProposal: Event<IFloatProposal> = this._onDidCreateProposal.event;

	private _activeModel: IFloatModelInfo = getDefaultFloatModel();
	private readonly _authService = this._register(new FloatAuthService());
	private readonly _modelClient = new FloatModelClient();
	private readonly _proposalSession = new FloatProposalSession();
	private readonly _checkpointService = new FloatCheckpointService();
	private readonly _brainService = new FloatBrainService();
	private readonly _workspaceIndexer = new FloatWorkspaceIndexer();

	public getActiveModel(): IFloatModelInfo {
		return this._activeModel;
	}

	public setActiveModel(modelId: string): boolean {
		const found = getFloatModel(modelId);
		if (found) {
			this._activeModel = found;
			this._onDidChangeActiveModel.fire(this._activeModel);
			return true;
		}
		return false;
	}

	public getAvailableModels(): IFloatModelInfo[] {
		return FLOAT_MODELS;
	}

	public getAuthService(): IFloatAuthService {
		return this._authService;
	}

	public getModelClient(): FloatModelClient {
		return this._modelClient;
	}

	public getProposalSession(): FloatProposalSession {
		return this._proposalSession;
	}

	public getCheckpointService(): FloatCheckpointService {
		return this._checkpointService;
	}

	public getBrainService(): FloatBrainService {
		return this._brainService;
	}

	public getWorkspaceIndexer(): FloatWorkspaceIndexer {
		return this._workspaceIndexer;
	}

	public createAgentLoop(maxIterations: number = 10): FloatBoundedAgentLoop {
		return new FloatBoundedAgentLoop(maxIterations);
	}

	public async streamChat(
		messages: IFloatChatMessage[],
		callbacks: IFloatStreamCallbacks,
		authToken?: string,
		projectId?: string,
		contextItems?: Array<{ path: string; content: string }>,
		conversationId?: string
	): Promise<void> {
		const token = authToken || this._authService.getAuthToken() || undefined;
		const projId = projectId || this._authService.getActiveProjectId() || 'default-project';
		return this._modelClient.streamChat(
			messages,
			this._activeModel.id,
			callbacks,
			token,
			projId,
			contextItems,
			conversationId
		);
	}

	public cancelActiveStream(): void {
		this._modelClient.cancelActiveStream();
	}
}
