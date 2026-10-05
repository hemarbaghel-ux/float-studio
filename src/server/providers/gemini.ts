import { GoogleGenAI, Type } from '@google/genai';
import { AIProviderAdapter, AIProviderRequest, AIProviderResponse } from './base';
import { AgentRunner } from '../agent/agentRunner';

export function normalizeGeminiError(error: any): Error {
  let rawObj = error;
  if (typeof error === 'string') {
    try {
      rawObj = JSON.parse(error);
    } catch {}
  }

  const msg = rawObj?.message || rawObj?.msg || (typeof error === 'string' ? error : String(error));

  if (
    rawObj?.type === 'cancelation' || 
    rawObj?.type === 'cancelled' || 
    rawObj?.name === 'AbortError' || 
    /cancel/i.test(msg) ||
    /operation is manually canceled/i.test(msg)
  ) {
    const err = new Error(rawObj?.msg || 'Operation was cancelled.');
    (err as any).name = 'AbortError';
    (err as any).type = 'cancelation';
    return err;
  }

  if (/no longer available|not[- ]?found|404|deprecated model/i.test(msg)) {
    return new Error(
      "The selected model is no longer available from Google Gemini. Please update your selected model in the model selector to an active model such as Gemini 3.1 Flash Lite (gemini-3.1-flash-lite) or Gemini 3.8 Flash."
    );
  }

  if (/high demand|spikes in demand|503|service unavailable|temporarily unavailable/i.test(msg)) {
    return new Error(
      "This model is currently experiencing temporary high demand from Google. Please wait a moment and retry, or switch to Gemini 3.1 Flash Lite."
    );
  }

  if (/resource_exhausted|quota|429|rate[- ]?limit/i.test(msg)) {
    return new Error(
      "Provider rate limit or quota exceeded. Please wait a moment before trying again, or switch models in the model selector."
    );
  }

  if (/API_KEY_INVALID|unauthorized|permission_denied|401|403/i.test(msg)) {
    return new Error(
      "Provider authentication failed. The server API key may be invalid or unauthorized."
    );
  }

  if (/timeout|ETIMEDOUT|ECONNRESET|network/i.test(msg)) {
    return new Error(
      "AI provider connection timed out. Please check your connection and try again."
    );
  }

  return error instanceof Error ? error : new Error(msg);
}

export class GoogleGeminiAdapter implements AIProviderAdapter {
  id = 'google';
  name = 'Google Gemini';

  isConfigured(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  async generateContent(request: AIProviderRequest): Promise<AIProviderResponse> {
    if (!this.isConfigured()) {
      throw new Error('GEMINI_API_KEY is not configured on the FLOAT server.');
    }
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { timeout: 120_000 } });
      const contents = this.normalizeMessages(request.messages);

      const config: Record<string, any> = {};
      if (request.systemInstruction) {
        config.systemInstruction = request.systemInstruction;
      }
      if (request.reasoningEffort && request.model.includes('3.8-flash')) {
        const budgetMap = { low: 1024, medium: 4096, high: 8192 };
        config.thinkingConfig = { thinkingBudget: budgetMap[request.reasoningEffort] || 4096 };
      }

      const response = await ai.models.generateContent({
        model: request.model,
        contents,
        config
      });

      const usage = response.usageMetadata ? {
        inputTokens: response.usageMetadata.promptTokenCount || 0,
        outputTokens: response.usageMetadata.candidatesTokenCount || 0
      } : undefined;
      
      return { text: response.text || '', usage };
    } catch (err: any) {
      throw normalizeGeminiError(err);
    }
  }

  async generateContentStream(
    request: AIProviderRequest,
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<AIProviderResponse> {
    if (!this.isConfigured()) {
      throw new Error('GEMINI_API_KEY is not configured on the FLOAT server.');
    }

    let fullText = '';
    let finalUsage: { inputTokens: number; outputTokens: number } | undefined = undefined;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { timeout: 120_000 } });
      const contents = this.normalizeMessages(request.messages);

      const config: Record<string, any> = {};
      if (request.systemInstruction) {
        config.systemInstruction = request.systemInstruction;
      }
      if (request.reasoningEffort && request.model.includes('3.8-flash')) {
        const budgetMap = { low: 1024, medium: 4096, high: 8192 };
        config.thinkingConfig = { thinkingBudget: budgetMap[request.reasoningEffort] || 4096 };
      }

      const responseStream = await ai.models.generateContentStream({
        model: request.model,
        contents,
        config
      });

      for await (const chunk of responseStream) {
        if (signal?.aborted) {
          break;
        }
        const delta = chunk.text || '';
        if (delta) {
          fullText += delta;
          onChunk(delta);
        }
        if (chunk.usageMetadata) {
          finalUsage = {
            inputTokens: chunk.usageMetadata.promptTokenCount || 0,
            outputTokens: chunk.usageMetadata.candidatesTokenCount || 0
          };
        }
      }

      return { text: fullText, usage: finalUsage };
    } catch (err: any) {
      if (signal?.aborted) {
        return { text: fullText, usage: finalUsage };
      }
      throw normalizeGeminiError(err);
    }
  }

  private normalizeMessages(messages: any): any {
    if (!messages) return [];
    if (typeof messages === 'string') return messages;
    if (Array.isArray(messages)) {
      return messages.map(msg => {
        if (typeof msg === 'string') {
          return { role: 'user', parts: [{ text: msg }] };
        }
        if (msg && typeof msg === 'object') {
          if (msg.parts) {
            return msg;
          }
          if (msg.content) {
            return {
              role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
              parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }]
            };
          }
          if (msg.text) {
            return {
              role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
              parts: [{ text: msg.text }]
            };
          }
        }
        return msg;
      });
    }
    return messages;
  }

  async runAgentLoop(
    req: any,
    res: any,
    model: string,
    prompt: string,
    virtualFiles: any[]
  ): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('GEMINI_API_KEY is not configured on the FLOAT server.');
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const abortController = new AbortController();
    // The request body is fully read before this handler starts. IncomingMessage's
    // `close` can therefore fire before the model work finishes; watch the response
    // instead so only a disconnected client cancels generation.
    res.on('close', () => {
      if (!res.writableEnded) abortController.abort();
    });

    const sendEvent = (type: string, data: any) => {
      if (abortController.signal.aborted || res.destroyed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    };

    try {
      const result = await AgentRunner.run({
        model,
        prompt,
        virtualFiles,
        projectName: req.body.projectName || 'Workspace',
        projectId: req.body.projectId || 'default-project',
        userId: req.user?.uid || 'user',
        systemInstruction: req.body.systemInstruction,
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
        const normalized = normalizeGeminiError(error);
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
          console.error('Agent Loop Error:', normalized.message);
          sendEvent('event', {
            type: 'failed',
            message: normalized.message
          });
          sendEvent('delta', { text: `\n\n**Agent Execution Stopped**: ${normalized.message}` });
          sendEvent('result', {
            text: `**Agent Execution Stopped**: ${normalized.message}`,
            changeSet: null
          });
        }
      }
    } finally {
      res.end();
    }
  }
}
