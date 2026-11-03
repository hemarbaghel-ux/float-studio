/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface IFloatChatMessage {
	readonly id: string;
	readonly role: 'user' | 'assistant' | 'system';
	readonly content: string;
	readonly timestamp: number;
	readonly model?: string;
	readonly proposals?: IFloatProposal[];
	readonly activeFileContext?: string;
}

export interface IFloatProposalFileChange {
	readonly path: string;
	readonly originalContent: string;
	readonly proposedContent: string;
	readonly isNew: boolean;
	readonly isDeletion: boolean;
	readonly status: 'pending' | 'accepted' | 'rejected';
}

export interface IFloatProposal {
	readonly id: string;
	readonly title: string;
	readonly explanation: string;
	readonly files: IFloatProposalFileChange[];
	readonly timestamp: number;
	readonly status: 'pending' | 'applied' | 'rejected' | 'partially_applied';
}

export interface IFloatModelInfo {
	readonly id: string;
	readonly name: string;
	readonly provider: 'openai' | 'google' | 'anthropic' | 'custom';
	readonly contextWindow: number;
	readonly supportsStreaming: boolean;
	readonly isDefault?: boolean;
}

export interface IFloatInlineDiffRequest {
	readonly filePath: string;
	readonly originalCode: string;
	readonly prompt: string;
	readonly model?: string;
}

export interface IFloatTurnCheckpoint {
	readonly id: string;
	readonly timestamp: number;
	readonly description: string;
	readonly snapshot: Record<string, string>;
}
