/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatService } from '../../common/floatService.js';
import { IFloatProposal } from '../../common/protocols/floatProtocol.js';
import { parseModelProposals } from '../../common/proposals/floatProposalValidator.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { URI } from '../../../../../base/common/uri.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';

export class FloatComposer extends Disposable {
	private _activeProposal: IFloatProposal | null = null;

	constructor(
		@IFloatService private readonly _floatService: IFloatService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ITextFileService private readonly _textFileService: ITextFileService
	) {
		super();
	}

	public get activeProposal(): IFloatProposal | null {
		return this._activeProposal;
	}

	public async generateComposerProposal(prompt: string, activeFilePath?: string): Promise<IFloatProposal | null> {
		this._notificationService.info(`FLOAT Composer generating multi-file proposal for: "${prompt}"...`);

		const messages = [
			{
				id: `msg-${Date.now()}`,
				role: 'user' as const,
				content: prompt,
				timestamp: Date.now(),
				activeFileContext: activeFilePath
			}
		];

		let fullResponse = '';
		await this._floatService.streamChat(messages, {
			onChunk: chunk => { fullResponse += chunk; },
			onError: err => { this._notificationService.error(`Composer generation error: ${err.message}`); },
			onComplete: () => {}
		});

		const proposals = parseModelProposals(fullResponse, activeFilePath);
		if (proposals.length > 0) {
			this._activeProposal = proposals[0];
			this._floatService.getProposalSession().addProposal(this._activeProposal);
			return this._activeProposal;
		}

		return null;
	}

	public async applyProposal(proposalId: string): Promise<boolean> {
		const proposal = this._floatService.getProposalSession().getProposal(proposalId);
		if (!proposal) {
			return false;
		}

		// Create rollback checkpoint
		const snapshot: Record<string, string> = {};
		for (const file of proposal.files) {
			snapshot[file.path] = file.originalContent;
		}
		this._floatService.getCheckpointService().createCheckpoint(`Apply ${proposal.title}`, snapshot);

		// Apply files
		for (const file of proposal.files) {
			this._floatService.getProposalSession().applyFileChange(proposalId, file.path);
			try {
				const uri = URI.file(file.path);
				await this._textFileService.write(uri, file.proposedContent);
			} catch (e: any) {
				this._notificationService.error(`Failed to write file ${file.path}: ${e.message}`);
			}
		}

		this._notificationService.info(`FLOAT Composer applied proposal: ${proposal.title}`);
		return true;
	}

	public rejectProposal(proposalId: string): boolean {
		const proposal = this._floatService.getProposalSession().getProposal(proposalId);
		if (!proposal) {
			return false;
		}

		for (const file of proposal.files) {
			this._floatService.getProposalSession().rejectFileChange(proposalId, file.path);
		}

		this._activeProposal = null;
		this._notificationService.info(`FLOAT Composer rejected proposal: ${proposal.title}`);
		return true;
	}
}
