/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { AgentHarness, HarnessExecutionResult } from '../harness/AgentHarness';
import { AgentMode } from '../harness/ToolPolicyManager';
import { IWorkspaceService } from '../../shared/contracts/workspace';

export interface CliExecutionOptions {
  readonly prompt: string;
  readonly mode?: AgentMode;
  readonly modelId?: string;
  readonly outputJson?: boolean;
  readonly autoApproveDiffs?: boolean;
  readonly timeoutMs?: number;
}

/**
 * CLI Agent Surface (Runs in user shell or CI environments)
 *
 * Provides headless, scripted execution of FLOAT agent workflows:
 * - Automated pull request reviews
 * - Headless test diagnostics & repair loops
 * - Phased task planning and execution
 */
export class CliAgentSurface {
  private readonly harness: AgentHarness;

  constructor(private readonly workspace: IWorkspaceService, harness?: AgentHarness) {
    this.harness = harness || new AgentHarness(workspace, 'agent');
  }

  public async runHeadless(options: CliExecutionOptions): Promise<HarnessExecutionResult> {
    const result = await this.harness.executeTurnLoop({
      prompt: options.prompt,
      mode: options.mode || 'agent',
      modelId: options.modelId
    });

    return result;
  }
}
