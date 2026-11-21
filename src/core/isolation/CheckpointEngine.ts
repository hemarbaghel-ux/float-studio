/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'node:crypto';
import { IWorkspaceService } from '../../shared/contracts/workspace';

export interface FileSnapshot {
  readonly path: string;
  readonly content: string;
  readonly existed: boolean;
}

export interface HarnessCheckpointRecord {
  readonly id: string;
  readonly timestamp: number;
  readonly description: string;
  readonly snapshots: readonly FileSnapshot[];
}

export interface CheckpointRestoreOutcome {
  readonly checkpointId: string;
  readonly restoredCount: number;
  readonly deletedCount: number;
  readonly chatPreserved: boolean;
}

/**
 * Checkpoint Engine (Independent from git)
 *
 * Captures point-in-time snapshots of files touched by the agent.
 * Restoring a checkpoint rolls back disk files to their pre-execution state
 * while keeping the chat conversation and audit logs intact.
 */
export class CheckpointEngine {
  private checkpoints = new Map<string, HarnessCheckpointRecord>();

  constructor(private readonly workspace: IWorkspaceService) {}

  /**
   * Captures snapshots of target file paths before an agent tool or edit applies.
   */
  public async createCheckpoint(
    description: string,
    targetFilePaths: readonly string[]
  ): Promise<HarnessCheckpointRecord> {
    const snapshots: FileSnapshot[] = [];

    for (const filePath of targetFilePaths) {
      const exists = await this.workspace.fileExists(filePath);
      const content = exists ? await this.workspace.readFile(filePath) : '';
      snapshots.push({ path: filePath, content, existed: exists });
    }

    const id = `chk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const checkpoint: HarnessCheckpointRecord = {
      id,
      timestamp: Date.now(),
      description,
      snapshots
    };

    this.checkpoints.set(id, checkpoint);
    return checkpoint;
  }

  /**
   * Restores touched files to their snapshotted contents.
   * Guarantees that chat history, messages, and user context are preserved (leaves the chat).
   */
  public async restoreCheckpoint(checkpointId: string): Promise<CheckpointRestoreOutcome> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`CHECKPOINT_NOT_FOUND: Checkpoint "${checkpointId}" does not exist.`);
    }

    let restored = 0;
    let deleted = 0;

    for (const snap of checkpoint.snapshots) {
      if (snap.existed) {
        await this.workspace.writeFile(snap.path, snap.content);
        restored++;
      } else {
        const currentlyExists = await this.workspace.fileExists(snap.path);
        if (currentlyExists) {
          await this.workspace.deleteFile(snap.path);
          deleted++;
        }
      }
    }

    return {
      checkpointId,
      restoredCount: restored,
      deletedCount: deleted,
      chatPreserved: true // Explicit invariant: Chat context is untouched
    };
  }

  public getCheckpoint(id: string): HarnessCheckpointRecord | undefined {
    return this.checkpoints.get(id);
  }
}
