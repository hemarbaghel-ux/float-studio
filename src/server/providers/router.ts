import {
  AIProviderAdapter,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderError,
  ProviderHealthCheckResult,
  CodeInterpreterResponseRequest,
  CodeInterpreterResponseResult,
  CodeInterpreterStreamEvent
} from './base';
import { OpenAIAdapter } from './openai';
import { GoogleGeminiAdapter } from './gemini';
import { AnthropicAdapter } from './anthropic';
import { ServerPrivacyGuard } from '../privacyGuard';

export interface ModelRouteDefinition {
  provider: 'openai' | 'google' | 'anthropic';
  apiModelId: string;
}

export class ModelRouter {
  private adapters: Map<string, AIProviderAdapter> = new Map();

  // Single source of truth for real upstream model IDs (zero fake aliases).
  // gpt-6.1-sol is excluded unless /api/ai/health proves it works.
  private modelRoutes: Record<string, ModelRouteDefinition> = {
    // Google Gemini 4 Flagship Coding & Reasoning
    'gemini-4-argon': { provider: 'google', apiModelId: 'gemini-4-argon' },

    // Real OpenAI GPT-6 Models
    'gpt-6-astra': { provider: 'openai', apiModelId: 'gpt-6-astra' },
    'gpt-6-sol': { provider: 'openai', apiModelId: 'gpt-6-sol' },
    'gpt-6-luna': { provider: 'openai', apiModelId: 'gpt-6-luna' },

    // Standard OpenAI Models
    'gpt-4o': { provider: 'openai', apiModelId: 'gpt-4o' },
    'gpt-4o-mini': { provider: 'openai', apiModelId: 'gpt-4o-mini' },
    'o1': { provider: 'openai', apiModelId: 'o1' },
    'o1-mini': { provider: 'openai', apiModelId: 'o1-mini' },
    'o3-mini': { provider: 'openai', apiModelId: 'o3-mini' },
    'gpt-4.5-preview': { provider: 'openai', apiModelId: 'gpt-4.5-preview' },
    'gpt-4-turbo': { provider: 'openai', apiModelId: 'gpt-4-turbo' },
    'chatgpt-4o-latest': { provider: 'openai', apiModelId: 'chatgpt-4o-latest' },
    'gpt-3.5-turbo': { provider: 'openai', apiModelId: 'gpt-3.5-turbo' },

    // Real Anthropic Claude Models
    'claude-sonnet-5-5': { provider: 'anthropic', apiModelId: 'claude-sonnet-5-5' },
    'claude-opus-5-5': { provider: 'anthropic', apiModelId: 'claude-opus-5-5' },
    'claude-haiku-5-5': { provider: 'anthropic', apiModelId: 'claude-haiku-5-5' },
    'claude-sonnet-4-20250514': { provider: 'anthropic', apiModelId: 'claude-sonnet-4-20250514' },
    'claude-3-7-sonnet-20250219': { provider: 'anthropic', apiModelId: 'claude-3-7-sonnet-20250219' },
    'claude-3-5-sonnet-20241022': { provider: 'anthropic', apiModelId: 'claude-3-5-sonnet-20241022' }
  };

  constructor() {
    this.ensureAdaptersRegistered();
  }

  private ensureAdaptersRegistered() {
    try {
      if (!this.adapters.has('openai') && typeof OpenAIAdapter === 'function') {
        this.registerAdapter(new OpenAIAdapter());
      }
    } catch {}
    try {
      if (!this.adapters.has('google') && typeof GoogleGeminiAdapter === 'function') {
        this.registerAdapter(new GoogleGeminiAdapter());
      }
    } catch {}
    try {
      if (!this.adapters.has('anthropic') && typeof AnthropicAdapter === 'function') {
        this.registerAdapter(new AnthropicAdapter());
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

  getConfiguredModelIds(): string[] {
    this.ensureAdaptersRegistered();
    const ids: string[] = [];
    const googleAdapter = this.adapters.get('google');
    const openaiAdapter = this.adapters.get('openai');
    const anthropicAdapter = this.adapters.get('anthropic');

    if (googleAdapter?.isConfigured()) {
      ids.push('gemini-4-argon');
    }
    if (openaiAdapter?.isConfigured()) {
      ids.push('gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna');
      if (this.modelRoutes['gpt-6.1-sol']) {
        ids.push('gpt-6.1-sol');
      }
    }
    if (anthropicAdapter?.isConfigured()) {
      ids.push('claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5');
    }
    return ids;
  }

  getProviderStatus(): Record<string, { name: string; configured: boolean; models?: string[] }> {
    this.ensureAdaptersRegistered();
    const status: Record<string, { name: string; configured: boolean; models?: string[] }> = {};
    for (const [id, adapter] of this.adapters.entries()) {
      const modelsForProvider = Object.entries(this.modelRoutes)
        .filter(([, route]) => route.provider === id)
        .map(([modelId]) => modelId);
      status[id] = {
        name: adapter.name,
        configured: adapter.isConfigured(),
        models: modelsForProvider
      };
    }
    return status;
  }

  async checkAllProvidersHealth(): Promise<
    Record<
      string,
      ProviderHealthCheckResult & {
        models?: Record<string, { status: 'ok' | 'error'; code?: string; statusCode?: number; message?: string }>;
      }
    >
  > {
    this.ensureAdaptersRegistered();
    const results: Record<
      string,
      ProviderHealthCheckResult & {
        models?: Record<string, { status: 'ok' | 'error'; code?: string; statusCode?: number; message?: string }>;
      }
    > = {};
    for (const [id, adapter] of this.adapters.entries()) {
      if (adapter.checkHealth) {
        try {
          results[id] = await adapter.checkHealth();
          if (id === 'openai' && results[id]?.models?.['gpt-6.1-sol']?.status === 'ok') {
            this.modelRoutes['gpt-6.1-sol'] = { provider: 'openai', apiModelId: 'gpt-6.1-sol' };
          }
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
    this.ensureAdaptersRegistered();
    const trimmed = (modelId || '').trim();
    if (!trimmed || trimmed === 'auto') {
      const openaiAdapter = this.adapters.get('openai');
      const googleAdapter = this.adapters.get('google');
      if (googleAdapter?.isConfigured() && !openaiAdapter?.isConfigured()) {
        return 'gemini-4-argon';
      }
      return 'gpt-6-astra';
    }
    return trimmed;
  }

  validateModelAvailability(modelId: string): void {
    const lower = (modelId || '').toLowerCase();
    if (
      lower === 'gemini-2.0-flash' ||
      lower.startsWith('gemini-1.5') ||
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
    const route = this.modelRoutes[key];

    if (!route) {
      throw new AIProviderError(
        `Model "${modelId}" is not recognized or supported by the FLOAT router. Configured route candidates include: ${Object.keys(this.modelRoutes).join(', ')}`,
        'MODEL_NOT_AVAILABLE',
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

  private getRequiredEnvKeyName(providerId: string): string {
    if (providerId === 'google') return 'GEMINI_API_KEY';
    if (providerId === 'anthropic') return 'ANTHROPIC_API_KEY';
    return 'OPENAI_API_KEY';
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
      const envVar = this.getRequiredEnvKeyName(route.provider);
      throw new AIProviderError(
        `Provider "${adapter.name}" is not configured on the FLOAT server. To use "${request.model}", configure ${envVar} in the server environment.`,
        'NOT_CONFIGURED',
        adapter.name,
        503
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
      const envVar = this.getRequiredEnvKeyName(route.provider);
      throw new AIProviderError(
        `Provider "${adapter.name}" is not configured on the FLOAT server. To use "${request.model}", configure ${envVar} in the server environment.`,
        'NOT_CONFIGURED',
        adapter.name,
        503
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

    ServerPrivacyGuard.logAudit(
      'ModelRouter',
      `runAgentLoop(${model} -> ${route.provider}:${route.apiModelId})`,
      dataSharingAllowed,
      {
        requestedModel: model,
        routedProvider: route.provider,
        apiModelId: route.apiModelId,
        fileCount: virtualFiles?.length || 0,
        dataSharingAllowed
      }
    );

    if (!adapter.isConfigured()) {
      const envVar = this.getRequiredEnvKeyName(route.provider);
      throw new AIProviderError(
        `Provider "${adapter.name}" is not configured on the FLOAT server. To run agents with "${model}", configure ${envVar} in the server environment.`,
        'NOT_CONFIGURED',
        adapter.name,
        503
      );
    }

    if (!adapter.runAgentLoop) {
      throw new AIProviderError(
        `Autonomous agent loop is not supported for provider ${adapter.name}.`,
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

  async runCodeInterpreterResponse(
    request: CodeInterpreterResponseRequest,
    onEvent?: (event: CodeInterpreterStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<CodeInterpreterResponseResult> {
    let route: ModelRouteDefinition;
    let adapter: AIProviderAdapter;
    try {
      const resolved = this.resolveRoute(request.model);
      route = resolved.route;
      adapter = resolved.adapter;
    } catch (err: any) {
      const code = err instanceof AIProviderError ? err.code : 'CODE_INTERPRETER_NOT_SUPPORTED';
      throw new AIProviderError(
        err?.message || `Model "${request.model}" does not support hosted code_interpreter.`,
        code,
        'OpenAI',
        503,
        { status: 503, code, model: request.model }
      );
    }

    if (!adapter.isConfigured()) {
      const envVar = this.getRequiredEnvKeyName(route.provider);
      throw new AIProviderError(
        `Provider "${adapter.name}" is not configured on the FLOAT server. To use "${request.model}", configure ${envVar} in the server environment.`,
        'NOT_CONFIGURED',
        adapter.name,
        503,
        { status: 503, code: 'not_configured', model: request.model }
      );
    }

    if (typeof adapter.runCodeInterpreterResponse !== 'function') {
      throw new AIProviderError(
        `Provider "${adapter.name}" does not support hosted code_interpreter via the Responses API.`,
        'CODE_INTERPRETER_NOT_SUPPORTED',
        adapter.name,
        503,
        { status: 503, code: 'code_interpreter_not_supported', model: request.model }
      );
    }

    return adapter.runCodeInterpreterResponse(
      {
        ...request,
        model: request.model,
        apiModelId: route.apiModelId
      },
      onEvent,
      signal
    );
  }
}

export const modelRouter = new ModelRouter();
