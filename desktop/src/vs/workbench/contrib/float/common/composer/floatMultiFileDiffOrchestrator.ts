/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { sanitizeProposalPath } from '../proposals/floatProposalValidator.js';

export interface IDiffHunk {
	index: number;
	type: 'add' | 'delete' | 'modify' | 'equal';
	originalStart: number;
	originalCount: number;
	proposedStart: number;
	proposedCount: number;
	originalLines: string[];
	proposedLines: string[];
	status: 'pending' | 'accepted' | 'rejected';
}

export interface IFloatOrchestratedFile {
	path: string;
	originalContent: string;
	proposedContent: string;
	hunks: IDiffHunk[];
	status: 'pending' | 'accepted' | 'rejected';
	stats: {
		additions: number;
		deletions: number;
	};
}

export interface IFloatMultiFileProposal {
	id: string;
	title: string;
	summary: string;
	checkpointId?: string;
	timestamp: number;
	files: IFloatOrchestratedFile[];
	status: 'pending' | 'partially_accepted' | 'accepted' | 'rejected';
	stats: {
		totalFiles: number;
		totalAdditions: number;
		totalDeletions: number;
	};
}

export function computeLineHunks(original: string, proposed: string): IDiffHunk[] {
	const origLines = original ? original.split(/\r?\n/) : [];
	const propLines = proposed ? proposed.split(/\r?\n/) : [];

	const hunks: IDiffHunk[] = [];
	let oIdx = 0;
	let pIdx = 0;
	let hunkCounter = 0;

	// Simple Myers-style greedy diff for structured hunk extraction
	while (oIdx < origLines.length || pIdx < propLines.length) {
		if (oIdx < origLines.length && pIdx < propLines.length && origLines[oIdx] === propLines[pIdx]) {
			// Unchanged context line
			oIdx++;
			pIdx++;
			continue;
		}

		const hunkStartO = oIdx + 1;
		const hunkStartP = pIdx + 1;
		const deletedBlock: string[] = [];
		const addedBlock: string[] = [];

		// Collect consecutive deletions and additions until next sync point
		while (oIdx < origLines.length && (pIdx >= propLines.length || origLines[oIdx] !== propLines[pIdx])) {
			// Look ahead in propLines to see if origLine matches soon
			const matchAhead = propLines.slice(pIdx, pIdx + 5).indexOf(origLines[oIdx]);
			if (matchAhead > 0) {
				// There were insertions in proposed
				for (let i = 0; i < matchAhead; i++) {
					addedBlock.push(propLines[pIdx++]);
				}
				break;
			}
			deletedBlock.push(origLines[oIdx++]);
		}

		while (pIdx < propLines.length && (oIdx >= origLines.length || origLines[oIdx] !== propLines[pIdx])) {
			addedBlock.push(propLines[pIdx++]);
		}

		const type: 'add' | 'delete' | 'modify' = 
			deletedBlock.length > 0 && addedBlock.length > 0 ? 'modify' :
			deletedBlock.length > 0 ? 'delete' : 'add';

		hunks.push({
			index: hunkCounter++,
			type,
			originalStart: hunkStartO,
			originalCount: deletedBlock.length,
			proposedStart: hunkStartP,
			proposedCount: addedBlock.length,
			originalLines: deletedBlock,
			proposedLines: addedBlock,
			status: 'pending'
		});
	}

	return hunks;
}

export class FloatMultiFileDiffOrchestrator {
	private readonly _proposals = new Map<string, IFloatMultiFileProposal>();

	public createProposal(
		title: string,
		summary: string,
		changes: Array<{ path: string; originalContent: string; proposedContent: string }>,
		checkpointId?: string
	): IFloatMultiFileProposal {
		const id = `mfp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
		let totalAdditions = 0;
		let totalDeletions = 0;

		const files: IFloatOrchestratedFile[] = changes.map(change => {
			const cleanPath = sanitizeProposalPath(change.path);
			const hunks = computeLineHunks(change.originalContent, change.proposedContent);

			let fileAdd = 0;
			let fileDel = 0;
			for (const h of hunks) {
				fileAdd += h.proposedCount;
				fileDel += h.originalCount;
			}

			totalAdditions += fileAdd;
			totalDeletions += fileDel;

			return {
				path: cleanPath,
				originalContent: change.originalContent,
				proposedContent: change.proposedContent,
				hunks,
				status: 'pending',
				stats: {
					additions: fileAdd,
					deletions: fileDel
				}
			};
		});

		const proposal: IFloatMultiFileProposal = {
			id,
			title,
			summary,
			checkpointId,
			timestamp: Date.now(),
			files,
			status: 'pending',
			stats: {
				totalFiles: files.length,
				totalAdditions,
				totalDeletions
			}
		};

		this._proposals.set(id, proposal);
		return proposal;
	}

	public getProposal(id: string): IFloatMultiFileProposal | undefined {
		return this._proposals.get(id);
	}

	public async acceptFile(
		proposalId: string,
		filePath: string,
		onApplyFile?: (path: string, content: string) => Promise<void>
	): Promise<boolean> {
		const prop = this._proposals.get(proposalId);
		if (!prop) {
			return false;
		}

		const cleanPath = sanitizeProposalPath(filePath);
		const targetFile = prop.files.find(f => f.path === cleanPath);
		if (!targetFile || targetFile.status === 'accepted') {
			return false;
		}

		if (onApplyFile) {
			await onApplyFile(cleanPath, targetFile.proposedContent);
		}

		targetFile.status = 'accepted';
		for (const h of targetFile.hunks) {
			h.status = 'accepted';
		}

		this._updateProposalStatus(prop);
		return true;
	}

	public rejectFile(proposalId: string, filePath: string): boolean {
		const prop = this._proposals.get(proposalId);
		if (!prop) {
			return false;
		}

		const cleanPath = sanitizeProposalPath(filePath);
		const targetFile = prop.files.find(f => f.path === cleanPath);
		if (!targetFile) {
			return false;
		}

		targetFile.status = 'rejected';
		for (const h of targetFile.hunks) {
			h.status = 'rejected';
		}

		this._updateProposalStatus(prop);
		return true;
	}

	public async acceptAll(
		proposalId: string,
		onApplyFile?: (path: string, content: string) => Promise<void>
	): Promise<boolean> {
		const prop = this._proposals.get(proposalId);
		if (!prop) {
			return false;
		}

		for (const file of prop.files) {
			if (file.status !== 'accepted') {
				if (onApplyFile) {
					await onApplyFile(file.path, file.proposedContent);
				}
				file.status = 'accepted';
				for (const h of file.hunks) {
					h.status = 'accepted';
				}
			}
		}

		prop.status = 'accepted';
		return true;
	}

	public rejectAll(proposalId: string): boolean {
		const prop = this._proposals.get(proposalId);
		if (!prop) {
			return false;
		}

		for (const file of prop.files) {
			file.status = 'rejected';
			for (const h of file.hunks) {
				h.status = 'rejected';
			}
		}

		prop.status = 'rejected';
		return true;
	}

	public detectConcurrentConflict(
		proposalId: string,
		currentDiskContents: Record<string, string>
	): { hasConflict: boolean; conflictedFiles: string[] } {
		const prop = this._proposals.get(proposalId);
		if (!prop) {
			return { hasConflict: false, conflictedFiles: [] };
		}

		const conflictedFiles: string[] = [];
		for (const file of prop.files) {
			const current = currentDiskContents[file.path];
			if (current !== undefined && current !== file.originalContent) {
				conflictedFiles.push(file.path);
			}
		}

		return {
			hasConflict: conflictedFiles.length > 0,
			conflictedFiles
		};
	}

	private _updateProposalStatus(prop: IFloatMultiFileProposal): void {
		const allAccepted = prop.files.every(f => f.status === 'accepted');
		const allRejected = prop.files.every(f => f.status === 'rejected');
		const anyAccepted = prop.files.some(f => f.status === 'accepted');

		if (allAccepted) {
			prop.status = 'accepted';
		} else if (allRejected) {
			prop.status = 'rejected';
		} else if (anyAccepted) {
			prop.status = 'partially_accepted';
		} else {
			prop.status = 'pending';
		}
	}
}
