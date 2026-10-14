import {
  AIProviderAdapter,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderError,
  ProviderHealthCheckResult
} from './base';
import { OpenAIAdapter } from './openai';
import { ServerPrivacyGuard } from '../privacyGuard';

export interface ModelRouteDefinition {
  provider: 'openai';
  apiModelId: string;
}

export class ModelRouter {
  private adapters: Map<string, AIProviderAdapter> = new Map();

  // Explicit provider/model allowlist. Entries are supported route candidates, not
  // proof that a model is enabled for the current account; upstream errors remain visible.
  private modelRoutes: Record<string, ModelRouteDefinition> = {
    // Auto uses a stable, documented API model. Availability still depends on
    // the server credential and account access; failures are surfaced to users.
    'auto': { provider: 'openai', apiModelId: 'gpt-4o-mini' },

    // Explicitly routed OpenAI API model IDs. Do not map preview/product labels
    // to a different upstream model without telling the user.
    'gpt-4o': { provider: 'openai', apiModelId: 'gpt-4o' },
    'gpt-4o-mini': { provider: 'openai', apiModelId: 'gpt-4o-mini' },
    'o1': { provider: 'openai', apiModelId: 'o1' },
    'o1-mini': { provider: 'openai', apiModelId: 'o1-mini' },
    'o3-mini': { provider: 'openai', apiModelId: 'o3-mini' },
    'float-basic': { provider: 'openai', apiModelId: 'gpt-4o-mini' }
  };

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
    // Keep the UI's Auto/default selection aligned with an explicitly routed API model.
    // A product label must never resolve to a preview model that the router rejects.
    if (!modelId || modelId.trim().toLowerCase() === 'auto') {
      return 'gpt-4o-mini';
    }
    return modelId.trim();
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
}
