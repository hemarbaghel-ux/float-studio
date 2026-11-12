/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	FloatMultiFileDiffOrchestrator
} from './floatMultiFileDiffOrchestrator.js';
import { IComposerAgentGoal } from './floatComposerAgent.js';

export interface IMultiDiffCardState {
	proposalId: string;
	title: string;
	summary: string;
	totalFiles: number;
	additions: number;
	deletions: number;
	files: Array<{
		path: string;
		status: 'pending' | 'accepted' | 'rejected' | 'conflict';
		additions: number;
		deletions: number;
		hunkCount: number;
		hunks: Array<{
			index: number;
			status: 'pending' | 'accepted' | 'rejected';
			originalStart: number;
			proposedStart: number;
		}>;
	}>;
	overallStatus: 'pending' | 'partially_accepted' | 'accepted' | 'rejected' | 'conflict';
}

/**
 * Controller for multi-file diff cards and terminal PTY self-healing workflows.
 */
export class FloatMultiDiffController {
	constructor(
		private readonly _orchestrator: FloatMultiFileDiffOrchestrator
	) {}

	public get orchestrator(): FloatMultiFileDiffOrchestrator {
		return this._orchestrator;
	}

	/**
	 * Returns snapshot of all diff cards formatted for UI rendering
	 */
	public getCardState(proposalId: string): IMultiDiffCardState | undefined {
		const prop = this._orchestrator.getProposal(proposalId);
		if (!prop) return undefined;

		return {
			proposalId: prop.id,
			title: prop.title,
			summary: prop.summary,
			totalFiles: prop.files.length,
			additions: prop.stats.totalAdditions,
			deletions: prop.stats.totalDeletions,
			overallStatus: prop.status,
			files: prop.files.map(f => ({
				path: f.path,
				status: f.status,
				additions: f.stats.additions,
				deletions: f.stats.deletions,
				hunkCount: f.hunks.length,
				hunks: f.hunks.map(h => ({
					index: h.index,
					status: h.status,
					originalStart: h.originalStart,
					proposedStart: h.proposedStart
				}))
			}))
		};
	}

	/**
	 * Accepts an individual hunk within a specific file
	 */
	public acceptHunk(proposalId: string, filePath: string, hunkIndex: number): boolean {
		const prop = this._orchestrator.getProposal(proposalId);
		const file = prop?.files.find(f => f.path === filePath);
		const hunk = file?.hunks.find(h => h.index === hunkIndex);
		if (hunk) {
			hunk.status = 'accepted';
			return true;
		}
		return false;
	}

	/**
	 * Rejects an individual hunk within a specific file
	 */
	public rejectHunk(proposalId: string, filePath: string, hunkIndex: number): boolean {
		const prop = this._orchestrator.getProposal(proposalId);
		const file = prop?.files.find(f => f.path === filePath);
		const hunk = file?.hunks.find(h => h.index === hunkIndex);
		if (hunk) {
			hunk.status = 'rejected';
			return true;
		}
		return false;
	}

	/**
	 * Accepts a single file within a multi-file proposal
	 */
	public async acceptFile(
		proposalId: string,
		filePath: string,
		onApplyFile: (path: string, content: string) => Promise<void>
	): Promise<boolean> {
		return await this._orchestrator.acceptFile(proposalId, filePath, onApplyFile);
	}

	/**
	 * Rejects a single file within a multi-file proposal
	 */
	public rejectFile(proposalId: string, filePath: string): boolean {
		return this._orchestrator.rejectFile(proposalId, filePath);
	}

	/**
	 * Atomically commits all files in the proposal with automatic rollback on failure
	 */
	public async commitTransactional(
		proposalId: string,
		onApplyFile: (path: string, content: string) => Promise<void>,
		onDeleteFile?: (path: string) => Promise<void>,
		currentDiskContents?: Record<string, string>
	): Promise<ITransactionCommitResult> {
		return await this._orchestrator.acceptAll(
			proposalId,
			onApplyFile,
			currentDiskContents ? ((p: string) => currentDiskContents[p]) : undefined,
			true,
			onDeleteFile
		);
	}

	/**
	 * Builds an autonomous Composer repair goal from a failed terminal PTY execution
	 */
	public buildTerminalErrorRepairGoal(
		terminalTitle: string,
		exitCode: number,
		terminalOutput: string,
		activeFilePath?: string
	): IComposerAgentGoal {
		// Clean and truncate terminal output to fit high-value diagnostics
		const lines = terminalOutput.split(/\r?\n/).slice(-50).join('\n');

		const prompt = [
			`Fix terminal execution failure from "${terminalTitle}" (Exit Code: ${exitCode}).`,
			'',
			'Error details and logs:',
			'```',
			lines,
			'```',
			'',
			'Diagnose the root cause across workspace files, propose fixes, and verify using shadow validation.'
		].join('\n');

		return {
			prompt,
			maxSteps: 8,
			activeFilePath,
			enableShadowValidation: true,
			maxSpeculativeRepairs: 3,
			isolateWorkspaceMutations: true
		};
	}
}
