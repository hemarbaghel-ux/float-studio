/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'node:crypto';
import { AgentHarness } from '../harness/AgentHarness';
import { IWorkspaceService } from '../../shared/contracts/workspace';

export type AgentExecutionEnvironment = 'local' | 'worktree' | 'cloud' | 'ssh';

export interface ManagedAgentInstance {
  readonly id: string;
  readonly name: string;
  readonly environment: AgentExecutionEnvironment;
  readonly worktreePath?: string;
  readonly status: 'idle' | 'running' | 'completed' | 'failed' | 'paused';
  readonly currentTask?: string;
  readonly startedAt: number;
}

/**
 * Agents Window Surface (Orchestrates many agents at once)
 *
 * Runs concurrent agents across:
 * - Local filesystem
 * - Ephemeral Git worktrees
 * - Cloud VMs
 * - Remote SSH targets
 */
export class AgentsWindowSurface {
  private readonly instances = new Map<string, ManagedAgentInstance>();

  constructor(private readonly workspace: IWorkspaceService) {}

  public spawnAgent(
    name: string,
    environment: AgentExecutionEnvironment = 'worktree',
    initialTask?: string
  ): ManagedAgentInstance {
    const id = `agent_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const instance: ManagedAgentInstance = {
      id,
      name,
      environment,
      worktreePath: environment === 'worktree' ? `.float/worktrees/${id}` : undefined,
      status: initialTask ? 'running' : 'idle',
      currentTask: initialTask,
      startedAt: Date.now()
    };

    this.instances.set(id, instance);
    return instance;
  }

  public listAgents(): ManagedAgentInstance[] {
    return Array.from(this.instances.values());
  }

  public getAgent(id: string): ManagedAgentInstance | undefined {
    return this.instances.get(id);
  }

  public stopAgent(id: string): boolean {
    const agent = this.instances.get(id);
    if (!agent) return false;

    this.instances.set(id, {
      ...agent,
      status: 'completed'
    });
    return true;
  }
}
