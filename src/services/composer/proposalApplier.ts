/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
  IProposal,
  IProposalApplicationResult,
  IProposalConflict,
  IProposalFileChange,
  ProposalStatus,
  computeContentHash,
} from '../../shared/contracts/proposals';
import { IWorkspaceService } from '../../shared/contracts/workspace';
import { ICheckpointManager, ICheckpointRestoreResult } from '../../shared/contracts/checkpoints';

export interface ApplyProposalOptions {
  proposal: IProposal;
  approvedPaths?: readonly string[];
  workspace: IWorkspaceService;
  checkpointManager?: ICheckpointManager;
  force?: boolean;
}

export interface RejectProposalOptions {
  proposal: IProposal;
  rejectedPaths?: readonly string[];
}

export interface RollbackProposalOptions {
  checkpointId: string;
  checkpointManager: ICheckpointManager;
}

/**
 * Checks for conflicts between proposal original baseline and current workspace contents.
 */
export async function checkProposalConflicts(
  proposal: IProposal,
  workspace: IWorkspaceService
): Promise<IProposalConflict[]> {
  const conflicts: IProposalConflict[] = [];

  for (const change of proposal.files) {
    if (change.status === 'applied' || change.status === 'rejected') {
      continue;
    }

    try {
      const exists = await workspace.fileExists(change.path);
      const currentContent = exists ? await workspace.readFile(change.path) : '';
      const actualHash = exists ? computeContentHash(currentContent) : '';
      const expectedHash = change.originalHash || '';

      if (change.operation === 'create' && exists) {
        conflicts.push({
          path: change.path,
          expectedHash: '',
          actualHash,
          reason: `File "${change.path}" was created externally in the workspace while proposal was pending.`,
        });
      } else if (change.operation === 'modify' || change.operation === 'delete') {
        if (!exists && change.originalHash) {
          conflicts.push({
            path: change.path,
            expectedHash,
            actualHash: '',
            reason: `File "${change.path}" was deleted externally in the workspace while proposal was pending.`,
          });
        } else if (exists && actualHash !== expectedHash) {
          conflicts.push({
            path: change.path,
            expectedHash,
            actualHash,
            reason: `File "${change.path}" was modified in the workspace since proposal generation.`,
          });
        }
      }
    } catch (err: any) {
      conflicts.push({
        path: change.path,
        expectedHash: change.originalHash || '',
        actualHash: 'error',
        reason: `Failed to inspect workspace file: ${err?.message || err}`,
      });
    }
  }

  return conflicts;
}

/**
 * Applies approved files from a proposal atomically with automatic pre-apply safety checkpoint.
 */
export async function applyProposal(options: ApplyProposalOptions): Promise<IProposalApplicationResult> {
  const { proposal, approvedPaths, workspace, checkpointManager, force = false } = options;

  if (proposal.status === 'rejected' || proposal.status === 'failed') {
    return {
      success: false,
      proposalId: proposal.id,
      status: proposal.status,
      appliedFiles: [],
      error: `Cannot apply proposal in "${proposal.status}" state.`,
    };
  }

  const targetPaths = approvedPaths && approvedPaths.length > 0
    ? proposal.files.filter(f => approvedPaths.includes(f.path) && f.status !== 'applied').map(f => f.path)
    : proposal.files.filter(f => f.status !== 'applied').map(f => f.path);

  if (targetPaths.length === 0) {
    return {
      success: false,
      proposalId: proposal.id,
      status: proposal.status,
      appliedFiles: [],
      error: 'No pending changes selected for application.',
    };
  }

  // 1. Conflict detection
  const conflicts = await checkProposalConflicts(proposal, workspace);
  const relevantConflicts = conflicts.filter(c => targetPaths.includes(c.path));
  if (relevantConflicts.length > 0 && !force) {
    return {
      success: false,
      proposalId: proposal.id,
      status: 'stale',
      appliedFiles: [],
      conflicts: relevantConflicts,
      error: `Detected ${relevantConflicts.length} conflict(s). Underlying workspace files were modified after proposal generation.`,
    };
  }

  // 2. Automatic safety checkpoint before mutating workspace
  let checkpointId: string | undefined;
  if (checkpointManager) {
    const chk = await checkpointManager.createCheckpoint(
      proposal.projectId,
      `Pre-apply snapshot for proposal: ${proposal.title} (${proposal.id})`,
      targetPaths,
      proposal.id
    );
    checkpointId = chk.id;
  }

  // 3. Atomically write approved changes to workspace disk
  const successfullyApplied: string[] = [];
  try {
    for (const change of proposal.files) {
      if (!targetPaths.includes(change.path)) continue;

      if (change.operation === 'delete') {
        const exists = await workspace.fileExists(change.path);
        if (exists) {
          await workspace.deleteFile(change.path);
        }
      } else {
        await workspace.writeFile(change.path, change.proposedContent ?? '');
      }
      successfullyApplied.push(change.path);
    }
  } catch (err: any) {
    // If failure occurs mid-write, rollback using checkpoint if available
    if (checkpointId && checkpointManager) {
      await checkpointManager.restoreCheckpoint(checkpointId);
    }
    return {
      success: false,
      proposalId: proposal.id,
      status: 'failed',
      appliedFiles: successfullyApplied,
      checkpointId,
      error: `Failed applying proposal changes: ${err?.message || err}. Workspace rolled back.`,
    };
  }

  // 4. Update file statuses and determine overall proposal status
  const updatedChanges: IProposalFileChange[] = proposal.files.map(change => {
    if (successfullyApplied.includes(change.path)) {
      return { ...change, status: 'applied' as const };
    }
    return change;
  });

  const allApplied = updatedChanges.every(c => c.status === 'applied');
  const allResolved = updatedChanges.every(c => c.status === 'applied' || c.status === 'rejected');
  const newStatus: ProposalStatus = allApplied
    ? 'applied'
    : allResolved
      ? 'partially_applied'
      : 'partially_applied';

  if (checkpointId && checkpointManager?.persistToWorkspaceDisk) {
    await checkpointManager.persistToWorkspaceDisk(checkpointId).catch(() => undefined);
  }

  return {
    success: true,
    proposalId: proposal.id,
    status: newStatus,
    appliedFiles: successfullyApplied,
    checkpointId,
  };
}

/**
 * Rejects a proposal or specific files without modifying real workspace files.
 */
export function rejectProposal(options: RejectProposalOptions): IProposal {
  const { proposal, rejectedPaths } = options;

  const updatedFiles: IProposalFileChange[] = proposal.files.map(change => {
    if (!rejectedPaths || rejectedPaths.includes(change.path)) {
      if (change.status !== 'applied') {
        return { ...change, status: 'rejected' as const };
      }
    }
    return change;
  });

  const allRejected = updatedFiles.every(c => c.status === 'rejected');
  const anyApplied = updatedFiles.some(c => c.status === 'applied');
  const newStatus: ProposalStatus = allRejected
    ? 'rejected'
    : anyApplied
      ? 'partially_applied'
      : 'pending_review';

  return {
    ...proposal,
    status: newStatus,
    files: updatedFiles,
    updatedAt: Date.now(),
  };
}

/**
 * Restores workspace files to pre-apply state from safety checkpoint.
 */
export async function rollbackProposal(options: RollbackProposalOptions): Promise<ICheckpointRestoreResult> {
  const { checkpointId, checkpointManager } = options;
  return checkpointManager.restoreCheckpoint(checkpointId);
}
