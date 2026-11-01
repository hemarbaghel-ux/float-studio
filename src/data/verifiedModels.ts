import { ProviderId } from '../types/ai';

export type AvailabilityStatus =
  | 'AVAILABLE'
  | 'CONFIG_REQUIRED'
  | 'PROVIDER_SUPPORTED_NOT_CONFIGURED'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export interface VerifiedModelPricing {
  inputCostPer1M: number;
  outputCostPer1M: number;
  cachedInputCostPer1M?: number;
  currency: 'USD';
  pricingUnit: 'per 1M tokens';
  effectiveDate: string;
  sourceUrl: string;
}

export interface VerifiedModelCapabilities {
  coding: boolean;
  reasoning: boolean;
  tools: boolean;
  vision: boolean;
  audio?: boolean;
  structuredOutput: boolean;
  streaming: boolean;
  longContext: boolean;
}

export type ModelCategory = 'flagship_coding' | 'advanced_reasoning' | 'fast_coding' | 'efficient' | 'auto';

export interface VerifiedModel {
  id: string;
  exactModelId: string;
  displayName: string;
  providerId: ProviderId;
  family: string;
  category?: ModelCategory;
  snapshotVersion: string;
  releaseDate?: string;
  docUrl: string;
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
  modalities: string[];
  capabilities: VerifiedModelCapabilities;
  pricing: VerifiedModelPricing;
  limitations: string[];
  intendedUseCases: string[];
  speed: 'fast' | 'balanced' | 'slow';
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'hybrid';
  supportedEfforts?: ('low' | 'medium' | 'high' | 'xhigh' | 'max')[];
  availabilityStatus: AvailabilityStatus;
  availabilityDetails: string;
  configRequirement?: string;
  deprecationStatus?: 'active' | 'preview' | 'deprecated' | 'retired';
  fallbackModel?: string;
  /** True when this entry is an internal FLOAT alias rather than a literal upstream OpenAI model ID. */
  isInternalAlias?: boolean;
  /** Explicit upstream OpenAI model ID that executes requests for this entry. */
  upstreamModelId?: string;
  /** Provider protocol used by the backend runtime for requests to this exact API model. */
  apiProtocol?: 'responses' | 'chat_completions';
  /** Primary server-side environment variable. This does not imply account access. */
  requiredEnvironmentVariable?: string;
}

/**
 * SOURCE-VERIFIED MODEL CATALOG — DUAL MODEL FOCUS
 * Dedicated to next-generation GPT-6 Astra & GPT-6.1 Sol
 */
export const VERIFIED_MODELS: VerifiedModel[] = [
  {
    id: 'gpt-6-astra',
    exactModelId: 'gpt-6-astra',
    isInternalAlias: false,
    upstreamModelId: 'gpt-6-astra',
    displayName: 'GPT-6 Astra',
    providerId: 'openai',
    apiProtocol: 'responses',
    requiredEnvironmentVariable: 'OPENAI_API_KEY',
    family: 'codex',
    category: 'flagship_coding',
    snapshotVersion: 'gpt-6-astra',
    docUrl: 'https://developers.openai.com/api/docs/models/gpt-6-astra',
    description: 'OpenAI flagship model for complex reasoning and coding, called through the Responses API.',
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    pricing: { inputCostPer1M: 10.00, outputCostPer1M: 50.00, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2026-10-31', sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-6-astra' },
    limitations: [
      'A configured credential does not prove that the account can access this model.',
      'Model access is reported as unverified until a real provider check succeeds.',
      'Agent workflows are not available in the current product.'
    ],
    intendedUseCases: [
      'Complex coding and reasoning requests',
      'Chat-based coding and reasoning assistance'
    ],
    speed: 'fast',
    availabilityStatus: 'UNKNOWN',
    availabilityDetails: 'Model-level access is unverified until a provider request succeeds.',
    deprecationStatus: 'active'
  },
  {
    id: 'gpt-6.1-sol',
    exactModelId: 'gpt-6.1-sol',
    isInternalAlias: false,
    upstreamModelId: 'gpt-6.1-sol',
    displayName: 'GPT-6.1 Sol',
    providerId: 'openai',
    apiProtocol: 'responses',
    requiredEnvironmentVariable: 'OPENAI_API_KEY',
    family: 'codex',
    category: 'advanced_reasoning',
    snapshotVersion: 'gpt-6.1-sol',
    docUrl: 'https://developers.openai.com/api/docs/models/gpt-6.1-sol',
    description: 'OpenAI model for complex reasoning and coding, called through the Responses API.',
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 2.00, outputCostPer1M: 10.00, cachedInputCostPer1M: 0.10, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2026-10-31', sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-6.1-sol' },
    limitations: [
      'A configured credential does not prove that the account can access this model.',
      'Model access is reported as unverified until a real provider check succeeds.',
      'Agent workflows are not available in the current product.'
    ],
    intendedUseCases: [
      'Complex reasoning and coding requests',
      'Chat-based coding and reasoning assistance'
    ],
    speed: 'fast',
    supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    availabilityStatus: 'UNKNOWN',
    availabilityDetails: 'Model-level access is unverified until a provider request succeeds.',
    deprecationStatus: 'active'
  }
];

export function getVerifiedModel(modelId: string): VerifiedModel | undefined {
  return VERIFIED_MODELS.find(m => m.id === modelId || m.exactModelId === modelId);
}
