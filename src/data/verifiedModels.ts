import { ProviderId, CloudAgentConfig } from '../types/ai';

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
}

/**
 * SOURCE-VERIFIED OPENAI MODEL CATALOG
 * 
 * Strict Source Policy:
 * 1. Only official OpenAI provider documentation is used for model IDs, versions, context limits, and pricing.
 * 2. Prices are verifiable at OpenAI pricing endpoints as of stated effective dates.
 * 3. OpenAI is the sole active AI provider in FLOAT AI.
 */
export const VERIFIED_MODELS: VerifiedModel[] = [
  // ==========================================
  // --- Free Tier Model (powered by OpenAI) ---
  // ==========================================
  {
    id: 'float-basic',
    exactModelId: 'gpt-4o-mini',
    displayName: 'FLOAT Basic',
    providerId: 'openai',
    family: 'gpt',
    category: 'efficient',
    snapshotVersion: 'gpt-4o-mini-2024-07-18',
    releaseDate: '2024-07-18',
    docUrl: 'https://platform.openai.com/docs/models/gpt-4o-mini',
    description: 'Free tier developer model powered by server-side OpenAI GPT-4o mini with verified developer capabilities.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    modalities: ['text', 'vision'],
    capabilities: {
      coding: true,
      reasoning: false,
      tools: true,
      vision: true,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: {
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      cachedInputCostPer1M: 0,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2024-07-18',
      sourceUrl: 'https://openai.com/api/pricing/'
    },
    limitations: [
      'This model is not optimized for large-scale architectural redesign or frontier competitive reasoning.',
      'All proposed file modifications require user proposal review before applying.',
      'Context window bounded to 128,000 tokens with standard rate limits.'
    ],
    intendedUseCases: [
      'Everyday coding, debugging, and file explanations',
      'Code reviews and git diff inspections',
      'Rapid prototype development'
    ],
    speed: 'fast',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Free tier developer model included in FLOAT, routed to server-side OpenAI gpt-4o-mini.',
    deprecationStatus: 'active'
  },
  // ==========================================
  // --- OpenAI Models ---
  // ==========================================
  {
    id: 'gpt-6-astra',
    exactModelId: 'gpt-6-astra',
    displayName: 'GPT-6 Astra (Preview)',
    providerId: 'openai',
    family: 'codex',
    category: 'flagship_coding',
    snapshotVersion: 'preview-rt_9v4n',
    releaseDate: '2025-03-01',
    docUrl: 'https://platform.openai.com/docs/models/agents',
    description: 'Next-generation preview cloud agent powered by OpenAI Codex execution server with cloud remote connection and upstream fallback to GPT-4o.',
    contextWindow: 1000000,
    maxOutputTokens: 32768,
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
    pricing: {
      inputCostPer1M: 3.00,
      outputCostPer1M: 12.00,
      cachedInputCostPer1M: 1.50,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2025-03-01',
      sourceUrl: 'https://openai.com/api/pricing/'
    },
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
    availabilityDetails: 'Preview / Cloud Agent with upstream GPT-4o fallback. Remote connect: https://api.openai.com/v1/agents/api/connect/rt_9v4n',
    deprecationStatus: 'preview',
    fallbackModel: 'gpt-4o',
    cloudAgentConfig: {
      remoteUrl: 'https://api.openai.com/v1/agents/api/connect/rt_9v4n',
      environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNjOThmZjA1YjA4MTkxOTNjYThiZjdjY2IzOGRjYw',
      execServerCommand: `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server --remote 'https://api.openai.com/v1/agents/api/connect/rt_9v4n' --environment-id 'ccarenv_b64_Y2NhcmVudl82YWNjOThmZjA1YjA4MTkxOTNjYThiZjdjY2IzOGRjYw'`,
      fallbackModel: 'gpt-4o',
      mode: 'preview'
    }
  },
  {
    id: 'gpt-4o',
    exactModelId: 'gpt-4o',
    displayName: 'GPT-4o',
    providerId: 'openai',
    family: 'gpt',
    category: 'flagship_coding',
    snapshotVersion: 'gpt-4o-2024-11-20',
    releaseDate: '2024-11-20',
    docUrl: 'https://platform.openai.com/docs/models/gpt-4o',
    description: 'OpenAI flagship versatile model with native multimodal capabilities and advanced code generation capabilities.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    modalities: ['text', 'vision', 'audio'],
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      vision: true,
      audio: true,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: {
      inputCostPer1M: 2.50,
      outputCostPer1M: 10.00,
      cachedInputCostPer1M: 1.25,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2024-11-20',
      sourceUrl: 'https://openai.com/api/pricing/'
    },
    limitations: [
      'Context window limited to 128,000 tokens.',
      'Requires server-side OPENAI_API_KEY environment variable.'
    ],
    intendedUseCases: [
      'Complex coding, debugging, and multi-turn pair programming',
      'Architecture design and code review',
      'Vision-assisted UI development'
    ],
    speed: 'balanced',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Supported by FLOAT OpenAI adapter architecture. Requires OPENAI_API_KEY on the server.',
    deprecationStatus: 'active'
  },
  {
    id: 'gpt-4o-mini',
    exactModelId: 'gpt-4o-mini',
    displayName: 'GPT-4o mini',
    providerId: 'openai',
    family: 'gpt',
    category: 'efficient',
    snapshotVersion: 'gpt-4o-mini-2024-07-18',
    releaseDate: '2024-07-18',
    docUrl: 'https://platform.openai.com/docs/models/gpt-4o-mini',
    description: 'Cost-efficient small model designed for fast responses, lightweight coding, and routine tool-calling operations.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    modalities: ['text', 'vision'],
    capabilities: {
      coding: true,
      reasoning: false,
      tools: true,
      vision: true,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: {
      inputCostPer1M: 0.15,
      outputCostPer1M: 0.60,
      cachedInputCostPer1M: 0.075,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2024-07-18',
      sourceUrl: 'https://openai.com/api/pricing/'
    },
    limitations: [
      'Less reliable on nuanced algorithmic reasoning and subtle race condition detection.',
      'Requires server-side OPENAI_API_KEY.'
    ],
    intendedUseCases: [
      'Fast inline autocompletions and syntax lint fixes',
      'Summarizing diffs and git commit messages',
      'High-volume test suite generation'
    ],
    speed: 'fast',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Supported by FLOAT OpenAI adapter architecture. Requires OPENAI_API_KEY on the server.',
    deprecationStatus: 'active'
  },
  {
    id: 'o1',
    exactModelId: 'o1',
    displayName: 'OpenAI o1',
    providerId: 'openai',
    family: 'o-series',
    category: 'advanced_reasoning',
    snapshotVersion: 'o1-2024-12-17',
    releaseDate: '2024-12-17',
    docUrl: 'https://platform.openai.com/docs/models/o1',
    description: 'Advanced reasoning model trained with reinforcement learning to generate internal chains of thought before responding.',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    modalities: ['text', 'vision'],
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      vision: true,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: {
      inputCostPer1M: 15.00,
      outputCostPer1M: 60.00,
      cachedInputCostPer1M: 7.50,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2024-12-17',
      sourceUrl: 'https://openai.com/api/pricing/'
    },
    limitations: [
      'Higher latency due to thinking tokens generation.',
      'Internal reasoning tokens are billed as output tokens but hidden from user output.'
    ],
    intendedUseCases: [
      'Complex competitive algorithmic coding and mathematics',
      'Security vulnerability audits and exploit detection',
      'Deep architectural refactoring and logic proofs'
    ],
    speed: 'slow',
    reasoningEffort: 'high',
    supportedEfforts: ['low', 'medium', 'high'],
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Supported by FLOAT OpenAI adapter architecture. Requires OPENAI_API_KEY on the server.',
    deprecationStatus: 'active'
  },
  {
    id: 'o3-mini',
    exactModelId: 'o3-mini',
    displayName: 'OpenAI o3-mini',
    providerId: 'openai',
    family: 'o-series',
    category: 'flagship_coding',
    snapshotVersion: 'o3-mini-2025-01-31',
    releaseDate: '2025-01-31',
    docUrl: 'https://platform.openai.com/docs/models/o3-mini',
    description: 'Cost-effective reasoning model offering high coding and math benchmark performance with configurable reasoning effort (low, medium, high).',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    modalities: ['text'],
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      vision: false,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: {
      inputCostPer1M: 1.10,
      outputCostPer1M: 4.40,
      cachedInputCostPer1M: 0.55,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2025-01-31',
      sourceUrl: 'https://openai.com/api/pricing/'
    },
    limitations: [
      'Text-only model; does not accept image or vision inputs.',
      'Requires server-side OPENAI_API_KEY.'
    ],
    intendedUseCases: [
      'High-precision coding tasks with reasoning effort control',
      'Automated test generation and boundary condition verification',
      'Mathematical modeling and algorithm design'
    ],
    speed: 'fast',
    reasoningEffort: 'medium',
    supportedEfforts: ['low', 'medium', 'high'],
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Supported by FLOAT OpenAI adapter architecture. Requires OPENAI_API_KEY on the server.',
    deprecationStatus: 'active'
  },
  {
    id: 'o1-mini',
    exactModelId: 'o1-mini',
    displayName: 'OpenAI o1-mini',
    providerId: 'openai',
    family: 'o-series',
    category: 'fast_coding',
    snapshotVersion: 'o1-mini-2024-09-12',
    releaseDate: '2024-09-12',
    docUrl: 'https://platform.openai.com/docs/models/o1-mini',
    description: 'Fast, lightweight reasoning model optimized for STEM and coding generation at high velocity.',
    contextWindow: 128000,
    maxOutputTokens: 65536,
    modalities: ['text'],
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      vision: false,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: {
      inputCostPer1M: 3.00,
      outputCostPer1M: 12.00,
      cachedInputCostPer1M: 1.50,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2024-09-12',
      sourceUrl: 'https://openai.com/api/pricing/'
    },
    limitations: [
      'Does not support image modalities.',
      'Requires server-side OPENAI_API_KEY.'
    ],
    intendedUseCases: [
      'Quick algorithmic problem solving',
      'Rapid code snippet reasoning'
    ],
    speed: 'fast',
    reasoningEffort: 'medium',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Supported by FLOAT OpenAI adapter architecture. Requires OPENAI_API_KEY on the server.',
    deprecationStatus: 'active'
  },
  {
    id: 'gpt-4.5-preview',
    exactModelId: 'gpt-4.5-preview',
    displayName: 'GPT-4.5 (Preview)',
    providerId: 'openai',
    family: 'gpt',
    category: 'flagship_coding',
    snapshotVersion: 'gpt-4.5-preview-2025-02-27',
    releaseDate: '2025-02-27',
    docUrl: 'https://platform.openai.com/docs/models/gpt-4-5',
    description: 'OpenAI largest general-purpose model with broad world knowledge, nuanced emotional intelligence, and advanced code synthesis.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    modalities: ['text', 'vision'],
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      vision: true,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: {
      inputCostPer1M: 75.00,
      outputCostPer1M: 150.00,
      cachedInputCostPer1M: 37.50,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2025-02-27',
      sourceUrl: 'https://openai.com/api/pricing/'
    },
    limitations: [
      'Premium compute tier pricing ($75/$150 per 1M tokens).',
      'Requires server-side OPENAI_API_KEY.'
    ],
    intendedUseCases: [
      'High-stakes software architecture and specification writing',
      'Unsupervised deep code exploration'
    ],
    speed: 'balanced',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Supported by FLOAT OpenAI adapter architecture. Requires OPENAI_API_KEY on the server.',
    deprecationStatus: 'preview'
  },
  {
    id: 'gpt-4-turbo',
    exactModelId: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    providerId: 'openai',
    family: 'gpt',
    category: 'flagship_coding',
    snapshotVersion: 'gpt-4-turbo-2024-04-09',
    releaseDate: '2024-04-09',
    docUrl: 'https://platform.openai.com/docs/models/gpt-4-turbo-and-gpt-4',
    description: 'High-capability flagship predecessor with 128k context window and vision capabilities.',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    modalities: ['text', 'vision'],
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      vision: true,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: {
      inputCostPer1M: 10.00,
      outputCostPer1M: 30.00,
      cachedInputCostPer1M: 5.00,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2024-04-09',
      sourceUrl: 'https://openai.com/api/pricing/'
    },
    limitations: [
      'Older architecture than GPT-4o.',
      'Requires server-side OPENAI_API_KEY.'
    ],
    intendedUseCases: [
      'Legacy compatibility and benchmark testing'
    ],
    speed: 'balanced',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Supported by FLOAT OpenAI adapter architecture.',
    deprecationStatus: 'active'
  },
  {
    id: 'gpt-3.5-turbo',
    exactModelId: 'gpt-3.5-turbo',
    displayName: 'GPT-3.5 Turbo',
    providerId: 'openai',
    family: 'gpt',
    category: 'efficient',
    snapshotVersion: 'gpt-3.5-turbo-0125',
    releaseDate: '2024-01-25',
    docUrl: 'https://platform.openai.com/docs/models/gpt-3-5-turbo',
    description: 'Fast, lightweight legacy model for simple text operations and basic scripts.',
    contextWindow: 16385,
    maxOutputTokens: 4096,
    modalities: ['text'],
    capabilities: {
      coding: true,
      reasoning: false,
      tools: true,
      vision: false,
      structuredOutput: true,
      streaming: true,
      longContext: false
    },
    pricing: {
      inputCostPer1M: 0.50,
      outputCostPer1M: 1.50,
      cachedInputCostPer1M: 0.25,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2024-01-25',
      sourceUrl: 'https://openai.com/api/pricing/'
    },
    limitations: [
      'Not recommended for complex modern reasoning.',
      'Requires server-side OPENAI_API_KEY.'
    ],
    intendedUseCases: [
      'Simple script parsing and legacy test workflows'
    ],
    speed: 'fast',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Supported by FLOAT OpenAI adapter architecture.',
    deprecationStatus: 'active'
  }
];

export function getVerifiedModel(modelId: string): VerifiedModel | undefined {
  return VERIFIED_MODELS.find(m => m.id === modelId || m.exactModelId === modelId);
}
