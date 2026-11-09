/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Authoritative Workspace Checkpoint & Rollback Contracts (Phase 5)
 *
 * Defines the canonical abstraction for point-in-time snapshots of workspace files,
 * enabling automatic pre-proposal and pre-command safety points, conflict detection,
 * and deterministic one-click rollback.
 */

export interface IWorkspaceCheckpoint {
  readonly id: string;
  readonly projectId: string;
  readonly description: string;
  readonly timestamp: number;
  readonly proposalId?: string;
  readonly fileSnapshots: ReadonlyMap<string, string>; // relativePath -> content
}

export interface ICheckpointRestoreResult {
  readonly success: boolean;
  readonly checkpointId: string;
  readonly restoredPaths: readonly string[];
  readonly error?: string;
}

export interface ICheckpointManager {
  createCheckpoint(
    projectId: string,
    description: string,
    paths?: readonly string[],
    proposalId?: string
  ): Promise<IWorkspaceCheckpoint>;

  restoreCheckpoint(checkpointId: string): Promise<ICheckpointRestoreResult>;

  getCheckpoint(checkpointId: string): IWorkspaceCheckpoint | undefined;

  listCheckpoints(projectId: string): readonly IWorkspaceCheckpoint[];

  deleteCheckpoint(checkpointId: string): boolean;
}
