import {
  AIProviderAdapter,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderError,
  ProviderHealthCheckResult
} from './base';
import { OpenAIAdapter } from './openai';
import { GoogleGeminiAdapter } from './gemini';
import { AnthropicAdapter } from './anthropic';
import { DeepSeekAdapter } from './deepseek';
import {
  MODEL_REGISTRY,
  MODEL_ROUTES,
  ModelProtocol,
  getModelDescriptor,
  getPublicModelCatalog
} from './modelRegistry';
import { ServerPrivacyGuard } from '../privacyGuard';
import { redactSecretsInText, sanitizeOutboundPayload } from '../../services/git/secretScanner';
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
  provider: 'openai' | 'google' | 'anthropic' | 'deepseek' | 'xai';
  apiModelId: string;
  protocol?: ModelProtocol;
  isInternalAlias?: boolean;
  upstreamModelId?: string;
}

export const BYOK_MODEL_DEFINITIONS: Readonly<Record<string, ModelRouteDefinition>> = Object.freeze({
  // OpenAI higher-tier and reasoning models unlocked via user BYOK key
  'o1': { provider: 'openai', apiModelId: 'o1' },
  'o3-mini': { provider: 'openai', apiModelId: 'o3-mini' },
  'gpt-4o': { provider: 'openai', apiModelId: 'gpt-4o' },
  'gpt-4o-mini': { provider: 'openai', apiModelId: 'gpt-4o-mini' },
  'gpt-4.5': { provider: 'openai', apiModelId: 'gpt-4.5' },
  'gpt-4.5-preview': { provider: 'openai', apiModelId: 'gpt-4.5-preview' },
  // Anthropic Claude 3.5 & Opus models unlocked via user BYOK key
  'claude-3-5-sonnet': { provider: 'anthropic', apiModelId: 'claude-3-5-sonnet-20241022' },
  'claude-3-5-haiku': { provider: 'anthropic', apiModelId: 'claude-3-5-haiku-20241022' },
  'claude-3-opus': { provider: 'anthropic', apiModelId: 'claude-3-opus-20240229' },
  // Google Gemini higher-tier models unlocked via user BYOK key
  'gemini-1.5-pro': { provider: 'google', apiModelId: 'gemini-1.5-pro' },
  'gemini-2.0-flash': { provider: 'google', apiModelId: 'gemini-2.0-flash' },
  'gemini-1.5-flash': { provider: 'google', apiModelId: 'gemini-1.5-flash' },
  // DeepSeek models unlocked via user BYOK key
  'deepseek-chat': { provider: 'deepseek', apiModelId: 'deepseek-chat' },
  'deepseek-reasoner': { provider: 'deepseek', apiModelId: 'deepseek-reasoner' },
});

export class ModelRouter implements IModelGateway {
  private adapters: Map<string, AIProviderAdapter> = new Map();
  private customRoutes: Map<string, ModelRouteDefinition> = new Map();

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
      if (!this.adapters.has('anthropic') && typeof AnthropicAdapter === 'function') {
        this.registerAdapter(new AnthropicAdapter());
      }
      // Note: DeepSeekAdapter is NOT registered by default. It is lazily registered for user BYOK keys.
    } catch {}
  }

  registerAdapter(adapter: AIProviderAdapter) {
    this.adapters.set(adapter.id, adapter);
  }

  registerCustomAdapter(providerId: string, adapter: AIProviderAdapter, modelIds: string[] = []): void {
    this.ensureAdaptersRegistered();
    this.registerAdapter(adapter);
    for (const id of modelIds) {
      this.customRoutes.set(id, {
        provider: providerId as any,
        apiModelId: id,
      });
    }
  }

  getAdapter(providerId: string): AIProviderAdapter | undefined {
    this.ensureAdaptersRegistered();
    if (providerId === 'deepseek' && !this.adapters.has('deepseek')) {
      try {
        if (typeof DeepSeekAdapter === 'function') {
          this.registerAdapter(new DeepSeekAdapter());
        }
      } catch {}
    }
    return this.adapters.get(providerId);
  }

  getModelCatalog(userConfiguredProviders?: Record<string, boolean>) {
    this.ensureAdaptersRegistered();
    const configured = Object.fromEntries(
      Array.from(this.adapters.entries()).map(([id, adapter]) => [
        id,
        adapter.isConfigured() || userConfiguredProviders?.[id] === true
      ])
    );
    return getPublicModelCatalog(configured, undefined, userConfiguredProviders);
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
      if (id === 'deepseek') continue; // DeepSeek is strictly BYOK, not a server-managed infrastructure provider
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
      if (id === 'deepseek') continue; // DeepSeek is strictly BYOK
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

  validateModelAvailability(modelId: string, isByok = false): void {
    // An explicit route is authoritative. Provider-prefix rejection only applies to
    // model IDs that are not present in the verified runtime route registry or user BYOK routes.
    if (isByok || this.customRoutes.has(modelId) || MODEL_ROUTES[modelId]) {
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

  getAdapterForModel(modelId: string, userApiKeys?: Record<string, string>): AIProviderAdapter {
    const resolved = this.resolveModelId(modelId);
    const { adapter } = this.resolveRoute(resolved, userApiKeys);
    return adapter;
  }

  resolveRoute(modelId: string, userApiKeys?: Record<string, string>): { route: ModelRouteDefinition; adapter: AIProviderAdapter } {
    this.ensureAdaptersRegistered();
    const key = this.resolveModelId(modelId);

    // 1. Authoritative static routes (or custom routes registered via registerCustomAdapter)
    const staticRoute = this.customRoutes.get(key) || MODEL_ROUTES[key];
    if (staticRoute) {
      this.validateModelAvailability(key);
      const adapter = this.adapters.get(staticRoute.provider);
      if (!adapter) {
        throw new AIProviderError(
          `Provider adapter for "${staticRoute.provider}" is not registered on the FLOAT server.`,
          'PROVIDER_ERROR',
          staticRoute.provider,
          500
        );
      }
      return { route: staticRoute, adapter };
    }

    // 2. Dynamic BYOK routes: active ONLY when caller provides user API key for the respective provider
    const byokDef = BYOK_MODEL_DEFINITIONS[key];
    if (byokDef && userApiKeys && (userApiKeys[byokDef.provider] || userApiKeys[key])) {
      this.validateModelAvailability(key, true);
      const adapter = this.getAdapter(byokDef.provider);
      if (adapter) {
        return { route: byokDef, adapter };
      }
    }

    // 3. Fallback: enforce rejection for unsupported providers or unconfigured models
    this.validateModelAvailability(key, false);

    throw new AIProviderError(
      `Model "${modelId}" is not recognized or supported by the FLOAT router.`,
      'MODEL_NOT_FOUND',
      'FLOAT',
      404
    );
  }

  async generateContent(request: AIProviderRequest): Promise<AIProviderResponse> {
    const effectiveUserKeys: Record<string, string> = {
      ...(request.userApiKeys || {})
    };
    if (request.apiKeyOverride) {
      effectiveUserKeys['openai'] = request.apiKeyOverride;
      effectiveUserKeys['anthropic'] = request.apiKeyOverride;
      effectiveUserKeys['google'] = request.apiKeyOverride;
      effectiveUserKeys['deepseek'] = request.apiKeyOverride;
    }

    const { route, adapter } = this.resolveRoute(request.model, effectiveUserKeys);

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

    const userApiKey = request.apiKeyOverride || request.userApiKeys?.[route.provider];

    if (!adapter.isConfigured(userApiKey) && !request.demoMode) {
      throw new AIProviderError(
        `Provider "${adapter.name}" is not configured on the FLOAT server. To use "${request.model}", configure ${route.provider === 'google' ? 'GEMINI_API_KEY' : route.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : route.provider === 'deepseek' ? 'DEEPSEEK_API_KEY' : 'OPENAI_API_KEY'} or provide your own API key in Settings -> Models.`,
        'AUTH_ERROR',
        adapter.name,
        401
      );
    }

    // Pre-dispatch secret redaction for non-streaming provider transmission (Phase 1.1 Task 4)
    const sanitizedMessages = (request.messages || []).map(m => ({
      ...m,
      content: sanitizeOutboundPayload(m.content),
    }));
    const sanitizedSystemInstruction = request.systemInstruction
      ? redactSecretsInText(request.systemInstruction)
      : undefined;
    const sanitizedTools = request.tools ? sanitizeOutboundPayload(request.tools) : undefined;

    const startTime = Date.now();
    const result = await adapter.generateContent({
      ...request,
      apiKeyOverride: userApiKey,
      messages: sanitizedMessages,
      systemInstruction: sanitizedSystemInstruction,
      tools: sanitizedTools,
      model: route.apiModelId,
      apiModelId: route.apiModelId,
      dataSharingConsent: dataSharingAllowed,
      dataSharingAllowed
    });
    if (result.text) {
      result.text = redactSecretsInText(result.text);
    }
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
    const effectiveUserKeys: Record<string, string> = {
      ...(request.userApiKeys || {})
    };
    if (request.apiKeyOverride) {
      effectiveUserKeys['openai'] = request.apiKeyOverride;
      effectiveUserKeys['anthropic'] = request.apiKeyOverride;
      effectiveUserKeys['google'] = request.apiKeyOverride;
      effectiveUserKeys['deepseek'] = request.apiKeyOverride;
    }

    const { route, adapter } = this.resolveRoute(request.model, effectiveUserKeys);
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

    const userApiKey = request.apiKeyOverride || request.userApiKeys?.[route.provider];

    if (!adapter.isConfigured(userApiKey) && !request.demoMode) {
      throw new AIProviderError(
        `Provider "${adapter.name}" is not configured on the FLOAT server. To use "${request.model}", configure ${route.provider === 'google' ? 'GEMINI_API_KEY' : route.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : route.provider === 'deepseek' ? 'DEEPSEEK_API_KEY' : 'OPENAI_API_KEY'} or provide your own API key in Settings -> Models.`,
        'AUTH_ERROR',
        adapter.name,
        401
      );
    }

    // Pre-dispatch secret redaction for streaming provider transmission (Phase 1.1 Task 4)
    const sanitizedMessages = (request.messages || []).map(m => ({
      ...m,
      content: sanitizeOutboundPayload(m.content),
    }));
    const sanitizedSystemInstruction = request.systemInstruction
      ? redactSecretsInText(request.systemInstruction)
      : undefined;
    const sanitizedTools = request.tools ? sanitizeOutboundPayload(request.tools) : undefined;

    if (adapter.generateContentStream) {
      return adapter.generateContentStream(
        {
          ...request,
          apiKeyOverride: userApiKey,
          messages: sanitizedMessages,
          systemInstruction: sanitizedSystemInstruction,
          tools: sanitizedTools,
          model: route.apiModelId,
          apiModelId: route.apiModelId,
          dataSharingConsent: dataSharingAllowed,
          dataSharingAllowed
        },
        (chunk: string) => {
          onChunk(redactSecretsInText(chunk));
        },
        signal
      );
    }

    const result = await adapter.generateContent({
      ...request,
      apiKeyOverride: userApiKey,
      messages: sanitizedMessages,
      systemInstruction: sanitizedSystemInstruction,
      model: route.apiModelId,
      apiModelId: route.apiModelId,
      dataSharingConsent: dataSharingAllowed,
      dataSharingAllowed
    });
    if (result.text) {
      const sanitized = redactSecretsInText(result.text);
      onChunk(sanitized);
      result.text = sanitized;
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
