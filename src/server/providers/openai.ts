import OpenAI, { toFile } from 'openai';
import {
  AIProviderAdapter,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderError,
  ProviderHealthCheckResult,
  CodeInterpreterFileAttachment,
  CodeInterpreterGeneratedFile,
  CodeInterpreterStreamEvent,
  CodeInterpreterResponseRequest,
  CodeInterpreterResponseResult
} from './base';
import { GPT6_ASTRA_CLOUD_CONFIG } from '../../data/cloudAgentConstants';

export type {
  CodeInterpreterFileAttachment,
  CodeInterpreterGeneratedFile,
  CodeInterpreterStreamEvent,
  CodeInterpreterResponseRequest,
  CodeInterpreterResponseResult
};

export type NormalizedOpenAIErrorCode =
  | 'NOT_CONFIGURED'
  | 'AUTH_ERROR'
  | 'MODEL_NOT_AVAILABLE'
  | 'RATE_LIMITED'
  | 'INVALID_REQUEST'
  | 'PROVIDER_ERROR'
  | 'CODE_INTERPRETER_NOT_SUPPORTED'
  | 'CODE_INTERPRETER_UNAVAILABLE'
  | 'API_CONNECTION_ERROR'
  | 'SANDBOX_TIMEOUT'
  | 'MALFORMED_CODE_EXECUTION';

export interface PerModelHealthEntry {
  status: 'ok' | 'error';
  code?: string;
  statusCode?: number;
  message?: string;
}

export const CONFIGURED_HEALTH_CHECK_MODELS = [
  'gpt-6-astra',
  'gpt-6-sol',
  'gpt-6-luna',
  'gpt-4o',
  'gpt-4o-mini'
] as const;

function sanitizeOpenAIErrorMessage(msg: string): string {
  return msg.replace(/sk-[a-zA-Z0-9_\-]{8,}/g, 'sk-[REDACTED]');
}

export function normalizeOpenAIError(error: any): AIProviderError {
  if (error instanceof AIProviderError) {
    return error;
  }

  const rawMsg =
    error?.error?.message ||
    error?.message ||
    (typeof error === 'string' ? error : JSON.stringify(error));
  const msg = sanitizeOpenAIErrorMessage(String(rawMsg || 'Unknown OpenAI error'));
  const status = error?.status ?? error?.statusCode;
  const upstreamCode = error?.code ?? error?.error?.code ?? error?.type ?? error?.error?.type;

  if (
    error?.name === 'AbortError' ||
    error?.type === 'cancelation' ||
    error?.type === 'cancelled' ||
    /operation is manually canceled/i.test(msg) ||
    /aborted|cancel/i.test(msg)
  ) {
    const err = new AIProviderError('Operation was cancelled.', 'INVALID_REQUEST', 'OpenAI', 499, {
      status: 499,
      code: upstreamCode || 'cancelled',
      message: msg
    });
    (err as any).name = 'AbortError';
    (err as any).type = 'cancelation';
    return err;
  }

  if (
    status === 503 && /not configured|missing.*OPENAI_API_KEY/i.test(msg) ||
    upstreamCode === 'NOT_CONFIGURED'
  ) {
    return new AIProviderError(
      msg || 'OpenAI is not configured on the FLOAT server. Set OPENAI_API_KEY in the server environment.',
      'NOT_CONFIGURED' as any,
      'OpenAI',
      503,
      { status: 503, code: upstreamCode || 'not_configured', message: msg, original: msg }
    );
  }

  if (
    status === 401 ||
    status === 403 ||
    upstreamCode === 'invalid_api_key' ||
    /invalid_api_key|Incorrect API key|unauthorized|invalid api key|authenticate|permission_denied|forbidden|country_not_supported/i.test(msg)
  ) {
    const resolvedStatus = status === 403 ? 403 : 401;
    return new AIProviderError(
      `OpenAI authentication failed (${resolvedStatus}${upstreamCode ? ` ${upstreamCode}` : ''}): ${msg}`,
      'AUTH_ERROR',
      'OpenAI',
      resolvedStatus,
      { status: resolvedStatus, code: upstreamCode || 'auth_error', message: msg, original: msg }
    );
  }

  if (
    status === 404 ||
    upstreamCode === 'model_not_found' ||
    /model_not_found|does not exist|do not have access|access to model|model .* not found|not available/i.test(msg)
  ) {
    return new AIProviderError(
      `OpenAI model not available (${status || 404}${upstreamCode ? ` ${upstreamCode}` : ''}): ${msg}`,
      'MODEL_NOT_AVAILABLE' as any,
      'OpenAI',
      404,
      { status: 404, code: upstreamCode || 'model_not_found', message: msg, original: msg }
    );
  }

  if (
    status === 429 ||
    upstreamCode === 'rate_limit_exceeded' ||
    upstreamCode === 'insufficient_quota' ||
    /rate[- ]?limit|too many requests|insufficient_quota|exceeded your current quota|billing/i.test(msg)
  ) {
    return new AIProviderError(
      `OpenAI rate limit or quota error (429${upstreamCode ? ` ${upstreamCode}` : ''}): ${msg}`,
      'RATE_LIMITED',
      'OpenAI',
      429,
      { status: 429, code: upstreamCode || 'rate_limited', message: msg, original: msg }
    );
  }

  if (status === 400 || /bad request|invalid_request_error|parameter|unsupported/i.test(msg)) {
    return new AIProviderError(
      `OpenAI invalid request (400${upstreamCode ? ` ${upstreamCode}` : ''}): ${msg}`,
      'INVALID_REQUEST',
      'OpenAI',
      400,
      { status: 400, code: upstreamCode || 'invalid_request_error', message: msg, original: msg }
    );
  }

  const fallbackStatus = typeof status === 'number' ? status : 502;
  return new AIProviderError(
    `OpenAI upstream error (${fallbackStatus}${upstreamCode ? ` ${upstreamCode}` : ''}): ${msg}`,
    'PROVIDER_ERROR',
    'OpenAI',
    fallbackStatus,
    { status: fallbackStatus, code: upstreamCode || 'provider_error', message: msg, original: msg }
  );
}

/**
 * Normalizes errors from OpenAI Responses API + hosted code_interpreter.
 * Differentiates between:
 * - Sandbox timeout errors -> 504 SANDBOX_TIMEOUT
 * - API connection issues -> 502 API_CONNECTION_ERROR
 * - Malformed code execution -> 422 MALFORMED_CODE_EXECUTION
 * - Unsupported model/account or unconfigured service -> 503 CODE_INTERPRETER_NOT_SUPPORTED / NOT_CONFIGURED
 */
export function normalizeCodeInterpreterError(error: any, model?: string): AIProviderError {
  if (error instanceof AIProviderError) {
    if (
      error.code === 'SANDBOX_TIMEOUT' ||
      error.code === 'API_CONNECTION_ERROR' ||
      error.code === 'MALFORMED_CODE_EXECUTION' ||
      error.code === 'NOT_CONFIGURED' ||
      (error as any).name === 'AbortError' ||
      error.statusCode === 499
    ) {
      return error;
    }
  }

  const baseErr = normalizeOpenAIError(error);
  if ((baseErr as any).name === 'AbortError' || baseErr.statusCode === 499) {
    return baseErr;
  }

  const rawMsg =
    error?.error?.message ||
    error?.message ||
    baseErr.message ||
    'OpenAI Code Interpreter execution failed';
  const msg = sanitizeOpenAIErrorMessage(String(rawMsg));
  const rawStatus = error?.status ?? error?.statusCode ?? error?.details?.upstreamStatus;
  const upstreamStatus = rawStatus ?? baseErr.statusCode;
  const upstreamCode =
    error?.code ??
    error?.error?.code ??
    error?.type ??
    error?.error?.type ??
    baseErr.details?.code;
  const errorName = String(error?.name || '');
  const codeStr = String(upstreamCode || '');

  if ((baseErr.code as string) === 'NOT_CONFIGURED') {
    return new AIProviderError(
      baseErr.message,
      'NOT_CONFIGURED',
      'OpenAI',
      503,
      { status: 503, upstreamStatus, code: 'not_configured', model, message: msg }
    );
  }

  // 1. Sandbox / execution timeout errors -> 504 SANDBOX_TIMEOUT
  if (
    errorName === 'APIConnectionTimeoutError' ||
    codeStr === 'ETIMEDOUT' ||
    codeStr === 'ESOCKETTIMEDOUT' ||
    codeStr === 'SANDBOX_TIMEOUT' ||
    codeStr === 'sandbox_timeout' ||
    codeStr === 'container_expired' ||
    rawStatus === 504 ||
    /timed?\s*out|timeout|deadline exceeded|sandbox.*timeout|container.*expired|execution.*time.*limit/i.test(msg)
  ) {
    return new AIProviderError(
      `OpenAI code_interpreter sandbox execution timed out for model "${model || 'unknown'}": ${msg}`,
      'SANDBOX_TIMEOUT',
      'OpenAI',
      504,
      {
        status: 504,
        upstreamStatus: rawStatus || 504,
        code: upstreamCode || 'sandbox_timeout',
        category: 'sandbox_timeout',
        model,
        message: msg,
        original: msg
      }
    );
  }

  // 2. Malformed code execution / Python syntax or runtime exception -> 422 MALFORMED_CODE_EXECUTION
  if (
    codeStr === 'MALFORMED_CODE_EXECUTION' ||
    codeStr === 'malformed_code_execution' ||
    codeStr === 'code_execution_error' ||
    codeStr === 'python_execution_error' ||
    rawStatus === 422 ||
    /syntaxerror|indentationerror|taberror|traceback \(most recent call last\)|malformed code|code execution failed|nameerror:|typeerror:|valueerror:|zerodivisionerror:|keyerror:|indexerror:|attributeerror:/i.test(msg)
  ) {
    return new AIProviderError(
      `Malformed code execution in OpenAI code_interpreter sandbox for model "${model || 'unknown'}": ${msg}`,
      'MALFORMED_CODE_EXECUTION',
      'OpenAI',
      422,
      {
        status: 422,
        upstreamStatus: rawStatus || 422,
        code: upstreamCode || 'malformed_code_execution',
        category: 'malformed_code',
        model,
        message: msg,
        original: msg
      }
    );
  }

  // 3. API connection / network issues -> 502 API_CONNECTION_ERROR
  const networkErrorCodes = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EPIPE',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
    'API_CONNECTION_ERROR',
    'api_connection_error'
  ]);
  if (
    errorName === 'APIConnectionError' ||
    networkErrorCodes.has(codeStr) ||
    rawStatus === 502 ||
    /connection error|network error|fetch failed|socket hang up|econnrefused|econnreset|enotfound|eai_again|bad gateway|upstream connect|failed to connect/i.test(msg)
  ) {
    return new AIProviderError(
      `OpenAI API connection failed while executing code_interpreter for model "${model || 'unknown'}": ${msg}`,
      'API_CONNECTION_ERROR',
      'OpenAI',
      502,
      {
        status: 502,
        upstreamStatus: rawStatus || 502,
        code: upstreamCode || 'api_connection_error',
        category: 'api_connection',
        model,
        message: msg,
        original: msg
      }
    );
  }

  // 4. Unsupported model/account or service unavailable -> 503
  let resolvedCode: NormalizedOpenAIErrorCode = 'CODE_INTERPRETER_UNAVAILABLE';
  if (
    /code_interpreter|tool.*not supported|unsupported.*tool|not supported with this model|responses.*not supported|container/i.test(msg) ||
    baseErr.code === 'INVALID_REQUEST'
  ) {
    resolvedCode = 'CODE_INTERPRETER_NOT_SUPPORTED';
  } else if ((baseErr.code as string) === 'MODEL_NOT_AVAILABLE') {
    resolvedCode = 'MODEL_NOT_AVAILABLE';
  } else if (baseErr.code === 'AUTH_ERROR') {
    resolvedCode = 'AUTH_ERROR';
  } else if (baseErr.code === 'RATE_LIMITED') {
    resolvedCode = 'RATE_LIMITED';
  } else if ((error?.code as string) === 'CODE_INTERPRETER_NOT_SUPPORTED') {
    resolvedCode = 'CODE_INTERPRETER_NOT_SUPPORTED';
  }

  return new AIProviderError(
    `OpenAI hosted code_interpreter unavailable for model "${model || 'unknown'}" (${resolvedCode}): ${msg}`,
    resolvedCode as any,
    'OpenAI',
    503,
    {
      status: 503,
      upstreamStatus,
      code: upstreamCode || resolvedCode.toLowerCase(),
      category: 'service_unavailable',
      model,
      message: msg,
      original: msg
    }
  );
}

export class OpenAIAdapter implements AIProviderAdapter {
  id = 'openai';
  name = 'OpenAI';

  /**
   * Authoritative, documented credential resolver for OpenAI.
   * Primary documented credential source for OpenAI API requests is OPENAI_API_KEY.
   */
  public resolveApiKey(forModel?: string): string | undefined {
    const isCloudPreview =
      forModel === 'gpt-6-astra' ||
      forModel === 'gpt-6-sol' ||
      forModel === 'gpt-6-luna';

    // 1. For cloud preview agents, check session credentials if explicitly set
    if (isCloudPreview) {
      const cloudKey = (process.env.CODEX_API_KEY || process.env.OPENAI_ENVIRONMENT_KEY)?.trim();
      if (cloudKey && cloudKey.length > 0 && !cloudKey.includes('replace_with')) {
        return cloudKey;
      }
    }

    // 2. Primary documented credential source for OpenAI API requests
    const primaryKey = process.env.OPENAI_API_KEY?.trim();
    if (primaryKey && primaryKey.length > 0 && !primaryKey.includes('replace_with')) {
      return primaryKey;
    }

    // 3. Fallback to legacy environment variables
    const legacyKey = (process.env.CODEX_API_KEY || process.env.OPENAI_ENVIRONMENT_KEY)?.trim();
    if (legacyKey && legacyKey.length > 0 && !legacyKey.includes('replace_with')) {
      return legacyKey;
    }

    return undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.resolveApiKey());
  }

  private getClient(forModel?: string): OpenAI {
    const key = this.resolveApiKey(forModel);
    if (!key) {
      throw new AIProviderError(
        'OpenAI is not configured on the FLOAT server. To use OpenAI models, configure OPENAI_API_KEY in the server environment.',
        'NOT_CONFIGURED' as any,
        'OpenAI',
        503,
        { status: 503, code: 'not_configured', message: 'Missing OPENAI_API_KEY' }
      );
    }
    const isCloudAgent =
      forModel === 'gpt-6-astra' ||
      forModel === 'gpt-6-sol' ||
      forModel === 'gpt-6-luna';

    const hasCloudSession = Boolean(
      isCloudAgent &&
      GPT6_ASTRA_CLOUD_CONFIG.sessionId &&
      GPT6_ASTRA_CLOUD_CONFIG.environmentId
    );

    const defaultHeaders = hasCloudSession
      ? {
          'X-Session-Id': GPT6_ASTRA_CLOUD_CONFIG.sessionId,
          'X-Environment-Id': GPT6_ASTRA_CLOUD_CONFIG.environmentId
        }
      : undefined;

    return new OpenAI({
      apiKey: key,
      ...(defaultHeaders ? { defaultHeaders } : {})
    });
  }

  private isGpt6OrReasoningModel(model: string): boolean {
    return (
      model.startsWith('gpt-6') ||
      model.startsWith('o1') ||
      model.startsWith('o3')
    );
  }

  private supportsReasoningEffortParam(model: string): boolean {
    return (
      model === 'o1' ||
      model === 'o3-mini' ||
      model === 'gpt-6-sol' ||
      model === 'gpt-6-astra' ||
      model === 'gpt-6-luna'
    );
  }

  /**
   * Adapts request parameters ONLY when the upstream SDK/API returns a parameter compatibility
   * error (e.g. max_completion_tokens vs max_tokens, reasoning_effort, or developer vs system role)
   * for the SAME model. Never changes or falls back to another model ID.
   */
  private adaptParamsForParameterError(
    params: Record<string, any>,
    err: any
  ): Record<string, any> | null {
    const msg = String(err?.error?.message || err?.message || '');
    const status = err?.status ?? err?.statusCode;
    if (status !== 400 && !/unsupported parameter|unrecognized request argument|invalid_request_error/i.test(msg)) {
      return null;
    }

    const updated = { ...params };
    let changed = false;

    if (/reasoning_effort/i.test(msg) && 'reasoning_effort' in updated) {
      delete updated.reasoning_effort;
      changed = true;
    }

    if (/max_tokens.*max_completion_tokens/i.test(msg) && 'max_tokens' in updated) {
      updated.max_completion_tokens = updated.max_tokens;
      delete updated.max_tokens;
      changed = true;
    } else if (/max_completion_tokens.*max_tokens/i.test(msg) && 'max_completion_tokens' in updated) {
      updated.max_tokens = updated.max_completion_tokens;
      delete updated.max_completion_tokens;
      changed = true;
    } else if (/higher max_tokens|model output limit was reached/i.test(msg)) {
      const currentLimit = updated.max_completion_tokens ?? updated.max_tokens ?? 1;
      if ('max_completion_tokens' in updated || this.isGpt6OrReasoningModel(String(updated.model || ''))) {
        updated.max_completion_tokens = Math.max(currentLimit * 16, 32);
        delete updated.max_tokens;
      } else {
        updated.max_tokens = Math.max(currentLimit * 16, 32);
      }
      changed = true;
    }

    if (/developer.*role|role.*developer/i.test(msg) && Array.isArray(updated.messages)) {
      updated.messages = updated.messages.map((m: any) =>
        m?.role === 'developer' ? { ...m, role: 'system' } : m
      );
      changed = true;
    }

    return changed ? updated : null;
  }

  /**
   * Sends a 1-token completion request to each configured model and reports ok / error per model.
   */
  async checkHealth(): Promise<ProviderHealthCheckResult & { models: Record<string, PerModelHealthEntry> }> {
    const modelsReport: Record<string, PerModelHealthEntry> = {};

    if (!this.isConfigured()) {
      for (const modelId of CONFIGURED_HEALTH_CHECK_MODELS) {
        modelsReport[modelId] = {
          status: 'error',
          code: 'NOT_CONFIGURED',
          statusCode: 503,
          message: 'OpenAI is not configured on the FLOAT server. Configure OPENAI_API_KEY in the server environment.'
        };
      }
      return {
        provider: 'OpenAI',
        configured: false,
        authenticated: false,
        modelAvailable: false,
        defaultModel: 'gpt-6-astra',
        models: modelsReport
      };
    }

    const accessibleModelIds: string[] = [];
    let anyAuthenticated = false;
    let firstError: string | undefined;

    await Promise.all(
      CONFIGURED_HEALTH_CHECK_MODELS.map(async (modelId) => {
        try {
          const client = this.getClient(modelId);
          const useMaxCompletionTokens = this.isGpt6OrReasoningModel(modelId);
          const baseParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
            model: modelId,
            messages: [{ role: 'user', content: 'ping' }],
            ...(useMaxCompletionTokens ? { max_completion_tokens: 1 } : { max_tokens: 1 })
          };

          if (client.chat?.completions?.create) {
            try {
              await client.chat.completions.create(baseParams);
            } catch (innerErr: any) {
              const adapted = this.adaptParamsForParameterError(baseParams as any, innerErr);
              if (adapted) {
                await client.chat.completions.create(
                  adapted as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
                );
              } else {
                throw innerErr;
              }
            }
          } else if (client.models?.list) {
            await client.models.list();
          }

          modelsReport[modelId] = { status: 'ok' };
          accessibleModelIds.push(modelId);
          anyAuthenticated = true;
        } catch (err: any) {
          const normalized = normalizeOpenAIError(err);
          if (normalized.code !== 'AUTH_ERROR' && normalized.code !== ('NOT_CONFIGURED' as any)) {
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
      })
    );

    const modelAvailable = accessibleModelIds.length > 0;
    return {
      provider: 'OpenAI',
      configured: true,
      authenticated: anyAuthenticated,
      modelAvailable,
      defaultModel: 'gpt-6-astra',
      accessibleModelIds,
      models: modelsReport,
      ...(modelAvailable ? {} : { error: firstError || 'No configured OpenAI models succeeded.' })
    };
  }

  private resolveApiModel(model: string): string {
    const mapping: Record<string, string> = {
      auto: 'gpt-6-astra',
      'float-basic': 'gpt-4o-mini'
    };
    return mapping[model] || model || 'gpt-6-astra';
  }

  private formatMessages(
    request: AIProviderRequest,
    isReasoningModel: boolean
  ): Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
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
          if (role === 'user' && Array.isArray(msg.parts) && msg.parts.some((p: any) => p?.inlineData || p?.image_url)) {
            const contentParts: any[] = [];
            for (const p of msg.parts) {
              if (p?.text) {
                contentParts.push({ type: 'text', text: String(p.text) });
              } else if (p?.inlineData?.mimeType && p?.inlineData?.data) {
                contentParts.push({
                  type: 'image_url',
                  image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` }
                });
              } else if (p?.image_url?.url) {
                contentParts.push({
                  type: 'image_url',
                  image_url: { url: String(p.image_url.url) }
                });
              }
            }
            messages.push({ role: 'user', content: contentParts } as any);
          } else {
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
    }

    if (messages.length === 0) {
      messages.push({ role: 'user', content: 'Hello' });
    }

    return messages;
  }

  private formatTools(
    tools?: AIProviderRequest['tools']
  ): OpenAI.Chat.Completions.ChatCompletionTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
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
          await new Promise((r) => setTimeout(r, 14));
        }
      }
    }
  }

  private synthesizeDemoResponse(model: string, messages: any[]): string {
    const isSol = model.includes('sol');
    const demoBanner = `> **[SIMULATED DEMO RESPONSE]**\n> This response was generated locally in offline demo mode. No genuine AI provider execution occurred.\n\n`;
    const badge =
      demoBanner +
      (isSol
        ? '### [GPT-6 Sol — Deep Architectural Reasoning (Demo Mode)]'
        : '### [GPT-6 Astra — Flagship Coding Agent (Demo Mode)]');

    let userPrompt = '';
    if (Array.isArray(messages)) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (typeof m === 'string') {
          userPrompt = m;
          break;
        }
        if (m && (m.role === 'user' || !m.role)) {
          userPrompt = typeof m.content === 'string' ? m.content : m.parts?.[0]?.text || '';
          if (userPrompt) break;
        }
      }
    }
    if (!userPrompt) userPrompt = 'Hello';

    return `${badge}\n\nReceived prompt in demo mode: "${userPrompt.slice(0, 160)}".`;
  }

  async generateContent(request: AIProviderRequest): Promise<AIProviderResponse> {
    const requestedModel = request.apiModelId || request.model;
    const effectiveModel = this.resolveApiModel(requestedModel);

    if (request.demoMode) {
      const text = this.synthesizeDemoResponse(requestedModel, request.messages);
      return {
        text,
        isSimulated: true
      };
    }

    if (!this.isConfigured()) {
      throw new AIProviderError(
        'OpenAI is not configured on the FLOAT server. To use OpenAI models, configure OPENAI_API_KEY in the server environment.',
        'NOT_CONFIGURED' as any,
        'OpenAI',
        503,
        { status: 503, code: 'not_configured', message: 'Missing OPENAI_API_KEY' }
      );
    }

    const client = this.getClient(effectiveModel);
    const isReasoning = this.isGpt6OrReasoningModel(effectiveModel);

    try {
      const messages = this.formatMessages(request, isReasoning);
      const tools = this.formatTools(request.tools);

      const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: effectiveModel,
        messages,
        ...(tools ? { tools } : {})
      };

      const maxTokens = (request as any).maxCompletionTokens ?? (request as any).maxTokens;
      if (typeof maxTokens === 'number' && maxTokens > 0) {
        if (isReasoning) {
          params.max_completion_tokens = maxTokens;
        } else {
          params.max_tokens = maxTokens;
        }
      }

      if (this.supportsReasoningEffortParam(effectiveModel) && request.reasoningEffort) {
        (params as any).reasoning_effort = request.reasoningEffort;
      }

      let response: OpenAI.Chat.Completions.ChatCompletion;
      try {
        response = await client.chat.completions.create(params);
      } catch (callErr: any) {
        const adapted = this.adaptParamsForParameterError(params as any, callErr);
        if (adapted) {
          response = await client.chat.completions.create(
            adapted as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
          );
        } else {
          throw callErr;
        }
      }

      const choice = response.choices[0];
      const text = choice?.message?.content || '';

      const executedTools = choice?.message?.tool_calls?.map((tc) => {
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

      const usage = response.usage
        ? {
            inputTokens: response.usage.prompt_tokens || 0,
            outputTokens: response.usage.completion_tokens || 0
          }
        : undefined;

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

    if (request.demoMode) {
      const demoText = this.synthesizeDemoResponse(requestedModel, request.messages);
      await this.streamDemoTokens(demoText, onChunk, signal);
      return {
        text: demoText,
        isSimulated: true
      };
    }

    if (!this.isConfigured()) {
      throw new AIProviderError(
        'OpenAI is not configured on the FLOAT server. To use OpenAI models, configure OPENAI_API_KEY in the server environment.',
        'NOT_CONFIGURED' as any,
        'OpenAI',
        503,
        { status: 503, code: 'not_configured', message: 'Missing OPENAI_API_KEY' }
      );
    }

    const client = this.getClient(effectiveModel);
    const isReasoning = this.isGpt6OrReasoningModel(effectiveModel);

    try {
      const messages = this.formatMessages(request, isReasoning);
      const tools = this.formatTools(request.tools);

      const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
        model: effectiveModel,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(tools ? { tools } : {})
      };

      const maxTokens = (request as any).maxCompletionTokens ?? (request as any).maxTokens;
      if (typeof maxTokens === 'number' && maxTokens > 0) {
        if (isReasoning) {
          params.max_completion_tokens = maxTokens;
        } else {
          params.max_tokens = maxTokens;
        }
      }

      if (this.supportsReasoningEffortParam(effectiveModel) && request.reasoningEffort) {
        (params as any).reasoning_effort = request.reasoningEffort;
      }

      let stream: any;
      try {
        stream = await client.chat.completions.create(params, { signal });
      } catch (callErr: any) {
        const adapted = this.adaptParamsForParameterError(params as any, callErr);
        if (adapted) {
          stream = await client.chat.completions.create(
            adapted as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
            { signal }
          );
        } else {
          throw callErr;
        }
      }

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

      const usage =
        inputTokens !== undefined || outputTokens !== undefined
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

  /**
   * Executes Python analysis in OpenAI's hosted `code_interpreter` container via the Responses API.
   * Supports uploading a CSV file and attaching it to the container (`file_ids`), streaming events,
   * and `AbortSignal` cancellation. Keeps `chat.completions` for everything else.
   */
  async runCodeInterpreterResponse(
    request: CodeInterpreterResponseRequest,
    onEvent?: (event: CodeInterpreterStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<CodeInterpreterResponseResult> {
    const requestedModel = request.apiModelId || request.model;
    const effectiveModel = this.resolveApiModel(requestedModel);
    const effectiveSignal = signal || request.signal;
    const effectiveOnEvent = onEvent || request.onEvent;

    if (effectiveSignal?.aborted) {
      throw normalizeOpenAIError({ name: 'AbortError', message: 'Operation was cancelled.' });
    }

    if (!this.isConfigured()) {
      throw new AIProviderError(
        'OpenAI is not configured on the FLOAT server. To use OpenAI Code Interpreter, configure OPENAI_API_KEY in the server environment.',
        'NOT_CONFIGURED',
        'OpenAI',
        503,
        { status: 503, code: 'not_configured', message: 'Missing OPENAI_API_KEY' }
      );
    }

    const client = this.getClient(effectiveModel);
    if (!client.responses || typeof client.responses.create !== 'function') {
      throw new AIProviderError(
        `OpenAI Responses API is not available on the client for model "${effectiveModel}".`,
        'CODE_INTERPRETER_UNAVAILABLE',
        'OpenAI',
        503,
        { status: 503, code: 'responses_api_unavailable', model: effectiveModel }
      );
    }

    let uploadedFileId: string | undefined;

    try {
      if (request.csvFile) {
        if (!client.files || typeof client.files.create !== 'function') {
          throw new AIProviderError(
            `OpenAI Files API is not available to upload dataset "${request.csvFile.filename}".`,
            'CODE_INTERPRETER_UNAVAILABLE',
            'OpenAI',
            503,
            { status: 503, code: 'files_api_unavailable', model: effectiveModel }
          );
        }

        const csvBuffer = Buffer.isBuffer(request.csvFile.content)
          ? request.csvFile.content
          : Buffer.from(String(request.csvFile.content), 'utf-8');
        const filename = request.csvFile.filename || 'dataset.csv';
        const mimeType = request.csvFile.mimeType || 'text/csv';

        try {
          const uploadable = await toFile(csvBuffer, filename, { type: mimeType });
          const createdFile = await client.files.create(
            { file: uploadable, purpose: 'assistants' },
            effectiveSignal ? { signal: effectiveSignal } : undefined
          );
          uploadedFileId = createdFile.id;
        } catch (uploadErr: any) {
          const uploadMsg = String(uploadErr?.error?.message || uploadErr?.message || '');
          if (uploadErr?.status === 400 && /purpose|user_data/i.test(uploadMsg)) {
            const fallbackUploadable = await toFile(csvBuffer, filename, { type: mimeType });
            const createdFile = await client.files.create(
              { file: fallbackUploadable, purpose: 'user_data' },
              effectiveSignal ? { signal: effectiveSignal } : undefined
            );
            uploadedFileId = createdFile.id;
          } else {
            throw uploadErr;
          }
        }
      }

      if (effectiveSignal?.aborted) {
        throw normalizeOpenAIError({ name: 'AbortError', message: 'Operation was cancelled.' });
      }

      const useStream = request.stream !== false;
      const containerConfig: OpenAI.Responses.Tool.CodeInterpreter.CodeInterpreterToolAuto = {
        type: 'auto',
        ...(uploadedFileId ? { file_ids: [uploadedFileId] } : {})
      };

      const params: OpenAI.Responses.ResponseCreateParams = {
        model: effectiveModel,
        input: request.input,
        ...(request.instructions ? { instructions: request.instructions } : {}),
        tools: [
          {
            type: 'code_interpreter',
            container: containerConfig
          }
        ],
        include: ['code_interpreter_call.outputs'],
        stream: useStream
      };

      const codeByItem = new Map<string, string>();
      const codeOrder: string[] = [];
      const logsByKey = new Map<string, string>();
      const filesByKey = new Map<string, CodeInterpreterGeneratedFile>();
      let containerId: string | undefined;
      let responseId: string | undefined;
      let streamedText = '';
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;

      const recordCode = (itemId: string, codeStr: string, append = false) => {
        const key = itemId || `item_${codeOrder.length}`;
        if (!codeByItem.has(key)) {
          codeOrder.push(key);
          codeByItem.set(key, '');
        }
        if (append) {
          codeByItem.set(key, (codeByItem.get(key) || '') + codeStr);
        } else {
          codeByItem.set(key, codeStr);
        }
      };

      const recordLog = (key: string, logText: string) => {
        if (!logText) return;
        if (!logsByKey.has(key)) {
          logsByKey.set(key, logText);
        }
      };

      const recordFile = (file: CodeInterpreterGeneratedFile): CodeInterpreterGeneratedFile => {
        const key = file.fileId || file.url || file.filename || `file_${filesByKey.size}`;
        const existing = filesByKey.get(key);
        const merged: CodeInterpreterGeneratedFile = existing ? { ...existing, ...file } : file;
        filesByKey.set(key, merged);
        return merged;
      };

      const extractAnnotationFile = (ann: any): CodeInterpreterGeneratedFile | null => {
        if (!ann || typeof ann !== 'object') return null;
        if (
          ann.type === 'container_file_citation' ||
          ann.type === 'file_citation' ||
          ann.type === 'file_path'
        ) {
          const filename = typeof ann.filename === 'string' ? ann.filename : undefined;
          const isImg = filename ? /\.(png|jpg|jpeg|webp|svg|gif)$/i.test(filename) : false;
          return {
            fileId: typeof ann.file_id === 'string' ? ann.file_id : undefined,
            containerId: typeof ann.container_id === 'string' ? ann.container_id : containerId,
            filename,
            type: isImg ? 'image' : 'file'
          };
        }
        return null;
      };

      const processOutputItem = (item: any, itemIdx = 0) => {
        if (!item || typeof item !== 'object') return;
        if (item.type === 'code_interpreter_call') {
          const itemId = item.id || `ci_${itemIdx}`;
          if (typeof item.container_id === 'string' && item.container_id) {
            containerId = item.container_id;
          }
          if (typeof item.code === 'string' && item.code.length > 0) {
            recordCode(itemId, item.code, false);
          }
          if (Array.isArray(item.outputs)) {
            item.outputs.forEach((out: any, outIdx: number) => {
              if (!out || typeof out !== 'object') return;
              if (out.type === 'logs' && typeof out.logs === 'string') {
                recordLog(`${itemId}_log_${outIdx}`, out.logs);
              } else if (out.type === 'image' && typeof out.url === 'string') {
                recordFile({
                  type: 'image',
                  url: out.url,
                  containerId: item.container_id || containerId
                });
              } else if (out.file_id || out.url || out.filename) {
                const fname = typeof out.filename === 'string' ? out.filename : undefined;
                const isImg =
                  out.type === 'image' ||
                  (fname ? /\.(png|jpg|jpeg|webp|svg|gif)$/i.test(fname) : false);
                recordFile({
                  type: isImg ? 'image' : 'file',
                  fileId: out.file_id,
                  url: out.url,
                  filename: fname,
                  containerId: item.container_id || containerId
                });
              }
            });
          }
        } else if (item.type === 'message' && Array.isArray(item.content)) {
          for (const part of item.content) {
            if (!part || typeof part !== 'object') continue;
            if (part.type === 'output_text') {
              if (Array.isArray(part.annotations)) {
                for (const ann of part.annotations) {
                  const f = extractAnnotationFile(ann);
                  if (f) recordFile(f);
                }
              }
            }
          }
        }
      };

      const processCompletedResponse = (resp: any) => {
        if (!resp || typeof resp !== 'object') return;
        if (typeof resp.id === 'string') {
          responseId = resp.id;
        }
        if (Array.isArray(resp.output)) {
          resp.output.forEach((item: any, idx: number) => processOutputItem(item, idx));
        }
        if (!streamedText) {
          if (typeof resp.output_text === 'string' && resp.output_text) {
            streamedText = resp.output_text;
          } else if (Array.isArray(resp.output)) {
            const textParts: string[] = [];
            for (const item of resp.output) {
              if (item?.type === 'message' && Array.isArray(item.content)) {
                for (const part of item.content) {
                  if (part?.type === 'output_text' && typeof part.text === 'string') {
                    textParts.push(part.text);
                  }
                }
              }
            }
            if (textParts.length > 0) {
              streamedText = textParts.join('\n');
            }
          }
        }
        if (resp.usage) {
          inputTokens = resp.usage.input_tokens ?? resp.usage.prompt_tokens ?? inputTokens;
          outputTokens = resp.usage.output_tokens ?? resp.usage.completion_tokens ?? outputTokens;
        }
      };

      const rawResponseOrStream: any = await client.responses.create(
        params as any,
        effectiveSignal ? { signal: effectiveSignal } : undefined
      );

      if (rawResponseOrStream && typeof rawResponseOrStream[Symbol.asyncIterator] === 'function') {
        for await (const event of rawResponseOrStream as AsyncIterable<OpenAI.Responses.ResponseStreamEvent>) {
          if (effectiveSignal?.aborted) {
            throw normalizeOpenAIError({ name: 'AbortError', message: 'Operation was cancelled.' });
          }
          if (!event || typeof event !== 'object') continue;

          switch (event.type) {
            case 'response.code_interpreter_call_code.delta': {
              recordCode(event.item_id, event.delta, true);
              effectiveOnEvent?.({
                type: 'code_delta',
                delta: event.delta,
                itemId: event.item_id
              });
              break;
            }
            case 'response.code_interpreter_call_code.done': {
              recordCode(event.item_id, event.code, false);
              effectiveOnEvent?.({
                type: 'code_done',
                code: event.code,
                itemId: event.item_id
              });
              break;
            }
            case 'response.code_interpreter_call.interpreting': {
              effectiveOnEvent?.({
                type: 'interpreting',
                itemId: event.item_id
              });
              break;
            }
            case 'response.code_interpreter_call.completed': {
              effectiveOnEvent?.({
                type: 'completed',
                itemId: event.item_id
              });
              break;
            }
            case 'response.output_text.delta': {
              if (event.delta) {
                streamedText += event.delta;
                request.onChunk?.(event.delta);
                effectiveOnEvent?.({
                  type: 'text_delta',
                  delta: event.delta,
                  itemId: event.item_id
                });
              }
              break;
            }
            case 'response.output_text.annotation.added': {
              const fileObj = extractAnnotationFile(event.annotation);
              if (fileObj) {
                const saved = recordFile(fileObj);
                effectiveOnEvent?.({
                  type: 'file_annotation',
                  itemId: event.item_id,
                  file: saved
                });
              }
              break;
            }
            case 'response.output_item.done': {
              processOutputItem(event.item, event.output_index);
              break;
            }
            case 'response.completed': {
              processCompletedResponse(event.response);
              break;
            }
            case 'response.failed': {
              const errInfo = event.response?.error as any;
              const failErr: any = new Error(
                errInfo?.message || 'OpenAI Responses API execution failed.'
              );
              if (typeof errInfo?.status === 'number') {
                failErr.status = errInfo.status;
              }
              failErr.code = errInfo?.code || 'response_failed';
              throw failErr;
            }
            case 'error': {
              const streamErr: any = new Error(
                event.message || 'OpenAI Responses stream error.'
              );
              if (typeof (event as any).status === 'number') {
                streamErr.status = (event as any).status;
              }
              streamErr.code = event.code || 'stream_error';
              throw streamErr;
            }
            default:
              break;
          }
        }
      } else {
        processCompletedResponse(rawResponseOrStream);
        if (streamedText && request.onChunk) {
          request.onChunk(streamedText);
        }
      }

      if (effectiveSignal?.aborted) {
        throw normalizeOpenAIError({ name: 'AbortError', message: 'Operation was cancelled.' });
      }

      const codeBlocks = codeOrder
        .map((id) => (codeByItem.get(id) || '').trim())
        .filter((c) => c.length > 0);
      const logs = Array.from(logsByKey.values()).filter((l) => l.length > 0);
      const files = Array.from(filesByKey.values());

      const usage =
        inputTokens !== undefined || outputTokens !== undefined
          ? { inputTokens: inputTokens ?? 0, outputTokens: outputTokens ?? 0 }
          : undefined;

      return {
        responseId,
        model: effectiveModel,
        text: streamedText,
        code: codeBlocks.join('\n\n'),
        codeBlocks,
        stdout: logs.join('\n'),
        logs,
        files,
        uploadedFileId,
        containerId,
        usage
      };
    } catch (err: any) {
      throw normalizeCodeInterpreterError(err, effectiveModel);
    } finally {
      if (uploadedFileId && client.files && typeof client.files.delete === 'function') {
        await client.files.delete(uploadedFileId).catch(() => {});
      }
    }
  }

  async runAgentLoop(
    req: any,
    res: any,
    model: string,
    prompt: string,
    virtualFiles: any[]
  ): Promise<void> {
    const effectiveModel = this.resolveApiModel(model);
    const apiKey = this.resolveApiKey(effectiveModel);
    if (!apiKey) {
      throw new AIProviderError(
        `OpenAI is not configured on the FLOAT server. To run agents with "${effectiveModel}", configure OPENAI_API_KEY.`,
        'NOT_CONFIGURED' as any,
        'OpenAI',
        503,
        { status: 503, code: 'not_configured', message: 'Missing OPENAI_API_KEY' }
      );
    }
    const { PortableAgentRunner } = await import('../agent/portableAgentRunner');
    return PortableAgentRunner.run('openai', req, res, effectiveModel, prompt, virtualFiles, apiKey);
  }
}
