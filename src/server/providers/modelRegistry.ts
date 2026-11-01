import { VERIFIED_MODELS } from '../../data/verifiedModels';
import type { ModelRouteDefinition } from './router';

export type ModelProtocol = 'responses' | 'chat_completions';

export interface ServerModelDescriptor {
  id: string;
  displayName: string;
  providerId: 'openai';
  apiModelId: string;
  protocol: ModelProtocol;
  selectable: boolean;
  requiredEnvironmentVariable: string;
  contextWindow: number;
  maxOutputTokens: number;
  description: string;
  capabilities: {
    coding: boolean;
    reasoning: boolean;
    vision: boolean;
    tools: boolean;
    structuredOutput: boolean;
    streaming: boolean;
  };
  pricing?: { inputCostPer1M: number; outputCostPer1M: number; cachedInputCostPer1M?: number; currency: 'USD'; effectiveDate: string; sourceUrl: string };
}

/** Execution descriptors are generated from the shared verified model catalog. */
export const MODEL_REGISTRY: readonly ServerModelDescriptor[] = VERIFIED_MODELS.map((model) => ({
  id: model.id,
  displayName: model.displayName,
  providerId: 'openai',
  apiModelId: model.upstreamModelId || model.exactModelId,
  protocol: model.apiProtocol || 'chat_completions',
  selectable: model.id === 'gpt-6-astra' || model.id === 'gpt-6.1-sol',
  requiredEnvironmentVariable: model.requiredEnvironmentVariable || 'OPENAI_API_KEY',
  contextWindow: model.contextWindow,
  maxOutputTokens: model.maxOutputTokens,
  description: model.description,
  capabilities: {
    coding: model.capabilities.coding,
    reasoning: model.capabilities.reasoning,
    vision: model.capabilities.vision,
    tools: model.capabilities.tools,
    structuredOutput: model.capabilities.structuredOutput,
    streaming: model.capabilities.streaming
  },
  pricing: model.pricing ? {
    inputCostPer1M: model.pricing.inputCostPer1M,
    outputCostPer1M: model.pricing.outputCostPer1M,
    cachedInputCostPer1M: model.pricing.cachedInputCostPer1M,
    currency: model.pricing.currency,
    effectiveDate: model.pricing.effectiveDate,
    sourceUrl: model.pricing.sourceUrl
  } : undefined
  }));

export function getModelDescriptor(modelId: string): ServerModelDescriptor | undefined {
  return MODEL_REGISTRY.find(model => model.id === modelId || model.apiModelId === modelId);
}

const route = (apiModelId: string, isInternalAlias = false, protocol: ModelProtocol = /^gpt-6(?:\.|-)/i.test(apiModelId) ? 'responses' : 'chat_completions'): ModelRouteDefinition => ({
  provider: 'openai', apiModelId, protocol, isInternalAlias, upstreamModelId: apiModelId
});

export const MODEL_ROUTES: Readonly<Record<string, ModelRouteDefinition>> = Object.freeze({
  ...Object.fromEntries(MODEL_REGISTRY.filter((model) => model.selectable).map((model) => [model.id, route(model.apiModelId, model.id !== model.apiModelId, model.protocol)])),
  auto: route('gpt-6-astra', true, 'responses')
});

export function getModelProtocol(modelId: string): ModelProtocol {
  return MODEL_ROUTES[modelId]?.protocol || 'chat_completions';
}

export function getPublicModelCatalog(providerConfigured: boolean) {
  return MODEL_REGISTRY.filter((model) => model.selectable).map((model) => ({
    ...model,
    providerConfigured,
    modelAvailability: 'unverified' as const,
    status: providerConfigured ? 'UNKNOWN' as const : 'CONFIG_REQUIRED' as const,
    availabilityDetails: providerConfigured
      ? 'Server credential is configured; access to this model has not been verified.'
      : `${model.requiredEnvironmentVariable} is not configured on the server.`
  }));
}
