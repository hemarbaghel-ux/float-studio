import OpenAI from 'openai';
import {
  AIProviderAdapter,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderError,
  ProviderHealthCheckResult
} from './base';
import { getModelProtocol, MODEL_REGISTRY } from './modelRegistry';

function sanitizeOpenAIErrorMessage(msg: string): string {
  return msg.replace(/sk-[a-zA-Z0-9_\-]{8,}/g, 'sk-[REDACTED]');
}

export function normalizeOpenAIError(error: any): AIProviderError {
  const rawMsg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
  const msg = sanitizeOpenAIErrorMessage(rawMsg);
  const status = error?.status || error?.statusCode;

  if (
    error?.name === 'AbortError' ||
    error?.type === 'cancelation' ||
    error?.type === 'cancelled' ||
    /operation is manually canceled/i.test(msg) ||
    /cancel/i.test(msg)
  ) {
    const err = new AIProviderError('Operation was cancelled.', 'INVALID_REQUEST', 'OpenAI', 499);
    (err as any).name = 'AbortError';
    (err as any).type = 'cancelation';
    return err;
  }

  if (status === 401 || /invalid_api_key|Incorrect API key|unauthorized|invalid api key|authenticate/i.test(msg)) {
    return new AIProviderError(
      "OpenAI authentication failed. The server-side OPENAI_API_KEY is missing, invalid, or unauthorized.",
      'AUTH_ERROR',
      'OpenAI',
      401,
      { original: msg }
    );
  }

  if (status === 403 || /permission_denied|forbidden|country_not_supported/i.test(msg)) {
    return new AIProviderError(
      "OpenAI permission denied. The configured credentials do not have permission to access the requested resource.",
      'AUTH_ERROR',
      'OpenAI',
      403,
      { original: msg }
    );
  }

  if (status === 404 || /model_not_found|does not exist|access to model|model .* not found/i.test(msg)) {
    return new AIProviderError(
      `The requested OpenAI model is not accessible or recognized with current credentials.`,
      'MODEL_NOT_FOUND',
      'OpenAI',
      404,
      { original: msg }
    );
  }

  if (/insufficient_quota|exceeded your current quota|billing/i.test(msg)) {
    return new AIProviderError(
      "OpenAI account quota exceeded. Please check your OpenAI account billing or switch to another operational model.",
      'QUOTA_EXCEEDED',
      'OpenAI',
      429,
      { original: msg }
    );
  }

  if (status === 429 || /rate[- ]?limit|too many requests/i.test(msg)) {
    return new AIProviderError(
      "OpenAI rate limit exceeded. Please wait a moment before retrying.",
      'RATE_LIMITED',
      'OpenAI',
      429,
      { original: msg }
    );
  }

  if (status === 400 || /bad request|invalid_request_error|parameter/i.test(msg)) {
    return new AIProviderError(
      `OpenAI invalid request: ${msg}`,
      'INVALID_REQUEST',
      'OpenAI',
      400,
      { original: msg }
    );
  }

  return new AIProviderError(
    msg || 'An unexpected error occurred with the OpenAI provider.',
    'PROVIDER_ERROR',
    'OpenAI',
    status || 502,
    { original: msg }
  );
}

export class OpenAIAdapter implements AIProviderAdapter {
  id = 'openai';
  name = 'OpenAI';

  /**
   * Authoritative, documented credential resolver for OpenAI.
   * Primary documented credential source for OpenAI API requests is OPENAI_API_KEY.
   */
  public resolveApiKey(_forModel?: string): string | undefined {
    const key = process.env.OPENAI_API_KEY?.trim();
    return key && key.length > 0 && !key.includes('replace_with') ? key : undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.resolveApiKey());
  }

  private getClient(forModel?: string): OpenAI {
    const key = this.resolveApiKey(forModel);
    if (!key) {
      throw new AIProviderError(
        "OpenAI is not configured on the FLOAT server. To use OpenAI models, configure OPENAI_API_KEY in the server environment.",
        'AUTH_ERROR',
        'OpenAI',
        401
      );
    }
    return new OpenAI({ apiKey: key });
  }

  async checkHealth(): Promise<ProviderHealthCheckResult> {
    const selectedModels = MODEL_REGISTRY.filter((model) => model.selectable);
    const defaultModel = selectedModels.find((model) => model.id === 'gpt-6-astra')?.apiModelId;
    const configurationRequired = Object.fromEntries(selectedModels.map((model) => [model.id, {
      upstreamModelId: model.apiModelId,
      status: 'configuration_required' as const,
      detail: 'OPENAI_API_KEY is not configured on this server.'
    }]));

    if (!this.isConfigured()) {
      return {
        provider: 'OpenAI',
        configured: false,
        authenticated: false,
        modelAvailable: false,
        defaultModel,
        accessibleModelIds: [],
        modelAccess: configurationRequired
      };
    }

    try {
      const client = this.getClient(defaultModel);
      const models = await client.models.list();
      const listedModelIds = new Set(models.data.map((model) => model.id));
      const accessibleModelIds = selectedModels
        .filter((model) => listedModelIds.has(model.apiModelId))
        .map((model) => model.apiModelId);
      const modelAccess = Object.fromEntries(selectedModels.map((model) => {
        const listed = listedModelIds.has(model.apiModelId);
        return [model.id, {
          upstreamModelId: model.apiModelId,
          status: listed ? 'listed' as const : 'not_listed' as const,
          detail: listed
            ? 'The configured credential lists this model ID. Generation access has not been verified.'
            : 'The configured credential did not list this model ID. Generation access remains unverified.'
        }];
      }));
      return {
        provider: 'OpenAI',
        configured: true,
        authenticated: true,
        modelAvailable: false,
        defaultModel,
        accessibleModelIds,
        modelAccess
      };
    } catch (err: any) {
      const normalized = normalizeOpenAIError(err);
      return {
        provider: 'OpenAI',
        configured: true,
        authenticated: false,
        modelAvailable: false,
        defaultModel,
        accessibleModelIds: [],
        modelAccess: Object.fromEntries(selectedModels.map((model) => [model.id, {
          upstreamModelId: model.apiModelId,
          status: 'unverified' as const,
          detail: 'OpenAI credential verification failed; model access could not be checked.'
        }])),
        error: normalized.message
      };
    }
  }

  private resolveApiModel(model: string): string {
    const mapping: Record<string, string> = {
      auto: 'gpt-6-astra'
    };
    if (!model) throw new Error('Selected model is unavailable.');
    return mapping[model] || model;
  }

  private usesResponsesApi(model: string): boolean {
    return getModelProtocol(model) === 'responses';
  }

  private formatResponsesInput(request: AIProviderRequest): Array<Record<string, unknown>> {
    const messages: Array<Record<string, unknown>> = [];
    if (Array.isArray(request.messages)) {
      for (const msg of request.messages) {
        if (typeof msg === 'string') {
          messages.push({ role: 'user', content: msg });
          continue;
        }
        if (!msg || typeof msg !== 'object') continue;

        const role = msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user';
        const content = typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.parts)
            ? msg.parts.map((part: any) => part.text || '').join('')
            : typeof msg.text === 'string' ? msg.text : '';

        if (msg.role === 'tool') {
          messages.push({
            type: 'function_call_output',
            call_id: String(msg.toolCallId || msg.tool_call_id || msg.id || ''),
            output: content
          });
          continue;
        }

        if (role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
          if (content) messages.push({ role: 'assistant', content });
          for (const call of msg.toolCalls) {
            messages.push({
              type: 'function_call',
              call_id: String(call.id || ''),
              name: String(call.name || ''),
              arguments: JSON.stringify(call.arguments || {})
            });
          }
          continue;
        }

        messages.push({ role, content });
      }
    }
    if (messages.length === 0) messages.push({ role: 'user', content: 'Hello' });
    return messages;
  }

  private formatResponsesTools(tools?: AIProviderRequest['tools']): Array<Record<string, unknown>> | undefined {
    if (!tools?.length) return undefined;
    return tools.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }

  private parseResponsesOutput(response: any): Pick<AIProviderResponse, 'text' | 'toolCalls' | 'usage'> {
    const output = Array.isArray(response?.output) ? response.output : [];
    const text = typeof response?.output_text === 'string'
      ? response.output_text
      : output.flatMap((item: any) => item?.type === 'message' && Array.isArray(item.content)
        ? item.content.flatMap((part: any) => part?.type === 'output_text'
          ? [part.text || '']
          : part?.type === 'refusal' && typeof part.refusal === 'string' ? [part.refusal] : [])
        : []).join('');
    const toolCalls = output.filter((item: any) => item?.type === 'function_call').map((item: any) => {
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(item.arguments || '{}');
      } catch {
        throw new AIProviderError('OpenAI returned invalid function arguments.', 'PROVIDER_ERROR', 'OpenAI', 502);
      }
      return { id: String(item.call_id || item.id || ''), name: String(item.name || ''), arguments: args };
    });
    const usage = response?.usage ? {
      inputTokens: Number(response.usage.input_tokens || 0),
      outputTokens: Number(response.usage.output_tokens || 0)
    } : undefined;
    return { text, toolCalls, usage };
  }

  private formatMessages(request: AIProviderRequest, isReasoningModel: boolean): Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
    const systemRole = isReasoningModel ? 'developer' : 'system';
    const messages: Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> = [];

    if (request.systemInstruction) {
      messages.push({
        role: systemRole,
        content: request.systemInstruction
      } as any);
    }

    if (Array.isArray(request.messages)) {
      for (const msg of request.messages) {
        if (typeof msg === 'string') {
          messages.push({ role: 'user', content: msg });
        } else if (msg && typeof msg === 'object') {
          const role = msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user';
          let content = '';
          if (typeof msg.content === 'string') {
            content = msg.content;
          } else if (Array.isArray(msg.parts)) {
            content = msg.parts.map((p: any) => p.text || '').join('');
          } else if (msg.text) {
            content = msg.text;
          }

          if (msg.role === 'tool') {
            messages.push({
              role: 'tool',
              tool_call_id: String(msg.toolCallId || msg.tool_call_id || msg.id || ''),
              content
            } as any);
            continue;
          }

          if (role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
            messages.push({
              role: 'assistant',
              content: content || null,
              tool_calls: msg.toolCalls.map((call: any) => ({
                id: String(call.id || ''),
                type: 'function',
                function: {
                  name: String(call.name || ''),
                  arguments: JSON.stringify(call.arguments || {})
                }
              }))
            } as any);
            continue;
          }

          messages.push({ role, content } as any);
        }
      }
    }

    if (messages.length === 0) {
      messages.push({ role: 'user', content: 'Hello' });
    }

    return messages;
  }

  private formatTools(tools?: AIProviderRequest['tools']): OpenAI.Chat.Completions.ChatCompletionTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
  }

  private async streamDemoTokens(
    text: string,
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const tokens = text.split(/(\s+|\b)/);
    for (let i = 0; i < tokens.length; i++) {
      if (signal?.aborted) break;
      const tok = tokens[i];
      if (tok) {
        onChunk(tok);
        if (i % 4 === 0) {
          await new Promise(r => setTimeout(r, 14));
        }
      }
    }
  }

  private synthesizeDemoResponse(
    model: string,
    messages: any[],
    systemInstruction?: string
  ): string {
    const isSol = model.includes('sol') || model.includes('6.1');
    const demoBanner = `> **[SIMULATED DEMO RESPONSE]**\n> This response was generated locally in offline demo mode. No genuine AI provider execution occurred.\n\n`;
    const badge = demoBanner + (isSol
      ? '### [GPT-6.1 Sol — Deep Architectural Reasoning (Demo Mode)]'
      : '### [GPT-6 Astra — Flagship Coding Agent (Demo Mode)]');

    let userPrompt = '';
    if (Array.isArray(messages)) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (typeof m === 'string') { userPrompt = m; break; }
        if (m && (m.role === 'user' || !m.role)) {
          userPrompt = typeof m.content === 'string' ? m.content : m.parts?.[0]?.text || '';
          if (userPrompt) break;
        }
      }
    }
    if (!userPrompt) userPrompt = 'Hello';

    const cleanPrompt = userPrompt.toLowerCase();

    // 1. React / Component / Frontend prompt
    if (cleanPrompt.includes('react') || cleanPrompt.includes('component') || cleanPrompt.includes('ui') || cleanPrompt.includes('hook') || cleanPrompt.includes('state')) {
      return `${badge}

I have analyzed your request regarding UI component architecture. Here is the clean, production-ready solution adhering to React 19 standards, TypeScript type safety, and optimal re-rendering patterns.

\`\`\`tsx
import React, { useState, useTransition, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export interface WorkflowItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  timestamp: number;
}

interface WorkflowManagerProps {
  items: WorkflowItem[];
  onAction?: (item: WorkflowItem) => Promise<void>;
  className?: string;
}

export const WorkflowManager = memo(function WorkflowManager({
  items,
  onAction,
  className = ''
}: WorkflowManagerProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleExecute = useCallback((item: WorkflowItem) => {
    setActiveId(item.id);
    startTransition(async () => {
      try {
        if (onAction) await onAction(item);
      } catch (err) {
        console.error('Execution failure in workflow:', err);
      } finally {
        setActiveId(null);
      }
    });
  }, [onAction]);

  return (
    <div className={\`flex flex-col gap-3 p-4 rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-[#121212] \${className}\`}>
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-neutral-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Active Workflow</h3>
        <span className="text-xs text-slate-500 font-mono">{items.length} task(s)</span>
      </div>

      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-neutral-900/60 border border-slate-200/60 dark:border-neutral-800/60"
          >
            <div className="flex items-center gap-2.5">
              {item.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {item.status === 'failed' && <AlertCircle className="w-4 h-4 text-rose-500" />}
              {item.status === 'in_progress' && <Loader2 className="w-4 h-4 text-sky-500 animate-spin" />}
              <span className="text-sm font-medium text-slate-800 dark:text-neutral-200">{item.title}</span>
            </div>

            <button
              onClick={() => handleExecute(item)}
              disabled={isPending && activeId === item.id}
              className="px-3 py-1 text-xs font-medium rounded-md bg-slate-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isPending && activeId === item.id ? 'Running…' : 'Execute'}
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
});
\`\`\`

### Architectural Notes:
1. **React 19 Transitions**: Uses \`useTransition\` to keep the interface responsive and non-blocking during asynchronous execution.
2. **Memoization**: Wrapped in \`React.memo\` with \`useCallback\` to eliminate unnecessary parent re-renders.
3. **Accessibility & Dark Mode**: Full Tailwind v4 class coverage including high-contrast semantic borders and ARIA status icons.`;
    }

    // 2. Python / Data Analysis / Scripting prompt
    if (cleanPrompt.includes('python') || cleanPrompt.includes('script') || cleanPrompt.includes('pandas') || cleanPrompt.includes('data') || cleanPrompt.includes('csv') || cleanPrompt.includes('algorithm')) {
      return `${badge}

Here is the complete, idiomatic solution designed for execution in Python 3.11+ environments with strict type annotations and error boundaries:

\`\`\`python
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import json
import sys

@dataclass
class ProcessingResult:
    total_records: int
    valid_count: int
    error_count: int
    metrics: Dict[str, float]

def process_dataset(data: List[Dict[str, Any]], primary_key: str = "id") -> ProcessingResult:
    """
    Transforms and validates records with defensive error isolation.
    """
    if not isinstance(data, list):
        raise ValueError("Expected data to be a list of records")

    valid_records = []
    errors = 0
    numeric_accumulator = 0.0

    for idx, row in enumerate(data):
        if not isinstance(row, dict) or primary_key not in row:
            errors += 1
            continue

        valid_records.append(row)
        score = row.get("value", row.get("score", 0.0))
        try:
            numeric_accumulator += float(score)
        except (ValueError, TypeError):
            pass

    avg_metric = (numeric_accumulator / len(valid_records)) if valid_records else 0.0

    return ProcessingResult(
        total_records=len(data),
        valid_count=len(valid_records),
        error_count=errors,
        metrics={
            "mean_value": round(avg_metric, 4),
            "pass_rate": round(len(valid_records) / max(len(data), 1), 4)
        }
    )

if __name__ == "__main__":
    sample = [
        {"id": "rec_001", "name": "Alpha", "value": 42.5},
        {"id": "rec_002", "name": "Beta", "value": 18.2},
        {"id": "rec_003", "name": "Gamma", "value": 99.1},
    ]
    res = process_dataset(sample)
    print(json.dumps(res.__dict__, indent=2))
\`\`\`

### Key Features:
- **Zero-Dependency Core**: Executes cleanly without third-party packages, compatible with isolated sandbox runtimes.
- **Defensive Type Safety**: Gracefully handles malformed JSON payloads and type coercions.`;
    }

    // 3. Bug fix / Debugging / Refactor prompt
    if (cleanPrompt.includes('fix') || cleanPrompt.includes('bug') || cleanPrompt.includes('error') || cleanPrompt.includes('refactor') || cleanPrompt.includes('why')) {
      return `${badge}

### Root Cause Analysis
Based on inspecting your code, the issue originates from a race condition between asynchronous state resolution and component cleanup lifecycle.

### Recommended Resolution

\`\`\`typescript
/**
 * Safe asynchronous state executor with automatic abort signals.
 */
export async function executeSafeTask<T>(
  taskFn: (signal: AbortSignal) => Promise<T>,
  options?: { timeoutMs?: number }
): Promise<{ success: boolean; data?: T; error?: string }> {
  const controller = new AbortController();
  const timeoutId = options?.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;

  try {
    const result = await taskFn(controller.signal);
    return { success: true, data: result };
  } catch (err: any) {
    if (controller.signal.aborted || err?.name === 'AbortError') {
      return { success: false, error: 'Operation cancelled or timed out.' };
    }
    return { success: false, error: err?.message || 'Execution failed.' };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
\`\`\`

### Verification Checklist:
1. Verify cleanup functions return a disposable or abort call.
2. Confirm that rejected promises don't bubble unhandled to global window listeners.
3. Check that state mutations only execute if the component remains mounted.`;
    }

    // 4. Default in-depth engineering response
    return `${badge}

I have received your request: "${userPrompt.slice(0, 160)}".

${isSol ? 'Applying multi-step architectural reasoning to formulate the recommended structure.' : 'Structuring an autonomous, production-grade implementation for your workspace.'}

### Proposed Engineering Strategy
1. **System Invariants**: Maintain immutable baselines and type-safe interfaces.
2. **Execution Boundary**: Validate parameters before dispatching asynchronous tasks.
3. **Resilience**: Ensure graceful fallbacks and proper cleanup on disconnection or cancellation.

\`\`\`typescript
export interface ExecutionContext {
  id: string;
  mode: 'astra' | 'sol';
  timestamp: number;
}

export function initializeExecutionContext(mode: 'astra' | 'sol' = '${isSol ? 'sol' : 'astra'}'): ExecutionContext {
  return {
    id: \`exec_\${Date.now()}_\${Math.random().toString(36).substring(2, 7)}\`,
    mode,
    timestamp: Date.now()
  };
}
\`\`\`

Let me know what specific module, file, or integration you would like to implement or modify next.`;
  }

  async generateContent(request: AIProviderRequest): Promise<AIProviderResponse> {
    const requestedModel = request.apiModelId || request.model;
    const effectiveModel = this.resolveApiModel(requestedModel);

    // If demo mode is explicitly requested, generate a visibly identified offline simulation
    if (request.demoMode) {
      const text = this.synthesizeDemoResponse(requestedModel, request.messages, request.systemInstruction);
      return {
        text,
        isSimulated: true
      };
    }

    if (!this.isConfigured()) {
      throw new AIProviderError(
        "OpenAI is not configured on the FLOAT server. To use OpenAI models, configure OPENAI_API_KEY in the server environment.",
        'AUTH_ERROR',
        'OpenAI',
        401
      );
    }

    const client = this.getClient(requestedModel);
    if (this.usesResponsesApi(effectiveModel)) {
      try {
        const response = await client.responses.create({
          model: effectiveModel,
          ...(request.systemInstruction ? { instructions: request.systemInstruction } : {}),
          input: this.formatResponsesInput(request),
          ...(this.formatResponsesTools(request.tools) ? { tools: this.formatResponsesTools(request.tools) } : {}),
          ...(request.maxOutputTokens ? { max_output_tokens: request.maxOutputTokens } : {}),
          ...(request.reasoningEffort ? { reasoning: { effort: request.reasoningEffort } } : {})
        } as any, request.signal ? { signal: request.signal } : undefined);
        return this.parseResponsesOutput(response) as AIProviderResponse;
      } catch (err: any) {
        throw normalizeOpenAIError(err);
      }
    }
    const isReasoning = effectiveModel.startsWith('o1') || effectiveModel.startsWith('o3');

    try {
      const messages = this.formatMessages(request, isReasoning);
      const tools = this.formatTools(request.tools);

      const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: effectiveModel,
        messages,
        ...(request.maxOutputTokens ? { max_tokens: request.maxOutputTokens } : {}),
        ...(tools ? { tools } : {})
      };

      if ((effectiveModel === 'o1' || effectiveModel === 'o3-mini') && request.reasoningEffort) {
        (params as any).reasoning_effort = request.reasoningEffort;
      }

      const response = await client.chat.completions.create(params, request.signal ? { signal: request.signal } : undefined);

      const choice = response.choices[0];
      const text = choice?.message?.content || '';

      const executedTools = choice?.message?.tool_calls?.map(tc => {
        let args: Record<string, any> = {};
        const fn = 'function' in tc ? tc.function : (tc as any).function;
        if (fn?.arguments) {
          try {
            args = JSON.parse(fn.arguments);
          } catch {
            args = { raw: fn.arguments };
          }
        }
        return {
          id: tc.id,
          name: fn?.name || '',
          arguments: args
        };
      });

      const usage = response.usage ? {
        inputTokens: response.usage.prompt_tokens || 0,
        outputTokens: response.usage.completion_tokens || 0
      } : undefined;

      return {
        text,
        toolCalls: executedTools,
        usage
      };
    } catch (err: any) {
      throw normalizeOpenAIError(err);
    }
  }

  async generateContentStream(
    request: AIProviderRequest,
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<AIProviderResponse> {
    const requestedModel = request.apiModelId || request.model;
    const effectiveModel = this.resolveApiModel(requestedModel);

    // If demo mode is explicitly requested, stream visibly identified offline simulation
    if (request.demoMode) {
      const demoText = this.synthesizeDemoResponse(requestedModel, request.messages, request.systemInstruction);
      await this.streamDemoTokens(demoText, onChunk, signal);
      return {
        text: demoText,
        isSimulated: true
      };
    }

    if (!this.isConfigured()) {
      throw new AIProviderError(
        "OpenAI is not configured on the FLOAT server. To use OpenAI models, configure OPENAI_API_KEY in the server environment.",
        'AUTH_ERROR',
        'OpenAI',
        401
      );
    }

    const client = this.getClient(requestedModel);
    if (this.usesResponsesApi(effectiveModel)) {
      try {
        const stream = await client.responses.create({
          model: effectiveModel,
          ...(request.systemInstruction ? { instructions: request.systemInstruction } : {}),
          input: this.formatResponsesInput(request),
          ...(this.formatResponsesTools(request.tools) ? { tools: this.formatResponsesTools(request.tools) } : {}),
          ...(request.maxOutputTokens ? { max_output_tokens: request.maxOutputTokens } : {}),
          ...(request.reasoningEffort ? { reasoning: { effort: request.reasoningEffort } } : {}),
          stream: true
        } as any, { signal } as any) as any;
        let fullText = '';
        let completedResponse: any;
        for await (const event of stream) {
          if (signal?.aborted) break;
          if ((event?.type === 'response.output_text.delta' || event?.type === 'response.refusal.delta') && typeof event.delta === 'string') {
            fullText += event.delta;
            onChunk(event.delta);
          } else if (event?.type === 'response.completed') {
            completedResponse = event.response;
          } else if (event?.type === 'response.failed' || event?.type === 'error') {
            throw event.error || new Error(event.response?.error?.message || 'OpenAI response stream failed.');
          }
        }
        if (signal?.aborted) {
          const cancelled = new Error('Operation was cancelled.');
          cancelled.name = 'AbortError';
          throw cancelled;
        }
        if (!completedResponse) throw new Error('OpenAI response stream ended before completion.');
        const parsed = this.parseResponsesOutput(completedResponse);
        return { ...parsed, text: fullText || parsed.text } as AIProviderResponse;
      } catch (err: any) {
        throw normalizeOpenAIError(err);
      }
    }
    const isReasoning = effectiveModel.startsWith('o1') || effectiveModel.startsWith('o3');

    try {
      const messages = this.formatMessages(request, isReasoning);
      const tools = this.formatTools(request.tools);

      const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
        model: effectiveModel,
        messages,
        ...(request.maxOutputTokens ? { max_tokens: request.maxOutputTokens } : {}),
        stream: true,
        stream_options: { include_usage: true },
        ...(tools ? { tools } : {})
      };

      if ((effectiveModel === 'o1' || effectiveModel === 'o3-mini') && request.reasoningEffort) {
        (params as any).reasoning_effort = request.reasoningEffort;
      }

      const stream = await client.chat.completions.create(params, { signal });

      let fullText = '';
      let inputTokens: number | undefined = undefined;
      let outputTokens: number | undefined = undefined;

      for await (const chunk of stream) {
        if (signal?.aborted) break;
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          onChunk(delta);
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
          outputTokens = chunk.usage.completion_tokens ?? outputTokens;
        }
      }

      const usage = (inputTokens !== undefined || outputTokens !== undefined)
        ? { inputTokens: inputTokens ?? 0, outputTokens: outputTokens ?? 0 }
        : undefined;

      return {
        text: fullText,
        usage
      };
    } catch (err: any) {
      throw normalizeOpenAIError(err);
    }
  }

}
