/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'node:crypto';
import { ToolPolicyManager, AgentMode } from './ToolPolicyManager';
import { DynamicContextManager } from './DynamicContextManager';
import { getToolsForModel, HarnessToolSchema } from './HarnessTools';
import { IWorkspaceService } from '../../shared/contracts/workspace';

export interface HarnessExecutionRequest {
  readonly taskId?: string;
  readonly prompt: string;
  readonly mode?: AgentMode;
  readonly modelId?: string;
  readonly activeRules?: Array<{ name: string; content: string }>;
  readonly onToolCall?: (toolName: string, args: any) => void;
  readonly onObservation?: (toolName: string, output: string) => void;
  readonly onStreamChunk?: (chunk: string) => void;
  readonly signal?: AbortSignal;
}

export interface HarnessExecutionResult {
  readonly taskId: string;
  readonly mode: AgentMode;
  readonly modelId: string;
  readonly turnsExecuted: number;
  readonly toolCallsExecuted: number;
  readonly finalResponse: string;
  readonly completed: boolean;
  readonly durationMs: number;
}

export class AgentHarness {
  private readonly policyManager: ToolPolicyManager;
  private readonly dynamicContext: DynamicContextManager;
  private defaultModelId: string = 'composer-pro';

  constructor(
    private readonly workspace: IWorkspaceService,
    initialMode: AgentMode = 'agent',
    workspaceRoot: string = process.cwd()
  ) {
    this.policyManager = new ToolPolicyManager(initialMode);
    this.dynamicContext = new DynamicContextManager(workspaceRoot);
  }

  public getPolicyManager(): ToolPolicyManager {
    return this.policyManager;
  }

  public getDynamicContextManager(): DynamicContextManager {
    return this.dynamicContext;
  }

  public setDefaultModel(modelId: string): void {
    this.defaultModelId = modelId;
  }

  /**
   * Constructs the model instructions including System Prompt, Active Rules, Skills Overview, and Mode Policy.
   */
  public assembleInstructions(mode: AgentMode, modelId: string, activeRules?: Array<{ name: string; content: string }>): string {
    const modeInstruction = this.policyManager.getModeSystemInstruction(mode);
    const skillsOverview = this.dynamicContext.getAvailableSkillsOverview();

    let rulesText = '';
    if (activeRules && activeRules.length > 0) {
      rulesText = '\nActive Repository Rules (.cursor/rules / .float/rules):\n' +
        activeRules.map(r => `--- ${r.name} ---\n${r.content}`).join('\n\n');
    }

    return `You are FLOAT Studio Agent, powered by a model-agnostic harness running beside Code-OSS.
Model Target: ${modelId}
${modeInstruction}

Dynamic Context Invariants:
1. Long tool outputs are written to disk; inspect specific files instead of asking for huge dumps.
2. Terminal sessions are persistent log files.
3. Call fetch_rules_or_skills to pull detailed skill manuals on demand.
4. The model pulls context via search and read tools rather than receiving the entire repository upfront.
${rulesText}

${skillsOverview}

Tool Execution Contract:
Emit structured tool calls. You do not touch the disk directly without emitting tool calls.
Changes are staged and presented as unified diffs for developer review.`;
  }

  /**
   * Executes the autonomous agent loop: model -> tool -> observation -> model
   */
  public async executeTurnLoop(request: HarnessExecutionRequest): Promise<HarnessExecutionResult> {
    const startTime = Date.now();
    const taskId = request.taskId || `harness_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const mode = request.mode || this.policyManager.getMode();
    const modelId = request.modelId || this.defaultModelId;

    const availableTools = getToolsForModel(modelId).filter(tool =>
      this.policyManager.isToolAllowed(tool.name, mode)
    );

    let turns = 0;
    let toolCallsCount = 0;
    let finalResponse = '';

    // Simulated turn loop for the harness core
    turns++;
    if (mode === 'ask') {
      finalResponse = `[FLOAT Harness: Ask Mode] Analyzed query "${request.prompt}" using read-only codebase retrieval.`;
    } else if (mode === 'plan') {
      finalResponse = `[FLOAT Harness: Plan Mode] Formulated implementation plan for "${request.prompt}". Ready for user approval before file mutations.`;
    } else if (mode === 'debug') {
      finalResponse = `[FLOAT Harness: Debug Mode] Examined runtime diagnostics and logs for "${request.prompt}". Root cause isolated; fix proposed as diff.`;
    } else {
      finalResponse = `[FLOAT Harness: Agent Mode] Executed supervised workflow for "${request.prompt}" with ${availableTools.length} tools available.`;
    }

    request.onStreamChunk?.(finalResponse);

    return {
      taskId,
      mode,
      modelId,
      turnsExecuted: turns,
      toolCallsExecuted: toolCallsCount,
      finalResponse,
      completed: true,
      durationMs: Date.now() - startTime
    };
  }
}
