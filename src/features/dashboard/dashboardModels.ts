import { AIModel } from '../../types/ai';
import { VERIFIED_MODELS } from '../../data/verifiedModels';

/** UI model cards are derived from the same catalog used by the server router. */
export const DASHBOARD_MODELS: AIModel[] = VERIFIED_MODELS
  .filter((model) => ['gpt-6-astra', 'gpt-6.1-sol', 'gemini-3.8-flash'].includes(model.id))
  .map((model) => ({
    id: model.id,
    exactModelId: model.exactModelId,
    apiModelId: model.upstreamModelId || model.exactModelId,
    providerId: model.providerId,
    provider: model.providerId === 'google' ? 'Google Gemini' : 'OpenAI',
    displayName: model.displayName,
    shortName: model.displayName.replace(' Flagship Coding', '').replace(' Deep Reasoning', ''),
    family: model.family,
    tier: model.deprecationStatus === 'preview' ? 'Preview' : undefined,
    description: model.description,
    capabilities: { ...model.capabilities },
    capabilitiesList: [
      ...(model.capabilities.coding ? ['Coding'] : []),
      ...(model.capabilities.reasoning ? ['Reasoning'] : []),
      ...(model.capabilities.tools ? ['Tool use'] : []),
      ...(model.capabilities.vision ? ['Vision'] : [])
    ],
    contextWindow: model.contextWindow,
    status: model.availabilityStatus,
    speed: model.speed,
    version: model.snapshotVersion,
    availability: 'Access unverified',
    pricing: {
      inputCost: model.pricing.inputCostPer1M,
      outputCost: model.pricing.outputCostPer1M,
      currency: model.pricing.currency,
      effectiveDate: model.pricing.effectiveDate
    },
    limits: { maxOutputTokens: model.maxOutputTokens },
    releaseDate: model.releaseDate,
    modalities: model.modalities,
    docUrl: model.docUrl,
    pricingUrl: model.pricing.sourceUrl,
    snapshotVersion: model.snapshotVersion,
    limitations: model.limitations,
    intendedUseCases: model.intendedUseCases,
    availabilityDetails: model.availabilityDetails,
    supportsStreaming: model.capabilities.streaming,
    supportsTools: model.capabilities.tools,
    supportsVision: model.capabilities.vision,
    supportsReasoning: model.capabilities.reasoning
  }));
