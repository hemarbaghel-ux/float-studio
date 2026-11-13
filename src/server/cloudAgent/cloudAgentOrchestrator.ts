/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'node:crypto';
import { IProposal } from '../../shared/contracts/proposals';
import { validateSafeWorkspacePath } from '../../shared/contracts/workspace';

export interface CloudAgentSubtaskSpec {
  readonly subtaskId: string;
  readonly title: string;
  readonly role: 'planner' | 'implementer' | 'verifier' | 'reviewer';
  readonly ownedPaths: readonly string[];
  readonly dependsOn?: readonly string[];
}

export interface CloudAgentRunRecord {
  readonly runId: string;
  readonly userId: string;
  readonly projectId: string;
  readonly goal: string;
  readonly worktreeId: string;
  status: 'queued' | 'running' | 'conflict_blocked' | 'proposal_ready' | 'completed' | 'cancelled' | 'failed';
  readonly subtasks: readonly CloudAgentSubtaskSpec[];
  readonly fileOwnershipConflicts: ReadonlyArray<{ path: string; subtaskA: string; subtaskB: string }>;
  readonly logs: string[];
  readonly mergedProposal?: IProposal;
  readonly createdAt: number;
  updatedAt: number;
}

export class CloudAgentOrchestrator {
  private readonly runs = new Map<string, CloudAgentRunRecord>();

  /**
   * Detects overlapping file ownership across concurrent subtasks before execution
   * so two parallel agents never clobber the same file without reconciliation.
   */
  public detectOwnershipConflicts(
    subtasks: readonly CloudAgentSubtaskSpec[]
  ): Array<{ path: string; subtaskA: string; subtaskB: string }> {
    const conflicts: Array<{ path: string; subtaskA: string; subtaskB: string }> = [];
    const ownerByPath = new Map<string, string>();
    const dependsMap = new Map<string, Set<string>>();

    for (const st of subtasks) {
      dependsMap.set(st.subtaskId, new Set(st.dependsOn || []));
    }

    const areOrdered = (a: string, b: string): boolean => {
      return Boolean(dependsMap.get(a)?.has(b) || dependsMap.get(b)?.has(a));
    };

    for (const st of subtasks) {
      for (const rawPath of st.ownedPaths) {
        const normPath = validateSafeWorkspacePath(rawPath);
        const existingOwner = ownerByPath.get(normPath);
        if (existingOwner && existingOwner !== st.subtaskId && !areOrdered(existingOwner, st.subtaskId)) {
          conflicts.push({
            path: normPath,
            subtaskA: existingOwner,
            subtaskB: st.subtaskId,
          });
        } else {
          ownerByPath.set(normPath, st.subtaskId);
        }
      }
    }
    return conflicts;
  }

  public startRun(params: {
    userId: string;
    projectId: string;
    goal: string;
    subtasks: readonly CloudAgentSubtaskSpec[];
    proposalsBySubtask?: Readonly<Record<string, IProposal>>;
  }): CloudAgentRunRecord {
    const runId = `cloudrun_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const worktreeId = `wt_${params.projectId}_${crypto.randomBytes(3).toString('hex')}`;
    const conflicts = this.detectOwnershipConflicts(params.subtasks);
    const logs: string[] = [
      `[${new Date().toISOString()}] Initialized isolated worktree ${worktreeId} for project ${params.projectId}`,
    ];

    if (conflicts.length > 0) {
      logs.push(
        `[${new Date().toISOString()}] Blocked parallel execution: file ownership conflict on ${conflicts
          .map(c => `${c.path} (${c.subtaskA} vs ${c.subtaskB})`)
          .join(', ')}`
      );
      const blockedRecord: CloudAgentRunRecord = {
        runId,
        userId: params.userId,
        projectId: params.projectId,
        goal: params.goal,
        worktreeId,
        status: 'conflict_blocked',
        subtasks: params.subtasks,
        fileOwnershipConflicts: conflicts,
        logs,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.runs.set(runId, blockedRecord);
      return blockedRecord;
    }

    const mergedFiles: IProposal['files'] = [];
    if (params.proposalsBySubtask) {
      for (const st of params.subtasks) {
        const subProp = params.proposalsBySubtask[st.subtaskId];
        if (subProp) {
          logs.push(`[${new Date().toISOString()}] Subtask ${st.subtaskId} (${st.role}) produced ${subProp.files.length} file diff(s)`);
          for (const f of subProp.files) {
            mergedFiles.push(f);
          }
        }
      }
    }

    const mergedProposal: IProposal | undefined =
      mergedFiles.length > 0
        ? {
            id: `prop_cloud_${crypto.randomBytes(4).toString('hex')}`,
            title: `Cloud Agent: ${params.goal.slice(0, 80)}`,
            explanation: `Synthesized from ${params.subtasks.length} isolated subtask(s) in worktree ${worktreeId}.`,
            files: mergedFiles,
            status: 'pending',
            createdAt: Date.now(),
          }
        : undefined;

    const record: CloudAgentRunRecord = {
      runId,
      userId: params.userId,
      projectId: params.projectId,
      goal: params.goal,
      worktreeId,
      status: mergedProposal ? 'proposal_ready' : 'completed',
      subtasks: params.subtasks,
      fileOwnershipConflicts: [],
      logs,
      mergedProposal,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.runs.set(runId, record);
    return record;
  }

  public getRun(runId: string, userId: string): CloudAgentRunRecord | undefined {
    const rec = this.runs.get(runId);
    if (!rec || rec.userId !== userId) return undefined;
    return rec;
  }

  public cancelRun(runId: string, userId: string): CloudAgentRunRecord | undefined {
    const rec = this.runs.get(runId);
    if (!rec || rec.userId !== userId) return undefined;
    rec.status = 'cancelled';
    rec.updatedAt = Date.now();
    rec.logs.push(`[${new Date().toISOString()}] Run cancelled by user ${userId}`);
    return rec;
  }
}

export const defaultCloudAgentOrchestrator = new CloudAgentOrchestrator();
