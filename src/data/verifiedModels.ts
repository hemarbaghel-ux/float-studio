import { ProviderId, CloudAgentConfig } from '../types/ai';
import { GPT6_ASTRA_CLOUD_CONFIG } from './cloudAgentConstants';

export type AvailabilityStatus =
  | 'AVAILABLE'
  | 'CONFIG_REQUIRED'
  | 'PROVIDER_SUPPORTED_NOT_CONFIGURED'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export interface VerifiedModelPricing {
  inputCostPer1M: number | null;
  outputCostPer1M: number | null;
  cachedInputCostPer1M?: number | null;
  currency: 'USD';
  pricingUnit: 'per 1M tokens';
  effectiveDate: string;
  sourceUrl: string | null;
}

export interface ModelConfigSpec {
  inputCostPer1M: number | null;
  outputCostPer1M: number | null;
  cachedInputCostPer1M?: number | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  sourceUrl: string | null;
}

/**
 * Single centralized configuration object holding pricing, contextWindow,
 * maxOutputTokens, and sourceUrl with an effectiveDate. Unknown values are null.
 */
export const MODEL_CONFIG: {
  effectiveDate: string;
  currency: 'USD';
  pricingUnit: 'per 1M tokens';
  sourceUrl: string;
  models: Record<string, ModelConfigSpec>;
} = {
  effectiveDate: '2025-05-01',
  currency: 'USD',
  pricingUnit: 'per 1M tokens',
  sourceUrl: 'https://openai.com/api/pricing/',
  models: {
    'gemini-4-argon': {
      inputCostPer1M: null,
      outputCostPer1M: null,
      contextWindow: 1000000,
      maxOutputTokens: 1000000,
      sourceUrl: 'https://ai.google.dev/gemini-api/docs/models'
    },
    'gpt-6-astra': {
      inputCostPer1M: null,
      outputCostPer1M: null,
      contextWindow: 1000000,
      maxOutputTokens: 32768,
      sourceUrl: 'https://platform.openai.com/docs/models'
    },
    'gpt-6-sol': {
      inputCostPer1M: 2.00,
      outputCostPer1M: 10.00,
      contextWindow: 1000000,
      maxOutputTokens: 65536,
      sourceUrl: 'https://platform.openai.com/docs/models'
    },
    'gpt-6-luna': {
      inputCostPer1M: 0.10,
      outputCostPer1M: 0.50,
      contextWindow: 256000,
      maxOutputTokens: 32768,
      sourceUrl: 'https://platform.openai.com/docs/models'
    },
    'claude-sonnet-5-5': {
      inputCostPer1M: null,
      outputCostPer1M: null,
      contextWindow: 200000,
      maxOutputTokens: 64000,
      sourceUrl: 'https://docs.anthropic.com/en/docs/about-claude/models'
    },
    'claude-opus-5-5': {
      inputCostPer1M: null,
      outputCostPer1M: null,
      contextWindow: 200000,
      maxOutputTokens: 64000,
      sourceUrl: 'https://docs.anthropic.com/en/docs/about-claude/models'
    },
    'claude-haiku-5-5': {
      inputCostPer1M: null,
      outputCostPer1M: null,
      contextWindow: 200000,
      maxOutputTokens: 64000,
      sourceUrl: 'https://docs.anthropic.com/en/docs/about-claude/models'
    },
    'gpt-4o': {
      inputCostPer1M: null,
      outputCostPer1M: null,
      contextWindow: 128000,
      maxOutputTokens: 16384,
      sourceUrl: 'https://platform.openai.com/docs/models/gpt-4o'
    },
    'gpt-4o-mini': {
      inputCostPer1M: null,
      outputCostPer1M: null,
      contextWindow: 128000,
      maxOutputTokens: 16384,
      sourceUrl: 'https://platform.openai.com/docs/models/gpt-4o-mini'
    }
  }
};

export const MODEL_PRICING_CONFIG = MODEL_CONFIG;

export function getPricingForModel(modelId: string): VerifiedModelPricing {
  const entry = MODEL_CONFIG.models[modelId] || {
    inputCostPer1M: null,
    outputCostPer1M: null,
    contextWindow: null,
    maxOutputTokens: null,
    sourceUrl: null
  };
  return {
    inputCostPer1M: entry.inputCostPer1M,
    outputCostPer1M: entry.outputCostPer1M,
    ...(entry.cachedInputCostPer1M !== undefined ? { cachedInputCostPer1M: entry.cachedInputCostPer1M } : {}),
    currency: MODEL_CONFIG.currency,
    pricingUnit: MODEL_CONFIG.pricingUnit,
    effectiveDate: MODEL_CONFIG.effectiveDate,
    sourceUrl: entry.sourceUrl ?? null
  };
}

export function isProviderKeyConfigured(providerId: ProviderId): boolean {
  if (typeof process === 'undefined' || !process.env) {
    // In browser context before status sync, default to true for display; aiStore.syncProviderStatus() updates live state
    return true;
  }
  if (providerId === 'google') {
    const key = process.env.GEMINI_API_KEY;
    return Boolean(key && key.trim().length > 0 && !key.includes('MY_GEMINI_API_KEY') && !key.includes('replace_with'));
  }
  if (providerId === 'openai') {
    const key = process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY || process.env.OPENAI_ENVIRONMENT_KEY;
    return Boolean(key && key.trim().length > 0 && !key.includes('replace_with'));
  }
  if (providerId === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    return Boolean(key && key.trim().length > 0 && !key.includes('replace_with'));
  }
  return false;
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
  releaseDate: string;
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
  supportedEfforts?: ('low' | 'medium' | 'high')[];
  availabilityStatus: AvailabilityStatus;
  availabilityDetails: string;
  configRequirement?: string;
  deprecationStatus?: 'active' | 'preview' | 'deprecated' | 'retired';
  cloudAgentConfig?: CloudAgentConfig;
  fallbackModel?: string;
}

const CATALOG_DEFINITIONS: VerifiedModel[] = [
  {
    id: 'gemini-4-argon',
    exactModelId: 'gemini-4-argon',
    displayName: 'Gemini 4 Argon',
    providerId: 'google',
    family: 'gemini-4',
    category: 'flagship_coding',
    snapshotVersion: 'gemini-4-argon',
    releaseDate: '2025-05-01',
    docUrl: MODEL_CONFIG.models['gemini-4-argon'].sourceUrl || 'https://ai.google.dev/gemini-api/docs/models',
    description: 'Google flagship coding and deep reasoning model with 1M token context and 1M token output capacity.',
    contextWindow: MODEL_CONFIG.models['gemini-4-argon'].contextWindow ?? 1000000,
    maxOutputTokens: MODEL_CONFIG.models['gemini-4-argon'].maxOutputTokens ?? 1000000,
    modalities: ['text', 'code', 'vision'],
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      vision: true,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: getPricingForModel('gemini-4-argon'),
    limitations: [
      'Requires server-side GEMINI_API_KEY.',
      'Pricing is null in MODEL_CONFIG until published.'
    ],
    intendedUseCases: [
      'Flagship multi-file software engineering and autonomous coding',
      'Deep architectural reasoning with 1M token output'
    ],
    speed: 'fast',
    reasoningEffort: 'high',
    supportedEfforts: ['low', 'medium', 'high'],
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Calls Google Gemini model gemini-4-argon directly.',
    configRequirement: 'GEMINI_API_KEY',
    deprecationStatus: 'active'
  },
  {
    id: 'gpt-6-astra',
    exactModelId: 'gpt-6-astra',
    displayName: 'GPT-6 Astra Flagship Coding',
    providerId: 'openai',
    family: 'gpt-6',
    category: 'flagship_coding',
    snapshotVersion: 'gpt-6-astra',
    releaseDate: '2025-05-01',
    docUrl: MODEL_CONFIG.models['gpt-6-astra'].sourceUrl || 'https://platform.openai.com/docs/models',
    description: 'Flagship coding agent powered by OpenAI gpt-6-astra with cloud remote connection and deep developer assistance.',
    contextWindow: MODEL_CONFIG.models['gpt-6-astra'].contextWindow ?? 1000000,
    maxOutputTokens: MODEL_CONFIG.models['gpt-6-astra'].maxOutputTokens ?? 32768,
    modalities: ['text', 'code', 'vision'],
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      vision: true,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: getPricingForModel('gpt-6-astra'),
    limitations: [
      'Requires server-side OPENAI_API_KEY with access to gpt-6-astra.',
      'Pricing is null in MODEL_CONFIG until published.'
    ],
    intendedUseCases: [
      'Autonomous developer workflows and multi-file implementation',
      'Cloud agent tasks and complex debugging'
    ],
    speed: 'fast',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Calls OpenAI model gpt-6-astra directly.',
    configRequirement: 'OPENAI_API_KEY',
    deprecationStatus: 'preview',
    cloudAgentConfig: {
      remoteUrl: GPT6_ASTRA_CLOUD_CONFIG.remoteUrl,
      environmentId: GPT6_ASTRA_CLOUD_CONFIG.environmentId,
      sessionId: GPT6_ASTRA_CLOUD_CONFIG.sessionId,
      sessionStatus: GPT6_ASTRA_CLOUD_CONFIG.sessionId && GPT6_ASTRA_CLOUD_CONFIG.environmentId ? 'connected' : 'disconnected',
      execServerCommand: '',
      mode: 'preview'
    }
  },
  {
    id: 'gpt-6-sol',
    exactModelId: 'gpt-6-sol',
    displayName: 'GPT-6 Sol Deep Reasoning',
    providerId: 'openai',
    family: 'gpt-6',
    category: 'advanced_reasoning',
    snapshotVersion: 'gpt-6-sol',
    releaseDate: '2025-05-01',
    docUrl: MODEL_CONFIG.models['gpt-6-sol'].sourceUrl || 'https://platform.openai.com/docs/models',
    description: 'Frontier deep-reasoning model (gpt-6-sol) tuned for architecture design, algorithm synthesis, multi-step refactoring, and root-cause debugging.',
    contextWindow: MODEL_CONFIG.models['gpt-6-sol'].contextWindow ?? 1000000,
    maxOutputTokens: MODEL_CONFIG.models['gpt-6-sol'].maxOutputTokens ?? 65536,
    modalities: ['text', 'code', 'vision'],
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      vision: true,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: getPricingForModel('gpt-6-sol'),
    limitations: [
      'Requires server-side OPENAI_API_KEY with access to gpt-6-sol.'
    ],
    intendedUseCases: [
      'Frontier code synthesis and system architecture planning',
      'Deep multi-step algorithmic reasoning and refactoring',
      'Concurrency, security audits, and type-system invariants'
    ],
    speed: 'balanced',
    reasoningEffort: 'high',
    supportedEfforts: ['low', 'medium', 'high'],
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Calls OpenAI model gpt-6-sol directly.',
    configRequirement: 'OPENAI_API_KEY',
    deprecationStatus: 'active'
  },
  {
    id: 'gpt-6-luna',
    exactModelId: 'gpt-6-luna',
    displayName: 'GPT-6 Luna Fast Coding',
    providerId: 'openai',
    family: 'gpt-6',
    category: 'fast_coding',
    snapshotVersion: 'gpt-6-luna',
    releaseDate: '2025-05-01',
    docUrl: MODEL_CONFIG.models['gpt-6-luna'].sourceUrl || 'https://platform.openai.com/docs/models',
    description: 'High-throughput, low-latency OpenAI coding model (gpt-6-luna) optimized for inline completions, quick edits, and fast turnarounds.',
    contextWindow: MODEL_CONFIG.models['gpt-6-luna'].contextWindow ?? 256000,
    maxOutputTokens: MODEL_CONFIG.models['gpt-6-luna'].maxOutputTokens ?? 32768,
    modalities: ['text', 'code', 'vision'],
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      vision: true,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: getPricingForModel('gpt-6-luna'),
    limitations: [
      'Requires server-side OPENAI_API_KEY with access to gpt-6-luna.'
    ],
    intendedUseCases: [
      'Fast inline code completions and next-edit prediction',
      'Rapid code generation and lightweight refactors'
    ],
    speed: 'fast',
    reasoningEffort: 'low',
    supportedEfforts: ['low', 'medium', 'high'],
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Calls OpenAI model gpt-6-luna directly.',
    configRequirement: 'OPENAI_API_KEY',
    deprecationStatus: 'active'
  },
  {
    id: 'claude-sonnet-5-5',
    exactModelId: 'claude-sonnet-5-5',
    displayName: 'Claude Sonnet 5.5',
    providerId: 'anthropic',
    family: 'claude-5',
    category: 'flagship_coding',
    snapshotVersion: 'claude-sonnet-5-5',
    releaseDate: '2025-05-14',
    docUrl: MODEL_CONFIG.models['claude-sonnet-5-5'].sourceUrl || 'https://docs.anthropic.com/en/docs/about-claude/models',
    description: 'Anthropic Claude Sonnet 5.5 flagship model for software engineering, code review, and agentic tool use.',
    contextWindow: MODEL_CONFIG.models['claude-sonnet-5-5'].contextWindow ?? 200000,
    maxOutputTokens: MODEL_CONFIG.models['claude-sonnet-5-5'].maxOutputTokens ?? 64000,
    modalities: ['text', 'code', 'vision'],
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      vision: true,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: getPricingForModel('claude-sonnet-5-5'),
    limitations: [
      'Requires server-side ANTHROPIC_API_KEY.',
      'Pricing is null in MODEL_CONFIG until published.'
    ],
    intendedUseCases: ['Code generation', 'Code review', 'Complex debugging'],
    speed: 'fast',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Calls Anthropic model claude-sonnet-5-5 directly.',
    configRequirement: 'ANTHROPIC_API_KEY',
    deprecationStatus: 'active'
  },
  {
    id: 'claude-opus-5-5',
    exactModelId: 'claude-opus-5-5',
    displayName: 'Claude Opus 5.5',
    providerId: 'anthropic',
    family: 'claude-5',
    category: 'advanced_reasoning',
    snapshotVersion: 'claude-opus-5-5',
    releaseDate: '2025-05-14',
    docUrl: MODEL_CONFIG.models['claude-opus-5-5'].sourceUrl || 'https://docs.anthropic.com/en/docs/about-claude/models',
    description: 'Anthropic Claude Opus 5.5 frontier reasoning model for complex systems architecture and deep code synthesis.',
    contextWindow: MODEL_CONFIG.models['claude-opus-5-5'].contextWindow ?? 200000,
    maxOutputTokens: MODEL_CONFIG.models['claude-opus-5-5'].maxOutputTokens ?? 64000,
    modalities: ['text', 'code', 'vision'],
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      vision: true,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: getPricingForModel('claude-opus-5-5'),
    limitations: [
      'Requires server-side ANTHROPIC_API_KEY.',
      'Pricing is null in MODEL_CONFIG until published.'
    ],
    intendedUseCases: ['Deep architectural reasoning', 'Complex multi-file refactoring', 'Security review'],
    speed: 'balanced',
    reasoningEffort: 'high',
    supportedEfforts: ['low', 'medium', 'high'],
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Calls Anthropic model claude-opus-5-5 directly.',
    configRequirement: 'ANTHROPIC_API_KEY',
    deprecationStatus: 'active'
  },
  {
    id: 'claude-haiku-5-5',
    exactModelId: 'claude-haiku-5-5',
    displayName: 'Claude Haiku 5.5',
    providerId: 'anthropic',
    family: 'claude-5',
    category: 'fast_coding',
    snapshotVersion: 'claude-haiku-5-5',
    releaseDate: '2025-05-14',
    docUrl: MODEL_CONFIG.models['claude-haiku-5-5'].sourceUrl || 'https://docs.anthropic.com/en/docs/about-claude/models',
    description: 'Anthropic Claude Haiku 5.5 high-speed model for fast coding assistance, summarization, and low-latency edits.',
    contextWindow: MODEL_CONFIG.models['claude-haiku-5-5'].contextWindow ?? 200000,
    maxOutputTokens: MODEL_CONFIG.models['claude-haiku-5-5'].maxOutputTokens ?? 64000,
    modalities: ['text', 'code', 'vision'],
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      vision: true,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: getPricingForModel('claude-haiku-5-5'),
    limitations: [
      'Requires server-side ANTHROPIC_API_KEY.',
      'Pricing is null in MODEL_CONFIG until published.'
    ],
    intendedUseCases: ['Fast coding queries', 'Quick explanations', 'High-throughput tasks'],
    speed: 'fast',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Calls Anthropic model claude-haiku-5-5 directly.',
    configRequirement: 'ANTHROPIC_API_KEY',
    deprecationStatus: 'active'
  }
];

/**
 * Returns the full catalog with live availability status based on provider API key presence.
 */
export function getAllCatalogModels(): VerifiedModel[] {
  return CATALOG_DEFINITIONS.map((m) => {
    const configured = isProviderKeyConfigured(m.providerId);
    return {
      ...m,
      availabilityStatus: configured ? 'AVAILABLE' : 'CONFIG_REQUIRED',
      availabilityDetails: configured ? m.availabilityDetails : 'Add key to enable'
    };
  });
}

/**
 * Returns gemini-4-argon plus OpenAI/Anthropic entries only when their respective API keys are configured.
 */
export function getActiveVerifiedModels(): VerifiedModel[] {
  return getAllCatalogModels().filter((m) => {
    if (m.id === 'gemini-4-argon') return true;
    return isProviderKeyConfigured(m.providerId);
  });
}

export const VERIFIED_MODELS: VerifiedModel[] = getAllCatalogModels();

export function getVerifiedModel(modelId: string): VerifiedModel | undefined {
  return getAllCatalogModels().find((m) => m.id === modelId);
}
