import { VERIFIED_MODELS } from '../../data/verifiedModels';
import type { ModelRouteDefinition } from './router';

export type ModelProtocol = 'responses' | 'chat_completions';
export type RoutedProvider = 'openai' | 'google' | 'anthropic';

export interface ModelVerificationMatrix {
  readonly credentialConfigured: boolean;
  readonly authVerified: boolean;
  readonly modelListed: boolean;
  readonly generationVerified: boolean;
}

export interface ServerModelDescriptor {
  id: string;
  displayName: string;
  providerId: RoutedProvider;
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

/** Runtime descriptors are derived from the shared, source-verified model catalog. */
export const MODEL_REGISTRY: readonly ServerModelDescriptor[] = VERIFIED_MODELS
  .filter((model) => model.deprecationStatus !== 'retired' && (model.providerId === 'openai' || model.providerId === 'google' || model.providerId === 'anthropic'))
  .map((model) => ({
    id: model.id,
    displayName: model.displayName,
    providerId: model.providerId as RoutedProvider,
    apiModelId: model.upstreamModelId || model.exactModelId,
    protocol: model.apiProtocol || 'chat_completions',
    selectable: model.deprecationStatus !== 'deprecated',
    requiredEnvironmentVariable: model.requiredEnvironmentVariable || (model.providerId === 'google' ? 'GEMINI_API_KEY' : model.providerId === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'),
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

const route = (
  provider: RoutedProvider,
  apiModelId: string,
  isInternalAlias = false,
  protocol: ModelProtocol = /^gpt-6(?:\\.|-)/i.test(apiModelId) ? 'responses' : 'chat_completions'
): ModelRouteDefinition => ({
  provider, apiModelId, protocol, isInternalAlias, upstreamModelId: apiModelId
});

export const MODEL_ROUTES: Readonly<Record<string, ModelRouteDefinition>> = Object.freeze({
  ...Object.fromEntries(
    MODEL_REGISTRY
      .filter((model) => model.selectable)
      .map((model) => [model.id, route(model.providerId, model.apiModelId, model.id !== model.apiModelId, model.protocol)])
  ),
  auto: route('openai', 'gpt-6-astra', true, 'responses')
});

export function getModelProtocol(modelId: string): ModelProtocol {
  return MODEL_ROUTES[modelId]?.protocol || 'chat_completions';
}

export function getPublicModelCatalog(
  providerConfigured: Readonly<Record<string, boolean>>,
  verificationOverrides?: Readonly<Record<string, Partial<ModelVerificationMatrix>>>
) {
  return MODEL_REGISTRY.filter((model) => model.selectable).map((model) => {
    const configured = providerConfigured[model.providerId] === true;
    const overrides = verificationOverrides?.[model.id] || {};
    const verification: ModelVerificationMatrix = {
      credentialConfigured: configured,
      authVerified: Boolean(overrides.authVerified),
      modelListed: Boolean(overrides.modelListed),
      generationVerified: Boolean(overrides.generationVerified),
    };
    return {
      ...model,
      providerConfigured: configured,
      verification,
      modelAvailability: verification.generationVerified ? 'verified' as const : 'unverified' as const,
      status: verification.generationVerified
        ? 'AVAILABLE' as const
        : configured
          ? 'UNKNOWN' as const
          : 'CONFIG_REQUIRED' as const,
      availabilityDetails: verification.generationVerified
        ? 'Live model generation has been verified on this server.'
        : configured
          ? 'Server credential is configured; access to this model has not been verified.'
          : `${model.requiredEnvironmentVariable} is not configured on the server.`
    };
  });
}
