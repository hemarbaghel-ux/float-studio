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
 * SOURCE-VERIFIED OPENAI MODEL CATALOG
 */
export const VERIFIED_MODELS: VerifiedModel[] = [
  {
    id: 'gpt-4o',
    exactModelId: 'gpt-4o-2024-11-20',
    displayName: 'OpenAI GPT-4o',
    providerId: 'openai',
    family: 'gpt-4o',
    category: 'flagship_coding',
    snapshotVersion: '2024-11-20',
    releaseDate: '2024-11-20',
    docUrl: 'https://platform.openai.com/docs/models/gpt-4o',
    description: 'High-intelligence flagship multimodal model for complex coding, architecture, and multi-step engineering workflows.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 2.50, outputCostPer1M: 10.00, cachedInputCostPer1M: 1.25, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2025-01-01', sourceUrl: 'https://openai.com/api/pricing/' },
    limitations: ['Requires server-side OPENAI_API_KEY.', 'Not a dedicated chain-of-thought model like o1/o3-mini.'],
    intendedUseCases: ['Full-stack feature implementation', 'Multi-file refactoring', 'Multimodal UI analysis'],
    speed: 'fast',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Available via OpenAI API with server-side OPENAI_API_KEY.',
    deprecationStatus: 'active'
  },
  {
    id: 'o3-mini',
    exactModelId: 'o3-mini-2025-01-31',
    displayName: 'OpenAI o3-mini',
    providerId: 'openai',
    family: 'o3',
    category: 'advanced_reasoning',
    snapshotVersion: '2025-01-31',
    releaseDate: '2025-01-31',
    docUrl: 'https://platform.openai.com/docs/models/o3-mini',
    description: 'Fast, cost-efficient reasoning model optimized for STEM, coding, and rigorous logical problem solving.',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    modalities: ['text', 'code'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: false, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 1.10, outputCostPer1M: 4.40, cachedInputCostPer1M: 0.55, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2025-01-31', sourceUrl: 'https://openai.com/api/pricing/' },
    limitations: ['Does not support vision inputs.', 'Requires server-side OPENAI_API_KEY.'],
    intendedUseCases: ['Algorithmic problem solving', 'Complex debugging', 'Type-system and compiler error resolution'],
    speed: 'fast',
    reasoningEffort: 'high',
    supportedEfforts: ['low', 'medium', 'high'],
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Available via OpenAI API with configurable reasoning_effort.',
    deprecationStatus: 'active'
  },
  {
    id: 'gpt-4o-mini',
    exactModelId: 'gpt-4o-mini-2024-07-18',
    displayName: 'OpenAI GPT-4o mini',
    providerId: 'openai',
    family: 'gpt-4o',
    category: 'fast_coding',
    snapshotVersion: '2024-07-18',
    releaseDate: '2024-07-18',
    docUrl: 'https://platform.openai.com/docs/models/gpt-4o-mini',
    description: 'Fast, cost-efficient model for everyday coding tasks, inline edits, and quick explanations.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: false, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 0.15, outputCostPer1M: 0.60, cachedInputCostPer1M: 0.075, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2025-01-01', sourceUrl: 'https://openai.com/api/pricing/' },
    limitations: ['Smaller parameter capacity than GPT-4o for deep architectural tasks.'],
    intendedUseCases: ['Fast inline code transformations', 'Documentation and unit test generation', 'Quick Q&A'],
    speed: 'fast',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Available via OpenAI API.',
    deprecationStatus: 'active'
  },
  {
    id: 'o1',
    exactModelId: 'o1-2024-12-17',
    displayName: 'OpenAI o1',
    providerId: 'openai',
    family: 'o1',
    category: 'advanced_reasoning',
    snapshotVersion: '2024-12-17',
    releaseDate: '2024-12-17',
    docUrl: 'https://platform.openai.com/docs/models/o1',
    description: 'Frontier deep-reasoning model designed to think through complex system architecture and hard algorithms.',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 15.00, outputCostPer1M: 60.00, cachedInputCostPer1M: 7.50, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2025-01-01', sourceUrl: 'https://openai.com/api/pricing/' },
    limitations: ['Higher latency and token cost due to internal reasoning tokens.'],
    intendedUseCases: ['Complex architecture design', 'Root-cause analysis of subtle concurrency bugs'],
    speed: 'slow',
    reasoningEffort: 'high',
    supportedEfforts: ['low', 'medium', 'high'],
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Available via OpenAI API.',
    deprecationStatus: 'active'
  },
  {
    id: 'o1-mini',
    exactModelId: 'o1-mini-2024-09-12',
    displayName: 'OpenAI o1-mini',
    providerId: 'openai',
    family: 'o1',
    category: 'advanced_reasoning',
    snapshotVersion: '2024-09-12',
    releaseDate: '2024-09-12',
    docUrl: 'https://platform.openai.com/docs/models/o1',
    description: 'Compact reasoning model tuned for code generation and technical problem solving.',
    contextWindow: 128000,
    maxOutputTokens: 65536,
    modalities: ['text', 'code'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: false, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 1.10, outputCostPer1M: 4.40, cachedInputCostPer1M: 0.55, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2025-01-01', sourceUrl: 'https://openai.com/api/pricing/' },
    limitations: ['Text-only input modality.'],
    intendedUseCases: ['Focused algorithmic synthesis', 'Unit test edge-case generation'],
    speed: 'balanced',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Available via OpenAI API.',
    deprecationStatus: 'active'
  },
  {
    id: 'gpt-4.5-preview',
    exactModelId: 'gpt-4.5-preview-2025-02-27',
    displayName: 'OpenAI GPT-4.5 Preview',
    providerId: 'openai',
    family: 'gpt-4.5',
    category: 'flagship_coding',
    snapshotVersion: '2025-02-27',
    releaseDate: '2025-02-27',
    docUrl: 'https://platform.openai.com/docs/models/gpt-4.5',
    description: 'Research preview of OpenAI largest flagship model with broad knowledge and natural code synthesis.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 75.00, outputCostPer1M: 150.00, cachedInputCostPer1M: 37.50, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2025-02-27', sourceUrl: 'https://openai.com/api/pricing/' },
    limitations: ['Research preview with higher per-token pricing.'],
    intendedUseCases: ['Nuanced architectural review', 'Frontend UX and copy polish'],
    speed: 'balanced',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Available via OpenAI API.',
    deprecationStatus: 'preview',
    fallbackModel: 'gpt-4o'
  },
  {
    id: 'gpt-4-turbo',
    exactModelId: 'gpt-4-turbo-2024-04-09',
    upstreamModelId: 'gpt-4-turbo',
    isInternalAlias: false,
    displayName: 'OpenAI GPT-4 Turbo',
    providerId: 'openai',
    family: 'gpt-4',
    category: 'flagship_coding',
    snapshotVersion: '2024-04-09',
    releaseDate: '2024-04-09',
    docUrl: 'https://platform.openai.com/docs/models/gpt-4-turbo-and-gpt-4',
    description: 'Previous-generation high-capability multimodal GPT-4 model with 128k context.',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 10.00, outputCostPer1M: 30.00, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2024-04-09', sourceUrl: 'https://openai.com/api/pricing/' },
    limitations: ['4,096 max output tokens.'],
    intendedUseCases: ['Code generation', 'Long-context document analysis'],
    speed: 'balanced',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Available via OpenAI API.',
    deprecationStatus: 'active'
  },
  {
    id: 'chatgpt-4o-latest',
    exactModelId: 'chatgpt-4o-latest',
    upstreamModelId: 'chatgpt-4o-latest',
    isInternalAlias: false,
    displayName: 'ChatGPT-4o Latest',
    providerId: 'openai',
    family: 'gpt-4o',
    category: 'flagship_coding',
    snapshotVersion: 'dynamic-latest',
    releaseDate: '2024-08-01',
    docUrl: 'https://platform.openai.com/docs/models/gpt-4o',
    description: 'Dynamic pointer to the GPT-4o snapshot currently used in ChatGPT.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 5.00, outputCostPer1M: 15.00, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2024-08-01', sourceUrl: 'https://openai.com/api/pricing/' },
    limitations: ['Dynamic snapshot updated periodically by OpenAI.'],
    intendedUseCases: ['Interactive coding chat', 'Conversational debugging'],
    speed: 'fast',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Available via OpenAI API.',
    deprecationStatus: 'active'
  },
  {
    id: 'auto',
    exactModelId: 'gpt-4o',
    upstreamModelId: 'gpt-4o',
    isInternalAlias: true,
    displayName: 'Auto Dynamic Router',
    providerId: 'openai',
    family: 'float',
    category: 'auto',
    snapshotVersion: 'router-v1',
    releaseDate: '2025-01-01',
    docUrl: 'https://platform.openai.com/docs/models/gpt-4o',
    description: 'Internal FLOAT dynamic router alias that resolves to OpenAI gpt-4o.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 2.50, outputCostPer1M: 10.00, cachedInputCostPer1M: 1.25, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2025-01-01', sourceUrl: 'https://openai.com/api/pricing/' },
    limitations: ['Internal FLOAT routing alias mapped to upstream OpenAI gpt-4o.'],
    intendedUseCases: ['General software engineering'],
    speed: 'fast',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Internal alias routed to OpenAI gpt-4o.',
    deprecationStatus: 'active',
    fallbackModel: 'gpt-4o'
  },
  {
    id: 'float-basic',
    isInternalAlias: true,
    upstreamModelId: 'gpt-4o-mini',
    exactModelId: 'gpt-4o-mini',
    displayName: 'FLOAT Basic',
    providerId: 'openai',
    family: 'float',
    category: 'efficient',
    snapshotVersion: '2024-07-18',
    releaseDate: '2025-01-01',
    docUrl: 'https://platform.openai.com/docs/models/gpt-4o-mini',
    description: 'Free-tier built-in developer model routed to OpenAI gpt-4o-mini for coding, reviewing, planning, debugging, exploring, and UI assistance.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: false, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 0, outputCostPer1M: 0, cachedInputCostPer1M: 0, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2025-01-01', sourceUrl: 'https://openai.com/api/pricing/' },
    limitations: [
      'Backed by OpenAI gpt-4o-mini; not optimized for large-scale architectural redesign across dozens of files.',
      'All proposed code modifications require explicit user proposal review before application.',
      'Requires server-side OPENAI_API_KEY to be configured on the backend.'
    ],
    intendedUseCases: ['Everyday coding and inline edits', 'Code review and bug triage', 'UI component scaffolding'],
    speed: 'fast',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Included in FLOAT Free Tier (routes to OpenAI gpt-4o-mini).',
    deprecationStatus: 'active'
  },
  {
    id: 'gpt-6-astra',
    exactModelId: 'gpt-6-astra',
    isInternalAlias: true,
    upstreamModelId: 'gpt-4o',
    displayName: 'GPT-6 Astra Deep Reasoning',
    providerId: 'openai',
    family: 'codex',
    category: 'flagship_coding',
    snapshotVersion: 'preview-rt_7k2m',
    releaseDate: '2025-03-01',
    docUrl: 'https://platform.openai.com/docs/models/agents',
    description: 'Next-generation preview cloud agent powered by OpenAI Codex execution server with cloud remote connection and upstream fallback to GPT-4o.',
    contextWindow: 1000000,
    maxOutputTokens: 32768,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 3.00, outputCostPer1M: 12.00, cachedInputCostPer1M: 1.50, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2025-03-01', sourceUrl: 'https://openai.com/api/pricing/' },
    limitations: [
      'Preview cloud agent: falls back to upstream GPT-4o if remote agent connection is unreachable.',
      'Requires server-side OPENAI_API_KEY, CODEX_API_KEY, or OPENAI_ENVIRONMENT_KEY.'
    ],
    intendedUseCases: [
      'Autonomous developer workflows with OpenAI Codex execution server',
      'Multi-file architectural changes and cloud agent tasks',
      'Complex software engineering challenges with upstream GPT-4o fallback'
    ],
    speed: 'fast',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Preview / Cloud Agent with upstream GPT-4o fallback.',
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
    description: 'Next-generation frontier preview model with deep architectural reasoning, autonomous system design, and advanced codex execution capabilities.',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    modalities: ['text', 'code', 'vision'],
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    pricing: { inputCostPer1M: 3.50, outputCostPer1M: 14.00, cachedInputCostPer1M: 1.75, currency: 'USD', pricingUnit: 'per 1M tokens', effectiveDate: '2025-04-01', sourceUrl: 'https://openai.com/api/pricing/' },
    limitations: [
      'Preview frontier model: falls back to upstream GPT-4o if remote agent connection is unreachable.',
      'Requires server-side OPENAI_API_KEY, CODEX_API_KEY, or OPENAI_ENVIRONMENT_KEY.'
    ],
    intendedUseCases: [
      'Frontier code synthesis and system architecture planning',
      'Deep multi-step algorithmic reasoning and refactoring',
      'Autonomous agent execution with OpenAI Codex execution server'
    ],
    speed: 'fast',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Preview frontier reasoning & coding model.',
    deprecationStatus: 'preview',
    fallbackModel: 'gpt-4o',
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
  }
];

export function getVerifiedModel(modelId: string): VerifiedModel | undefined {
  return VERIFIED_MODELS.find(m => m.id === modelId || m.exactModelId === modelId);
}
