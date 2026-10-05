import { AIProviderAdapter, AIProviderRequest, AIProviderResponse } from './base';
import { providerRequestSignal } from './requestSignal';
import { PortableAgentRunner } from '../agent/portableAgentRunner';

export function normalizeXAIError(error: any): Error {
  const msg = error?.message || String(error);

  if (/rate[- ]?limit|429/i.test(msg)) {
    return new Error(
      "xAI rate limit exceeded. Please wait a moment before trying again, or switch to Gemini 3.1 Flash Lite."
    );
  }

  if (/invalid_api_key|authentication|401/i.test(msg)) {
    return new Error(
      "xAI authentication failed. The server-side XAI_API_KEY is invalid or unauthorized."
    );
  }

  if (/not_found|model/i.test(msg)) {
    return new Error(
      "The requested Grok model is not available or unrecognized by the provider API."
    );
  }

  return error instanceof Error ? error : new Error(msg);
}

export class XAIAdapter implements AIProviderAdapter {
  id = 'xai';
  name = 'xAI';

  isConfigured(): boolean {
    return !!process.env.XAI_API_KEY;
  }

  private buildPayload(request: AIProviderRequest, stream = false) {
    const formattedMessages: Array<{ role: string; content: string }> = [];

    if (request.systemInstruction) {
      formattedMessages.push({ role: 'system', content: request.systemInstruction });
    }

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

    const payload: Record<string, unknown> = {
      model: request.model,
      messages: formattedMessages,
      stream
    };

    if (request.reasoningEffort) {
      payload.reasoning_effort = request.reasoningEffort;
    }

    return payload;
  }

  async generateContent(request: AIProviderRequest): Promise<AIProviderResponse> {
    if (!this.isConfigured()) {
      throw new Error(
        `xAI is not configured on the FLOAT server. To use "${request.model}", configure XAI_API_KEY in the environment.`
      );
    }

    try {
      const payload = this.buildPayload(request, false);
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`
        },
        body: JSON.stringify(payload),
        signal: providerRequestSignal()
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `xAI API returned status ${res.status}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      const usage = data.usage ? {
        inputTokens: data.usage.prompt_tokens || 0,
        outputTokens: data.usage.completion_tokens || 0
      } : undefined;

      return { text, usage };
    } catch (err: any) {
      throw normalizeXAIError(err);
    }
  }

  async generateContentStream(
    request: AIProviderRequest,
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<AIProviderResponse> {
    if (!this.isConfigured()) {
      throw new Error(
        `xAI is not configured on the FLOAT server. To use "${request.model}", configure XAI_API_KEY in the environment.`
      );
    }

    try {
      const payload = this.buildPayload(request, true);
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`
        },
        body: JSON.stringify(payload),
        signal: providerRequestSignal(signal)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `xAI API returned status ${res.status}`);
      }

      if (!res.body) {
        throw new Error('xAI response body is empty');
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
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              onChunk(delta);
            }
          } catch {}
        }
      }

      return { text: fullText };
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
      throw new Error(
        `xAI is not configured on the FLOAT server. To run agents with "${model}", configure XAI_API_KEY.`
      );
    }
    return PortableAgentRunner.run('xai', req, res, model, prompt, virtualFiles, process.env.XAI_API_KEY!);
  }
}
