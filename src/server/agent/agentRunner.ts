import { GoogleGenAI, Type } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { ToolRegistry } from './toolRegistry';
import { ToolExecutionContext, AgentProgressEvent, AgentProgressAction } from './types';
import { ChangeSet } from '../../types';
import { normalizeGeminiError } from '../providers/gemini';
import { normalizeOpenAIError } from '../providers/openai';
import { normalizeXAIError } from '../providers/xai';
import { normalizeAnthropicError } from '../providers/anthropic';
import { AIProviderError } from '../providers/base';

export interface AgentRunnerOptions {
  provider?: 'google' | 'openai' | 'xai' | 'anthropic';
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
  if (normName === 'search_project' || normName === 'search_codebase') {
    const query = args.query ? `"${String(args.query).slice(0, 35)}"` : 'codebase';
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

    // Determine provider
    let provider: 'google' | 'openai' | 'xai' | 'anthropic' = options.provider || 'google';
    if (!options.provider) {
      if (model.includes('grok')) provider = 'xai';
      else if (model.includes('gpt') || model.includes('o1') || model.includes('o3')) provider = 'openai';
      else if (model.includes('claude')) provider = 'anthropic';
      else provider = 'google';
    }

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

    onEvent({
      type: 'thinking',
      action: 'Planning',
      message: 'Analyzing project and planning steps...'
    });

    // ==========================================
    // ROUTE EXECUTION BY PROVIDER
    // ==========================================

    if (provider === 'google') {
      if (!process.env.GEMINI_API_KEY) {
        throw new AIProviderError(
          'GEMINI_API_KEY is not configured on the FLOAT server.',
          'AUTH_ERROR',
          'Google Gemini',
          401
        );
      }

      // Map any old aliases to active gemini-3.8-flash
      let effectiveModel = model;
      if (
        model === 'auto' ||
        !model ||
        model === 'gemini-2.0-flash' ||
        model === 'gemini-1.5-flash' ||
        model === 'gemini-1.5-pro' ||
        model === 'gemini-2.5-flash' ||
        model === 'gemini-2.5-pro' ||
        model === 'gemini-3.1-flash-lite' ||
        model === 'composer-2.5' ||
        model === 'muse-spark-1.3'
      ) {
        effectiveModel = 'gemini-3.8-flash';
      }

      const geminiFunctionDeclarations = registeredTools.map(t => {
        const properties: Record<string, any> = {};
        const required: string[] = [];

        for (const [key, prop] of Object.entries(t.parameters.properties)) {
          properties[key] = {
            type: prop.type === 'number' ? Type.NUMBER : Type.STRING,
            description: prop.description
          };
        }

        if (t.parameters.required) {
          required.push(...t.parameters.required);
        }

        return {
          name: t.name,
          description: t.description,
          parameters: {
            type: Type.OBJECT,
            properties,
            required: required.length > 0 ? required : undefined
          }
        };
      });

      const geminiTools = [{ functionDeclarations: geminiFunctionDeclarations }];
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      let history: any[] = [{ role: 'user', parts: [{ text: prompt }] }];

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

        let response;
        try {
          response = await ai.models.generateContent({
            model: effectiveModel,
            contents: history,
            config: {
              systemInstruction,
              tools: geminiTools
            }
          });
        } catch (err: any) {
          throw normalizeGeminiError(err);
        }

        const functionCalls = response.functionCalls || [];

        if (response.text) {
          finalResponseText = finalResponseText ? `${finalResponseText}\n\n${response.text}` : response.text;
          if (onDelta) {
            onDelta(response.text);
          }
        }

        const candidateContent = response.candidates?.[0]?.content;
        if (candidateContent?.parts && candidateContent.parts.length > 0) {
          history.push({
            role: 'model',
            parts: candidateContent.parts
          });
        } else {
          const syntheticParts: any[] = [];
          if (response.text) {
            syntheticParts.push({ text: response.text });
          }
          for (const call of functionCalls) {
            const fc: any = {
              name: call.name,
              args: call.args || {}
            };
            if ((call as any).id) {
              fc.id = (call as any).id;
            }
            syntheticParts.push({ functionCall: fc });
          }
          history.push({
            role: 'model',
            parts: syntheticParts.length > 0 ? syntheticParts : [{ text: '...' }]
          });
        }

        if (!functionCalls || functionCalls.length === 0) {
          onEvent({
            type: 'completed',
            action: 'Synthesizing',
            message: 'Agent completed task.'
          });
          break;
        }

        const functionResponses: { id?: string; name: string; response: Record<string, any> }[] = [];

        for (const call of functionCalls) {
          if (signal?.aborted) break;

          const { name, args } = call;
          const callId = (call as any).id;
          const toolArgs = (args as Record<string, any>) || {};
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
            functionResponses.push({
              id: callId,
              name,
              response: { error: `Tool "${name}" was already executed with identical arguments. Please synthesize your answer with the information obtained.` }
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

          const result = await ToolRegistry.execute(name, toolArgs, context);

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
            }

            onEvent({
              type: 'tool_completed',
              action,
              tool: name,
              message: completionMsg,
              outputSummary: result.output ? JSON.stringify(result.output).slice(0, 150) : undefined
            });

            if (name === 'propose_changes' && (result.output?.changes || result.output?.proposal)) {
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

            functionResponses.push({
              id: callId,
              name,
              response: { result: result.output }
            });
          } else {
            onEvent({
              type: 'tool_failed',
              action: 'Thinking',
              tool: name,
              message: `Tool "${name}" failed: ${result.error}`
            });

            functionResponses.push({
              id: callId,
              name,
              response: { error: result.error || 'Tool execution failed' }
            });
          }
        }

        const responseParts: any[] = [];
        for (const fr of functionResponses) {
          const frPart: any = {
            name: fr.name,
            response: fr.response
          };
          if (fr.id) {
            frPart.id = fr.id;
          }
          responseParts.push({ functionResponse: frPart });
        }

        history.push({
          role: 'user',
          parts: responseParts
        });

        if (changeSet) {
          if (!finalResponseText) {
            finalResponseText = `I have generated a code proposal: **${changeSet.description}** with ${changeSet.changes.length} file change(s).\n\nPlease review the diffs using the **Review Diffs** button to inspect additions, deletions, and approve applying them to your workspace.`;
          }
          break;
        }
      }
    } else if (provider === 'xai' || provider === 'openai') {
      const isXAI = provider === 'xai';
      const apiKey = isXAI ? process.env.XAI_API_KEY : process.env.OPENAI_API_KEY;
      if (!apiKey || !apiKey.trim()) {
        throw new AIProviderError(
          `${isXAI ? 'xAI' : 'OpenAI'} is not configured on the FLOAT server. To run agents with ${isXAI ? 'Grok' : 'OpenAI models'}, configure ${isXAI ? 'XAI_API_KEY' : 'OPENAI_API_KEY'} in the server environment.`,
          'AUTH_ERROR',
          isXAI ? 'xAI' : 'OpenAI',
          401
        );
      }

      let effectiveModel = model;
      if (isXAI) {
        if (model === 'grok-4.7') effectiveModel = 'grok-2-1212';
        else if (model === 'grok-4.6') effectiveModel = 'grok-2';
        else if (!model || model === 'auto') effectiveModel = 'grok-2';
      } else {
        if (model === 'gpt-5.6-sol') effectiveModel = 'gpt-4o-2024-11-20';
        else if (!model || model === 'auto') effectiveModel = 'gpt-4o';
      }

      const client = new OpenAI({
        apiKey,
        baseURL: isXAI ? 'https://api.x.ai/v1' : undefined
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
          throw isXAI ? normalizeXAIError(err) : normalizeOpenAIError(err);
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

          const result = await ToolRegistry.execute(name, toolArgs, context);

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
            }

            onEvent({
              type: 'tool_completed',
              action,
              tool: name,
              message: completionMsg,
              outputSummary: result.output ? JSON.stringify(result.output).slice(0, 150) : undefined
            });

            if (name === 'propose_changes' && (result.output?.changes || result.output?.proposal)) {
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
          if (!finalResponseText) {
            finalResponseText = `I have generated a code proposal: **${changeSet.description}** with ${changeSet.changes.length} file change(s).\n\nPlease review the diffs using the **Review Diffs** button to inspect additions, deletions, and approve applying them to your workspace.`;
          }
          break;
        }
      }
    } else if (provider === 'anthropic') {
      if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_API_KEY.trim()) {
        throw new AIProviderError(
          'Anthropic is not configured on the FLOAT server. To run agents with Claude, configure ANTHROPIC_API_KEY in the server environment.',
          'AUTH_ERROR',
          'Anthropic',
          401
        );
      }

      let effectiveModel = model;
      if (model === 'claude-opus-5.5' || model === 'claude-opus-5') {
        effectiveModel = 'claude-3-opus-20240229';
      } else if (model === 'claude-fable-5.1') {
        effectiveModel = 'claude-3-7-sonnet-20250219';
      } else if (!model || model === 'auto') {
        effectiveModel = 'claude-3-5-sonnet-20241022';
      }

      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const anthropicTools: Anthropic.Tool[] = registeredTools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: {
          type: 'object',
          properties: t.parameters.properties,
          required: t.parameters.required || []
        }
      }));

      const anthropicMessages: any[] = [
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

        let resp: Anthropic.Message;
        try {
          resp = await client.messages.create({
            model: effectiveModel,
            max_tokens: 4096,
            system: systemInstruction,
            messages: anthropicMessages,
            tools: anthropicTools
          }, { signal });
        } catch (err: any) {
          throw normalizeAnthropicError(err);
        }

        anthropicMessages.push({ role: 'assistant', content: resp.content });

        const textBlocks = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
        for (const tb of textBlocks) {
          if (tb.text) {
            finalResponseText = finalResponseText ? `${finalResponseText}\n\n${tb.text}` : tb.text;
            if (onDelta) {
              onDelta(tb.text);
            }
          }
        }

        const toolUseBlocks = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
        if (toolUseBlocks.length === 0) {
          onEvent({
            type: 'completed',
            action: 'Synthesizing',
            message: 'Agent completed task.'
          });
          break;
        }

        const toolResults: any[] = [];
        for (const call of toolUseBlocks) {
          if (signal?.aborted) break;

          const name = call.name;
          const toolArgs = (call.input as Record<string, any>) || {};
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
            toolResults.push({
              type: 'tool_result',
              tool_use_id: call.id,
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

          const result = await ToolRegistry.execute(name, toolArgs, context);

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
            }

            onEvent({
              type: 'tool_completed',
              action,
              tool: name,
              message: completionMsg,
              outputSummary: result.output ? JSON.stringify(result.output).slice(0, 150) : undefined
            });

            if (name === 'propose_changes' && (result.output?.changes || result.output?.proposal)) {
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

            toolResults.push({
              type: 'tool_result',
              tool_use_id: call.id,
              content: JSON.stringify(result.output || { success: true })
            });
          } else {
            onEvent({
              type: 'tool_failed',
              action: 'Thinking',
              tool: name,
              message: `Tool "${name}" failed: ${result.error}`
            });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: call.id,
              content: JSON.stringify({ error: result.error || 'Tool execution failed' })
            });
          }
        }

        anthropicMessages.push({ role: 'user', content: toolResults });

        if (changeSet) {
          if (!finalResponseText) {
            finalResponseText = `I have generated a code proposal: **${changeSet.description}** with ${changeSet.changes.length} file change(s).\n\nPlease review the diffs using the **Review Diffs** button to inspect additions, deletions, and approve applying them to your workspace.`;
          }
          break;
        }
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
