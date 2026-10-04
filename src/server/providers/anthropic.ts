import Anthropic from '@anthropic-ai/sdk';
import { 
  AIProviderAdapter, 
  AIProviderRequest, 
  AIProviderResponse, 
  AIProviderError, 
  ProviderHealthCheckResult 
} from './base';

export function normalizeAnthropicError(error: any): AIProviderError {
  const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
  const status = error?.status || error?.statusCode;

  if (status === 401 || /invalid_api_key|authentication|401|api_key/i.test(msg)) {
    return new AIProviderError(
      "Anthropic authentication failed. The server-side ANTHROPIC_API_KEY is missing, invalid, or unauthorized.",
      'AUTH_ERROR',
      'Anthropic',
      401,
      { original: msg }
    );
  }

  if (status === 404 || /not_found|model/i.test(msg)) {
    return new AIProviderError(
      "The requested Anthropic model is not available or unrecognized by the provider API.",
      'MODEL_NOT_FOUND',
      'Anthropic',
      404,
      { original: msg }
    );
  }

  if (/rate[- ]?limit|429/i.test(msg) || status === 429) {
    return new AIProviderError(
      "Anthropic rate limit exceeded. Please wait a moment before trying again.",
      'RATE_LIMITED',
      'Anthropic',
      429,
      { original: msg }
    );
  }

  if (/overloaded|529/i.test(msg) || status === 529) {
    return new AIProviderError(
      "Anthropic servers are currently overloaded. Please retry in a few moments, or select an alternative model.",
      'PROVIDER_ERROR',
      'Anthropic',
      529,
      { original: msg }
    );
  }

  if (status === 400 || /bad_request|invalid_request/i.test(msg)) {
    return new AIProviderError(
      `Invalid request for Anthropic model: ${msg}`,
      'INVALID_REQUEST',
      'Anthropic',
      400,
      { original: msg }
    );
  }

  return new AIProviderError(
    msg || 'An unexpected error occurred with the Anthropic provider.',
    'PROVIDER_ERROR',
    'Anthropic',
    status || 500,
    { original: msg }
  );
}

export class AnthropicAdapter implements AIProviderAdapter {
  id = 'anthropic';
  name = 'Anthropic';

  isConfigured(): boolean {
    const key = process.env.ANTHROPIC_API_KEY;
    return Boolean(key && key.trim().length > 0 && !key.includes('replace_with'));
  }

  private getClient(): Anthropic {
    if (!this.isConfigured()) {
      throw new AIProviderError(
        "Anthropic is not configured on the FLOAT server. To use Claude models, configure ANTHROPIC_API_KEY in the server environment.",
        'AUTH_ERROR',
        'Anthropic',
        401
      );
    }
    return new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  async checkHealth(): Promise<ProviderHealthCheckResult> {
    if (!this.isConfigured()) {
      return {
        provider: 'Anthropic',
        configured: false,
        authenticated: false,
        modelAvailable: false,
        defaultModel: 'claude-3-5-sonnet-20241022'
      };
    }

    try {
      this.getClient();
      return {
        provider: 'Anthropic',
        configured: true,
        authenticated: true,
        modelAvailable: true,
        defaultModel: 'claude-3-5-sonnet-20241022'
      };
    } catch (err: any) {
      const normalized = normalizeAnthropicError(err);
      return {
        provider: 'Anthropic',
        configured: true,
        authenticated: false,
        modelAvailable: false,
        defaultModel: 'claude-3-5-sonnet-20241022',
        error: normalized.message
      };
    }
  }

  private resolveApiModel(model: string): string {
    const mapping: Record<string, string> = {
      'claude-opus-5.5': 'claude-3-opus-20240229',
      'claude-opus-5': 'claude-3-opus-20240229',
      'claude-fable-5.1': 'claude-3-7-sonnet-20250219',
      'claude-sonnet-5.5': 'claude-3-5-sonnet-20241022'
    };
    return mapping[model] || model;
  }

  private formatMessages(messages: any[]): Array<Anthropic.MessageParam> {
    const formatted: Array<Anthropic.MessageParam> = [];

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
          formatted.push({ role, content });
        }
      }
    }

    if (formatted.length === 0) {
      formatted.push({ role: 'user', content: 'Hello' });
    }

    return formatted;
  }

  private formatTools(tools?: AIProviderRequest['tools']): Anthropic.Tool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: (t.parameters || { type: 'object' }) as any
    }));
  }

  async generateContent(request: AIProviderRequest): Promise<AIProviderResponse> {
    const client = this.getClient();
    const effectiveModel = this.resolveApiModel(request.apiModelId || request.model);

    try {
      const messages = this.formatMessages(request.messages);
      const tools = this.formatTools(request.tools);

      let maxTokens = 8192;
      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model: effectiveModel,
        messages,
        max_tokens: maxTokens,
        ...(request.systemInstruction ? { system: request.systemInstruction } : {}),
        ...(tools ? { tools } : {})
      };

      if (effectiveModel.includes('3-7-sonnet') && request.reasoningEffort && request.reasoningEffort !== 'low') {
        const budget = request.reasoningEffort === 'high' ? 16384 : 8192;
        maxTokens = budget + 8192;
        params.max_tokens = maxTokens;
        (params as any).thinking = {
          type: 'enabled',
          budget_tokens: budget
        };
      }

      const response = await client.messages.create(params);
      let text = '';
      const executedTools: any[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          text += block.text;
        } else if (block.type === 'tool_use') {
          executedTools.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, any>
          });
        }
      }

      const usage = response.usage ? {
        inputTokens: response.usage.input_tokens || 0,
        outputTokens: response.usage.output_tokens || 0
      } : undefined;

      return {
        text,
        toolCalls: executedTools.length > 0 ? executedTools : undefined,
        usage
      };
    } catch (err: any) {
      throw normalizeAnthropicError(err);
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
      const messages = this.formatMessages(request.messages);
      const tools = this.formatTools(request.tools);

      let maxTokens = 8192;
      const params: Anthropic.MessageCreateParamsStreaming = {
        model: effectiveModel,
        messages,
        max_tokens: maxTokens,
        stream: true,
        ...(request.systemInstruction ? { system: request.systemInstruction } : {}),
        ...(tools ? { tools } : {})
      };

      if (effectiveModel.includes('3-7-sonnet') && request.reasoningEffort && request.reasoningEffort !== 'low') {
        const budget = request.reasoningEffort === 'high' ? 16384 : 8192;
        maxTokens = budget + 8192;
        params.max_tokens = maxTokens;
        (params as any).thinking = {
          type: 'enabled',
          budget_tokens: budget
        };
      }

      const stream = client.messages.stream(params, { signal });
      let fullText = '';

      for await (const event of stream) {
        if (signal?.aborted) break;
        if (event.type === 'content_block_delta') {
          const delta = (event.delta as any)?.text || '';
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
        }
      }

      const finalMsg = await stream.finalMessage().catch(() => null);
      const usage = finalMsg?.usage ? {
        inputTokens: finalMsg.usage.input_tokens || 0,
        outputTokens: finalMsg.usage.output_tokens || 0
      } : undefined;

      return {
        text: fullText,
        usage
      };
    } catch (err: any) {
      throw normalizeAnthropicError(err);
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
        `Anthropic is not configured on the FLOAT server. To run agents with "${model}", configure ANTHROPIC_API_KEY.`,
        'AUTH_ERROR',
        'Anthropic',
        401
      );
    }
    throw new AIProviderError(
      'Anthropic agent loops are currently in preview. Use Gemini 3.1 Flash Lite for full tool execution.',
      'INVALID_REQUEST',
      'Anthropic',
      400
    );
  }
}
