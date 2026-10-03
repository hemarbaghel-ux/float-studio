import { AIProviderAdapter, AIModel, ModelRequest, ModelResponse } from '../../types/ai';
import { GoogleGeminiAdapter } from './GoogleGeminiAdapter';
import { AnthropicAdapter } from './AnthropicAdapter';
import { OpenAIAdapter } from './OpenAIAdapter';
import { ServerPrivacyGuard } from '../privacyGuard';

export class ModelRouter {
  private adapters: Map<string, AIProviderAdapter> = new Map();
  private models: Map<string, AIModel> = new Map();

  constructor() {
    this.adapters.set('google', new GoogleGeminiAdapter());
    this.adapters.set('anthropic', new AnthropicAdapter());
    this.adapters.set('openai', new OpenAIAdapter());
  }

  public registerModel(model: AIModel) {
    this.models.set(model.id, model);
  }

  public async route(request: ModelRequest): Promise<ModelResponse> {
    const model = this.models.get(request.modelId);
    if (!model) {
      throw new Error(`Model ${request.modelId} not found`);
    }

    const adapter = this.adapters.get(model.providerId);
    if (!adapter) {
      throw new Error(`Provider adapter for ${model.providerId} not found`);
    }

    // Runtime check for user's consent preference
    const dataSharingAllowed = request.dataSharingAllowed === true || (request as any).dataSharingConsent === true;

    ServerPrivacyGuard.logAudit('ModelRouter', `route(${request.modelId})`, dataSharingAllowed, {
      modelId: request.modelId,
      providerId: model.providerId,
      dataSharingAllowed
    });

    const startTime = Date.now();
    const response = await adapter.generate(request);
    const latencyMs = Date.now() - startTime;

    // If dataSharingAllowed is false, ensure optional analytics, usage telemetry, or external improvement data transmission is blocked
    if (dataSharingAllowed) {
      ServerPrivacyGuard.dispatchExternalTelemetry('model_router_route_telemetry', true, {
        modelId: request.modelId,
        providerId: model.providerId,
        latencyMs
      });
    } else {
      ServerPrivacyGuard.dispatchExternalTelemetry('model_router_route_telemetry', false, null);
    }

    return response;
  }
}
