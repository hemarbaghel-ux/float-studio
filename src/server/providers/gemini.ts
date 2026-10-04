import { GoogleGenAI } from '@google/genai';
import { 
  AIProviderAdapter, 
  AIProviderRequest, 
  AIProviderResponse, 
  AIProviderError, 
  ProviderHealthCheckResult 
} from './base';
import { AgentRunner } from '../agent/agentRunner';

export function normalizeGeminiError(error: any): AIProviderError {
  let rawObj = error;
  if (typeof error === 'string') {
    try {
      rawObj = JSON.parse(error);
    } catch {}
  }

  const msg = rawObj?.message || rawObj?.msg || (typeof error === 'string' ? error : String(error));
  const status = error?.status || error?.statusCode;

  if (
    rawObj?.type === 'cancelation' || 
    rawObj?.type === 'cancelled' || 
    rawObj?.name === 'AbortError' || 
    /cancel/i.test(msg) ||
    /operation is manually canceled/i.test(msg)
  ) {
    const err = new AIProviderError('Operation was cancelled.', 'INVALID_REQUEST', 'Google Gemini', 499);
    (err as any).name = 'AbortError';
    (err as any).type = 'cancelation';
    return err;
  }

  if (/API_KEY_INVALID|unauthorized|permission_denied|401|403/i.test(msg) || status === 401 || status === 403) {
    return new AIProviderError(
      "Gemini authentication failed. The server-side GEMINI_API_KEY is invalid, unauthorized, or expired.",
      'AUTH_ERROR',
      'Google Gemini',
      401,
      { original: msg }
    );
  }

  if (/no longer available|not[- ]?found|404|deprecated model|models\/.* is not found/i.test(msg) || status === 404) {
    return new AIProviderError(
      "The selected Gemini model is not recognized or no longer available. Please select an active model such as Gemini 2.0 Flash.",
      'MODEL_NOT_FOUND',
      'Google Gemini',
      404,
      { original: msg }
    );
  }

  if (/resource_exhausted|quota|429|exceeded quota/i.test(msg) || status === 429) {
    return new AIProviderError(
      "Provider rate limit or quota exceeded. Please wait a moment before trying again, or switch models in the model selector.",
      'QUOTA_EXCEEDED',
      'Google Gemini',
      429,
      { original: msg }
    );
  }

  if (/high demand|spikes in demand|503|service unavailable|temporarily unavailable/i.test(msg) || status === 503) {
    return new AIProviderError(
      "This Gemini model is currently experiencing temporary high demand from Google. Please retry shortly.",
      'PROVIDER_ERROR',
      'Google Gemini',
      503,
      { original: msg }
    );
  }

  if (/invalid_argument|invalid request|bad request/i.test(msg) || status === 400) {
    return new AIProviderError(
      `Invalid request for Gemini model: ${msg}`,
      'INVALID_REQUEST',
      'Google Gemini',
      400,
      { original: msg }
    );
  }

  return new AIProviderError(
    msg || 'An unexpected error occurred with the Gemini provider.',
    'PROVIDER_ERROR',
    'Google Gemini',
    status || 500,
    { original: msg }
  );
}

export class GoogleGeminiAdapter implements AIProviderAdapter {
  id = 'google';
  name = 'Google Gemini';

  isConfigured(): boolean {
    const key = process.env.GEMINI_API_KEY;
    return Boolean(key && key.trim().length > 0 && !key.includes('MY_GEMINI_API_KEY'));
  }

  async checkHealth(): Promise<ProviderHealthCheckResult> {
    if (!this.isConfigured()) {
      return {
        provider: 'Google Gemini',
        configured: false,
        authenticated: false,
        modelAvailable: false,
        defaultModel: 'gemini-3.8-flash'
      };
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      return {
        provider: 'Google Gemini',
        configured: true,
        authenticated: true,
        modelAvailable: true,
        defaultModel: 'gemini-3.8-flash'
      };
    } catch (err: any) {
      const normalized = normalizeGeminiError(err);
      return {
        provider: 'Google Gemini',
        configured: true,
        authenticated: false,
        modelAvailable: false,
        defaultModel: 'gemini-3.8-flash',
        error: normalized.message
      };
    }
  }

  private resolveApiModel(model: string): string {
    // Map obsolete model identifiers to active gemini-3.8-flash
    if (
      model === 'gemini-2.0-flash' || 
      model === 'gemini-1.5-flash' || 
      model === 'gemini-1.5-pro' ||
      model === 'gemini-3.1-flash-lite' ||
      model === 'composer-2.5' || 
      model === 'muse-spark-1.3' ||
      model === 'auto'
    ) {
      return 'gemini-3.8-flash';
    }
    return model;
  }

  async generateContent(request: AIProviderRequest): Promise<AIProviderResponse> {
    if (!this.isConfigured()) {
      throw new AIProviderError(
        'GEMINI_API_KEY is not configured on the FLOAT server.',
        'AUTH_ERROR',
        'Google Gemini',
        401
      );
    }
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const contents = this.normalizeMessages(request.messages);
      const apiModel = this.resolveApiModel(request.apiModelId || request.model);

      const config: Record<string, any> = {};
      if (request.systemInstruction) {
        config.systemInstruction = request.systemInstruction;
      }
      if (request.reasoningEffort && apiModel.includes('2.0-flash')) {
        const budgetMap = { low: 1024, medium: 4096, high: 8192 };
        config.thinkingConfig = { thinkingBudget: budgetMap[request.reasoningEffort] || 4096 };
      }

      const response = await ai.models.generateContent({
        model: apiModel,
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
      throw new AIProviderError(
        'GEMINI_API_KEY is not configured on the FLOAT server.',
        'AUTH_ERROR',
        'Google Gemini',
        401
      );
    }

    if (signal?.aborted) {
      return { text: '' };
    }

    let fullText = '';
    let finalUsage: { inputTokens: number; outputTokens: number } | undefined = undefined;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const contents = this.normalizeMessages(request.messages);
      const apiModel = this.resolveApiModel(request.apiModelId || request.model);

      const config: Record<string, any> = {};
      if (request.systemInstruction) {
        config.systemInstruction = request.systemInstruction;
      }
      if (request.reasoningEffort && (apiModel.includes('2.0-flash') || apiModel.includes('3.8-flash'))) {
        const budgetMap = { low: 1024, medium: 4096, high: 8192 };
        config.thinkingConfig = { thinkingBudget: budgetMap[request.reasoningEffort] || 4096 };
      }

      const responseStream = await ai.models.generateContentStream({
        model: apiModel,
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
      throw new AIProviderError(
        'GEMINI_API_KEY is not configured on the FLOAT server.',
        'AUTH_ERROR',
        'Google Gemini',
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
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    };

    try {
      const apiModel = this.resolveApiModel(model);
      const result = await AgentRunner.run({
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
