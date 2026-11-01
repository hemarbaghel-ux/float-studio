import {
  AIProviderAdapter,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderError,
  ProviderHealthCheckResult
} from './base';
import { OpenAIAdapter } from './openai';
import { ServerPrivacyGuard } from '../privacyGuard';
import { getModelDescriptor, getPublicModelCatalog, MODEL_ROUTES } from './modelRegistry';

export interface ModelRouteDefinition {
  provider: 'openai';
  apiModelId: string;
  protocol?: 'responses' | 'chat_completions';
  /** True when the route ID is a FLOAT-defined internal alias rather than a literal upstream OpenAI model ID. */
  isInternalAlias?: boolean;
  /** The exact upstream model ID executed by the selected provider adapter. */
  upstreamModelId?: string;
}

export class ModelRouter {
  private adapters: Map<string, AIProviderAdapter> = new Map();

  // Explicit provider/model allowlist. GPT-6 Astra & Sol are the flagship primary models.
  private modelRoutes: Record<string, ModelRouteDefinition> = { ...MODEL_ROUTES };

  constructor() {
    this.registerAdapter(new OpenAIAdapter());
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

  getModelCatalog() {
    const openAIConfigured = this.adapters.get('openai')?.isConfigured() ?? false;
    return getPublicModelCatalog(openAIConfigured);
  }

  private assertModelCapability(
    modelId: string,
    capability: 'streaming' | 'tools',
    operation: string
  ): void {
    const descriptor = getModelDescriptor(modelId);
    const supported = descriptor?.capabilities[capability];
    if (descriptor && !supported) {
      throw new AIProviderError(
        `Selected model "${descriptor.displayName}" does not support ${operation}. Choose a model that supports ${operation}.`,
        'INVALID_REQUEST',
        descriptor.providerId,
        400
      );
    }
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
      return 'gpt-6-astra';
    }
    return modelId;
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
        `Model "${modelId}" belongs to an unsupported provider. FLOAT AI supports OpenAI models exclusively.`,
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
    const key = (modelId || 'auto').trim();
    this.validateModelAvailability(key);
    const route = this.modelRoutes[key];

    if (!route) {
      throw new AIProviderError(
        `Model "${modelId}" is not recognized or supported by the FLOAT router. Configured route candidates include: ${Object.keys(this.modelRoutes).join(', ')}`,
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
    if (request.tools?.length) this.assertModelCapability(route.apiModelId, 'tools', 'tool calling');

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

    if (!adapter.isConfigured() && !request.demoMode) {
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
      apiProtocol: route.protocol,
      maxOutputTokens: getModelDescriptor(route.apiModelId)?.maxOutputTokens,
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
    this.assertModelCapability(route.apiModelId, 'streaming', 'streaming');

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

    if (!adapter.isConfigured() && !request.demoMode) {
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
        apiProtocol: route.protocol,
        maxOutputTokens: getModelDescriptor(route.apiModelId)?.maxOutputTokens,
        dataSharingConsent: dataSharingAllowed,
        dataSharingAllowed
      }, onChunk, signal);
    }

    const result = await adapter.generateContent({
      ...request,
      model: request.model,
      apiModelId: route.apiModelId,
      apiProtocol: route.protocol,
      maxOutputTokens: getModelDescriptor(route.apiModelId)?.maxOutputTokens,
      dataSharingConsent: dataSharingAllowed,
      dataSharingAllowed
    });
    if (result.text) {
      onChunk(result.text);
    }
    return result;
  }

}
