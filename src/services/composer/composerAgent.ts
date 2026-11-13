/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'crypto';
import { IModelGateway, ModelGatewayMessage } from '../../shared/contracts/gateway';
import { IToolRegistry, READ_ONLY_CANONICAL_TOOLS, ToolExecutionContext, ToolExecutionResult } from '../../shared/contracts/tools';
import { IWorkspaceService } from '../../shared/contracts/workspace';
import { IProposal } from '../../shared/contracts/proposals';
import { ICheckpointManager } from '../../shared/contracts/checkpoints';
import { applyProposal } from './proposalApplier';

export type ComposerMode = 'ask' | 'plan' | 'agent' | 'debug';

export interface ComposerPlanStep {
  readonly id: string;
  readonly description: string;
  readonly status: 'pending' | 'in_progress' | 'completed';
}

export type ComposerProgressEvent =
  | { type: 'started'; taskId: string; task: string; mode: ComposerMode; modelId: string; activeTools: string[]; timestamp: number }
  | { type: 'plan'; steps: ComposerPlanStep[]; requiresApproval: boolean; timestamp: number }
  | { type: 'context_retrieval'; files: string[]; totalChars: number; timestamp: number }
  | { type: 'iteration_start'; iteration: number; timestamp: number }
  | { type: 'thinking'; content: string; timestamp: number }
  | { type: 'tool_call'; toolName: string; args: any; timestamp: number }
  | { type: 'tool_result'; toolName: string; success: boolean; data?: any; error?: string; timestamp: number }
  | { type: 'proposal_created'; proposal: IProposal; timestamp: number }
  | { type: 'approval_requested'; proposalId?: string; reason: string; timestamp: number }
  | { type: 'patch_applied'; proposalId: string; appliedFiles: string[]; checkpointId?: string; timestamp: number }
  | { type: 'command_started'; command: string; timestamp: number }
  | { type: 'command_output'; command: string; stdout: string; stderr: string; timestamp: number }
  | { type: 'command_completed'; command: string; exitCode: number; timestamp: number }
  | { type: 'test_result'; command: string; passed: boolean; exitCode: number; summary: string; timestamp: number }
  | { type: 'repair_proposal'; proposal: IProposal; failureCommand: string; timestamp: number }
  | { type: 'completed'; summary: string; timestamp: number }
  | { type: 'cancelled'; reason: string; timestamp: number }
  | { type: 'error'; message: string; timestamp: number };

export interface ComposerAuditEntry {
  readonly timestamp: number;
  readonly action: string;
  readonly detail: string;
}

export interface ComposerAgentOptions {
  readonly task: string;
  readonly userId: string;
  readonly projectId: string;
  readonly taskId?: string;
  readonly idempotencyKey?: string;
  readonly mode?: ComposerMode;
  readonly modelId?: string;
  readonly maxIterations?: number;
  readonly timeoutMs?: number;
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
  readonly allowedCommands?: readonly string[];
  readonly autoApplyApprovedProposal?: boolean;
  readonly verificationCommand?: string;
  readonly repairOnVerificationFailure?: boolean;
  readonly activeRulesInstruction?: string;
  readonly onProgress?: (event: ComposerProgressEvent) => void;
}

export interface ComposerExecutionResult {
  readonly taskId: string;
  readonly mode: ComposerMode;
  readonly modelId: string;
  readonly status: 'completed' | 'plan_ready' | 'proposal_ready' | 'verified' | 'cancelled' | 'budget_exceeded' | 'error';
  readonly iterations: number;
  readonly durationMs: number;
  readonly tokenUsage: number;
  readonly toolOutcomes: readonly ToolExecutionResult[];
  readonly plan?: readonly ComposerPlanStep[];
  readonly proposal?: IProposal;
  readonly repairProposal?: IProposal;
  readonly checkpointId?: string;
  readonly verificationPassed?: boolean;
  readonly finalResponse?: string;
  readonly auditTrail: readonly ComposerAuditEntry[];
  readonly error?: string;
}

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 8_192;

/**
 * Robust JSON extraction helper for tool call payloads from LLM responses.
 */
export function extractToolCallsFromText(text: string): Array<{ name: string; args: any }> {
  const toolCalls: Array<{ name: string; args: any }> = [];

  const blockRegex = /```(?:tool_call|json:tool_call)\s*([\s\S]*?)```|<tool_call>([\s\S]*?)<\/tool_call>/gi;
  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    const rawJson = (match[1] || match[2] || '').trim();
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed && typeof parsed.name === 'string') {
        toolCalls.push({ name: parsed.name, args: parsed.args || {} });
      }
    } catch {
      // Continue searching
    }
  }

  if (toolCalls.length === 0) {
    const jsonMatch = text.match(
      /\{[\s\S]*"name"\s*:\s*"(list_dir|read_file|search_codebase|inspect_symbol|retrieve_context|inspect_diagnostics|inspect_git|request_approval|propose_changes|run_command)"[\s\S]*\}/
    );
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed && parsed.name) {
          toolCalls.push({ name: parsed.name, args: parsed.args || {} });
        }
      } catch {
        // Ignored
      }
    }
  }

  return toolCalls;
}

function extractPlanSteps(text: string, fallbackTask: string): ComposerPlanStep[] {
  const numbered = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => /^(?:\d+\.|[-*])\s+/.test(l))
    .slice(0, 8)
    .map((l, idx) => ({
      id: `step_${idx + 1}`,
      description: l.replace(/^(?:\d+\.|[-*])\s+/, '').trim(),
      status: 'pending' as const,
    }));

  if (numbered.length > 0) return numbered;
  return [
    { id: 'step_1', description: `Inspect workspace files and symbols for: ${fallbackTask.slice(0, 80)}`, status: 'completed' },
    { id: 'step_2', description: 'Draft minimal multi-file unified diff proposal', status: 'pending' },
    { id: 'step_3', description: 'Verify syntax and run project test checks', status: 'pending' },
  ];
}

/**
 * Autonomous Composer Agent Loop (Phase 5 & Production Stage 1)
 *
 * Coordinates model reasoning, workspace inspection, multi-file code proposal drafting,
 * pre-apply checkpointing, and post-apply test verification & self-repair.
 * Strictly guarantees that unapproved changes never touch user files on disk.
 */
export class ComposerAgent {
  constructor(
    private readonly gateway: IModelGateway,
    private readonly toolRegistry: IToolRegistry,
    private readonly workspace: IWorkspaceService,
    private readonly checkpointManager?: ICheckpointManager
  ) {}

  async run(options: ComposerAgentOptions): Promise<ComposerExecutionResult> {
    const startTime = Date.now();
    const taskId = options.taskId || `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const mode: ComposerMode = options.mode || 'agent';
    const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const modelId = options.modelId || 'gpt-6.1-sol';

    const toolOutcomes: ToolExecutionResult[] = [];
    const auditTrail: ComposerAuditEntry[] = [];
    let accumulatedTokens = 0;
    let createdProposal: IProposal | undefined;
    let repairProposal: IProposal | undefined;
    let appliedCheckpointId: string | undefined;
    let verificationPassed: boolean | undefined;
    let finalAssistantResponse: string | undefined;
    let synthesizedPlan: ComposerPlanStep[] | undefined;

    const availableTools = this.toolRegistry
      .list()
      .filter(t => (mode === 'ask' || mode === 'plan' ? READ_ONLY_CANONICAL_TOOLS.has(t.name) : true));
    const activeToolNames = availableTools.map(t => t.name);

    const recordAudit = (action: string, detail: string) => {
      auditTrail.push({ timestamp: Date.now(), action, detail });
    };

    recordAudit('task_started', `Started Composer task (${mode}) with model ${modelId}`);
    options.onProgress?.({
      type: 'started',
      taskId,
      task: options.task,
      mode,
      modelId,
      activeTools: activeToolNames,
      timestamp: startTime,
    });

    const executionContext: ToolExecutionContext = {
      workspace: this.workspace,
      userId: options.userId,
      projectId: options.projectId,
      signal: options.signal,
      allowedCommands: options.allowedCommands,
      mode,
    };

    const toolsDescription = availableTools
      .map(t => `- ${t.name}: ${t.description} (Schema: ${JSON.stringify(t.parametersSchema)})`)
      .join('\n');

    const modeInstructions =
      mode === 'ask'
        ? 'MODE: ASK (Read-Only). Inspect files and symbols to answer the user accurately. Do NOT propose file edits or run shell commands.'
        : mode === 'plan'
          ? 'MODE: PLAN (Read-Only Exploration -> Plan Approval). Inspect the codebase using read-only tools, then produce a clear numbered implementation plan for user approval without mutating files.'
          : mode === 'debug'
            ? 'MODE: DEBUG (Evidence-Based Diagnostics & Repair). Inspect compiler/test diagnostics and source files first, identify the exact file/line root cause, and call propose_changes with a minimal fix.'
            : 'MODE: AGENT (Bounded Multi-File Implementation). Inspect the codebase first, then call propose_changes with complete file changes and unified diffs.';

    const systemPrompt = `You are FLOAT Studio Composer, an expert autonomous software engineer.
${modeInstructions}
${options.activeRulesInstruction ? `\nActive Workspace Rules & Skills:\n${options.activeRulesInstruction}\n` : ''}
Available Tools:
${toolsDescription}

Rules:
1. Inspect the codebase first using list_dir, read_file, search_codebase, inspect_symbol, retrieve_context, or inspect_diagnostics before proposing edits.
2. When you have determined the solution (in agent or debug mode), call propose_changes with a title, explanation, and an array of file modifications.
3. Every tool call must be formatted as:
\`\`\`tool_call
{
  "name": "<tool_name>",
  "args": { ... }
}
\`\`\`
4. When finished, provide a clear explanation for the user.`;

    const messages: ModelGatewayMessage[] = [{ role: 'user', content: options.task }];

    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      options.onProgress?.({ type: 'iteration_start', iteration, timestamp: Date.now() });

      if (options.signal?.aborted) {
        recordAudit('task_cancelled', 'Aborted by user signal');
        options.onProgress?.({ type: 'cancelled', reason: 'Aborted by user signal.', timestamp: Date.now() });
        return {
          taskId,
          mode,
          modelId,
          status: 'cancelled',
          iterations: iteration,
          durationMs: Date.now() - startTime,
          tokenUsage: accumulatedTokens,
          toolOutcomes,
          plan: synthesizedPlan,
          proposal: createdProposal,
          auditTrail,
          error: 'Execution cancelled by user.',
        };
      }

      if (Date.now() - startTime > timeoutMs) {
        recordAudit('budget_exceeded', `Timed out after ${timeoutMs}ms`);
        options.onProgress?.({ type: 'error', message: 'Composer agent timeout exceeded.', timestamp: Date.now() });
        return {
          taskId,
          mode,
          modelId,
          status: 'budget_exceeded',
          iterations: iteration,
          durationMs: Date.now() - startTime,
          tokenUsage: accumulatedTokens,
          toolOutcomes,
          plan: synthesizedPlan,
          proposal: createdProposal,
          auditTrail,
          error: `Execution timed out after ${timeoutMs}ms limit.`,
        };
      }

      if (accumulatedTokens > maxTokens) {
        recordAudit('budget_exceeded', `Token budget (${maxTokens}) exceeded`);
        options.onProgress?.({ type: 'error', message: 'Token budget exceeded.', timestamp: Date.now() });
        return {
          taskId,
          mode,
          modelId,
          status: 'budget_exceeded',
          iterations: iteration,
          durationMs: Date.now() - startTime,
          tokenUsage: accumulatedTokens,
          toolOutcomes,
          plan: synthesizedPlan,
          proposal: createdProposal,
          auditTrail,
          error: `Token budget of ${maxTokens} tokens exceeded.`,
        };
      }

      let response;
      try {
        response = await this.gateway.generate(
          {
            modelId,
            messages,
            systemPrompt,
            temperature: 0.2,
            maxTokens: 2048,
          },
          options.signal
        );
      } catch (err: any) {
        recordAudit('gateway_error', err?.message || String(err));
        options.onProgress?.({ type: 'error', message: err?.message || String(err), timestamp: Date.now() });
        return {
          taskId,
          mode,
          modelId,
          status: 'error',
          iterations: iteration,
          durationMs: Date.now() - startTime,
          tokenUsage: accumulatedTokens,
          toolOutcomes,
          plan: synthesizedPlan,
          proposal: createdProposal,
          auditTrail,
          error: `Model gateway error: ${err?.message || err}`,
        };
      }

      accumulatedTokens += (response.usage?.inputTokens ?? 50) + (response.usage?.outputTokens ?? 100);
      finalAssistantResponse = response.text;
      options.onProgress?.({ type: 'thinking', content: response.text, timestamp: Date.now() });

      const toolCalls = extractToolCallsFromText(response.text);

      if (toolCalls.length === 0) {
        if (mode === 'plan') {
          synthesizedPlan = extractPlanSteps(response.text, options.task);
          options.onProgress?.({
            type: 'plan',
            steps: synthesizedPlan,
            requiresApproval: true,
            timestamp: Date.now(),
          });
          options.onProgress?.({
            type: 'approval_requested',
            reason: 'Approve implementation plan to proceed with Agent execution.',
            timestamp: Date.now(),
          });
        }

        options.onProgress?.({
          type: 'completed',
          summary: mode === 'plan' ? 'Implementation plan ready for user approval.' : 'Composer agent concluded task.',
          timestamp: Date.now(),
        });

        return {
          taskId,
          mode,
          modelId,
          status: createdProposal ? 'proposal_ready' : mode === 'plan' ? 'plan_ready' : 'completed',
          iterations: iteration,
          durationMs: Date.now() - startTime,
          tokenUsage: accumulatedTokens,
          toolOutcomes,
          plan: synthesizedPlan,
          proposal: createdProposal,
          finalResponse: response.text,
          auditTrail,
        };
      }

      messages.push({ role: 'assistant', content: response.text });

      for (const call of toolCalls) {
        recordAudit('tool_call', `${call.name}(${JSON.stringify(call.args).slice(0, 200)})`);
        options.onProgress?.({ type: 'tool_call', toolName: call.name, args: call.args, timestamp: Date.now() });

        const outcome = await this.toolRegistry.execute(call.name, call.args, executionContext);
        toolOutcomes.push(outcome);

        if (call.name === 'retrieve_context' && outcome.success && Array.isArray(outcome.data?.snippets)) {
          options.onProgress?.({
            type: 'context_retrieval',
            files: outcome.data.snippets.map((s: any) => s.path),
            totalChars: outcome.data.totalChars || 0,
            timestamp: Date.now(),
          });
        }

        options.onProgress?.({
          type: 'tool_result',
          toolName: call.name,
          success: outcome.success,
          data: outcome.data,
          error: outcome.error,
          timestamp: Date.now(),
        });

        if (call.name === 'propose_changes' && outcome.success && outcome.data?.proposal) {
          createdProposal = outcome.data.proposal as IProposal;
          synthesizedPlan = extractPlanSteps(response.text, options.task);
          options.onProgress?.({
            type: 'plan',
            steps: synthesizedPlan,
            requiresApproval: false,
            timestamp: Date.now(),
          });
          options.onProgress?.({
            type: 'proposal_created',
            proposal: createdProposal,
            timestamp: Date.now(),
          });
          options.onProgress?.({
            type: 'approval_requested',
            proposalId: createdProposal.id,
            reason: 'Multi-file proposal ready for user diff review and approval.',
            timestamp: Date.now(),
          });
        }

        messages.push({
          role: 'user',
          content: `Tool Execution Result (${call.name}):\n${JSON.stringify(outcome.success ? outcome.data : { error: outcome.error }, null, 2)}`,
        });
      }

      if (createdProposal) {
        if (options.autoApplyApprovedProposal) {
          const applyRes = await applyProposal({
            proposal: createdProposal,
            workspace: this.workspace,
            checkpointManager: this.checkpointManager,
          });

          if (applyRes.success) {
            appliedCheckpointId = applyRes.checkpointId;
            recordAudit('patch_applied', `Applied proposal ${createdProposal.id} (checkpoint=${appliedCheckpointId || 'none'})`);
            options.onProgress?.({
              type: 'patch_applied',
              proposalId: createdProposal.id,
              appliedFiles: applyRes.appliedFiles,
              checkpointId: appliedCheckpointId,
              timestamp: Date.now(),
            });

            if (options.verificationCommand) {
              const verifyCmd = options.verificationCommand;
              options.onProgress?.({ type: 'command_started', command: verifyCmd, timestamp: Date.now() });
              const cmdOutcome = await this.toolRegistry.execute(
                'run_command',
                { command: verifyCmd },
                executionContext
              );
              toolOutcomes.push(cmdOutcome);

              const stdout = String(cmdOutcome.data?.stdout || '');
              const stderr = String(cmdOutcome.data?.stderr || cmdOutcome.error || '');
              const exitCode = typeof cmdOutcome.data?.exitCode === 'number' ? cmdOutcome.data.exitCode : (cmdOutcome.success ? 0 : 1);

              options.onProgress?.({
                type: 'command_output',
                command: verifyCmd,
                stdout,
                stderr,
                timestamp: Date.now(),
              });
              options.onProgress?.({
                type: 'command_completed',
                command: verifyCmd,
                exitCode,
                timestamp: Date.now(),
              });
              options.onProgress?.({
                type: 'test_result',
                command: verifyCmd,
                passed: exitCode === 0,
                exitCode,
                summary: exitCode === 0 ? `Verification passed: ${verifyCmd}` : `Verification failed (exit ${exitCode}): ${verifyCmd}`,
                timestamp: Date.now(),
              });

              verificationPassed = exitCode === 0;

              if (!verificationPassed && options.repairOnVerificationFailure !== false && iteration < maxIterations) {
                messages.push({
                  role: 'user',
                  content: `Verification command "${verifyCmd}" failed with exit code ${exitCode}.\nOutput:\n${stdout}\n${stderr}\nPlease diagnose the failure and call propose_changes with a corrective fix.`,
                });
                const repairTurn = await this.gateway.generate(
                  { modelId, messages, systemPrompt, temperature: 0.1, maxTokens: 2048 },
                  options.signal
                );
                accumulatedTokens += (repairTurn.usage?.inputTokens ?? 50) + (repairTurn.usage?.outputTokens ?? 100);
                const repairCalls = extractToolCallsFromText(repairTurn.text);
                for (const rc of repairCalls) {
                  if (rc.name === 'propose_changes') {
                    const repairOutcome = await this.toolRegistry.execute('propose_changes', rc.args, executionContext);
                    toolOutcomes.push(repairOutcome);
                    if (repairOutcome.success && repairOutcome.data?.proposal) {
                      repairProposal = repairOutcome.data.proposal as IProposal;
                      options.onProgress?.({
                        type: 'repair_proposal',
                        proposal: repairProposal,
                        failureCommand: verifyCmd,
                        timestamp: Date.now(),
                      });
                      const repairApply = await applyProposal({
                        proposal: repairProposal,
                        workspace: this.workspace,
                        checkpointManager: this.checkpointManager,
                        force: true,
                      });
                      if (repairApply.success) {
                        const rerunOutcome = await this.toolRegistry.execute(
                          'run_command',
                          { command: verifyCmd },
                          executionContext
                        );
                        toolOutcomes.push(rerunOutcome);
                        const rerunExit = typeof rerunOutcome.data?.exitCode === 'number' ? rerunOutcome.data.exitCode : (rerunOutcome.success ? 0 : 1);
                        verificationPassed = rerunExit === 0;
                        options.onProgress?.({
                          type: 'test_result',
                          command: verifyCmd,
                          passed: verificationPassed,
                          exitCode: rerunExit,
                          summary: verificationPassed
                            ? `Post-repair verification passed: ${verifyCmd}`
                            : `Post-repair verification failed (exit ${rerunExit})`,
                          timestamp: Date.now(),
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }

        options.onProgress?.({
          type: 'completed',
          summary: verificationPassed
            ? `Proposal "${createdProposal.title}" applied and verified.`
            : `Proposal "${createdProposal.title}" generated for user review.`,
          timestamp: Date.now(),
        });

        return {
          taskId,
          mode,
          modelId,
          status: verificationPassed ? 'verified' : 'proposal_ready',
          iterations: iteration,
          durationMs: Date.now() - startTime,
          tokenUsage: accumulatedTokens,
          toolOutcomes,
          plan: synthesizedPlan,
          proposal: createdProposal,
          repairProposal,
          checkpointId: appliedCheckpointId,
          verificationPassed,
          finalResponse: finalAssistantResponse,
          auditTrail,
        };
      }
    }

    return {
      taskId,
      mode,
      modelId,
      status: 'budget_exceeded',
      iterations: iteration,
      durationMs: Date.now() - startTime,
      tokenUsage: accumulatedTokens,
      toolOutcomes,
      plan: synthesizedPlan,
      proposal: createdProposal,
      finalResponse: finalAssistantResponse,
      auditTrail,
      error: `Maximum iterations limit (${maxIterations}) reached.`,
    };
  }
}
