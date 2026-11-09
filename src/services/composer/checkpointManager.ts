/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'crypto';
import {
  ICheckpointManager,
  ICheckpointRestoreResult,
  IWorkspaceCheckpoint,
} from '../../shared/contracts/checkpoints';
import { IWorkspaceService } from '../../shared/contracts/workspace';

/**
 * Workspace Checkpoint Manager (Phase 5)
 *
 * Captures point-in-time file snapshots of project workspaces before agent tool executions
 * and code proposal applications, providing automatic recovery and deterministic one-click rollback.
 */
export class WorkspaceCheckpointManager implements ICheckpointManager {
  private readonly checkpoints: Map<string, IWorkspaceCheckpoint> = new Map();

  constructor(private readonly workspace: IWorkspaceService) {}

  async createCheckpoint(
    projectId: string,
    description: string,
    paths?: readonly string[],
    proposalId?: string
  ): Promise<IWorkspaceCheckpoint> {
    const fileSnapshots = new Map<string, string>();

    let targetPaths: string[] = [];
    if (paths && paths.length > 0) {
      targetPaths = [...paths];
    } else {
      const allFiles = await this.workspace.listFiles({ recursive: true });
      targetPaths = allFiles.filter(f => f.type === 'file').map(f => f.path);
    }

    for (const relPath of targetPaths) {
      try {
        const exists = await this.workspace.fileExists(relPath);
        if (exists) {
          const content = await this.workspace.readFile(relPath);
          fileSnapshots.set(relPath, content);
        } else {
          // Record absence so restore can remove newly created files
          fileSnapshots.set(relPath, '__FLOAT_FILE_DELETED__');
        }
      } catch {
        // Skip unreadable files safely
      }
    }

    const checkpointId = `chk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const checkpoint: IWorkspaceCheckpoint = {
      id: checkpointId,
      projectId,
      description,
      timestamp: Date.now(),
      proposalId,
      fileSnapshots,
    };

    this.checkpoints.set(checkpointId, checkpoint);
    return checkpoint;
  }

  async restoreCheckpoint(checkpointId: string): Promise<ICheckpointRestoreResult> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return {
        success: false,
        checkpointId,
        restoredPaths: [],
        error: `Checkpoint "${checkpointId}" not found.`,
      };
    }

    const restoredPaths: string[] = [];
    try {
      for (const [relPath, content] of checkpoint.fileSnapshots.entries()) {
        if (content === '__FLOAT_FILE_DELETED__') {
          const exists = await this.workspace.fileExists(relPath);
          if (exists) {
            await this.workspace.deleteFile(relPath);
            restoredPaths.push(relPath);
          }
        } else {
          await this.workspace.writeFile(relPath, content);
          restoredPaths.push(relPath);
        }
      }

      return {
        success: true,
        checkpointId,
        restoredPaths,
      };
    } catch (err: any) {
      return {
        success: false,
        checkpointId,
        restoredPaths,
        error: err?.message || String(err),
      };
    }
  }

  getCheckpoint(checkpointId: string): IWorkspaceCheckpoint | undefined {
    return this.checkpoints.get(checkpointId);
  }

  listCheckpoints(projectId: string): readonly IWorkspaceCheckpoint[] {
    return Array.from(this.checkpoints.values())
      .filter(c => c.projectId === projectId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  deleteCheckpoint(checkpointId: string): boolean {
    return this.checkpoints.delete(checkpointId);
  }
}
