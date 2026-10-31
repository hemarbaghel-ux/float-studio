import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  AIProviderAdapter,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderError,
  ProviderHealthCheckResult,
  ToolCallDefinition,
  ExecutedToolCall
} from './base';
import { AgentRunner } from '../agent/agentRunner';
import { PerModelHealthEntry } from './openai';

export const CONFIGURED_GEMINI_HEALTH_MODELS = ['gemini-4-argon'] as const;

function sanitizeGeminiErrorMessage(msg: string): string {
  return msg.replace(/AIza[0-9A-Za-z\-_]{20,}/g, 'AIza[REDACTED]');
}

export function normalizeGeminiError(error: any): AIProviderError {
  if (error instanceof AIProviderError) {
    return error;
  }

  let rawObj = error;
  if (typeof error === 'string') {
    try {
      rawObj = JSON.parse(error);
    } catch {}
  }

  const rawMsg =
    rawObj?.error?.message ||
    rawObj?.message ||
    rawObj?.msg ||
    (typeof error === 'string' ? error : String(error));
  const msg = sanitizeGeminiErrorMessage(String(rawMsg || 'Unknown Gemini error'));
  const status = error?.status ?? error?.statusCode ?? rawObj?.error?.code;
  const upstreamCode = rawObj?.error?.status ?? error?.code ?? error?.type;

  if (
    rawObj?.type === 'cancelation' ||
    rawObj?.type === 'cancelled' ||
    rawObj?.name === 'AbortError' ||
    error?.name === 'AbortError' ||
    /operation is manually canceled/i.test(msg) ||
    /aborted|cancel/i.test(msg)
  ) {
    const err = new AIProviderError('Operation was cancelled.', 'INVALID_REQUEST', 'Google Gemini', 499, {
      status: 499,
      code: 'cancelled',
      message: msg
    });
    (err as any).name = 'AbortError';
    (err as any).type = 'cancelation';
    return err;
  }

  if (
    status === 503 && /not configured|missing.*GEMINI_API_KEY/i.test(msg) ||
    upstreamCode === 'NOT_CONFIGURED'
  ) {
    return new AIProviderError(
      msg || 'Google Gemini is not configured on the FLOAT server. Set GEMINI_API_KEY in the server environment.',
      'NOT_CONFIGURED',
      'Google Gemini',
      503,
      { status: 503, code: 'not_configured', message: msg, original: msg }
    );
  }

  if (
    status === 401 ||
    status === 403 ||
    /API_KEY_INVALID|unauthorized|permission_denied|unauthenticated|401|403/i.test(msg)
  ) {
    const resolvedStatus = status === 403 ? 403 : 401;
    return new AIProviderError(
      `Gemini authentication failed (${resolvedStatus}): ${msg}`,
      'AUTH_ERROR',
      'Google Gemini',
      resolvedStatus,
      { status: resolvedStatus, code: upstreamCode || 'auth_error', message: msg, original: msg }
    );
  }

  if (
    status === 404 ||
    /no longer available|not[- ]?found|404|deprecated model|models\/.* is not found/i.test(msg)
  ) {
    return new AIProviderError(
      `Gemini model not available (404): ${msg}`,
      'MODEL_NOT_AVAILABLE',
      'Google Gemini',
      404,
      { status: 404, code: upstreamCode || 'model_not_available', message: msg, original: msg }
    );
  }

  if (
    status === 429 ||
    /resource_exhausted|quota|429|exceeded quota|rate[- ]?limit/i.test(msg)
  ) {
    return new AIProviderError(
      `Gemini rate limit or quota exceeded (429): ${msg} Please wait or switch models in the model selector.`,
      'RATE_LIMITED',
      'Google Gemini',
      429,
      { status: 429, code: upstreamCode || 'rate_limited', message: msg, original: msg }
    );
  }

  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /high demand|spikes in demand|500|502|503|504|service unavailable|temporarily unavailable|internal error/i.test(msg)
  ) {
    const resolvedStatus = typeof status === 'number' && status >= 500 ? status : 503;
    return new AIProviderError(
      `Gemini upstream server error (${resolvedStatus}, temporary high demand): ${msg}`,
      'PROVIDER_ERROR',
      'Google Gemini',
      resolvedStatus,
      { status: resolvedStatus, code: upstreamCode || 'provider_error', message: msg, original: msg }
    );
  }

  if (status === 400 || /invalid_argument|invalid request|bad request/i.test(msg)) {
    return new AIProviderError(
      `Invalid request for Gemini model (400): ${msg}`,
      'INVALID_REQUEST',
      'Google Gemini',
      400,
      { status: 400, code: upstreamCode || 'invalid_argument', message: msg, original: msg }
    );
  }

  const fallbackStatus = typeof status === 'number' ? status : 502;
  return new AIProviderError(
    msg || 'An unexpected error occurred with the Gemini provider.',
    'PROVIDER_ERROR',
    'Google Gemini',
    fallbackStatus,
    { status: fallbackStatus, code: upstreamCode || 'provider_error', message: msg, original: msg }
  );
}

export class GoogleGeminiAdapter implements AIProviderAdapter {
  id = 'google';
  name = 'Google Gemini';

  isConfigured(): boolean {
    const key = process.env.GEMINI_API_KEY;
    return Boolean(
      key &&
      key.trim().length > 0 &&
      !key.includes('MY_GEMINI_API_KEY') &&
      !key.includes('replace_with')
    );
  }

  private getClient(): GoogleGenAI {
    if (!this.isConfigured()) {
      throw new AIProviderError(
        'GEMINI_API_KEY is not configured on the FLOAT server.',
        'NOT_CONFIGURED',
        'Google Gemini',
        503,
        { status: 503, code: 'not_configured', message: 'GEMINI_API_KEY is not configured.' }
      );
    }
    return new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!.trim(),
      httpOptions: {
        timeout: 120_000,
        headers: { 'User-Agent': 'aistudio-build' }
      }
    });
  }

  formatTools(tools?: ToolCallDefinition[]): Array<{ functionDeclarations: any[] }> | undefined {
    if (!tools || tools.length === 0) return undefined;
    return [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters
            ? {
                type: Type.OBJECT,
                properties: (t.parameters.properties || {}) as any,
                required: Array.isArray(t.parameters.required) ? t.parameters.required : []
              }
            : { type: Type.OBJECT, properties: {}, required: [] }
        }))
      }
    ];
  }

  private buildGenerationConfig(request: AIProviderRequest, apiModel: string, signal?: AbortSignal): Record<string, any> {
    const config: Record<string, any> = {};
    if (request.systemInstruction) {
      config.systemInstruction = request.systemInstruction;
    }
    const formattedTools = this.formatTools(request.tools);
    if (formattedTools) {
      config.tools = formattedTools;
    }
    if (signal) {
      config.abortSignal = signal;
    }
    // For gemini-4-argon, use ThinkingLevel (never thinkingBudget, which causes a 400 error).
    if (request.reasoningEffort && apiModel === 'gemini-4-argon') {
      const levelMap: Record<string, ThinkingLevel> = {
        low: ThinkingLevel.LOW,
        medium: ThinkingLevel.MEDIUM,
        high: ThinkingLevel.HIGH
      };
      config.thinkingConfig = {
        thinkingLevel: levelMap[request.reasoningEffort] || ThinkingLevel.HIGH
      };
    }
    return config;
  }

  async checkHealth(): Promise<ProviderHealthCheckResult & { models: Record<string, PerModelHealthEntry> }> {
    const modelsReport: Record<string, PerModelHealthEntry> = {};

    if (!this.isConfigured()) {
      for (const modelId of CONFIGURED_GEMINI_HEALTH_MODELS) {
        modelsReport[modelId] = {
          status: 'error',
          code: 'NOT_CONFIGURED',
          statusCode: 503,
          message: 'GEMINI_API_KEY is not configured on the FLOAT server.'
        };
      }
      return {
        provider: 'Google Gemini',
        configured: false,
        authenticated: false,
        modelAvailable: false,
        defaultModel: 'gemini-4-argon',
        accessibleModelIds: [],
        models: modelsReport
      };
    }

    const ai = this.getClient();
    const accessibleModelIds: string[] = [];
    let anyAuthenticated = false;
    let firstError: string | undefined;

    for (const modelId of CONFIGURED_GEMINI_HEALTH_MODELS) {
      try {
        await ai.models.generateContent({
          model: modelId,
          contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
          config: { maxOutputTokens: 1 }
        });
        modelsReport[modelId] = { status: 'ok', statusCode: 200 };
        accessibleModelIds.push(modelId);
        anyAuthenticated = true;
      } catch (err: any) {
        const normalized = normalizeGeminiError(err);
        if (normalized.code !== 'AUTH_ERROR') {
          anyAuthenticated = true;
        }
        if (!firstError) {
          firstError = normalized.message;
        }
        modelsReport[modelId] = {
          status: 'error',
          code: normalized.code,
          statusCode: normalized.statusCode,
          message: normalized.message
        };
      }
    }

    return {
      provider: 'Google Gemini',
      configured: true,
      authenticated: anyAuthenticated,
      modelAvailable: accessibleModelIds.length > 0,
      defaultModel: 'gemini-4-argon',
      accessibleModelIds,
      models: modelsReport,
      ...(accessibleModelIds.length === 0 && firstError ? { error: firstError } : {})
    };
  }

  private extractToolCalls(functionCalls?: any[]): ExecutedToolCall[] | undefined {
    if (!Array.isArray(functionCalls) || functionCalls.length === 0) return undefined;
    return functionCalls.map((call, idx) => ({
      id: call.id || `gemini_call_${idx + 1}`,
      name: call.name,
      arguments: (call.args && typeof call.args === 'object' ? call.args : {}) as Record<string, any>
    }));
  }

  async generateContent(request: AIProviderRequest, signal?: AbortSignal): Promise<AIProviderResponse> {
    if (signal?.aborted) {
      const abortErr = new Error('Operation was cancelled.');
      abortErr.name = 'AbortError';
      throw normalizeGeminiError(abortErr);
    }

    const ai = this.getClient();
    const apiModel = (request.apiModelId || request.model || 'gemini-4-argon').trim();

    try {
      const contents = this.normalizeMessages(request.messages);
      const config = this.buildGenerationConfig(request, apiModel, signal);

      const response = await ai.models.generateContent({
        model: apiModel,
        contents,
        config
      });

      if (signal?.aborted) {
        const abortErr = new Error('Operation was cancelled.');
        abortErr.name = 'AbortError';
        throw normalizeGeminiError(abortErr);
      }

      const usage = response.usageMetadata
        ? {
            inputTokens: response.usageMetadata.promptTokenCount || 0,
            outputTokens: response.usageMetadata.candidatesTokenCount || 0
          }
        : undefined;

      const toolCalls = this.extractToolCalls(response.functionCalls);

      return {
        text: response.text || '',
        ...(toolCalls ? { toolCalls } : {}),
        usage
      };
    } catch (err: any) {
      throw normalizeGeminiError(err);
    }
  }

  async generateContentStream(
    request: AIProviderRequest,
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<AIProviderResponse> {
    if (signal?.aborted) {
      return { text: '' };
    }

    const ai = this.getClient();
    const apiModel = (request.apiModelId || request.model || 'gemini-4-argon').trim();

    let fullText = '';
    let finalUsage: { inputTokens: number; outputTokens: number } | undefined = undefined;
    const collectedToolCalls: ExecutedToolCall[] = [];

    try {
      const contents = this.normalizeMessages(request.messages);
      const config = this.buildGenerationConfig(request, apiModel, signal);

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
        if (Array.isArray(chunk.functionCalls) && chunk.functionCalls.length > 0) {
          const calls = this.extractToolCalls(chunk.functionCalls);
          if (calls) {
            collectedToolCalls.push(...calls);
          }
        }
        if (chunk.usageMetadata) {
          finalUsage = {
            inputTokens: chunk.usageMetadata.promptTokenCount || 0,
            outputTokens: chunk.usageMetadata.candidatesTokenCount || 0
          };
        }
      }

      return {
        text: fullText,
        ...(collectedToolCalls.length > 0 ? { toolCalls: collectedToolCalls } : {}),
        usage: finalUsage
      };
    } catch (err: any) {
      if (signal?.aborted) {
        return {
          text: fullText,
          ...(collectedToolCalls.length > 0 ? { toolCalls: collectedToolCalls } : {}),
          usage: finalUsage
        };
      }
      throw normalizeGeminiError(err);
    }
  }

  private normalizeMessages(messages: any): any {
    if (!messages) return [];
    if (typeof messages === 'string') return [{ role: 'user', parts: [{ text: messages }] }];
    if (Array.isArray(messages)) {
      return messages.map((msg) => {
        if (typeof msg === 'string') {
          return { role: 'user', parts: [{ text: msg }] };
        }
        if (msg && typeof msg === 'object') {
          if (Array.isArray(msg.parts)) {
            return {
              role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
              parts: msg.parts
            };
          }
          if (msg.content !== undefined) {
            if (Array.isArray(msg.content)) {
              const parts = msg.content.map((part: any) => {
                if (typeof part === 'string') return { text: part };
                if (part?.type === 'text') return { text: part.text || '' };
                if (part?.type === 'image_url' && part.image_url?.url) {
                  const match = /^data:([^;]+);base64,(.+)$/.exec(part.image_url.url);
                  if (match) {
                    return { inlineData: { mimeType: match[1], data: match[2] } };
                  }
                }
                if (part?.inlineData) return { inlineData: part.inlineData };
                return { text: JSON.stringify(part) };
              });
              return {
                role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
                parts
              };
            }
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
        'NOT_CONFIGURED',
        'Google Gemini',
        503
      );
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abortController.abort();
    });

    const sendEvent = (type: string, data: any) => {
      if (abortController.signal.aborted || res.destroyed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    };

    try {
      const apiModel = (model || 'gemini-4-argon').trim();
      const result = await AgentRunner.run({
        model: apiModel,
        prompt,
        virtualFiles,
        projectName: req.body?.projectName || 'Workspace',
        projectId: req.body?.projectId || 'default-project',
        userId: req.user?.uid || 'user',
        systemInstruction: req.body?.systemInstruction,
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
        changeSet: result.changeSet,
        checkpointId: req.body?.checkpointId
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
