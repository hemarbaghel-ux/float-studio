/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'crypto';
import {
  ICheckpointManager,
  ICheckpointRestoreResult,
  ISerializedWorkspaceCheckpoint,
  IWorkspaceCheckpoint,
} from '../../shared/contracts/checkpoints';
import { IWorkspaceService } from '../../shared/contracts/workspace';

/**
 * Workspace Checkpoint Manager (Phase 5 & 9)
 *
 * Captures point-in-time file snapshots of project workspaces before agent tool executions
 * and code proposal applications, providing automatic recovery, deterministic one-click rollback,
 * and durable storage across server sessions and restarts.
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
      targetPaths = allFiles
        .filter(
          f =>
            f.type === 'file' &&
            !f.path.startsWith('.float/') &&
            !f.path.startsWith('.git/') &&
            !f.path.startsWith('node_modules/')
        )
        .map(f => f.path);
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

  /**
   * Serializes a checkpoint into a portable JSON string with an SHA-256 integrity hash.
   */
  exportCheckpoint(checkpointId: string): string | undefined {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) return undefined;

    const filesObj: Record<string, string> = {};
    for (const [p, content] of checkpoint.fileSnapshots.entries()) {
      filesObj[p] = content;
    }

    const serialized: ISerializedWorkspaceCheckpoint = {
      id: checkpoint.id,
      projectId: checkpoint.projectId,
      description: checkpoint.description,
      timestamp: checkpoint.timestamp,
      proposalId: checkpoint.proposalId,
      fileSnapshots: filesObj,
      fileCount: Object.keys(filesObj).length,
      sha256: crypto
        .createHash('sha256')
        .update(JSON.stringify(filesObj), 'utf8')
        .digest('hex'),
    };

    return JSON.stringify(serialized, null, 2);
  }

  /**
   * Imports and validates a previously exported checkpoint.
   */
  importCheckpoint(
    serializedOrObj: string | ISerializedWorkspaceCheckpoint
  ): IWorkspaceCheckpoint {
    const data: ISerializedWorkspaceCheckpoint =
      typeof serializedOrObj === 'string'
        ? (JSON.parse(serializedOrObj) as ISerializedWorkspaceCheckpoint)
        : serializedOrObj;

    if (!data.id || !data.projectId || !data.fileSnapshots) {
      throw new Error('Invalid serialized checkpoint structure');
    }

    if (data.sha256) {
      const computedHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(data.fileSnapshots), 'utf8')
        .digest('hex');
      if (computedHash !== data.sha256) {
        throw new Error('Checkpoint integrity verification failed (SHA-256 mismatch)');
      }
    }

    const fileSnapshots = new Map<string, string>();
    for (const [p, content] of Object.entries(data.fileSnapshots)) {
      fileSnapshots.set(p, content);
    }

    const checkpoint: IWorkspaceCheckpoint = {
      id: data.id,
      projectId: data.projectId,
      description: data.description,
      timestamp: data.timestamp,
      proposalId: data.proposalId,
      fileSnapshots,
    };

    this.checkpoints.set(checkpoint.id, checkpoint);
    return checkpoint;
  }

  /**
   * Persists a checkpoint to the local workspace disk under `.float/checkpoints/${checkpointId}.json`.
   */
  async persistToWorkspaceDisk(checkpointId: string): Promise<string> {
    const exported = this.exportCheckpoint(checkpointId);
    if (!exported) {
      throw new Error(`Checkpoint "${checkpointId}" not found in memory to persist.`);
    }

    const diskPath = `.float/checkpoints/${checkpointId}.json`;
    await this.workspace.writeFile(diskPath, exported);
    return diskPath;
  }

  /**
   * Loads a checkpoint from the local workspace disk under `.float/checkpoints/${checkpointId}.json`.
   */
  async loadFromWorkspaceDisk(checkpointId: string): Promise<IWorkspaceCheckpoint | null> {
    const diskPath = `.float/checkpoints/${checkpointId}.json`;
    const exists = await this.workspace.fileExists(diskPath);
    if (!exists) return null;

    const content = await this.workspace.readFile(diskPath);
    return this.importCheckpoint(content);
  }

  /**
   * Persists the checkpoint to durable cloud storage (Firestore / GCS) via `durableState`.
   */
  async saveToDurableStorage(
    checkpointId: string,
    ownerId: string,
    ttlMs?: number
  ): Promise<{ manifestId: string; backend: string } | null> {
    const exported = this.exportCheckpoint(checkpointId);
    if (!exported) return null;

    const checkpoint = this.checkpoints.get(checkpointId)!;
    const serializedObj: ISerializedWorkspaceCheckpoint = JSON.parse(exported);

    const { saveLargePayloadDurable } = await import('../../server/durableState');
    const manifest = await saveLargePayloadDurable({
      collectionName: 'workspace_checkpoints',
      docId: checkpointId,
      ownerId,
      projectId: checkpoint.projectId,
      payload: serializedObj,
      extraFields: {
        description: checkpoint.description,
        proposalId: checkpoint.proposalId,
        fileCount: serializedObj.fileCount,
      },
      ttlMs,
    });

    return {
      manifestId: manifest.id,
      backend: manifest.storageBackend,
    };
  }

  /**
   * Rehydrates a checkpoint from durable cloud storage (Firestore / GCS) via `durableState`.
   */
  async loadFromDurableStorage(
    checkpointId: string,
    ownerId: string
  ): Promise<IWorkspaceCheckpoint | null> {
    const { loadLargePayloadDurable } = await import('../../server/durableState');
    const result = await loadLargePayloadDurable<ISerializedWorkspaceCheckpoint>({
      collectionName: 'workspace_checkpoints',
      docId: checkpointId,
      ownerId,
    });

    if (!result || !result.payload) return null;
    return this.importCheckpoint(result.payload);
  }
}
