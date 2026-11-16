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
    exactModelId: 'gpt-4o',
    isInternalAlias: true,
    upstreamModelId: 'gpt-4o',
    displayName: 'GPT-6 Astra (Flagship)',
    providerId: 'openai',
    apiProtocol: 'chat_completions',
    requiredEnvironmentVariable: 'OPENAI_API_KEY',
    family: 'codex',
    category: 'flagship_coding',
    snapshotVersion: 'gpt-4o-2024-08-06',
    docUrl: 'https://developers.openai.com/api/docs/models/gpt-4o',
    description: 'OpenAI flagship model for complex reasoning and coding, routed to high-performance GPT-4o.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    pricing: { inputCostPer1M: 2.50, outputCostPer1M: 10.00, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2024-08-06', sourceUrl: 'https://openai.com/pricing' },
    limitations: [
      'A configured credential does not prove that the account can access this model.',
      'Model access is reported as unverified until a real provider check succeeds.'
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
    exactModelId: 'gpt-4o',
    isInternalAlias: true,
    upstreamModelId: 'gpt-4o',
    displayName: 'GPT-6.1 Sol (Reasoning)',
    providerId: 'openai',
    apiProtocol: 'chat_completions',
    requiredEnvironmentVariable: 'OPENAI_API_KEY',
    family: 'codex',
    category: 'advanced_reasoning',
    snapshotVersion: 'gpt-4o-2024-08-06',
    docUrl: 'https://developers.openai.com/api/docs/models/gpt-4o',
    description: 'OpenAI model for complex multi-file reasoning and Composer workflows, routed to GPT-4o.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 2.50, outputCostPer1M: 10.00, cachedInputCostPer1M: 1.25, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2024-08-06', sourceUrl: 'https://openai.com/pricing' },
    limitations: [
      'A configured credential does not prove that the account can access this model.',
      'Model access is reported as unverified until a real provider check succeeds.'
    ],
    intendedUseCases: [
      'Complex reasoning and coding requests',
      'Composer multi-file diff generation'
    ],
    speed: 'fast',
    supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    availabilityStatus: 'UNKNOWN',
    availabilityDetails: 'Model-level access is unverified until a provider request succeeds.',
    deprecationStatus: 'active'
  },
  {
    id: 'gpt-4o-mini',
    exactModelId: 'gpt-4o-mini',
    isInternalAlias: false,
    upstreamModelId: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini (Fast)',
    providerId: 'openai',
    apiProtocol: 'chat_completions',
    requiredEnvironmentVariable: 'OPENAI_API_KEY',
    family: 'gpt-4o',
    category: 'fast_coding',
    snapshotVersion: 'gpt-4o-mini-2024-07-18',
    docUrl: 'https://platform.openai.com/docs/models/gpt-4o-mini',
    description: 'Fast, lightweight model optimized for low-latency Tab autocompletions and rapid chat.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: false, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 0.15, outputCostPer1M: 0.60, cachedInputCostPer1M: 0.075, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2024-07-18', sourceUrl: 'https://openai.com/pricing' },
    limitations: [],
    intendedUseCases: ['Fast inline code completion', 'Instant code explanations'],
    speed: 'fast',
    availabilityStatus: 'UNKNOWN',
    availabilityDetails: 'Model-level access is unverified until a provider request succeeds.',
    deprecationStatus: 'active'
  },
  {
    id: 'gemini-3.8-flash',
    exactModelId: 'gemini-2.0-flash',
    upstreamModelId: 'gemini-2.0-flash',
    isInternalAlias: true,
    displayName: 'Gemini 2.0 Flash',
    providerId: 'google',
    family: 'gemini-2',
    category: 'flagship_coding',
    snapshotVersion: 'gemini-2.0-flash',
    docUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini-2.0-flash',
    description: 'Google Gemini 2.0 Flash for agentic coding, long-horizon software engineering, and multi-step workflows.',
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    modalities: ['text', 'image', 'video', 'audio', 'pdf', 'code'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    supportedEfforts: ['low', 'medium', 'high'],
    pricing: { inputCostPer1M: 0.10, outputCostPer1M: 0.40, cachedInputCostPer1M: 0.025, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2024-12-11', sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing' },
    limitations: [
      'The Gemini Developer API has a limited free tier; rate limits and eligibility apply.',
      'A configured API key does not prove model-level access.'
    ],
    intendedUseCases: [
      'Agentic coding and multi-file software engineering',
      'Long-context codebase analysis',
      'Streaming chat and function calling'
    ],
    speed: 'fast',
    availabilityStatus: 'UNKNOWN',
    availabilityDetails: 'Model access is unverified until a real generation request succeeds.',
    configRequirement: 'GEMINI_API_KEY',
    deprecationStatus: 'active',
    requiredEnvironmentVariable: 'GEMINI_API_KEY'
  },
  {
    id: 'claude-3-5-sonnet',
    exactModelId: 'claude-3-5-sonnet-20241022',
    upstreamModelId: 'claude-3-5-sonnet-20241022',
    isInternalAlias: false,
    displayName: 'Claude 3.5 Sonnet',
    providerId: 'anthropic',
    family: 'claude-3-5',
    category: 'flagship_coding',
    snapshotVersion: '20241022',
    docUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
    description: 'Anthropic flagship model for coding, reasoning, and multi-step tool use.',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 3.00, outputCostPer1M: 15.00, cachedInputCostPer1M: 0.30, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2024-10-22', sourceUrl: 'https://www.anthropic.com/pricing' },
    limitations: [
      'A configured API key does not guarantee model availability.',
      'Subject to Anthropic API concurrency and rate limits.'
    ],
    intendedUseCases: [
      'Autonomous coding, multi-file changes, and architectural reasoning',
      'Refactoring and test generation'
    ],
    speed: 'fast',
    availabilityStatus: 'UNKNOWN',
    availabilityDetails: 'Model access is unverified until a real generation request succeeds.',
    deprecationStatus: 'active',
    requiredEnvironmentVariable: 'ANTHROPIC_API_KEY'
  }
];

export function getVerifiedModel(modelId: string): VerifiedModel | undefined {
  return VERIFIED_MODELS.find(m => m.id === modelId || m.exactModelId === modelId);
}
