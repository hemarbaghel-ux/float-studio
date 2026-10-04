import OpenAI from 'openai';
import { 
  AIProviderAdapter, 
  AIProviderRequest, 
  AIProviderResponse, 
  AIProviderError, 
  ProviderHealthCheckResult 
} from './base';
import { AgentRunner } from '../agent/agentRunner';

export function normalizeXAIError(error: any): AIProviderError {
  const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
  const status = error?.status || error?.statusCode;

  if (
    error?.name === 'AbortError' ||
    error?.type === 'cancelation' ||
    error?.type === 'cancelled' ||
    /operation is manually canceled/i.test(msg) ||
    /cancel/i.test(msg)
  ) {
    const err = new AIProviderError('Operation was cancelled.', 'INVALID_REQUEST', 'xAI', 499);
    (err as any).name = 'AbortError';
    (err as any).type = 'cancelation';
    return err;
  }

  if (status === 401 || /invalid_api_key|authentication|401|api_key|unauthorized/i.test(msg)) {
    return new AIProviderError(
      "xAI authentication failed. The server-side XAI_API_KEY is missing, invalid, or unauthorized.",
      'AUTH_ERROR',
      'xAI',
      401,
      { original: msg }
    );
  }

  if (status === 404 || /not_found|model/i.test(msg)) {
    return new AIProviderError(
      "The requested Grok model is not available or unrecognized by the provider API.",
      'MODEL_NOT_FOUND',
      'xAI',
      404,
      { original: msg }
    );
  }

  if (/insufficient_quota|quota/i.test(msg)) {
    return new AIProviderError(
      "xAI quota exceeded. Please check your xAI account billing.",
      'QUOTA_EXCEEDED',
      'xAI',
      429,
      { original: msg }
    );
  }

  if (/rate[- ]?limit|429/i.test(msg) || status === 429) {
    return new AIProviderError(
      "xAI rate limit exceeded. Please wait a moment before trying again.",
      'RATE_LIMITED',
      'xAI',
      429,
      { original: msg }
    );
  }

  if (status === 400 || /bad_request|invalid_request/i.test(msg)) {
    return new AIProviderError(
      `Invalid request for xAI model: ${msg}`,
      'INVALID_REQUEST',
      'xAI',
      400,
      { original: msg }
    );
  }

  return new AIProviderError(
    msg || 'An unexpected error occurred with the xAI provider.',
    'PROVIDER_ERROR',
    'xAI',
    status || 500,
    { original: msg }
  );
}

export class XAIAdapter implements AIProviderAdapter {
  id = 'xai';
  name = 'xAI';

  isConfigured(): boolean {
    const key = process.env.XAI_API_KEY;
    return Boolean(key && key.trim().length > 0 && !key.includes('replace_with'));
  }

  private getClient(): OpenAI {
    if (!this.isConfigured()) {
      throw new AIProviderError(
        "xAI is not configured on the FLOAT server. To use Grok models, configure XAI_API_KEY in the server environment.",
        'AUTH_ERROR',
        'xAI',
        401
      );
    }
    return new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: 'https://api.x.ai/v1'
    });
  }

  async checkHealth(): Promise<ProviderHealthCheckResult> {
    if (!this.isConfigured()) {
      return {
        provider: 'xAI',
        configured: false,
        authenticated: false,
        modelAvailable: false,
        defaultModel: 'grok-2'
      };
    }

    try {
      const client = this.getClient();
      const models = await client.models.list();
      const hasGrok = models.data.some(m => m.id.includes('grok'));
      return {
        provider: 'xAI',
        configured: true,
        authenticated: true,
        modelAvailable: hasGrok || models.data.length > 0,
        defaultModel: 'grok-2'
      };
    } catch (err: any) {
      const normalized = normalizeXAIError(err);
      return {
        provider: 'xAI',
        configured: true,
        authenticated: false,
        modelAvailable: false,
        defaultModel: 'grok-2',
        error: normalized.message
      };
    }
  }

  private resolveApiModel(model: string): string {
    const mapping: Record<string, string> = {
      'grok-4.7': 'grok-2-1212',
      'grok-4.6': 'grok-2'
    };
    return mapping[model] || model;
  }

  private formatMessages(messages: any[], systemInstruction?: string): Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
    const formatted: Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> = [];

    if (systemInstruction) {
      formatted.push({ role: 'system', content: systemInstruction });
    }

    if (Array.isArray(messages)) {
      for (const msg of messages) {
        if (typeof msg === 'string') {
          formatted.push({ role: 'user', content: msg });
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
          formatted.push({ role, content } as any);
        }
      }
    }

    if (formatted.length === 0) {
      formatted.push({ role: 'user', content: 'Hello' });
    }

    return formatted;
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

  async generateContent(request: AIProviderRequest): Promise<AIProviderResponse> {
    const client = this.getClient();
    const effectiveModel = this.resolveApiModel(request.apiModelId || request.model);

    try {
      const messages = this.formatMessages(request.messages, request.systemInstruction);
      const tools = this.formatTools(request.tools);

      const response = await client.chat.completions.create({
        model: effectiveModel,
        messages,
        ...(tools ? { tools } : {})
      });

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
      throw normalizeXAIError(err);
    }
  }

  async generateContentStream(
    request: AIProviderRequest,
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<AIProviderResponse> {
    const client = this.getClient();
    const effectiveModel = this.resolveApiModel(request.apiModelId || request.model);

    try {
      const messages = this.formatMessages(request.messages, request.systemInstruction);
      const tools = this.formatTools(request.tools);

      const stream = await client.chat.completions.create({
        model: effectiveModel,
        messages,
        stream: true,
        ...(tools ? { tools } : {})
      }, { signal });

      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of stream) {
        if (signal?.aborted) break;
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          onChunk(delta);
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens || inputTokens;
          outputTokens = chunk.usage.completion_tokens || outputTokens;
        }
      }

      return {
        text: fullText,
        usage: (inputTokens || outputTokens) ? { inputTokens, outputTokens } : undefined
      };
    } catch (err: any) {
      throw normalizeXAIError(err);
    }
  }

  async runAgentLoop(
    req: any,
    res: any,
    model: string,
    prompt: string,
    virtualFiles: any[]
  ): Promise<void> {
    if (!this.isConfigured()) {
      throw new AIProviderError(
        `xAI is not configured on the FLOAT server. To run agents with "${model}", configure XAI_API_KEY in the server environment.`,
        'AUTH_ERROR',
        'xAI',
        401
      );
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const abortController = new AbortController();
    if (req?.on) {
      req.on('close', () => {
        abortController.abort();
      });
    }

    const sendEvent = (type: string, data: any) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      }
    };

    try {
      const apiModel = this.resolveApiModel(model);
      const result = await AgentRunner.run({
        provider: 'xai',
        model: apiModel,
        prompt,
        virtualFiles,
        projectName: req.body?.projectName || 'Workspace',
        projectId: req.body?.projectId || 'default-project',
        userId: req.user?.uid || 'user',
        onEvent: (event) => {
          sendEvent('event', event);
        },
        onDelta: (delta) => {
          sendEvent('delta', { text: delta });
        },
        signal: abortController.signal
      });

      sendEvent('result', {
        text: result.text,
        changeSet: result.changeSet
      });
    } catch (error: any) {
      if (!abortController.signal.aborted) {
        const normalized = normalizeXAIError(error);
        const isCancelled = normalized.name === 'AbortError' || (normalized as any).type === 'cancelation';
        if (isCancelled) {
          sendEvent('event', {
            type: 'cancelled',
            message: 'Agent execution was stopped by user.'
          });
          sendEvent('result', {
            text: '*(Agent task stopped)*',
            changeSet: null
          });
        } else {
          sendEvent('event', {
            type: 'failed',
            message: normalized.message
          });
          sendEvent('result', {
            text: `**Agent Execution Error (${normalized.code || 'PROVIDER_ERROR'})**\n\n${normalized.message}`,
            changeSet: null
          });
        }
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
}
