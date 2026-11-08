import { AIModel } from '../../types/ai';
import { VERIFIED_MODELS } from '../../data/verifiedModels';
import { DASHBOARD_MODELS } from '../dashboard/dashboardModels';

const existingPredefinedIds = new Set([
  ...DASHBOARD_MODELS.map(m => m.id)
]);

const rawInitialModels: AIModel[] = [
  ...DASHBOARD_MODELS,
  ...VERIFIED_MODELS.filter(vm => !existingPredefinedIds.has(vm.id)).map(vm => ({
    id: vm.id,
    exactModelId: vm.exactModelId,
    apiModelId: vm.exactModelId,
    providerId: vm.providerId,
    provider: vm.providerId === 'openai' ? 'OpenAI' : vm.providerId === 'google' ? 'Google Gemini' : 'FLOAT',
    displayName: vm.displayName,
    shortName: vm.displayName.replace('OpenAI ', ''),
    family: vm.family,
    tier: vm.deprecationStatus === 'preview' ? 'Preview' : undefined,
    description: vm.description,
    capabilities: {
      coding: vm.capabilities.coding,
      reasoning: vm.capabilities.reasoning,
      vision: vm.capabilities.vision,
      tools: vm.capabilities.tools,
      structuredOutput: vm.capabilities.structuredOutput,
      streaming: vm.capabilities.streaming,
      longContext: vm.capabilities.longContext
    },
    capabilitiesList: [
      ...(vm.capabilities.coding ? ['Coding'] : []),
      ...(vm.capabilities.reasoning ? ['Reasoning'] : []),
      ...(vm.capabilities.tools ? ['Tool use'] : []),
      ...(vm.capabilities.vision ? ['Vision'] : [])
    ],
    contextWindow: vm.contextWindow,
    status: vm.availabilityStatus as any,
    speed: vm.speed,
    version: vm.snapshotVersion || vm.id,
    availability: vm.availabilityStatus === 'AVAILABLE'
      ? 'Available'
      : vm.availabilityStatus === 'CONFIG_REQUIRED' ? 'Configuration required' : 'Access unverified',
    pricing: {
      inputCost: vm.pricing.inputCostPer1M,
      outputCost: vm.pricing.outputCostPer1M,
      currency: vm.pricing.currency,
      effectiveDate: vm.pricing.effectiveDate
    },
    limits: {
      maxOutputTokens: vm.maxOutputTokens
    },
    releaseDate: vm.releaseDate,
    modalities: vm.modalities,
    docUrl: vm.docUrl,
    pricingUrl: vm.pricing.sourceUrl,
    snapshotVersion: vm.snapshotVersion,
    limitations: vm.limitations,
    intendedUseCases: vm.intendedUseCases,
    availabilityDetails: vm.availabilityDetails,
    fallbackModel: vm.fallbackModel,
    supportsStreaming: vm.capabilities.streaming,
    supportsTools: vm.capabilities.tools,
    supportsVision: vm.capabilities.vision,
    supportsReasoning: vm.capabilities.reasoning
  }))
];

const seenInitialModelIds = new Set<string>();
export const INITIAL_MODELS: AIModel[] = [
  ...rawInitialModels.filter(m => ['gpt-6-astra', 'gpt-6.1-sol', 'gemini-3.8-flash'].includes(m.id))
].filter(m => {
  if (seenInitialModelIds.has(m.id)) return false;
  seenInitialModelIds.add(m.id);
  return true;
});
