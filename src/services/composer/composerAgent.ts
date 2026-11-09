/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'crypto';
import { IModelGateway, ModelGatewayMessage } from '../../shared/contracts/gateway';
import { IToolRegistry, ToolExecutionContext, ToolExecutionResult } from '../../shared/contracts/tools';
import { IWorkspaceService } from '../../shared/contracts/workspace';
import { IProposal } from '../../shared/contracts/proposals';
import { ICheckpointManager } from '../../shared/contracts/checkpoints';

export type ComposerProgressEvent =
  | { type: 'started'; task: string; timestamp: number }
  | { type: 'iteration_start'; iteration: number; timestamp: number }
  | { type: 'thinking'; content: string; timestamp: number }
  | { type: 'tool_call'; toolName: string; args: any; timestamp: number }
  | { type: 'tool_result'; toolName: string; success: boolean; data?: any; error?: string; timestamp: number }
  | { type: 'proposal_created'; proposal: IProposal; timestamp: number }
  | { type: 'completed'; summary: string; timestamp: number }
  | { type: 'cancelled'; reason: string; timestamp: number }
  | { type: 'error'; message: string; timestamp: number };

export interface ComposerAgentOptions {
  readonly task: string;
  readonly userId: string;
  readonly projectId: string;
  readonly modelId?: string;
  readonly maxIterations?: number;
  readonly timeoutMs?: number;
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
  readonly allowedCommands?: readonly string[];
  readonly onProgress?: (event: ComposerProgressEvent) => void;
}

export interface ComposerExecutionResult {
  readonly taskId: string;
  readonly status: 'completed' | 'proposal_ready' | 'cancelled' | 'budget_exceeded' | 'error';
  readonly iterations: number;
  readonly durationMs: number;
  readonly tokenUsage: number;
  readonly toolOutcomes: readonly ToolExecutionResult[];
  readonly proposal?: IProposal;
  readonly finalResponse?: string;
  readonly error?: string;
}

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 8_192;

/**
 * Robust JSON extraction helper for tool call payloads from LLM responses.
 */
function extractToolCallsFromText(text: string): Array<{ name: string; args: any }> {
  const toolCalls: Array<{ name: string; args: any }> = [];

  // Match ```tool_call ... ``` or <tool_call>...</tool_call>
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

  // Fallback: look for direct JSON {"tool": "...", "args": {...}} or {"name": "...", "args": {...}}
  if (toolCalls.length === 0) {
    const jsonMatch = text.match(/\{[\s\S]*"name"\s*:\s*"(list_dir|read_file|search_codebase|inspect_symbol|propose_changes|run_command)"[\s\S]*\}/);
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

/**
 * Autonomous Composer Agent Loop (Phase 5)
 *
 * Coordinates model reasoning, workspace inspection, and multi-file code proposal drafting.
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
    const taskId = `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const modelId = options.modelId || 'gemini-2.5-pro';

    const toolOutcomes: ToolExecutionResult[] = [];
    let accumulatedTokens = 0;
    let createdProposal: IProposal | undefined;
    let finalAssistantResponse: string | undefined;

    options.onProgress?.({ type: 'started', task: options.task, timestamp: startTime });

    // Initial tool execution context
    const executionContext: ToolExecutionContext = {
      workspace: this.workspace,
      userId: options.userId,
      projectId: options.projectId,
      signal: options.signal,
      allowedCommands: options.allowedCommands,
    };

    const toolsDescription = this.toolRegistry.list().map(t =>
      `- ${t.name}: ${t.description} (Schema: ${JSON.stringify(t.parametersSchema)})`
    ).join('\n');

    const systemPrompt = `You are FLOAT Studio Composer, an expert autonomous software engineer.
You are tasked with analyzing the project and proposing precise code modifications.

Available Tools:
${toolsDescription}

Rules:
1. Inspect the codebase first using list_dir, read_file, search_codebase, or inspect_symbol before proposing edits.
2. When you have determined the solution, call propose_changes with a title, explanation, and an array of file modifications.
3. Every tool call must be formatted as:
\`\`\`tool_call
{
  "name": "<tool_name>",
  "args": { ... }
}
\`\`\`
4. When finished, provide a clear explanation for the user.`;

    const messages: ModelGatewayMessage[] = [
      { role: 'user', content: options.task },
    ];

    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      options.onProgress?.({ type: 'iteration_start', iteration, timestamp: Date.now() });

      // 1. Check Cancellation
      if (options.signal?.aborted) {
        options.onProgress?.({ type: 'cancelled', reason: 'Aborted by user signal.', timestamp: Date.now() });
        return {
          taskId,
          status: 'cancelled',
          iterations: iteration,
          durationMs: Date.now() - startTime,
          tokenUsage: accumulatedTokens,
          toolOutcomes,
          proposal: createdProposal,
          error: 'Execution cancelled by user.',
        };
      }

      // 2. Check Timeout
      if (Date.now() - startTime > timeoutMs) {
        options.onProgress?.({ type: 'error', message: 'Composer agent timeout exceeded.', timestamp: Date.now() });
        return {
          taskId,
          status: 'budget_exceeded',
          iterations: iteration,
          durationMs: Date.now() - startTime,
          tokenUsage: accumulatedTokens,
          toolOutcomes,
          proposal: createdProposal,
          error: `Execution timed out after ${timeoutMs}ms limit.`,
        };
      }

      // 3. Check Token Budget
      if (accumulatedTokens > maxTokens) {
        options.onProgress?.({ type: 'error', message: 'Token budget exceeded.', timestamp: Date.now() });
        return {
          taskId,
          status: 'budget_exceeded',
          iterations: iteration,
          durationMs: Date.now() - startTime,
          tokenUsage: accumulatedTokens,
          toolOutcomes,
          proposal: createdProposal,
          error: `Token budget of ${maxTokens} tokens exceeded.`,
        };
      }

      // 4. Request Next Turn From Model Gateway
      let response;
      try {
        response = await this.gateway.generate({
          modelId,
          messages,
          systemPrompt,
          temperature: 0.2,
          maxTokens: 2048,
        }, options.signal);
      } catch (err: any) {
        options.onProgress?.({ type: 'error', message: err?.message || String(err), timestamp: Date.now() });
        return {
          taskId,
          status: 'error',
          iterations: iteration,
          durationMs: Date.now() - startTime,
          tokenUsage: accumulatedTokens,
          toolOutcomes,
          proposal: createdProposal,
          error: `Model gateway error: ${err?.message || err}`,
        };
      }

      accumulatedTokens += (response.usage?.inputTokens ?? 50) + (response.usage?.outputTokens ?? 100);
      finalAssistantResponse = response.text;
      options.onProgress?.({ type: 'thinking', content: response.text, timestamp: Date.now() });

      // 5. Parse Tool Calls from Response
      const toolCalls = extractToolCallsFromText(response.text);

      if (toolCalls.length === 0) {
        // Model concluded reasoning without additional tool calls
        options.onProgress?.({
          type: 'completed',
          summary: 'Composer agent concluded task.',
          timestamp: Date.now(),
        });

        return {
          taskId,
          status: createdProposal ? 'proposal_ready' : 'completed',
          iterations: iteration,
          durationMs: Date.now() - startTime,
          tokenUsage: accumulatedTokens,
          toolOutcomes,
          proposal: createdProposal,
          finalResponse: response.text,
        };
      }

      // 6. Execute Parsed Tool Calls
      messages.push({ role: 'assistant', content: response.text });

      for (const call of toolCalls) {
        options.onProgress?.({ type: 'tool_call', toolName: call.name, args: call.args, timestamp: Date.now() });

        const outcome = await this.toolRegistry.execute(call.name, call.args, executionContext);
        toolOutcomes.push(outcome);

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
          options.onProgress?.({
            type: 'proposal_created',
            proposal: createdProposal,
            timestamp: Date.now(),
          });
        }

        // Add tool result back into conversation
        messages.push({
          role: 'user',
          content: `Tool Execution Result (${call.name}):\n${JSON.stringify(outcome.success ? outcome.data : { error: outcome.error }, null, 2)}`,
        });
      }

      // If a proposal has been generated and no other tools remain in this iteration, return proposal_ready
      if (createdProposal) {
        options.onProgress?.({
          type: 'completed',
          summary: `Proposal "${createdProposal.title}" generated for user review.`,
          timestamp: Date.now(),
        });

        return {
          taskId,
          status: 'proposal_ready',
          iterations: iteration,
          durationMs: Date.now() - startTime,
          tokenUsage: accumulatedTokens,
          toolOutcomes,
          proposal: createdProposal,
          finalResponse: finalAssistantResponse,
        };
      }
    }

    // Reached max iterations without finishing
    return {
      taskId,
      status: 'budget_exceeded',
      iterations: iteration,
      durationMs: Date.now() - startTime,
      tokenUsage: accumulatedTokens,
      toolOutcomes,
      proposal: createdProposal,
      finalResponse: finalAssistantResponse,
      error: `Maximum iterations limit (${maxIterations}) reached.`,
    };
  }
}
