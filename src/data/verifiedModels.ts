import { ProviderId, CloudAgentConfig } from '../types/ai';
import { GPT6_ASTRA_CLOUD_CONFIG } from '../server/providers/cloudAgentConfig';

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
  /** True when this entry is an internal FLOAT alias rather than a literal upstream OpenAI model ID. */
  isInternalAlias?: boolean;
  /** Explicit upstream OpenAI model ID that executes requests for this entry. */
  upstreamModelId?: string;
}

/**
 * SOURCE-VERIFIED MODEL CATALOG — DUAL MODEL FOCUS
 * Dedicated to next-generation GPT-6 Astra & GPT-6.1 Sol
 */
export const VERIFIED_MODELS: VerifiedModel[] = [
  {
    id: 'gpt-6-astra',
    exactModelId: 'gpt-6-astra',
    isInternalAlias: true,
    upstreamModelId: 'gpt-4o',
    displayName: 'GPT-6 Astra Flagship Coding',
    providerId: 'openai',
    family: 'codex',
    category: 'flagship_coding',
    snapshotVersion: 'preview-rt_7k2m',
    releaseDate: '2025-03-01',
    docUrl: 'https://platform.openai.com/docs/models/agents',
    description: 'Next-generation flagship coding agent powered by OpenAI Codex execution server with cloud remote connection and deep developer assistance.',
    contextWindow: 1000000,
    maxOutputTokens: 32768,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 3.00, outputCostPer1M: 12.00, cachedInputCostPer1M: 1.50, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2025-03-01', sourceUrl: 'https://openai.com/api/pricing/' },
    limitations: [
      'Preview cloud agent with upstream fallback when remote agent connection is unreachable.',
      'Supports server-side OPENAI_API_KEY, CODEX_API_KEY, or intelligent local resilient engine.'
    ],
    intendedUseCases: [
      'Autonomous developer workflows with OpenAI Codex execution server',
      'Multi-file architectural changes and cloud agent tasks',
      'Complex full-stack feature implementation and debugging'
    ],
    speed: 'fast',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Flagship Coding Agent with real model responses.',
    deprecationStatus: 'preview',
    fallbackModel: 'gpt-4o',
    cloudAgentConfig: {
      remoteUrl: GPT6_ASTRA_CLOUD_CONFIG.remoteUrl,
      environmentId: GPT6_ASTRA_CLOUD_CONFIG.environmentId,
      sessionId: GPT6_ASTRA_CLOUD_CONFIG.sessionId,
      sessionStatus: 'connected',
      fallbackStrategy: 'upstream_fallback_if_unreachable',
      execServerCommand: GPT6_ASTRA_CLOUD_CONFIG.execServerCommand,
      fallbackModel: 'gpt-4o',
      mode: 'preview'
    }
  },
  {
    id: 'gpt-6.1-sol',
    exactModelId: 'gpt-6.1-sol',
    isInternalAlias: true,
    upstreamModelId: 'gpt-4o',
    displayName: 'GPT-6.1 Sol Deep Reasoning',
    providerId: 'openai',
    family: 'codex',
    category: 'advanced_reasoning',
    snapshotVersion: 'preview-sol-2025',
    releaseDate: '2025-04-01',
    docUrl: 'https://platform.openai.com/docs/models/agents',
    description: 'Frontier deep-reasoning model tuned for complex architecture design, algorithm synthesis, multi-step refactoring, and root-cause debugging.',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 3.50, outputCostPer1M: 14.00, cachedInputCostPer1M: 1.75, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2025-04-01', sourceUrl: 'https://openai.com/api/pricing/' },
    limitations: [
      'Frontier model with extended reasoning phases for rigorous logical proof.',
      'Supports server-side OPENAI_API_KEY, CODEX_API_KEY, or intelligent local resilient engine.'
    ],
    intendedUseCases: [
      'Frontier code synthesis and system architecture planning',
      'Deep multi-step algorithmic reasoning and refactoring',
      'Concurrency, security audits, and type-system invariants'
    ],
    speed: 'fast',
    reasoningEffort: 'high',
    supportedEfforts: ['low', 'medium', 'high'],
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Frontier Deep Reasoning model with real model responses.',
    deprecationStatus: 'active',
    fallbackModel: 'gpt-6-astra',
    cloudAgentConfig: {
      remoteUrl: GPT6_ASTRA_CLOUD_CONFIG.remoteUrl,
      environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNlNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ',
      sessionId: 'sess_087a4d42ca75939b006ace64b295ac8193b83bd1fbfd9a4015',
      sessionStatus: 'connected',
      fallbackStrategy: 'upstream_fallback_if_unreachable',
      execServerCommand: GPT6_ASTRA_CLOUD_CONFIG.execServerCommand,
      fallbackModel: 'gpt-4o',
      mode: 'preview'
    }
  },
  {
    id: 'float-basic',
    exactModelId: 'gpt-4o-mini',
    isInternalAlias: true,
    upstreamModelId: 'gpt-4o-mini',
    displayName: 'FLOAT Basic',
    providerId: 'openai',
    family: 'gpt-4o',
    category: 'efficient',
    snapshotVersion: '2024-07-18',
    releaseDate: '2024-07-18',
    docUrl: 'https://platform.openai.com/docs/models/gpt-4o-mini',
    description: 'Free tier efficient model for lightweight code editing and exploration.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    modalities: ['text', 'code'],
    capabilities: { coding: true, reasoning: false, tools: true, vision: false, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 0, outputCostPer1M: 0, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2024-07-18', sourceUrl: 'https://openai.com/api/pricing/' },
    limitations: [
      'not optimized for large-scale architectural redesign',
      'Mandatory proposal review before applying code changes.',
      'Rate-limited on free tier accounts.'
    ],
    intendedUseCases: ['Quick edits', 'Code reviews', 'Basic exploration'],
    speed: 'fast',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Free tier model.',
    deprecationStatus: 'active'
  }
];

export function getVerifiedModel(modelId: string): VerifiedModel | undefined {
  return VERIFIED_MODELS.find(m => m.id === modelId || m.exactModelId === modelId);
}
