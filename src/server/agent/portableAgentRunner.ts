import type { ChangeSet } from '../../types';
import { ToolRegistry } from './toolRegistry';
import type { AgentProgressEvent, ToolExecutionContext, ToolResult } from './types';

type Provider = 'openai' | 'xai' | 'anthropic';
type ToolCall = { id: string; name: string; args: Record<string, unknown> };

const MAX_ROUNDS = 8;
const MAX_TOOL_CALLS = 15;
const MAX_RUNTIME_MS = 60_000;
const MAX_FILES = 1_000;
const MAX_FILE_BYTES = 500 * 1024;
const SENSITIVE = [/^\.env($|\.)/i, /^node_modules\//i, /^\.git\//i, /^dist\//i, /^build\//i, /\.(pem|key|p12|pfx|keystore)$/i, /(^|\/)id_rsa/i];

interface ToolDefinition {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, { type: string; description: string }>; required?: string[] };
}

function tools(): ToolDefinition[] {
  return ToolRegistry.getAllTools().map(({ name, description, parameters }) => ({ name, description, parameters }));
}

function safeFiles(files: unknown[]): Map<string, { path: string; name: string; content: string; type: string }> {
  const result = new Map<string, { path: string; name: string; content: string; type: string }>();
  for (const item of files.slice(0, MAX_FILES)) {
    if (!item || typeof item !== 'object') continue;
    const file = item as Record<string, unknown>;
    if (typeof file.path !== 'string' || file.type === 'folder') continue;
    const path = file.path.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!path || path.split('/').some((part) => part === '..') || path.includes('\0') || SENSITIVE.some((pattern) => pattern.test(path))) continue;
    const content = typeof file.content === 'string' ? file.content.slice(0, MAX_FILE_BYTES) : '';
    result.set(path, { path, name: typeof file.name === 'string' ? file.name : path.split('/').pop() || path, content, type: 'file' });
  }
  return result;
}

function systemPrompt(specialist?: string): string {
  const base = `You are FLOAT AI's autonomous software engineering agent. Inspect and reason about the supplied project using safe read-only tools. Never directly write, delete, or overwrite project files. For code changes, call propose_changes with complete file contents so the user can review a diff before applying. Inspect the codebase before proposing changes. Explain what you changed and why.`;
  return specialist?.trim() ? `${base}\n\nSpecialization (does not override safety or review requirements):\n${specialist.trim()}` : base;
}

function send(res: any, type: string, data: unknown) {
  if (res.destroyed || res.writableEnded) return;
  res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
}

function changeSetFrom(result: ToolResult, context: ToolExecutionContext): ChangeSet | null {
  const proposal = result.output?.proposal;
  if (!proposal && !result.output?.changes) return null;
  return {
    id: result.output.proposalId || proposal?.id || Math.random().toString(36).slice(2),
    proposalId: result.output.proposalId || proposal?.id,
    projectId: context.projectId,
    ownerId: context.userId,
    description: result.output.description || proposal?.description || 'Proposed Code Changes',
    status: 'pending',
    changes: (proposal?.changes || result.output.changes || []).map((change: any) => ({
      path: change.path,
      operation: change.operation,
      originalContent: change.originalContent,
      proposedContent: change.proposedContent,
      originalHash: change.originalHash,
      proposedHash: change.proposedHash,
      diffStats: change.diffStats,
      status: change.status || 'pending',
    })),
  };
}

async function providerTurn(provider: Provider, model: string, key: string, instruction: string, history: any[], signal: AbortSignal) {
  const definitions = tools();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let url: string;
  let body: Record<string, unknown>;

  if (provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model,
      system: instruction,
      max_tokens: 8192,
      messages: history,
      tools: definitions.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })),
    };
  } else {
    url = provider === 'xai' ? 'https://api.x.ai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
    headers.Authorization = `Bearer ${key}`;
    body = {
      model,
      messages: history,
      tools: definitions.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } })),
      tool_choice: 'auto',
    };
  }

  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.message || `${provider} API returned status ${response.status}`);

  if (provider === 'anthropic') {
    const blocks = Array.isArray(data.content) ? data.content : [];
    const text = blocks.filter((block: any) => block.type === 'text').map((block: any) => block.text || '').join('');
    const calls = blocks.filter((block: any) => block.type === 'tool_use').map((block: any) => ({ id: String(block.id), name: String(block.name), args: block.input && typeof block.input === 'object' ? block.input : {} }));
    return { text, calls, assistantMessage: { role: 'assistant', content: blocks } };
  }

  const message = data.choices?.[0]?.message || {};
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls.map((call: any) => {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(call.function?.arguments || '{}'); } catch { throw new Error(`The model returned invalid JSON arguments for tool ${call.function?.name || 'unknown'}.`); }
    return { id: String(call.id), name: String(call.function?.name || ''), args };
  }) : [];
  return { text: typeof message.content === 'string' ? message.content : '', calls, assistantMessage: message };
}

export class PortableAgentRunner {
  static async run(provider: Provider, req: any, res: any, model: string, prompt: string, virtualFiles: unknown[], apiKey: string): Promise<void> {
    if (!prompt.trim()) throw new Error('A non-empty prompt is required to run the agent.');
    if (!apiKey) throw new Error(`The ${provider} server API key is not configured.`);

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    const context: ToolExecutionContext = {
      userId: req.user?.uid || 'user',
      projectId: typeof req.body?.projectId === 'string' ? req.body.projectId : 'default-project',
      projectName: typeof req.body?.projectName === 'string' ? req.body.projectName : 'Workspace',
      virtualFiles: safeFiles(Array.isArray(virtualFiles) ? virtualFiles : []),
      signal: controller.signal,
    };
    const instruction = systemPrompt(typeof req.body?.systemInstruction === 'string' ? req.body.systemInstruction.slice(0, 8_000) : undefined);
    let history: any[] = provider === 'anthropic' ? [{ role: 'user', content: prompt }] : [{ role: 'system', content: instruction }, { role: 'user', content: prompt }];
    let finalText = '';
    let changeSet: ChangeSet | null = null;
    let toolCallsCount = 0;
    let finished = false;
    const startedAt = Date.now();
    const repeatedCalls = new Map<string, number>();
    send(res, 'event', { type: 'task_started', action: 'Planning', message: 'Agent initialized task and workspace context.' });

    try {
      for (let round = 1; round <= MAX_ROUNDS; round++) {
        if (controller.signal.aborted) break;
        if (Date.now() - startedAt > MAX_RUNTIME_MS) throw new Error('Agent execution exceeded the 60 second limit.');
        if (toolCallsCount >= MAX_TOOL_CALLS) throw new Error(`Agent reached the ${MAX_TOOL_CALLS} tool call limit.`);
        send(res, 'event', { type: 'thinking', action: toolCallsCount ? 'Synthesizing' : 'Thinking', message: `Reasoning about request and codebase (round ${round}/${MAX_ROUNDS}).` });
        const turn = await providerTurn(provider, model, apiKey, instruction, history, controller.signal);
        if (turn.text) {
          finalText = finalText ? `${finalText}\n\n${turn.text}` : turn.text;
          send(res, 'delta', { text: turn.text });
        }
        history.push(turn.assistantMessage);
        if (!turn.calls.length) {
          send(res, 'event', { type: 'completed', action: 'Synthesizing', message: 'Agent completed task.' });
          finished = true;
          break;
        }

        const toolResults: Array<{ id: string; name: string; result: ToolResult }> = [];
        for (const call of turn.calls) {
          if (controller.signal.aborted) break;
          if (toolCallsCount >= MAX_TOOL_CALLS) break;
          toolCallsCount++;
          const signature = `${call.name}:${JSON.stringify(call.args)}`;
          const count = (repeatedCalls.get(signature) || 0) + 1;
          repeatedCalls.set(signature, count);
          const result: ToolResult = count > 2
            ? { success: false, error: 'This exact tool call was already executed twice. Continue with the available results.' }
            : await ToolRegistry.execute(call.name, call.args, context);
          send(res, 'event', {
            type: result.success ? 'tool_completed' : 'tool_failed',
            action: call.name === 'propose_changes' ? 'Generating proposal' : 'Thinking',
            tool: call.name,
            args: call.args,
            message: result.success ? `Completed "${call.name}" successfully.` : `Tool "${call.name}" failed: ${result.error}`,
            outputSummary: result.output ? JSON.stringify(result.output).slice(0, 180) : undefined,
          });
          if (call.name === 'propose_changes' && result.success) {
            changeSet = changeSetFrom(result, context);
            if (changeSet) send(res, 'event', { type: 'review_ready', action: 'Generating proposal', message: `Code changes proposed: "${changeSet.description}" (${changeSet.changes.length} file(s) ready for review).` });
          }
          toolResults.push({ id: call.id, name: call.name, result });
        }

        if (provider === 'anthropic') {
          history.push({ role: 'user', content: toolResults.map(({ id, result }) => ({ type: 'tool_result', tool_use_id: id, content: JSON.stringify(result.success ? { result: result.output } : { error: result.error }), is_error: !result.success })) });
        } else {
          for (const { id, name, result } of toolResults) history.push({ role: 'tool', tool_call_id: id, name, content: JSON.stringify(result.success ? { result: result.output } : { error: result.error }) });
        }
        if (changeSet) {
          if (!finalText) finalText = `I have generated a code proposal: **${changeSet.description}** with ${changeSet.changes.length} file change(s). Review the diffs before applying them.`;
          finished = true;
          break;
        }
      }
      if (!controller.signal.aborted && !finished) {
        send(res, 'event', { type: 'failed', message: `Agent did not reach a final answer within ${MAX_ROUNDS} reasoning rounds.` });
      }
      send(res, 'result', { text: finalText, changeSet, toolCallsCount });
    } catch (error: any) {
      if (!controller.signal.aborted) {
        const message = error?.message || 'Agent execution failed.';
        send(res, 'event', { type: 'failed', message });
        send(res, 'result', { text: `**Agent Execution Stopped**: ${message}`, changeSet: null });
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  }
}
