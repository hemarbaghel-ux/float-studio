import {
  AIProviderAdapter,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderError,
  ProviderHealthCheckResult
} from './base';
import { OpenAIAdapter } from './openai';
import { GoogleGeminiAdapter } from './gemini';
import {
  MODEL_REGISTRY,
  MODEL_ROUTES,
  ModelProtocol,
  getModelDescriptor,
  getPublicModelCatalog
} from './modelRegistry';
import { ServerPrivacyGuard } from '../privacyGuard';
import type {
  IModelGateway,
  ModelGatewayRequest,
  ModelGatewayResponse,
  ModelGatewayDelta,
  ProviderHealthStatus,
  IModelCatalog
} from '../../shared/contracts/index';
import { AuthoritativeModelCatalog } from '../../shared/contracts/index';

export interface ModelRouteDefinition {
  provider: 'openai' | 'google';
  apiModelId: string;
  protocol?: ModelProtocol;
  isInternalAlias?: boolean;
  upstreamModelId?: string;
}

export class ModelRouter implements IModelGateway {
  private adapters: Map<string, AIProviderAdapter> = new Map();

  constructor() {
    this.ensureAdaptersRegistered();
  }

  private ensureAdaptersRegistered() {
    try {
      if (!this.adapters.has('openai') && typeof OpenAIAdapter === 'function') {
        this.registerAdapter(new OpenAIAdapter());
      }
      if (!this.adapters.has('google') && typeof GoogleGeminiAdapter === 'function') {
        this.registerAdapter(new GoogleGeminiAdapter());
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
    const configured = Object.fromEntries(
      Array.from(this.adapters.entries()).map(([id, adapter]) => [id, adapter.isConfigured()])
    );
    return getPublicModelCatalog(configured);
  }

  getConfiguredModelIds(): string[] {
    this.ensureAdaptersRegistered();
    return MODEL_REGISTRY
      .filter((model) => model.selectable && this.adapters.get(model.providerId)?.isConfigured())
      .map((model) => model.id);
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
    // An explicit route is authoritative. Provider-prefix rejection only applies to
    // model IDs that are not present in the verified runtime route registry.
    if (MODEL_ROUTES[modelId]) {
      return;
    }
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
        `Provider "${adapter.name}" is not configured on the FLOAT server. To use "${request.model}", configure ${route.provider === 'google' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'} in the server environment.`,
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
        `Provider "${adapter.name}" is not configured on the FLOAT server. To use "${request.model}", configure ${route.provider === 'google' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'} in the server environment.`,
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
  getCatalog(): IModelCatalog {
    return new AuthoritativeModelCatalog();
  }

  async checkHealth(providerId: string): Promise<ProviderHealthStatus> {
    this.ensureAdaptersRegistered();
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      return {
        providerId,
        operational: false,
        latencyMs: 0,
        error: `Provider "${providerId}" is not registered on the server.`,
        timestamp: Date.now()
      };
    }
    const start = Date.now();
    try {
      if (adapter.checkHealth) {
        const res = await adapter.checkHealth();
        return {
          providerId,
          operational: res.authenticated && res.modelAvailable,
          latencyMs: Date.now() - start,
          error: res.error,
          timestamp: Date.now()
        };
      }
      return {
        providerId,
        operational: adapter.isConfigured(),
        latencyMs: Date.now() - start,
        timestamp: Date.now()
      };
    } catch (err: any) {
      return {
        providerId,
        operational: false,
        latencyMs: Date.now() - start,
        error: err?.message || String(err),
        timestamp: Date.now()
      };
    }
  }

  async generate(request: ModelGatewayRequest, signal?: AbortSignal): Promise<ModelGatewayResponse> {
    const start = Date.now();
    const res = await this.generateContent({
      model: request.modelId,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      systemInstruction: request.systemPrompt,
      reasoningEffort: request.reasoningEffort,
    });
    return {
      text: res.text,
      modelId: request.modelId,
      usage: {
        inputTokens: res.usage?.inputTokens || 0,
        outputTokens: res.usage?.outputTokens || 0,
        totalTokens: (res.usage?.inputTokens || 0) + (res.usage?.outputTokens || 0),
        durationMs: Date.now() - start
      },
      toolCalls: res.toolCalls?.map(tc => ({
        id: tc.id,
        name: tc.name,
        args: tc.arguments
      })),
      isSimulated: res.isSimulated
    };
  }

  async generateStream(
    request: ModelGatewayRequest,
    onDelta: (delta: ModelGatewayDelta) => void,
    signal?: AbortSignal
  ): Promise<ModelGatewayResponse> {
    const start = Date.now();
    const res = await this.generateContentStream(
      {
        model: request.modelId,
        messages: request.messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        systemInstruction: request.systemPrompt,
        reasoningEffort: request.reasoningEffort,
      },
      (chunk: string) => {
        onDelta({ type: 'delta', content: chunk });
      },
      signal
    );
    return {
      text: res.text,
      modelId: request.modelId,
      usage: {
        inputTokens: res.usage?.inputTokens || 0,
        outputTokens: res.usage?.outputTokens || 0,
        totalTokens: (res.usage?.inputTokens || 0) + (res.usage?.outputTokens || 0),
        durationMs: Date.now() - start
      },
      toolCalls: res.toolCalls?.map(tc => ({
        id: tc.id,
        name: tc.name,
        args: tc.arguments
      })),
      isSimulated: res.isSimulated
    };
  }
}

export const modelRouter = new ModelRouter();
