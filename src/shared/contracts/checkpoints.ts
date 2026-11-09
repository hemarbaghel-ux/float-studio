/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Authoritative Workspace Checkpoint & Rollback Contracts (Phase 5 & 9)
 *
 * Defines the canonical abstraction for point-in-time snapshots of workspace files,
 * enabling automatic pre-proposal and pre-command safety points, conflict detection,
 * deterministic one-click rollback, and durable cross-session persistence.
 */

export interface IWorkspaceCheckpoint {
  readonly id: string;
  readonly projectId: string;
  readonly description: string;
  readonly timestamp: number;
  readonly proposalId?: string;
  readonly fileSnapshots: ReadonlyMap<string, string>; // relativePath -> content
}

export interface ISerializedWorkspaceCheckpoint {
  readonly id: string;
  readonly projectId: string;
  readonly description: string;
  readonly timestamp: number;
  readonly proposalId?: string;
  readonly fileSnapshots: Record<string, string>;
  readonly fileCount: number;
  readonly sha256?: string;
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

  exportCheckpoint?(checkpointId: string): string | undefined;

  importCheckpoint?(serialized: string | ISerializedWorkspaceCheckpoint): IWorkspaceCheckpoint;

  saveToDurableStorage?(
    checkpointId: string,
    ownerId: string,
    ttlMs?: number
  ): Promise<{ manifestId: string; backend: string } | null>;

  loadFromDurableStorage?(
    checkpointId: string,
    ownerId: string
  ): Promise<IWorkspaceCheckpoint | null>;

  persistToWorkspaceDisk?(checkpointId: string): Promise<string>;

  loadFromWorkspaceDisk?(checkpointId: string): Promise<IWorkspaceCheckpoint | null>;
}
