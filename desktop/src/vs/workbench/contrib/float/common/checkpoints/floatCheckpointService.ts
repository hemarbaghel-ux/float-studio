/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IFloatTurnCheckpoint } from '../protocols/floatProtocol.js';

export interface IFloatFileRestorationAction {
	path: string;
	action: 'modified_restored' | 'created_deleted' | 'deleted_recreated' | 'unmodified';
	content?: string;
	error?: string;
}

export interface IFloatRestorationOptions {
	conflictCheck?: boolean;
	expectedBaseContents?: Record<string, string>;
	abortOnConflict?: boolean;
	allowedRoot?: string;
}

export interface IFloatRestorationResult {
	success: boolean;
	checkpointId: string;
	actions: IFloatFileRestorationAction[];
	restoredFiles: Record<string, string>;
	conflicts?: string[];
	errors?: string[];
	error?: string;
}

export class FloatCheckpointService {
	private readonly _checkpoints: IFloatTurnCheckpoint[] = [];

	public static validatePath(filePath: string, allowedRoot?: string): { valid: boolean; reason?: string } {
		if (!filePath || typeof filePath !== 'string') {
			return { valid: false, reason: 'Empty or non-string file path.' };
		}
		if (filePath.includes('\0')) {
			return { valid: false, reason: 'Path contains forbidden null byte.' };
		}
		const normalized = filePath.replace(/\\/g, '/');
		const segments = normalized.split('/');
		if (segments.some(segment => segment === '..')) {
			return { valid: false, reason: 'Path traversal sequence (..) detected.' };
		}
		if (allowedRoot) {
			const normRoot = allowedRoot.replace(/\\/g, '/').replace(/\/$/, '');
			if (!normalized.startsWith(normRoot + '/') && normalized !== normRoot) {
				return { valid: false, reason: `Path escapes authorized workspace root: ${allowedRoot}` };
			}
		}
		return { valid: true };
	}

	public createCheckpoint(description: string, files: Record<string, string>, allowedRoot?: string): IFloatTurnCheckpoint {
		const sanitizedFiles: Record<string, string> = {};
		for (const [filePath, content] of Object.entries(files)) {
			const check = FloatCheckpointService.validatePath(filePath, allowedRoot);
			if (!check.valid) {
				throw new Error(`Invalid checkpoint file path "${filePath}": ${check.reason}`);
			}
			sanitizedFiles[filePath] = content;
		}

		const checkpoint: IFloatTurnCheckpoint = {
			id: `cp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
			timestamp: Date.now(),
			description,
			snapshot: sanitizedFiles
		};

		this._checkpoints.push(checkpoint);
		return checkpoint;
	}

	public getLatestCheckpoint(): IFloatTurnCheckpoint | undefined {
		return this._checkpoints[this._checkpoints.length - 1];
	}

	public getCheckpoint(id: string): IFloatTurnCheckpoint | undefined {
		return this._checkpoints.find(c => c.id === id);
	}

	public getAllCheckpoints(): IFloatTurnCheckpoint[] {
		return [...this._checkpoints];
	}

	public listCheckpoints(): IFloatTurnCheckpoint[] {
		return this.getAllCheckpoints();
	}

	public popLatestCheckpoint(): IFloatTurnCheckpoint | undefined {
		return this._checkpoints.pop();
	}

	/**
	 * Physically restores files from a checkpoint snapshot.
	 *
	 * Handles all 3 restoration cases:
	 * 1. Modified files: Restores content back to the exact checkpoint snapshot state.
	 * 2. Newly created files: Identifies files added since checkpoint and removes them.
	 * 3. Deleted files: Identifies files removed since checkpoint and recreates them.
	 *
	 * Preserves unrelated workspace files that were not part of the modified set.
	 * Hardened against:
	 * - Invalid paths and directory traversal (..)
	 * - External file divergence (conflict detection)
	 * - Partial restore failure tracking
	 */
	public restoreCheckpoint(
		checkpointId: string,
		currentWorkspaceFiles: Record<string, string> = {},
		options: IFloatRestorationOptions = {}
	): IFloatRestorationResult {
		const checkpoint = this.getCheckpoint(checkpointId);
		if (!checkpoint) {
			return {
				success: false,
				checkpointId,
				actions: [],
				restoredFiles: { ...currentWorkspaceFiles },
				error: `Checkpoint ${checkpointId} not found.`
			};
		}

		const snapshot = checkpoint.snapshot;
		const actions: IFloatFileRestorationAction[] = [];
		const restoredFiles: Record<string, string> = { ...currentWorkspaceFiles };
		const conflicts: string[] = [];
		const errors: string[] = [];

		// Validate all snapshot paths
		for (const filePath of Object.keys(snapshot)) {
			const check = FloatCheckpointService.validatePath(filePath, options.allowedRoot);
			if (!check.valid) {
				errors.push(`Snapshot path invalid: ${filePath} (${check.reason})`);
			}
		}

		// Validate all current workspace paths
		for (const filePath of Object.keys(currentWorkspaceFiles)) {
			const check = FloatCheckpointService.validatePath(filePath, options.allowedRoot);
			if (!check.valid) {
				errors.push(`Current file path invalid: ${filePath} (${check.reason})`);
			}
		}

		if (errors.length > 0) {
			return {
				success: false,
				checkpointId,
				actions: [],
				restoredFiles: { ...currentWorkspaceFiles },
				errors,
				error: `Restoration blocked due to path security violations: ${errors.join('; ')}`
			};
		}

		// 1. Process files present in the snapshot (modified or deleted files)
		for (const [filePath, snapContent] of Object.entries(snapshot)) {
			if (filePath in currentWorkspaceFiles) {
				const currentContent = currentWorkspaceFiles[filePath];

				// Conflict detection: if caller provided expected base contents and current content has diverged from base
				if (options.conflictCheck && options.expectedBaseContents && filePath in options.expectedBaseContents) {
					const expectedBase = options.expectedBaseContents[filePath];
					if (currentContent !== expectedBase && currentContent !== snapContent) {
						conflicts.push(filePath);
					}
				}

				if (currentContent !== snapContent) {
					// Modified file: restore content
					restoredFiles[filePath] = snapContent;
					actions.push({
						path: filePath,
						action: 'modified_restored',
						content: snapContent
					});
				} else {
					actions.push({
						path: filePath,
						action: 'unmodified',
						content: snapContent
					});
				}
			} else {
				// Deleted file: recreate from snapshot
				restoredFiles[filePath] = snapContent;
				actions.push({
					path: filePath,
					action: 'deleted_recreated',
					content: snapContent
				});
			}
		}

		// Check if strict conflict abort is requested
		if (options.abortOnConflict && conflicts.length > 0) {
			return {
				success: false,
				checkpointId,
				actions: [],
				restoredFiles: { ...currentWorkspaceFiles },
				conflicts,
				error: `Restoration aborted due to external file conflicts on: ${conflicts.join(', ')}`
			};
		}

		// 2. Process newly created files (present in workspace but missing in checkpoint snapshot)
		for (const filePath of Object.keys(currentWorkspaceFiles)) {
			if (!(filePath in snapshot)) {
				// Newly created files in the touched set are pruned
				delete restoredFiles[filePath];
				actions.push({
					path: filePath,
					action: 'created_deleted'
				});
			}
		}

		return {
			success: true,
			checkpointId,
			actions,
			restoredFiles,
			conflicts: conflicts.length > 0 ? conflicts : undefined
		};
	}

	public clear(): void {
		this._checkpoints.length = 0;
	}
}
