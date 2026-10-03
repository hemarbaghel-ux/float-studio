import { AIProviderAdapter, AIProviderRequest, AIProviderResponse } from './base';

export function normalizeOpenAIError(error: any): Error {
  const msg = error?.message || String(error);

  if (/insufficient_quota|quota|exceeded your current quota|429/i.test(msg)) {
    return new Error(
      "OpenAI rate limit or quota exceeded. Please check your OpenAI account billing or switch to an operational model such as Gemini 3.1 Flash Lite."
    );
  }

  if (/invalid_api_key|Incorrect API key|unauthorized|401/i.test(msg)) {
    return new Error(
      "OpenAI authentication failed. The server-side OPENAI_API_KEY is invalid or unauthorized."
    );
  }

  if (/model_not_found|does not exist|access to model/i.test(msg)) {
    return new Error(
      `The requested OpenAI model is not accessible with the current API credentials. Please select another verified model.`
    );
  }

  if (/timeout|ETIMEDOUT|ECONNRESET|network/i.test(msg)) {
    return new Error(
      "Connection to OpenAI API timed out. Please check network connectivity and try again."
    );
  }

  return error instanceof Error ? error : new Error(msg);
}

export class OpenAIAdapter implements AIProviderAdapter {
  id = 'openai';
  name = 'OpenAI';

  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  private buildPayload(request: AIProviderRequest, stream = false) {
    const isReasoningModel = request.model.startsWith('o1') || request.model.startsWith('o3');
    const systemRole = isReasoningModel ? 'developer' : 'system';

    const formattedMessages: Array<{ role: string; content: string }> = [];

    if (request.systemInstruction) {
      formattedMessages.push({
        role: systemRole,
        content: request.systemInstruction
      });
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

    const payload: Record<string, any> = {
      model: request.model,
      messages: formattedMessages,
      stream
    };

    if (isReasoningModel && request.reasoningEffort) {
      payload.reasoning_effort = request.reasoningEffort;
    }

    return payload;
  }

  async generateContent(request: AIProviderRequest): Promise<AIProviderResponse> {
    if (!this.isConfigured()) {
      throw new Error(
        `OpenAI is not configured on the FLOAT server. To use "${request.model}", configure OPENAI_API_KEY in the environment.`
      );
    }

    try {
      const payload = this.buildPayload(request, false);
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `OpenAI API returned status ${res.status}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      const usage = data.usage ? {
        inputTokens: data.usage.prompt_tokens || 0,
        outputTokens: data.usage.completion_tokens || 0
      } : undefined;

      return { text, usage };
    } catch (err: any) {
      throw normalizeOpenAIError(err);
    }
  }

  async generateContentStream(
    request: AIProviderRequest,
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<AIProviderResponse> {
    if (!this.isConfigured()) {
      throw new Error(
        `OpenAI is not configured on the FLOAT server. To use "${request.model}", configure OPENAI_API_KEY in the environment.`
      );
    }

    try {
      const payload = this.buildPayload(request, true);
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(payload),
        signal
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `OpenAI API returned status ${res.status}`);
      }

      if (!res.body) {
        throw new Error('OpenAI response body is empty');
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
      throw new Error(
        `OpenAI is not configured on the FLOAT server. To run agents with "${model}", configure OPENAI_API_KEY.`
      );
    }
    throw new Error('OpenAI autonomous agent loops are currently in preview. Use Gemini 3.1 Flash Lite for full tool execution.');
  }
}
