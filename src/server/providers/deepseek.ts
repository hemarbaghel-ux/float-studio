/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import OpenAI from 'openai';
import {
  AIProviderAdapter,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderError,
  ProviderHealthCheckResult,
} from './base';

export function normalizeDeepSeekError(error: any): AIProviderError {
  const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
  const status = error?.status || error?.statusCode;

  if (
    error?.name === 'AbortError' ||
    error?.type === 'cancelation' ||
    error?.type === 'cancelled' ||
    /operation is manually canceled/i.test(msg) ||
    /cancel/i.test(msg)
  ) {
    const err = new AIProviderError('Operation was cancelled.', 'INVALID_REQUEST', 'DeepSeek', 499);
    (err as any).name = 'AbortError';
    (err as any).type = 'cancelation';
    return err;
  }

  if (status === 401 || /invalid_api_key|authentication|401|api_key|unauthorized/i.test(msg)) {
    return new AIProviderError(
      'DeepSeek authentication failed. Check your DEEPSEEK_API_KEY or BYOK key.',
      'AUTH_ERROR',
      'DeepSeek',
      401,
      { original: msg }
    );
  }

  if (status === 429 || /insufficient_quota|rate[- ]?limit|balance/i.test(msg)) {
    return new AIProviderError(
      'DeepSeek rate limit or insufficient balance. Check your DeepSeek account balance.',
      'QUOTA_EXCEEDED',
      'DeepSeek',
      429,
      { original: msg }
    );
  }

  return new AIProviderError(
    msg || 'An unexpected error occurred with DeepSeek provider.',
    'PROVIDER_ERROR',
    'DeepSeek',
    status || 500,
    { original: msg }
  );
}

export class DeepSeekAdapter implements AIProviderAdapter {
  id = 'deepseek';
  name = 'DeepSeek';

  public resolveApiKey(apiKeyOverride?: string): string | undefined {
    if (apiKeyOverride && apiKeyOverride.trim().length > 0) {
      return apiKeyOverride.trim();
    }
    const key = process.env.DEEPSEEK_API_KEY?.trim();
    return key && key.length > 0 && !key.includes('replace_with') ? key : undefined;
  }

  isConfigured(apiKeyOverride?: string): boolean {
    return Boolean(this.resolveApiKey(apiKeyOverride));
  }

  private getClient(apiKeyOverride?: string): OpenAI {
    const key = this.resolveApiKey(apiKeyOverride);
    if (!key) {
      throw new AIProviderError(
        'DeepSeek is not configured. Provide DEEPSEEK_API_KEY or configure your key in Settings -> Models.',
        'AUTH_ERROR',
        'DeepSeek',
        401
      );
    }
    return new OpenAI({
      apiKey: key,
      baseURL: 'https://api.deepseek.com',
    });
  }

  async checkHealth(apiKeyOverride?: string): Promise<ProviderHealthCheckResult> {
    if (!this.isConfigured(apiKeyOverride)) {
      return {
        provider: 'DeepSeek',
        configured: false,
        authenticated: false,
        modelAvailable: false,
        defaultModel: 'deepseek-chat',
      };
    }

    try {
      const client = this.getClient(apiKeyOverride);
      const models = await client.models.list();
      return {
        provider: 'DeepSeek',
        configured: true,
        authenticated: true,
        modelAvailable: true,
        defaultModel: 'deepseek-chat',
        accessibleModelIds: models.data.map((m) => m.id),
      };
    } catch (err: any) {
      const normalized = normalizeDeepSeekError(err);
      return {
        provider: 'DeepSeek',
        configured: true,
        authenticated: false,
        modelAvailable: false,
        defaultModel: 'deepseek-chat',
        error: normalized.message,
      };
    }
  }

  async generateContent(request: AIProviderRequest): Promise<AIProviderResponse> {
    const client = this.getClient(request.apiKeyOverride);
    const model = request.apiModelId || request.model || 'deepseek-chat';

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: request.messages as any,
        temperature: 0.2,
      });

      const text = completion.choices[0]?.message?.content || '';
      return {
        text,
        usage: {
          inputTokens: completion.usage?.prompt_tokens || 0,
          outputTokens: completion.usage?.completion_tokens || 0,
        },
      };
    } catch (err: any) {
      throw normalizeDeepSeekError(err);
    }
  }

  async generateContentStream(
    request: AIProviderRequest,
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<AIProviderResponse> {
    const client = this.getClient(request.apiKeyOverride);
    const model = request.apiModelId || request.model || 'deepseek-chat';

    try {
      const stream = await client.chat.completions.create(
        {
          model,
          messages: request.messages as any,
          stream: true,
          temperature: 0.2,
        },
        { signal }
      );

      let fullText = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          onChunk(delta);
        }
      }

      return { text: fullText };
    } catch (err: any) {
      throw normalizeDeepSeekError(err);
    }
  }
}
