import OpenAI from 'openai';
import { 
  AIProviderAdapter, 
  AIProviderRequest, 
  AIProviderResponse, 
  AIProviderError, 
  ProviderHealthCheckResult 
} from './base';

export function normalizeOpenAIError(error: any): AIProviderError {
  const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
  const status = error?.status || error?.statusCode;

  if (status === 401 || /invalid_api_key|Incorrect API key|unauthorized|invalid api key|authenticate/i.test(msg)) {
    return new AIProviderError(
      "OpenAI authentication failed. The server-side OPENAI_API_KEY is missing, invalid, or unauthorized.",
      'AUTH_ERROR',
      'OpenAI',
      401,
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

  isConfigured(): boolean {
    const key = process.env.OPENAI_API_KEY;
    return Boolean(key && key.trim().length > 0 && !key.includes('replace_with'));
  }

  private getClient(): OpenAI {
    if (!this.isConfigured()) {
      throw new AIProviderError(
        "OpenAI is not configured on the FLOAT server. To use OpenAI models, configure OPENAI_API_KEY in the server environment.",
        'AUTH_ERROR',
        'OpenAI',
        401
      );
    }
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async checkHealth(): Promise<ProviderHealthCheckResult> {
    if (!this.isConfigured()) {
      return {
        provider: 'OpenAI',
        configured: false,
        authenticated: false,
        modelAvailable: false,
        defaultModel: 'gpt-4o'
      };
    }

    try {
      const client = this.getClient();
      // Lightweight verification using models.list or small limit
      const models = await client.models.list();
      const hasGpt4 = models.data.some(m => m.id.includes('gpt-4') || m.id.includes('o1') || m.id.includes('o3'));
      return {
        provider: 'OpenAI',
        configured: true,
        authenticated: true,
        modelAvailable: hasGpt4 || models.data.length > 0,
        defaultModel: 'gpt-4o'
      };
    } catch (err: any) {
      const normalized = normalizeOpenAIError(err);
      return {
        provider: 'OpenAI',
        configured: true,
        authenticated: false,
        modelAvailable: false,
        defaultModel: 'gpt-4o',
        error: normalized.message
      };
    }
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

  async generateContent(request: AIProviderRequest): Promise<AIProviderResponse> {
    const client = this.getClient();
    const effectiveModel = request.apiModelId || request.model;
    const isReasoning = effectiveModel.startsWith('o1') || effectiveModel.startsWith('o3');

    try {
      const messages = this.formatMessages(request, isReasoning);
      const tools = this.formatTools(request.tools);

      const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: effectiveModel,
        messages,
        ...(tools ? { tools } : {})
      };

      if (isReasoning && request.reasoningEffort) {
        (params as any).reasoning_effort = request.reasoningEffort;
      }

      const response = await client.chat.completions.create(params);
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
    const client = this.getClient();
    const effectiveModel = request.apiModelId || request.model;
    const isReasoning = effectiveModel.startsWith('o1') || effectiveModel.startsWith('o3');

    try {
      const messages = this.formatMessages(request, isReasoning);
      const tools = this.formatTools(request.tools);

      const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
        model: effectiveModel,
        messages,
        stream: true,
        ...(tools ? { tools } : {})
      };

      if (isReasoning && request.reasoningEffort) {
        (params as any).reasoning_effort = request.reasoningEffort;
      }

      const stream = await client.chat.completions.create(params, { signal });
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
      throw normalizeOpenAIError(err);
    }
  }

  async runAgentLoop(
    _req: any,
    _res: any,
    model: string,
    _prompt: string,
    _virtualFiles: any[]
  ): Promise<void> {
    if (!this.isConfigured()) {
      throw new AIProviderError(
        `OpenAI is not configured on the FLOAT server. To run agents with "${model}", configure OPENAI_API_KEY.`,
        'AUTH_ERROR',
        'OpenAI',
        401
      );
    }
    throw new AIProviderError(
      'OpenAI autonomous agent loops are currently in preview. Use Gemini 3.1 Flash Lite for full tool execution.',
      'INVALID_REQUEST',
      'OpenAI',
      400
    );
  }
}
