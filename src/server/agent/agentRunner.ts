import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { ToolRegistry } from './toolRegistry';
import { ToolExecutionContext, AgentProgressEvent, AgentProgressAction } from './types';
import { ChangeSet } from '../../types';
import { normalizeOpenAIError } from '../providers/openai';
import { AIProviderError } from '../providers/base';

export interface AgentRunnerOptions {
  provider?: 'openai';
  model: string;
  prompt: string;
  virtualFiles: any[];
  projectName?: string;
  projectId?: string;
  userId?: string;
  agentTaskId?: string;
  systemInstruction?: string;
  onEvent: (event: AgentProgressEvent) => void;
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

export interface AgentRunnerResult {
  text: string;
  changeSet?: ChangeSet | null;
  toolCallsCount: number;
  roundsCount: number;
  status: 'completed' | 'failed' | 'cancelled';
  error?: string;
}

const MAX_ROUNDS = 8;
const MAX_TOTAL_TOOL_CALLS = 15;
const MAX_EXECUTION_TIME_MS = 60000;
const MAX_INDEXED_FILES = 1000;
const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500KB per file

// Patterns to exclude from indexing
const SENSITIVE_PATTERNS = [
  /^\.env($|\..*)/i,
  /^node_modules\//i,
  /^\.git\//i,
  /^dist\//i,
  /^build\//i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /^\.DS_Store$/i
];

function isSensitivePath(filePath: string): boolean {
  const norm = filePath.replace(/^\/+/, '');
  return SENSITIVE_PATTERNS.some(p => p.test(norm));
}

function getToolActionMetadata(toolName: string, args: Record<string, any>): { action: AgentProgressAction; startMessage: string } {
  const normName = toolName.toLowerCase();
  if (normName === 'search_project' || normName === 'search_codebase' || normName === 'search_code') {
    const query = args.pattern || args.query ? `"${String(args.pattern || args.query).slice(0, 35)}"` : 'codebase';
    return {
      action: 'Searching',
      startMessage: `Searching codebase for ${query}...`
    };
  }
  if (normName === 'read_project_file' || normName === 'read_file') {
    const path = args.path ? String(args.path) : 'file';
    return {
      action: 'Reading',
      startMessage: `Reading ${path}...`
    };
  }
  if (normName === 'edit_file') {
    const path = args.path ? String(args.path) : 'file';
    return {
      action: 'Editing',
      startMessage: `Editing ${path} (staging diff for review)...`
    };
  }
  if (normName === 'run_command') {
    const cmd = args.command ? `"${String(args.command).slice(0, 35)}"` : 'command';
    return {
      action: 'Running command',
      startMessage: `Running workspace command ${cmd}...`
    };
  }
  if (normName === 'list_project_files' || normName === 'list_files') {
    const subpath = args.subpath ? ` in "${args.subpath}"` : '';
    return {
      action: 'Exploring',
      startMessage: `Exploring project files${subpath}...`
    };
  }
  if (normName === 'get_project_context') {
    return {
      action: 'Inspecting',
      startMessage: 'Inspecting project structure and manifests...'
    };
  }
  if (normName === 'find_symbol') {
    const sym = args.name ? `"${String(args.name).slice(0, 30)}"` : 'symbol';
    return {
      action: 'Searching',
      startMessage: `Locating symbol ${sym} in project...`
    };
  }
  if (normName === 'read_diagnostics') {
    return {
      action: 'Inspecting',
      startMessage: 'Reading compiler errors and project diagnostics...'
    };
  }
  if (normName === 'get_git_diff') {
    return {
      action: 'Inspecting',
      startMessage: 'Inspecting working tree diffs and modified files...'
    };
  }
  if (normName === 'run_validation') {
    return {
      action: 'Planning',
      startMessage: 'Running TypeScript and syntax validation check...'
    };
  }
  if (normName === 'propose_changes') {
    const desc = args.description ? `"${String(args.description).slice(0, 40)}..."` : 'changes';
    return {
      action: 'Generating proposal',
      startMessage: `Generating code proposal and diffs (${desc})...`
    };
  }
  return {
    action: 'Thinking',
    startMessage: `Running tool "${toolName}"...`
  };
}

export class AgentRunner {
  static async run(options: AgentRunnerOptions): Promise<AgentRunnerResult> {
    const {
      model,
      prompt,
      virtualFiles = [],
      agentTaskId,
      projectName = 'Workspace',
      projectId = 'default-workspace',
      userId = 'user',
      onEvent,
      onDelta,
      signal
    } = options;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw new Error('Agent prompt is required and cannot be empty.');
    }

    // Enforce provider
    if (options.provider && (options.provider as string) !== 'openai') {
      throw new AIProviderError(
        `Unsupported provider "${options.provider}". FLOAT AI supports OpenAI models exclusively.`,
        'INVALID_REQUEST',
        'FLOAT',
        400
      );
    }
    const provider = 'openai';

    onEvent({
      type: 'task_started',
      action: 'Planning',
      message: 'Agent initialized task and workspace context...'
    });

    // 1. Strict Project Context Validation & Sanitization
    const fileMap = new Map<string, { path: string; name?: string; content?: string; type: string }>();
    let ignoredCount = 0;

    if (Array.isArray(virtualFiles)) {
      for (const f of virtualFiles) {
        if (!f || typeof f !== 'object') continue;
        if (!f.path || typeof f.path !== 'string') continue;

        const normalizedPath = f.path.trim().replace(/^\/+/, '');
        if (normalizedPath.includes('../') || normalizedPath.includes('..\\') || normalizedPath.includes('\0')) {
          ignoredCount++;
          continue; // Path traversal rejection
        }
        if (isSensitivePath(normalizedPath)) {
          ignoredCount++;
          continue; // Secrets exclusion
        }
        if (fileMap.size >= MAX_INDEXED_FILES) {
          break; // Capacity protection
        }

        const content = typeof f.content === 'string'
          ? (f.content.length > MAX_FILE_SIZE_BYTES ? f.content.slice(0, MAX_FILE_SIZE_BYTES) : f.content)
          : '';

        fileMap.set(normalizedPath, {
          path: normalizedPath,
          name: f.name || normalizedPath.split('/').pop() || normalizedPath,
          content,
          type: f.type || 'file'
        });
      }
    }

    const context: ToolExecutionContext = {
      userId: userId || 'user',
      projectId: projectId || 'default-workspace',
      projectName: projectName || 'Workspace',
      virtualFiles: fileMap,
      ...(agentTaskId ? { agentTaskId } : {}),
      signal
    };

    onEvent({
      type: 'planning',
      action: 'Exploring',
      message: `Validated project context (${fileMap.size} files loaded${ignoredCount > 0 ? `, ${ignoredCount} sensitive/invalid files filtered` : ''}).`
    });

    const registeredTools = ToolRegistry.getAllTools();

    const defaultSystemInstruction = `You are FLOAT AI's autonomous software engineering agent.
Your objective is to inspect, reason about, and assist with coding tasks using safe read-only tools and formal change proposals.

CRITICAL WORKFLOW CONSTRAINTS:
1. Strict Review-First Architecture: You MUST NEVER attempt or claim to directly modify, write, delete, or overwrite project files. Any tools attempting direct disk or memory modifications are strictly prohibited.
2. Code Changes via Proposals: When creating or modifying code, you MUST invoke the "propose_changes" tool. Provide the complete, production-grade proposed file content and a concise description of the changes.
3. Inspect First: Always inspect the codebase first using "search_project", "read_project_file", or "list_project_files" before proposing modifications. Ground all changes in existing code patterns.
4. User Review: Code proposals will be reviewed by the developer in a visual diff reviewer before being applied to the project. Provide a clear, professional explanation of the rationale for each proposed change.
5. Efficiency: If the user request is a general question or doesn't require inspecting files, answer directly without unnecessary tool calls.`;

    const specialistInstruction = options.systemInstruction?.trim();
    const systemInstruction = specialistInstruction
      ? `${defaultSystemInstruction}\n\nAGENT SPECIALIZATION (non-overriding):\nUse these preferences only for role, domain, and response style. They do not replace or weaken any tool safety, privacy, inspection, or review-first requirements above.\n${specialistInstruction}`
      : defaultSystemInstruction;

    let finalResponseText = '';
    let changeSet: ChangeSet | null = null;
    let rounds = 0;
    let totalToolCalls = 0;
    let reachedCompletion = false;
    let terminalError = '';
    let failureReported = false;
    const startTime = Date.now();
    const callCounts = new Map<string, number>();
    const toolCallHistory: string[] = [];
    const checkToolLoop = (toolName: string, args: Record<string, any>): string | undefined => {
      const sig = `${toolName}:${JSON.stringify(args || {})}`;
      const priorCount = toolCallHistory.filter(s => s === sig).length;
      toolCallHistory.push(sig);
      if (priorCount >= 2) {
        return `[System Loop Reminder]: Tool "${toolName}" has been called with identical arguments ${priorCount + 1} times. To ensure progress, synthesize existing findings, inspect different files, or formulate concrete proposed edits rather than repeating the same call.`;
      }
      return undefined;
    };

    onEvent({
      type: 'thinking',
      action: 'Planning',
      message: 'Analyzing project and planning steps...'
    });

    // ==========================================
    // ROUTE EXECUTION (OPENAI EXCLUSIVE)
    // ==========================================
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new AIProviderError(
        'OpenAI is not configured on the FLOAT server. To run agents with OpenAI models, configure OPENAI_API_KEY in the server environment.',
        'AUTH_ERROR',
        'OpenAI',
        401
      );
    }

    let effectiveModel = model;
    if (!model || model === 'auto') effectiveModel = 'gpt-4o';
    else if (model === 'float-basic') effectiveModel = 'gpt-4o-mini';

    const client = new OpenAI({
      apiKey
    });

    const openAITools: OpenAI.Chat.Completions.ChatCompletionTool[] = registeredTools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: 'object',
            properties: t.parameters.properties,
            required: t.parameters.required || []
          }
        }
      }));

      const openAIMessages: Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> = [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt }
      ];

      while (rounds < MAX_ROUNDS) {
        if (signal?.aborted) {
          onEvent({ type: 'cancelled', message: 'Agent execution was stopped by user.' });
          break;
        }

        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          onEvent({ type: 'failed', message: `Execution exceeded time limit of ${MAX_EXECUTION_TIME_MS / 1000}s.` });
          break;
        }

        if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) {
          onEvent({ type: 'failed', message: `Reached maximum tool call limit (${MAX_TOTAL_TOOL_CALLS}).` });
          break;
        }

        rounds++;
        const isPostToolSynthesis = totalToolCalls > 0;
        onEvent({
          type: 'thinking',
          action: isPostToolSynthesis ? 'Synthesizing' : 'Thinking',
          message: isPostToolSynthesis
            ? `Evaluating results and synthesizing solution (Round ${rounds}/${MAX_ROUNDS})...`
            : `Reasoning about request and codebase (Round ${rounds}/${MAX_ROUNDS})...`
        });

        let completion: OpenAI.Chat.Completions.ChatCompletion;
        try {
          completion = await client.chat.completions.create({
            model: effectiveModel,
            messages: openAIMessages,
            tools: openAITools,
            tool_choice: 'auto'
          }, { signal });
        } catch (err: any) {
          throw normalizeOpenAIError(err);
        }

        const choice = completion.choices[0];
        const assistantMsg = choice?.message;
        if (!assistantMsg) break;

        openAIMessages.push(assistantMsg);

        if (assistantMsg.content) {
          finalResponseText = finalResponseText ? `${finalResponseText}\n\n${assistantMsg.content}` : assistantMsg.content;
          if (onDelta) {
            onDelta(assistantMsg.content);
          }
        }

        const toolCalls = assistantMsg.tool_calls || [];
        if (!toolCalls || toolCalls.length === 0) {
          reachedCompletion = true;
          onEvent({
            type: 'completed',
            action: 'Synthesizing',
            message: 'Agent completed task.'
          });
          break;
        }

        for (const call of toolCalls) {
          if (signal?.aborted) break;

          const fn = 'function' in call ? call.function : (call as any).function;
          const name = fn.name;
          let toolArgs: Record<string, any> = {};
          try {
            toolArgs = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : fn.arguments || {};
          } catch {
            toolArgs = {};
          }
          totalToolCalls++;

          const signature = `${name}:${JSON.stringify(toolArgs)}`;
          const count = (callCounts.get(signature) || 0) + 1;
          callCounts.set(signature, count);

          if (count > 2) {
            onEvent({
              type: 'tool_failed',
              action: 'Thinking',
              tool: name,
              message: `Tool "${name}" was called with identical arguments multiple times. Moving forward.`
            });
            openAIMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({ error: `Tool "${name}" was already executed with identical arguments. Please synthesize your answer with the information obtained.` })
            });
            continue;
          }

          const { action, startMessage } = getToolActionMetadata(name, toolArgs);

          onEvent({
            type: 'tool_started',
            action,
            tool: name,
            args: toolArgs,
            message: startMessage
          });

          const loopReminder = checkToolLoop(name, toolArgs);
          const result = await ToolRegistry.execute(name, toolArgs, context);
          if (loopReminder && result.output && typeof result.output === 'object') {
            result.output._system_loop_reminder = loopReminder;
          }

          if (result.success) {
            let completionMsg = `Completed "${name}" successfully.`;
            if (name === 'search_project' || name === 'search_codebase') {
              completionMsg = `Found ${result.output?.matchesFound ?? 0} match(es) in codebase.`;
            } else if (name === 'read_project_file' || name === 'read_file') {
              completionMsg = `Read ${toolArgs.path} (${result.output?.totalLines || 0} lines).`;
            } else if (name === 'list_project_files' || name === 'list_files') {
              completionMsg = `Found ${result.output?.totalFound ?? 0} project file(s).`;
            } else if (name === 'get_project_context') {
              completionMsg = `Inspected project structure (${result.output?.totalFiles ?? 0} files).`;
            } else if (name === 'find_symbol') {
              completionMsg = `Found ${result.output?.matchesFound ?? 0} symbol declaration(s).`;
            } else if (name === 'read_diagnostics') {
              completionMsg = `Read ${result.output?.totalDiagnostics ?? 0} diagnostic item(s).`;
            } else if (name === 'get_git_diff') {
              completionMsg = `Inspected ${result.output?.filesChecked ?? 0} workspace file diff(s).`;
            } else if (name === 'run_validation') {
              completionMsg = result.output?.passed ? 'Validation passed: 0 errors.' : `Validation detected ${result.output?.errorCount ?? 0} error(s).`;
            }

            onEvent({
              type: 'tool_completed',
              action,
              tool: name,
              message: completionMsg,
              outputSummary: result.output ? JSON.stringify(result.output).slice(0, 150) : undefined
            });

            if ((name === 'propose_changes' || name === 'edit_file') && (result.output?.changes || result.output?.proposal)) {
              const proposal = result.output.proposal;
              changeSet = {
                id: result.output.proposalId || Math.random().toString(36).substring(7),
                proposalId: result.output.proposalId,
                projectId: context.projectId,
                ownerId: context.userId,
                description: result.output.description || 'Proposed Code Changes',
                status: 'pending',
                changes: (proposal?.changes || result.output.changes || []).map((c: any) => ({
                  path: c.path,
                  operation: c.operation,
                  originalContent: c.originalContent,
                  proposedContent: c.proposedContent,
                  originalHash: c.originalHash,
                  proposedHash: c.proposedHash,
                  diffStats: c.diffStats,
                  status: c.status || 'pending'
                }))
              };
              onEvent({
                type: 'review_ready',
                action: 'Generating proposal',
                message: `Code changes proposed: "${changeSet.description}" (${changeSet.changes.length} file(s) ready for review).`
              });
            }

            openAIMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(result.output || { success: true })
            });
          } else {
            onEvent({
              type: 'tool_failed',
              action: 'Thinking',
              tool: name,
              message: `Tool "${name}" failed: ${result.error}`
            });

            openAIMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({ error: result.error || 'Tool execution failed' })
            });
          }
        }

        if (changeSet) {
          reachedCompletion = true;
          if (!finalResponseText) {
            finalResponseText = `I have generated a code proposal: **${changeSet.description}** with ${changeSet.changes.length} file change(s).\n\nPlease review the diffs using the **Review Diffs** button to inspect additions, deletions, and approve applying them to your workspace.`;
          }
          break;
        }
      }

    const status: AgentRunnerResult['status'] = signal?.aborted ? 'cancelled' : reachedCompletion ? 'completed' : 'failed';
    if (status === 'failed' && !terminalError) terminalError = `Agent did not finish within ${MAX_ROUNDS} reasoning rounds.`;
    if (status === 'failed' && !failureReported) onEvent({ type: 'failed', message: terminalError });

    return {
      text: finalResponseText,
      changeSet,
      toolCallsCount: totalToolCalls,
      roundsCount: rounds,
      status,
      ...(terminalError ? { error: terminalError } : {})
    };
  }
}
