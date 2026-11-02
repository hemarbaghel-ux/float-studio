import {
  AIProviderAdapter,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderError,
  ProviderHealthCheckResult
} from './base';
import { OpenAIAdapter } from './openai';
import {
  MODEL_ROUTES,
  ModelProtocol,
  getModelDescriptor,
  getPublicModelCatalog
} from './modelRegistry';
import { ServerPrivacyGuard } from '../privacyGuard';

export interface ModelRouteDefinition {
  provider: 'openai';
  apiModelId: string;
  protocol?: ModelProtocol;
  isInternalAlias?: boolean;
  upstreamModelId?: string;
}

export class ModelRouter {
  private adapters: Map<string, AIProviderAdapter> = new Map();

  constructor() {
    this.ensureAdaptersRegistered();
  }

  private ensureAdaptersRegistered() {
    try {
      if (!this.adapters.has('openai') && typeof OpenAIAdapter === 'function') {
        this.registerAdapter(new OpenAIAdapter());
      }
    } catch {}
  }

  registerAdapter(adapter: AIProviderAdapter) {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(providerId: string): AIProviderAdapter | undefined {
    this.ensureAdaptersRegistered();
    return this.adapters.get(providerId);
  }

  getModelCatalog() {
    this.ensureAdaptersRegistered();
    const openaiAdapter = this.adapters.get('openai');
    return getPublicModelCatalog(Boolean(openaiAdapter?.isConfigured()));
  }

  getConfiguredModelIds(): string[] {
    this.ensureAdaptersRegistered();
    const openaiAdapter = this.adapters.get('openai');
    if (openaiAdapter?.isConfigured()) {
      return ['gpt-6-astra', 'gpt-6.1-sol'];
    }
    return [];
  }

  getProviderStatus(): Record<string, { name: string; configured: boolean; models?: string[] }> {
    this.ensureAdaptersRegistered();
    const status: Record<string, { name: string; configured: boolean; models?: string[] }> = {};
    for (const [id, adapter] of this.adapters.entries()) {
      const modelsForProvider = Object.entries(MODEL_ROUTES)
        .filter(([modelId, route]) => route.provider === id && modelId !== 'auto')
        .map(([modelId]) => modelId);
      status[id] = {
        name: adapter.name,
        configured: adapter.isConfigured(),
        models: modelsForProvider
      };
    }
    return status;
  }

  async checkAllProvidersHealth(): Promise<Record<string, ProviderHealthCheckResult>> {
    this.ensureAdaptersRegistered();
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
          modelAvailable: false
        };
      }
    }
    return results;
  }

  resolveModelId(modelId: string): string {
    this.ensureAdaptersRegistered();
    const trimmed = (modelId || '').trim();
    if (!trimmed || trimmed === 'auto') {
      return 'gpt-6-astra';
    }
    return trimmed;
  }

  validateModelAvailability(modelId: string): void {
    const lower = (modelId || '').toLowerCase();
    if (
      lower.startsWith('gemini') ||
      lower.startsWith('claude') ||
      lower.startsWith('grok') ||
      lower.startsWith('deepseek') ||
      lower.startsWith('composer') ||
      lower.startsWith('muse') ||
      lower.startsWith('llama') ||
      lower.startsWith('mistral') ||
      lower.startsWith('qwen') ||
      lower.startsWith('cohere')
    ) {
      throw new AIProviderError(
        `Model "${modelId}" belongs to an unsupported provider or is retired.`,
        'UNSUPPORTED_PROVIDER',
        'FLOAT',
        400
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
    this.ensureAdaptersRegistered();
    const key = this.resolveModelId(modelId);
    this.validateModelAvailability(key);
    const route = MODEL_ROUTES[key];

    if (!route) {
      throw new AIProviderError(
        `Model "${modelId}" is not recognized or supported by the FLOAT router.`,
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

  async generateContent(request: AIProviderRequest): Promise<AIProviderResponse> {
    const { route, adapter } = this.resolveRoute(request.model);

    const dataSharingAllowed =
      request.dataSharingAllowed !== undefined
        ? request.dataSharingAllowed === true
        : request.dataSharingConsent === true;

    ServerPrivacyGuard.logAudit(
      'ModelRouter',
      `generateContent(${request.model} -> ${route.provider}:${route.apiModelId})`,
      dataSharingAllowed,
      {
        requestedModel: request.model,
        routedProvider: route.provider,
        apiModelId: route.apiModelId,
        messageCount: request.messages?.length || 0,
        dataSharingAllowed
      }
    );

    if (!adapter.isConfigured() && !request.demoMode) {
      throw new AIProviderError(
        `Provider "${adapter.name}" is not configured on the FLOAT server. To use "${request.model}", configure OPENAI_API_KEY in the server environment.`,
        'AUTH_ERROR',
        adapter.name,
        401
      );
    }

    const startTime = Date.now();
    const result = await adapter.generateContent({
      ...request,
      model: route.apiModelId,
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
    request: AIProviderRequest,
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<AIProviderResponse> {
    const { route, adapter } = this.resolveRoute(request.model);
    const descriptor = getModelDescriptor(route.apiModelId);
    if (descriptor && !descriptor.capabilities.streaming) {
      throw new AIProviderError(
        `Model "${request.model}" does not support streaming.`,
        'INVALID_REQUEST',
        'FLOAT',
        400
      );
    }

    const dataSharingAllowed =
      request.dataSharingAllowed !== undefined
        ? request.dataSharingAllowed === true
        : request.dataSharingConsent === true;

    ServerPrivacyGuard.logAudit(
      'ModelRouter',
      `generateContentStream(${request.model} -> ${route.provider}:${route.apiModelId})`,
      dataSharingAllowed,
      {
        requestedModel: request.model,
        routedProvider: route.provider,
        apiModelId: route.apiModelId,
        messageCount: request.messages?.length || 0,
        dataSharingAllowed
      }
    );

    if (!adapter.isConfigured() && !request.demoMode) {
      throw new AIProviderError(
        `Provider "${adapter.name}" is not configured on the FLOAT server. To use "${request.model}", configure OPENAI_API_KEY in the server environment.`,
        'AUTH_ERROR',
        adapter.name,
        401
      );
    }

    if (adapter.generateContentStream) {
      return adapter.generateContentStream(
        {
          ...request,
          model: route.apiModelId,
          apiModelId: route.apiModelId,
          dataSharingConsent: dataSharingAllowed,
          dataSharingAllowed
        },
        onChunk,
        signal
      );
    }

    const result = await adapter.generateContent({
      ...request,
      model: route.apiModelId,
      apiModelId: route.apiModelId,
      dataSharingConsent: dataSharingAllowed,
      dataSharingAllowed
    });
    if (result.text) {
      onChunk(result.text);
    }
    return result;
  }
}

export const modelRouter = new ModelRouter();
