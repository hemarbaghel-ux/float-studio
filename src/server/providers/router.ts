import { AIProviderAdapter, AIProviderRequest, AIProviderResponse } from './base';
import { GoogleGeminiAdapter } from './gemini';
import { OpenAIAdapter } from './openai';
import { AnthropicAdapter } from './anthropic';
import { XAIAdapter } from './xai';
import { DeepSeekAdapter } from './deepseek';
import { ServerPrivacyGuard } from '../privacyGuard';

export class ModelRouter {
  private adapters: Map<string, AIProviderAdapter> = new Map();
  
  // Explicit verified model to provider mapping
  private providerMapping: Record<string, string> = {
    // Google Gemini - Active Verified Models
    'gemini-3.1-flash-lite': 'google',
    'gemini-3.8-flash': 'google',
    'gemini-flash-latest': 'google',
    'gemini-3.1-pro-preview': 'google',
    'gemini-3-flash-preview': 'google',

    // Google Gemini - Retired (mapped to Google adapter for clean error handling)
    'gemini-2.0-flash': 'google',
    'gemini-1.5-pro': 'google',
    'gemini-1.5-flash': 'google',
    'gemini-2.5-flash': 'google',
    'gemini-2.5-pro': 'google',
    'gemini-3.5-flash': 'google',

    // OpenAI
    'gpt-4o': 'openai',
    'gpt-4o-mini': 'openai',
    'o1': 'openai',
    'o3-mini': 'openai',
    'o1-mini': 'openai',
    'gpt-4.5-preview': 'openai',
    'gpt-4o-2024-11-20': 'openai',
    'gpt-4': 'openai',
    'gpt-3.5-turbo': 'openai',

    // Anthropic
    'claude-3-7-sonnet-20250219': 'anthropic',
    'claude-3-5-sonnet-20241022': 'anthropic',
    'claude-3-5-haiku-20241022': 'anthropic',
    'claude-3-opus-20240229': 'anthropic',

    // xAI
    'grok-4.7': 'xai',
    'grok-2-1212': 'xai',
    'grok-2': 'xai',
    'grok-2-vision-1212': 'xai',
    'grok-beta': 'xai',

    // DeepSeek
    'deepseek-chat': 'deepseek',
    'deepseek-reasoner': 'deepseek'
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
    this.registerAdapter(new DeepSeekAdapter());
  }

  registerAdapter(adapter: AIProviderAdapter) {
    this.adapters.set(adapter.id, adapter);
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

  resolveModelId(modelId: string): string {
    if (modelId === 'auto' || !modelId) {
      return 'gemini-3.1-flash-lite';
    }
    return modelId;
  }

  validateModelAvailability(modelId: string): void {
    const resolved = this.resolveModelId(modelId);
    if (this.retiredModels[resolved]) {
      const suggested = this.retiredModels[resolved];
      throw new Error(
        `The selected model "${modelId}" has been retired by Google and is no longer available. Please update your selected model in the model selector to an active model such as "${suggested}".`
      );
    }
  }

  getAdapterForModel(modelId: string): AIProviderAdapter {
    const resolvedModelId = this.resolveModelId(modelId);
    
    // Strict provider lookup - NO silent fallback to google for unmapped/external models
    const providerId = this.providerMapping[resolvedModelId];
    
    if (!providerId) {
      throw new Error(
        `Model "${modelId}" is not recognized or supported by the FLOAT router. Available verified models include: ${Object.keys(this.providerMapping).join(', ')}`
      );
    }

    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new Error(`Provider adapter for "${providerId}" not registered.`);
    }

    return adapter;
  }

  async generateContent(request: { 
    model: string; 
    messages: any[]; 
    systemInstruction?: string;
    reasoningEffort?: 'low' | 'medium' | 'high';
    speed?: 'fast' | 'balanced' | 'slow';
    dataSharingConsent?: boolean;
    dataSharingAllowed?: boolean;
  }): Promise<AIProviderResponse> {
    this.validateModelAvailability(request.model);
    const resolvedModel = this.resolveModelId(request.model);
    const adapter = this.getAdapterForModel(request.model);
    
    // Runtime check for user's consent preference:
    const dataSharingAllowed = request.dataSharingAllowed !== undefined
      ? request.dataSharingAllowed === true
      : request.dataSharingConsent === true;

    // Audit consent: if OFF, ensure no prompts or telemetry are pushed to external collectors
    ServerPrivacyGuard.logAudit('ModelRouter', `generateContent(${resolvedModel})`, dataSharingAllowed, {
      model: resolvedModel,
      messageCount: request.messages?.length || 0,
      dataSharingAllowed
    });

    if (!adapter.isConfigured()) {
      throw new Error(
        `Provider "${adapter.name}" is not configured on the FLOAT server. To use "${request.model}", configure the server-side API key.`
      );
    }

    const startTime = Date.now();
    const result = await adapter.generateContent({
      ...request,
      model: resolvedModel,
      dataSharingConsent: dataSharingAllowed,
      dataSharingAllowed
    });
    const latencyMs = Date.now() - startTime;

    // Runtime enforcement: If data sharing is OFF, block all telemetry and optional usage data
    if (dataSharingAllowed) {
      ServerPrivacyGuard.dispatchExternalTelemetry('model_chat_operational', true, {
        model: resolvedModel,
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
      dataSharingConsent?: boolean;
      dataSharingAllowed?: boolean;
    },
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<AIProviderResponse> {
    this.validateModelAvailability(request.model);
    const resolvedModel = this.resolveModelId(request.model);
    const adapter = this.getAdapterForModel(request.model);
    
    const dataSharingAllowed = request.dataSharingAllowed !== undefined
      ? request.dataSharingAllowed === true
      : request.dataSharingConsent === true;

    ServerPrivacyGuard.logAudit('ModelRouter', `generateContentStream(${resolvedModel})`, dataSharingAllowed, {
      model: resolvedModel,
      messageCount: request.messages?.length || 0,
      dataSharingAllowed
    });

    if (!adapter.isConfigured()) {
      throw new Error(
        `Provider "${adapter.name}" is not configured on the FLOAT server. To use "${request.model}", configure the server-side API key.`
      );
    }

    if (adapter.generateContentStream) {
      return adapter.generateContentStream({
        ...request,
        model: resolvedModel,
        dataSharingConsent: dataSharingAllowed,
        dataSharingAllowed
      }, onChunk, signal);
    }

    // Fallback if adapter doesn't support streaming: call generateContent and stream whole text
    const result = await adapter.generateContent({
      ...request,
      model: resolvedModel,
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
      throw new Error('A non-empty prompt is required to run the agent loop.');
    }

    this.validateModelAvailability(model);
    const resolvedModel = this.resolveModelId(model);
    const adapter = this.getAdapterForModel(model);
    const dataSharingAllowed = ServerPrivacyGuard.evaluateConsent(req);

    // Audit consent for autonomous agent operations
    ServerPrivacyGuard.logAudit('ModelRouter', `runAgentLoop(${resolvedModel})`, dataSharingAllowed, {
      model: resolvedModel,
      fileCount: virtualFiles?.length || 0,
      dataSharingAllowed
    });

    if (!adapter.isConfigured()) {
      throw new Error(
        `Provider "${adapter.name}" is not configured on the FLOAT server. To run agents with "${model}", configure the server-side API key.`
      );
    }

    if (!adapter.runAgentLoop) {
      throw new Error(`Agent loop not supported by provider ${adapter.name}`);
    }

    if (!dataSharingAllowed) {
      ServerPrivacyGuard.dispatchExternalTelemetry('agent_loop_telemetry', false, null);
    }

    return adapter.runAgentLoop(req, res, resolvedModel, prompt, virtualFiles);
  }
}
