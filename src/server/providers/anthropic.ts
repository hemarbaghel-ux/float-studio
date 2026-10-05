import { AIProviderAdapter, AIProviderRequest, AIProviderResponse } from './base';
import { providerRequestSignal } from './requestSignal';
import { PortableAgentRunner } from '../agent/portableAgentRunner';

export function normalizeAnthropicError(error: any): Error {
  const msg = error?.message || String(error);

  if (/rate[- ]?limit|429/i.test(msg)) {
    return new Error(
      "Anthropic rate limit exceeded. Please wait a moment before trying again, or switch to Gemini 3.1 Flash Lite."
    );
  }

  if (/invalid_api_key|authentication|401/i.test(msg)) {
    return new Error(
      "Anthropic authentication failed. The server-side ANTHROPIC_API_KEY is invalid or unauthorized."
    );
  }

  if (/overloaded|529/i.test(msg)) {
    return new Error(
      "Anthropic servers are currently overloaded. Please retry in a few moments, or select an alternative model."
    );
  }

  if (/not_found|model/i.test(msg)) {
    return new Error(
      "The requested Anthropic model is not available or unrecognized by the provider API."
    );
  }

  return error instanceof Error ? error : new Error(msg);
}

export class AnthropicAdapter implements AIProviderAdapter {
  id = 'anthropic';
  name = 'Anthropic';

  isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  private buildPayload(request: AIProviderRequest, stream = false) {
    const formattedMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (Array.isArray(request.messages)) {
      for (const msg of request.messages) {
        if (typeof msg === 'string') {
          formattedMessages.push({ role: 'user', content: msg });
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
          formattedMessages.push({ role, content });
        }
      }
    }

    // Anthropic requires at least 1 message
    if (formattedMessages.length === 0) {
      formattedMessages.push({ role: 'user', content: 'Hello' });
    }

    let maxTokens = 8192;
    const payload: Record<string, any> = {
      model: request.model,
      messages: formattedMessages,
      max_tokens: maxTokens,
      stream
    };

    if (request.systemInstruction) {
      payload.system = request.systemInstruction;
    }

    // Extended thinking support for Claude 3.7 Sonnet
    if (request.model.includes('3-7-sonnet') && request.reasoningEffort && request.reasoningEffort !== 'low') {
      const budget = request.reasoningEffort === 'high' ? 16384 : 8192;
      maxTokens = budget + 8192;
      payload.max_tokens = maxTokens;
      payload.thinking = {
        type: 'enabled',
        budget_tokens: budget
      };
    }

    return payload;
  }

  async generateContent(request: AIProviderRequest): Promise<AIProviderResponse> {
    if (!this.isConfigured()) {
      throw new Error(
        `Anthropic is not configured on the FLOAT server. To use "${request.model}", configure ANTHROPIC_API_KEY in the environment.`
      );
    }

    try {
      const payload = this.buildPayload(request, false);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(payload),
        signal: providerRequestSignal()
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Anthropic API returned status ${res.status}`);
      }

      const data = await res.json();
      const text = (data.content || [])
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('');

      const usage = data.usage ? {
        inputTokens: data.usage.input_tokens || 0,
        outputTokens: data.usage.output_tokens || 0
      } : undefined;

      return { text, usage };
    } catch (err: any) {
      throw normalizeAnthropicError(err);
    }
  }

  async generateContentStream(
    request: AIProviderRequest,
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<AIProviderResponse> {
    if (!this.isConfigured()) {
      throw new Error(
        `Anthropic is not configured on the FLOAT server. To use "${request.model}", configure ANTHROPIC_API_KEY in the environment.`
      );
    }

    try {
      const payload = this.buildPayload(request, true);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(payload),
        signal: providerRequestSignal(signal)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Anthropic API returned status ${res.status}`);
      }

      if (!res.body) {
        throw new Error('Anthropic response body is empty');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let buffer = '';

      while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              const delta = parsed.delta.text || '';
              if (delta) {
                fullText += delta;
                onChunk(delta);
              }
            }
          } catch {}
        }
      }

      return { text: fullText };
    } catch (err: any) {
      throw normalizeAnthropicError(err);
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
      throw new Error(
        `Anthropic is not configured on the FLOAT server. To run agents with "${model}", configure ANTHROPIC_API_KEY.`
      );
    }
    return PortableAgentRunner.run('anthropic', req, res, model, prompt, virtualFiles, process.env.ANTHROPIC_API_KEY!);
  }
}
