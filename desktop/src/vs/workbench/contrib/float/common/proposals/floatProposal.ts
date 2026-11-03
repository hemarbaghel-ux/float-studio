/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatProposal, IFloatProposalFileChange } from '../protocols/floatProtocol.js';
import { sanitizeProposalPath } from './floatProposalValidator.js';

export class FloatProposalSession {
	private readonly _proposals: Map<string, IFloatProposal> = new Map();

	public addProposal(proposal: IFloatProposal): void {
		this._proposals.set(proposal.id, proposal);
	}

	public getProposal(id: string): IFloatProposal | undefined {
		return this._proposals.get(id);
	}

	public getAllProposals(): IFloatProposal[] {
		return Array.from(this._proposals.values());
	}

	public applyFileChange(proposalId: string, filePath: string): IFloatProposalFileChange | undefined {
		const prop = this._proposals.get(proposalId);
		if (!prop) {
			return undefined;
		}

		const cleanPath = sanitizeProposalPath(filePath);
		const change = prop.files.find(f => f.path === cleanPath);
		if (!change) {
			return undefined;
		}

		const updatedFiles = prop.files.map(f => {
			if (f.path === cleanPath) {
				return { ...f, status: 'accepted' as const };
			}
			return f;
		});

		const allAccepted = updatedFiles.every(f => f.status === 'accepted');
		const anyAccepted = updatedFiles.some(f => f.status === 'accepted');

		const updatedProposal: IFloatProposal = {
			...prop,
			files: updatedFiles,
			status: allAccepted ? 'applied' : anyAccepted ? 'partially_applied' : 'pending'
		};

		this._proposals.set(proposalId, updatedProposal);
		return change;
	}

	public rejectFileChange(proposalId: string, filePath: string): IFloatProposalFileChange | undefined {
		const prop = this._proposals.get(proposalId);
		if (!prop) {
			return undefined;
		}

		const cleanPath = sanitizeProposalPath(filePath);
		const change = prop.files.find(f => f.path === cleanPath);
		if (!change) {
			return undefined;
		}

		const updatedFiles = prop.files.map(f => {
			if (f.path === cleanPath) {
				return { ...f, status: 'rejected' as const };
			}
			return f;
		});

		const allRejected = updatedFiles.every(f => f.status === 'rejected');

		const updatedProposal: IFloatProposal = {
			...prop,
			files: updatedFiles,
			status: allRejected ? 'rejected' : 'partially_applied'
		};

		this._proposals.set(proposalId, updatedProposal);
		return change;
	}

	public clear(): void {
		this._proposals.clear();
	}
}
