import {
  AIProviderAdapter,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderError,
  ProviderHealthCheckResult
} from './base';
import { GoogleGeminiAdapter } from './gemini';
import { OpenAIAdapter } from './openai';
import { AnthropicAdapter } from './anthropic';
import { XAIAdapter } from './xai';
import { ServerPrivacyGuard } from '../privacyGuard';

export interface ModelRouteDefinition {
  provider: 'google' | 'openai' | 'anthropic' | 'xai';
  apiModelId: string;
}

export class ModelRouter {
  private adapters: Map<string, AIProviderAdapter> = new Map();

  // Strict, verified model mapping to provider + verified apiModelId
  // The UI display name or alias must never be treated as the actual API model ID
  private modelRoutes: Record<string, ModelRouteDefinition> = {
    // Auto / Default
    'auto': { provider: 'google', apiModelId: 'gemini-3.8-flash' },

    // Free Tier Model
    'float-basic': { provider: 'google', apiModelId: 'gemini-3.8-flash' },

    // Google Gemini Models
    'gemini-3.8-flash': { provider: 'google', apiModelId: 'gemini-3.8-flash' },
    'gemini-2.0-flash': { provider: 'google', apiModelId: 'gemini-3.8-flash' },
    'gemini-2.5-flash': { provider: 'google', apiModelId: 'gemini-2.5-flash' },
    'gemini-2.5-pro': { provider: 'google', apiModelId: 'gemini-2.5-pro' },
    'gemini-1.5-pro': { provider: 'google', apiModelId: 'gemini-3.8-flash' },
    'gemini-1.5-flash': { provider: 'google', apiModelId: 'gemini-3.8-flash' },
    'gemini-3.1-flash-lite': { provider: 'google', apiModelId: 'gemini-3.8-flash' },
    'gemini-flash-latest': { provider: 'google', apiModelId: 'gemini-3.8-flash' },
    'composer-2.5': { provider: 'google', apiModelId: 'gemini-3.8-flash' },
    'muse-spark-1.3': { provider: 'google', apiModelId: 'gemini-3.8-flash' },

    // OpenAI Models
    'gpt-4o': { provider: 'openai', apiModelId: 'gpt-4o' },
    'gpt-4o-mini': { provider: 'openai', apiModelId: 'gpt-4o-mini' },
    'o1': { provider: 'openai', apiModelId: 'o1' },
    'o3-mini': { provider: 'openai', apiModelId: 'o3-mini' },
    'gpt-4o-2024-11-20': { provider: 'openai', apiModelId: 'gpt-4o-2024-11-20' },
    'gpt-4': { provider: 'openai', apiModelId: 'gpt-4' },
    'gpt-3.5-turbo': { provider: 'openai', apiModelId: 'gpt-3.5-turbo' },
    'gpt-5.6-sol': { provider: 'openai', apiModelId: 'gpt-4o-2024-11-20' },

    // Anthropic Models
    'claude-3-7-sonnet-20250219': { provider: 'anthropic', apiModelId: 'claude-3-7-sonnet-20250219' },
    'claude-3-5-sonnet-20241022': { provider: 'anthropic', apiModelId: 'claude-3-5-sonnet-20241022' },
    'claude-3-5-haiku-20241022': { provider: 'anthropic', apiModelId: 'claude-3-5-haiku-20241022' },
    'claude-3-opus-20240229': { provider: 'anthropic', apiModelId: 'claude-3-opus-20240229' },
    'claude-opus-5.5': { provider: 'anthropic', apiModelId: 'claude-3-opus-20240229' },
    'claude-opus-5': { provider: 'anthropic', apiModelId: 'claude-3-opus-20240229' },
    'claude-fable-5.1': { provider: 'anthropic', apiModelId: 'claude-3-7-sonnet-20250219' },
    'claude-sonnet-5.5': { provider: 'anthropic', apiModelId: 'claude-3-5-sonnet-20241022' },

    // xAI
    'grok-4.7': { provider: 'xai', apiModelId: 'grok-2-1212' },
    'grok-2-1212': { provider: 'xai', apiModelId: 'grok-2-1212' },
    'grok-2': { provider: 'xai', apiModelId: 'grok-2' },
    'grok-2-vision-1212': { provider: 'xai', apiModelId: 'grok-2-vision-1212' },
    'grok-beta': { provider: 'xai', apiModelId: 'grok-beta' }
  };

  private retiredModels: Record<string, string> = {
    'gemini-2.0-flash': 'gemini-3.1-flash-lite',
    'gemini-1.5-flash': 'gemini-3.1-flash-lite',
    'gemini-1.5-pro': 'gemini-3.1-pro-preview',
    'gemini-2.5-flash': 'gemini-3.1-flash-lite',
    'gemini-2.5-pro': 'gemini-3.1-pro-preview'
  };

  constructor() {
    this.registerAdapter(new GoogleGeminiAdapter());
    this.registerAdapter(new OpenAIAdapter());
    this.registerAdapter(new AnthropicAdapter());
    this.registerAdapter(new XAIAdapter());
  }

  registerAdapter(adapter: AIProviderAdapter) {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(providerId: string): AIProviderAdapter | undefined {
    return this.adapters.get(providerId);
  }

  getProviderStatus(): Record<string, { name: string; configured: boolean }> {
    const status: Record<string, { name: string; configured: boolean }> = {};
    for (const [id, adapter] of this.adapters.entries()) {
      status[id] = {
        name: adapter.name,
        configured: adapter.isConfigured()
      };
    }
    return status;
  }

  async checkAllProvidersHealth(): Promise<Record<string, ProviderHealthCheckResult>> {
    const results: Record<string, ProviderHealthCheckResult> = {};
    for (const [id, adapter] of this.adapters.entries()) {
      if (adapter.checkHealth) {
        try {
          results[id] = await adapter.checkHealth();
        } catch (err: any) {
          results[id] = {
            provider: adapter.name,
            configured: adapter.isConfigured(),
            authenticated: false,
            modelAvailable: false,
            error: err.message || 'Health check failed'
          };
        }
      } else {
        results[id] = {
          provider: adapter.name,
          configured: adapter.isConfigured(),
          authenticated: adapter.isConfigured(),
          modelAvailable: adapter.isConfigured()
        };
      }
    }
    return results;
  }

  resolveModelId(modelId: string): string {
    if (modelId === 'auto' || !modelId) {
      return 'gemini-3.1-flash-lite';
    }
    return modelId;
  }

  validateModelAvailability(modelId: string): void {
    if (modelId === 'gemini-2.0-flash') {
      throw new AIProviderError(
        'The model gemini-2.0-flash has been retired by Google. Please update your code to use gemini-3.8-flash.',
        'MODEL_NOT_FOUND',
        'Google Gemini',
        404
      );
    }
    if (modelId.toLowerCase().startsWith('deepseek')) {
      throw new AIProviderError(
        `DeepSeek models (${modelId}) have been removed and are no longer supported by FLOAT AI. Please choose a supported model from Google Gemini, Anthropic Claude, OpenAI, or xAI.`,
        'MODEL_NOT_FOUND',
        'FLOAT',
        404
      );
    }
  }

  getAdapterForModel(modelId: string): AIProviderAdapter {
    const resolved = this.resolveModelId(modelId);
    this.validateModelAvailability(resolved);
    const { adapter } = this.resolveRoute(resolved);
    return adapter;
  }

  resolveRoute(modelId: string): { route: ModelRouteDefinition; adapter: AIProviderAdapter } {
    const key = (modelId || 'auto').trim();
    const route = this.modelRoutes[key];

    if (!route) {
      throw new AIProviderError(
        `Model "${modelId}" is not recognized or supported by the FLOAT router. Available verified models include: ${Object.keys(this.modelRoutes).join(', ')}`,
        'MODEL_NOT_FOUND',
        'FLOAT',
        404
      );
    }

    const adapter = this.adapters.get(route.provider);
    if (!adapter) {
      throw new AIProviderError(
        `Provider adapter for "${route.provider}" is not registered on the FLOAT server.`,
        'PROVIDER_ERROR',
        route.provider,
        500
      );
    }

    return { route, adapter };
  }

  async generateContent(request: {
    model: string;
    messages: any[];
    systemInstruction?: string;
    reasoningEffort?: 'low' | 'medium' | 'high';
    speed?: 'fast' | 'balanced' | 'slow';
    tools?: any[];
    dataSharingConsent?: boolean;
    dataSharingAllowed?: boolean;
  }): Promise<AIProviderResponse> {
    const { route, adapter } = this.resolveRoute(request.model);

    const dataSharingAllowed = request.dataSharingAllowed !== undefined
      ? request.dataSharingAllowed === true
      : request.dataSharingConsent === true;

    ServerPrivacyGuard.logAudit('ModelRouter', `generateContent(${request.model} -> ${route.provider}:${route.apiModelId})`, dataSharingAllowed, {
      requestedModel: request.model,
      routedProvider: route.provider,
      apiModelId: route.apiModelId,
      messageCount: request.messages?.length || 0,
      dataSharingAllowed
    });

    if (!adapter.isConfigured()) {
      throw new AIProviderError(
        `Provider "${adapter.name}" is not configured on the FLOAT server. To use "${request.model}", configure the server-side API key.`,
        'AUTH_ERROR',
        adapter.name,
        401
      );
    }

    const startTime = Date.now();
    const result = await adapter.generateContent({
      ...request,
      model: request.model,
      apiModelId: route.apiModelId,
      dataSharingConsent: dataSharingAllowed,
      dataSharingAllowed
    });
    const latencyMs = Date.now() - startTime;

    if (dataSharingAllowed) {
      ServerPrivacyGuard.dispatchExternalTelemetry('model_chat_operational', true, {
        requestedModel: request.model,
        apiModelId: route.apiModelId,
        latencyMs,
        provider: adapter.id
      });
    } else {
      ServerPrivacyGuard.dispatchExternalTelemetry('model_chat_operational', false, null);
    }

    return result;
  }

  async generateContentStream(
    request: {
      model: string;
      messages: any[];
      systemInstruction?: string;
      reasoningEffort?: 'low' | 'medium' | 'high';
      speed?: 'fast' | 'balanced' | 'slow';
      tools?: any[];
      dataSharingConsent?: boolean;
      dataSharingAllowed?: boolean;
    },
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<AIProviderResponse> {
    const { route, adapter } = this.resolveRoute(request.model);

    const dataSharingAllowed = request.dataSharingAllowed !== undefined
      ? request.dataSharingAllowed === true
      : request.dataSharingConsent === true;

    ServerPrivacyGuard.logAudit('ModelRouter', `generateContentStream(${request.model} -> ${route.provider}:${route.apiModelId})`, dataSharingAllowed, {
      requestedModel: request.model,
      routedProvider: route.provider,
      apiModelId: route.apiModelId,
      messageCount: request.messages?.length || 0,
      dataSharingAllowed
    });

    if (!adapter.isConfigured()) {
      throw new AIProviderError(
        `Provider "${adapter.name}" is not configured on the FLOAT server. To use "${request.model}", configure the server-side API key.`,
        'AUTH_ERROR',
        adapter.name,
        401
      );
    }

    if (adapter.generateContentStream) {
      return adapter.generateContentStream({
        ...request,
        model: request.model,
        apiModelId: route.apiModelId,
        dataSharingConsent: dataSharingAllowed,
        dataSharingAllowed
      }, onChunk, signal);
    }

    // Fallback if adapter doesn't support streaming: call generateContent and stream whole text
    const result = await adapter.generateContent({
      ...request,
      model: request.model,
      apiModelId: route.apiModelId,
      dataSharingConsent: dataSharingAllowed,
      dataSharingAllowed
    });
    if (result.text) {
      onChunk(result.text);
    }
    return result;
  }

  async runAgentLoop(req: any, res: any, model: string, prompt: string, virtualFiles: any[]): Promise<void> {
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw new AIProviderError(
        'A non-empty prompt is required to run the agent loop.',
        'INVALID_REQUEST',
        'FLOAT',
        400
      );
    }

    const { route, adapter } = this.resolveRoute(model);
    const dataSharingAllowed = ServerPrivacyGuard.evaluateConsent(req);

    ServerPrivacyGuard.logAudit('ModelRouter', `runAgentLoop(${model} -> ${route.provider}:${route.apiModelId})`, dataSharingAllowed, {
      requestedModel: model,
      routedProvider: route.provider,
      apiModelId: route.apiModelId,
      fileCount: virtualFiles?.length || 0,
      dataSharingAllowed
    });

    if (!adapter.isConfigured()) {
      throw new AIProviderError(
        `Provider "${adapter.name}" is not configured on the FLOAT server. To run agents with "${model}", configure the server-side API key.`,
        'AUTH_ERROR',
        adapter.name,
        401
      );
    }

    if (!adapter.runAgentLoop) {
      throw new AIProviderError(
        `Autonomous agent loop is not supported for provider ${adapter.name}. Use Gemini for full tool execution.`,
        'INVALID_REQUEST',
        adapter.name,
        400
      );
    }

    if (!dataSharingAllowed) {
      ServerPrivacyGuard.dispatchExternalTelemetry('agent_loop_telemetry', false, null);
    }

    return adapter.runAgentLoop(req, res, route.apiModelId, prompt, virtualFiles);
  }
}
