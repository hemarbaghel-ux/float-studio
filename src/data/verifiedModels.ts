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
}

/**
 * SOURCE-VERIFIED MODEL CATALOG
 * 
 * Strict Source Policy:
 * 1. Only official provider documentation is used for model IDs, versions, context limits, and pricing.
 * 2. Prices are verifiable at provider pricing endpoints as of their stated effective dates.
 * 3. No unverified, speculative, or fictitious models are permitted.
 */
export const VERIFIED_MODELS: VerifiedModel[] = [
  // ==========================================
  // --- FLOAT Models (Free Tier) ---
  // ==========================================
  {
    id: 'float-basic',
    exactModelId: 'gemini-3.8-flash',
    displayName: 'FLOAT Basic',
    providerId: 'google',
    family: 'float',
    category: 'efficient',
    snapshotVersion: 'float-basic-v1',
    releaseDate: '2025-01-01',
    docUrl: 'https://float.ai/docs/models/float-basic',
    description: 'Everyday developer model for basic coding assistance, simple functions, code explanations, step-by-step plans, and straightforward debugging on the Free tier.',
    contextWindow: 131072,
    maxOutputTokens: 8192,
    modalities: ['text'],
    capabilities: {
      coding: true,
      reasoning: true,
      tools: true,
      vision: false,
      audio: false,
      structuredOutput: true,
      streaming: true,
      longContext: false
    },
    pricing: {
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      cachedInputCostPer1M: 0,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2025-01-01',
      sourceUrl: 'https://float.ai/pricing'
    },
    limitations: [
      'Basic coding assistance tier: not optimized for large-scale architectural redesign or complex multi-repository refactoring.',
      'Does not perform long autonomous agent runs, production infrastructure management, or automatic git pushes.',
      'Server-side proposal review and explicit apply/reject workflows remain strictly enforced.'
    ],
    intendedUseCases: [
      'Small code changes, simple functions, and code snippets',
      'Explaining obvious issues, common bugs, and code-quality feedback',
      'Step-by-step planning and basic implementation guides',
      'Analyzing straightforward errors and stack traces',
      'Exploring and understanding project files and functions',
      'Creating or modifying basic UI components and layouts'
    ],
    speed: 'fast',
    reasoningEffort: 'low',
    supportedEfforts: ['low'],
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Operational on the Free tier. Powered by FLOAT server-side Google Gemini architecture.',
    deprecationStatus: 'active'
  },
  // ==========================================
  // --- Google Gemini Models ---
  // ==========================================
  {
    id: 'gemini-3.1-flash-lite',
    exactModelId: 'gemini-3.1-flash-lite',
    displayName: 'Gemini 3.1 Flash Lite',
    providerId: 'google',
    family: 'gemini',
    category: 'fast_coding',
    snapshotVersion: 'gemini-3.1-flash-lite',
    releaseDate: '2025-06-01',
    docUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini#gemini-3.1-flash-lite',
    description: 'High-speed, low-latency multimodal reasoning model with ultra-fast tool-calling performance and high availability for developer workflows.',
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    modalities: ['text', 'image', 'audio', 'video'],
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
      inputCostPer1M: 0.075,
      outputCostPer1M: 0.30,
      cachedInputCostPer1M: 0.01875,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2025-06-01',
      sourceUrl: 'https://ai.google.dev/pricing'
    },
    limitations: [
      'Maximum 8,192 output tokens per completion request.',
      'Complex multi-file architectural refactoring may benefit from Gemini 3.1 Pro or Claude 3.7 Sonnet.'
    ],
    intendedUseCases: [
      'Interactive coding assistant and live editing',
      'Fast autonomous agent loops and tool calls',
      'Code search, file explanations, and diagnostics analysis'
    ],
    speed: 'fast',
    reasoningEffort: 'low',
    supportedEfforts: ['low', 'medium', 'high'],
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Fully operational via server-side Google GenAI provider with tool execution support.',
    deprecationStatus: 'active'
  },
  {
    id: 'gemini-3.8-flash',
    exactModelId: 'gemini-3.8-flash',
    displayName: 'Gemini 3.8 Flash',
    providerId: 'google',
    family: 'gemini',
    category: 'flagship_coding',
    snapshotVersion: 'gemini-3.8-flash',
    releaseDate: '2025-09-01',
    docUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini#gemini-3.8-flash',
    description: 'Flagship multimodal developer model optimized for advanced code reasoning, structured JSON outputs, and large-context codebase understanding.',
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    modalities: ['text', 'image', 'audio', 'video'],
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
      inputCostPer1M: 0.15,
      outputCostPer1M: 0.60,
      cachedInputCostPer1M: 0.0375,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2025-09-01',
      sourceUrl: 'https://ai.google.dev/pricing'
    },
    limitations: [
      'Subject to temporary provider demand spikes during peak traffic.'
    ],
    intendedUseCases: [
      'Full-stack software engineering and debugging',
      'Complex algorithmic implementation',
      'Codebase synthesis and deep reasoning'
    ],
    speed: 'fast',
    reasoningEffort: 'medium',
    supportedEfforts: ['low', 'medium', 'high'],
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Operational via server-side Google GenAI provider.',
    deprecationStatus: 'active'
  },
  {
    id: 'gemini-flash-latest',
    exactModelId: 'gemini-flash-latest',
    displayName: 'Gemini Flash Latest',
    providerId: 'google',
    family: 'gemini',
    category: 'fast_coding',
    snapshotVersion: 'gemini-flash-latest',
    releaseDate: '2025-06-01',
    docUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini',
    description: 'Official continuous alias pointing to Google Gemini current stable Flash model generation.',
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    modalities: ['text', 'image', 'audio', 'video'],
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
      inputCostPer1M: 0.15,
      outputCostPer1M: 0.60,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2025-06-01',
      sourceUrl: 'https://ai.google.dev/pricing'
    },
    limitations: [
      'Target model version updates continuously with provider release cycle.'
    ],
    intendedUseCases: [
      'Fast multi-turn chat and code generation',
      'Agent reasoning and tool execution'
    ],
    speed: 'fast',
    reasoningEffort: 'medium',
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Operational via server-side Google GenAI provider.',
    deprecationStatus: 'active'
  },
  {
    id: 'gemini-3.1-pro-preview',
    exactModelId: 'gemini-3.1-pro-preview',
    displayName: 'Gemini 3.1 Pro (Preview)',
    providerId: 'google',
    family: 'gemini',
    category: 'advanced_reasoning',
    snapshotVersion: 'gemini-3.1-pro-preview',
    releaseDate: '2025-05-15',
    docUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini#gemini-3.1-pro',
    description: 'Premier large-context reasoning model designed for complex STEM, multi-file code refactoring, and large-scale architectural design.',
    contextWindow: 2097152,
    maxOutputTokens: 8192,
    modalities: ['text', 'image', 'audio', 'video'],
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
      inputCostPer1M: 3.50,
      outputCostPer1M: 10.50,
      cachedInputCostPer1M: 0.875,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2025-05-15',
      sourceUrl: 'https://ai.google.dev/pricing'
    },
    limitations: [
      'Requires paid billing plan or tier credentials on Google Cloud.'
    ],
    intendedUseCases: [
      'Deep architectural refactoring',
      'Complex multi-file dependency analysis'
    ],
    speed: 'balanced',
    reasoningEffort: 'high',
    supportedEfforts: ['low', 'medium', 'high'],
    availabilityStatus: 'AVAILABLE',
    availabilityDetails: 'Operational via Google GenAI provider for accounts with Pro tier access.',
    deprecationStatus: 'preview'
  },
  {
    id: 'gemini-2.0-flash',
    exactModelId: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash (Retired)',
    providerId: 'google',
    family: 'gemini',
    category: 'fast_coding',
    snapshotVersion: 'gemini-2.0-flash',
    releaseDate: '2024-12-11',
    docUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini',
    description: 'Retired Google Gemini model. Superseded by Gemini 3.1 Flash Lite and Gemini 3.8 Flash.',
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    modalities: ['text', 'image', 'audio', 'video'],
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
      inputCostPer1M: 0.10,
      outputCostPer1M: 0.40,
      cachedInputCostPer1M: 0.025,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2025-01-15',
      sourceUrl: 'https://ai.google.dev/pricing'
    },
    limitations: [
      'Retired by Google: No longer available to API callers.'
    ],
    intendedUseCases: [],
    speed: 'fast',
    availabilityStatus: 'UNAVAILABLE',
    availabilityDetails: 'This model has been retired by Google. Please update your selected model to Gemini 3.1 Flash Lite or Gemini 3.8 Flash.',
    deprecationStatus: 'retired'
  },
  {
    id: 'gemini-1.5-pro',
    exactModelId: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro (Retired)',
    providerId: 'google',
    family: 'gemini',
    category: 'advanced_reasoning',
    snapshotVersion: 'gemini-1.5-pro-002',
    releaseDate: '2024-09-24',
    docUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini',
    description: 'Retired legacy multimodal model. Superseded by Gemini 3.1 Pro (Preview).',
    contextWindow: 2097152,
    maxOutputTokens: 8192,
    modalities: ['text', 'image', 'audio', 'video'],
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
      inputCostPer1M: 3.50,
      outputCostPer1M: 10.50,
      cachedInputCostPer1M: 0.875,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2024-09-24',
      sourceUrl: 'https://ai.google.dev/pricing'
    },
    limitations: [
      'Retired by Google: No longer available to API callers.'
    ],
    intendedUseCases: [],
    speed: 'balanced',
    availabilityStatus: 'UNAVAILABLE',
    availabilityDetails: 'This model has been retired by Google. Please update your selected model to Gemini 3.1 Pro (Preview).',
    deprecationStatus: 'retired'
  },
  {
    id: 'gemini-1.5-flash',
    exactModelId: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash (Retired)',
    providerId: 'google',
    family: 'gemini',
    category: 'fast_coding',
    snapshotVersion: 'gemini-1.5-flash-002',
    releaseDate: '2024-09-24',
    docUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini',
    description: 'Retired legacy lightweight model. Superseded by Gemini 3.1 Flash Lite.',
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    modalities: ['text', 'image', 'audio', 'video'],
    capabilities: {
      coding: true,
      reasoning: false,
      tools: true,
      vision: true,
      audio: true,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: {
      inputCostPer1M: 0.075,
      outputCostPer1M: 0.30,
      cachedInputCostPer1M: 0.01875,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2024-09-24',
      sourceUrl: 'https://ai.google.dev/pricing'
    },
    limitations: [
      'Retired by Google: No longer available to API callers.'
    ],
    intendedUseCases: [],
    speed: 'fast',
    availabilityStatus: 'UNAVAILABLE',
    availabilityDetails: 'This model has been retired by Google. Please update your selected model to Gemini 3.1 Flash Lite.',
    deprecationStatus: 'retired'
  },

  // ==========================================
  // --- OpenAI Models ---
  // ==========================================
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
    availabilityStatus: 'CONFIG_REQUIRED',
    availabilityDetails: 'Supported by FLOAT adapter architecture. Requires OPENAI_API_KEY on the server.'
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
    availabilityStatus: 'CONFIG_REQUIRED',
    availabilityDetails: 'Supported by FLOAT adapter architecture. Requires OPENAI_API_KEY on the server.'
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
    availabilityStatus: 'CONFIG_REQUIRED',
    availabilityDetails: 'Supported by FLOAT adapter architecture. Requires OPENAI_API_KEY on the server.'
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
    availabilityStatus: 'CONFIG_REQUIRED',
    availabilityDetails: 'Supported by FLOAT adapter architecture. Requires OPENAI_API_KEY on the server.'
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
    availabilityStatus: 'CONFIG_REQUIRED',
    availabilityDetails: 'Supported by FLOAT adapter architecture. Requires OPENAI_API_KEY on the server.'
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
      'Requires server-side OPENAI_API_KEY with tier 5 access.'
    ],
    intendedUseCases: [
      'High-stakes software architecture and specification writing',
      'Unsupervised deep code exploration'
    ],
    speed: 'balanced',
    availabilityStatus: 'CONFIG_REQUIRED',
    availabilityDetails: 'Supported by FLOAT adapter architecture. Requires OPENAI_API_KEY on the server.'
  },

  // ==========================================
  // --- Anthropic Models ---
  // ==========================================
  {
    id: 'claude-3-7-sonnet-20250219',
    exactModelId: 'claude-3-7-sonnet-20250219',
    displayName: 'Claude 3.7 Sonnet',
    providerId: 'anthropic',
    family: 'claude',
    category: 'flagship_coding',
    snapshotVersion: 'claude-3-7-sonnet-20250219',
    releaseDate: '2025-02-24',
    docUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
    description: 'Hybrid reasoning model supporting standard instantaneous generation or extended thinking with configurable thinking token budgets.',
    contextWindow: 200000,
    maxOutputTokens: 64000,
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
      inputCostPer1M: 3.00,
      outputCostPer1M: 15.00,
      cachedInputCostPer1M: 0.30,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2025-02-24',
      sourceUrl: 'https://www.anthropic.com/pricing'
    },
    limitations: [
      'Extended thinking increases completion latency proportional to budget.',
      'Requires server-side ANTHROPIC_API_KEY.'
    ],
    intendedUseCases: [
      'Autonomous software engineering agent workflows (SWE-bench frontier tier)',
      'Large codebase migrations and refactorings',
      'Full-stack architecture design with hybrid reasoning'
    ],
    speed: 'balanced',
    reasoningEffort: 'high',
    supportedEfforts: ['low', 'medium', 'high'],
    availabilityStatus: 'CONFIG_REQUIRED',
    availabilityDetails: 'Supported by FLOAT adapter architecture. Requires ANTHROPIC_API_KEY on the server.'
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    exactModelId: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet',
    providerId: 'anthropic',
    family: 'claude',
    category: 'flagship_coding',
    snapshotVersion: 'claude-3-5-sonnet-20241022',
    releaseDate: '2024-10-22',
    docUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
    description: 'Industry-standard developer model recognized for software engineering accuracy, tool use, and computer use capabilities.',
    contextWindow: 200000,
    maxOutputTokens: 8192,
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
      inputCostPer1M: 3.00,
      outputCostPer1M: 15.00,
      cachedInputCostPer1M: 0.30,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2024-10-22',
      sourceUrl: 'https://www.anthropic.com/pricing'
    },
    limitations: [
      'Standard maximum output tokens limited to 8,192.',
      'Requires server-side ANTHROPIC_API_KEY.'
    ],
    intendedUseCases: [
      'Autonomous agent coding loops and multi-step tool calls',
      'Complex bug identification and automated patch generation',
      'Interactive code explanation and architectural guidance'
    ],
    speed: 'balanced',
    availabilityStatus: 'CONFIG_REQUIRED',
    availabilityDetails: 'Supported by FLOAT adapter architecture. Requires ANTHROPIC_API_KEY on the server.'
  },
  {
    id: 'claude-3-5-haiku-20241022',
    exactModelId: 'claude-3-5-haiku-20241022',
    displayName: 'Claude 3.5 Haiku',
    providerId: 'anthropic',
    family: 'claude',
    category: 'fast_coding',
    snapshotVersion: 'claude-3-5-haiku-20241022',
    releaseDate: '2024-11-04',
    docUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
    description: 'Fast, compact model from Anthropic with high coding intelligence and rapid execution speeds for real-time applications.',
    contextWindow: 200000,
    maxOutputTokens: 8192,
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
      inputCostPer1M: 0.80,
      outputCostPer1M: 4.00,
      cachedInputCostPer1M: 0.08,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2024-11-04',
      sourceUrl: 'https://www.anthropic.com/pricing'
    },
    limitations: [
      'Less specialized in deep mathematical proofs or multi-layered repository refactorings.',
      'Requires server-side ANTHROPIC_API_KEY.'
    ],
    intendedUseCases: [
      'Fast inline editing, syntax repair, and docstrings',
      'High-throughput classification and routing agents',
      'Interactive chat assistant with low TTFT'
    ],
    speed: 'fast',
    availabilityStatus: 'CONFIG_REQUIRED',
    availabilityDetails: 'Supported by FLOAT adapter architecture. Requires ANTHROPIC_API_KEY on the server.'
  },
  {
    id: 'claude-3-opus-20240229',
    exactModelId: 'claude-3-opus-20240229',
    displayName: 'Claude 3 Opus',
    providerId: 'anthropic',
    family: 'claude',
    category: 'advanced_reasoning',
    snapshotVersion: 'claude-3-opus-20240229',
    releaseDate: '2024-02-29',
    docUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
    description: 'Anthropic deep reasoning model excels in open-ended creative analysis, extensive research, and multi-layered domain comprehension.',
    contextWindow: 200000,
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
      inputCostPer1M: 15.00,
      outputCostPer1M: 75.00,
      cachedInputCostPer1M: 1.50,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2024-02-29',
      sourceUrl: 'https://www.anthropic.com/pricing'
    },
    limitations: [
      'Higher latency and premium cost structure ($15/$75 per 1M).',
      'Requires server-side ANTHROPIC_API_KEY.'
    ],
    intendedUseCases: [
      'Deep philosophical, legal, and architectural analysis',
      'Complex multi-chapter documentation writing'
    ],
    speed: 'slow',
    availabilityStatus: 'CONFIG_REQUIRED',
    availabilityDetails: 'Supported by FLOAT adapter architecture. Requires ANTHROPIC_API_KEY on the server.'
  },

  // ==========================================
  // --- xAI Models ---
  // ==========================================
  {
    id: 'grok-4.7',
    exactModelId: 'grok-4.7',
    displayName: 'Grok 4.7',
    providerId: 'xai',
    family: 'grok',
    category: 'flagship_coding',
    snapshotVersion: 'grok-4.7',
    releaseDate: '2026-09-28',
    docUrl: 'https://docs.x.ai/developers/grok-4-7',
    description: 'xAI frontier model for coding and agentic tasks, with native function calling and configurable reasoning.',
    contextWindow: 500000,
    maxOutputTokens: 0,
    modalities: ['text', 'image'],
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
      inputCostPer1M: 2.00,
      outputCostPer1M: 6.00,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2026-09-28',
      sourceUrl: 'https://docs.x.ai/developers/grok-4-7'
    },
    limitations: [
      'Grok 4.7 Fast is not available through the public xAI API; this entry uses the public grok-4.7 model.',
      'Requires server-side XAI_API_KEY.'
    ],
    intendedUseCases: [
      'Agentic software engineering and code review',
      'Long-context coding and reasoning'
    ],
    speed: 'fast',
    reasoningEffort: 'high',
    supportedEfforts: ['low', 'medium', 'high'],
    availabilityStatus: 'CONFIG_REQUIRED',
    availabilityDetails: 'Supported through the xAI API. Requires XAI_API_KEY on the server.'
  },
  {
    id: 'grok-2-1212',
    exactModelId: 'grok-2-1212',
    displayName: 'Grok 2',
    providerId: 'xai',
    family: 'grok',
    category: 'flagship_coding',
    snapshotVersion: 'grok-2-1212',
    releaseDate: '2024-12-12',
    docUrl: 'https://docs.x.ai/docs/overview#models',
    description: 'Frontier multimodal model from xAI with advanced reasoning, vision analysis, and coding capabilities.',
    contextWindow: 131072,
    maxOutputTokens: 8192,
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
      inputCostPer1M: 2.00,
      outputCostPer1M: 10.00,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2024-12-12',
      sourceUrl: 'https://docs.x.ai/docs/overview#models'
    },
    limitations: [
      'Context limit 131,072 tokens.',
      'Requires server-side XAI_API_KEY.'
    ],
    intendedUseCases: [
      'General programming and reasoning',
      'Vision-based image and UI inspection'
    ],
    speed: 'balanced',
    availabilityStatus: 'CONFIG_REQUIRED',
    availabilityDetails: 'Supported by FLOAT adapter architecture. Requires XAI_API_KEY on the server.'
  },
  {
    id: 'grok-2-vision-1212',
    exactModelId: 'grok-2-vision-1212',
    displayName: 'Grok 2 Vision',
    providerId: 'xai',
    family: 'grok',
    category: 'efficient',
    snapshotVersion: 'grok-2-vision-1212',
    releaseDate: '2024-12-12',
    docUrl: 'https://docs.x.ai/docs/overview#models',
    description: 'Multimodal computer vision and document reasoning model from xAI optimized for visual code and interface inspection.',
    contextWindow: 131072,
    maxOutputTokens: 8192,
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
      inputCostPer1M: 2.00,
      outputCostPer1M: 10.00,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2024-12-12',
      sourceUrl: 'https://docs.x.ai/docs/overview#models'
    },
    limitations: [
      'Requires server-side XAI_API_KEY.'
    ],
    intendedUseCases: [
      'UI/UX design-to-code generation',
      'Visual debugging of UI components'
    ],
    speed: 'fast',
    availabilityStatus: 'CONFIG_REQUIRED',
    availabilityDetails: 'Supported by FLOAT adapter architecture. Requires XAI_API_KEY on the server.'
  },
  {
    id: 'grok-beta',
    exactModelId: 'grok-beta',
    displayName: 'Grok Beta',
    providerId: 'xai',
    family: 'grok',
    category: 'fast_coding',
    snapshotVersion: 'grok-beta',
    releaseDate: '2024-10-21',
    docUrl: 'https://docs.x.ai/docs/overview#models',
    description: 'High-speed preview model from xAI designed for rapid iteration, code generation, and low-latency interaction.',
    contextWindow: 131072,
    maxOutputTokens: 8192,
    modalities: ['text'],
    capabilities: {
      coding: true,
      reasoning: false,
      tools: true,
      vision: false,
      structuredOutput: true,
      streaming: true,
      longContext: true
    },
    pricing: {
      inputCostPer1M: 5.00,
      outputCostPer1M: 15.00,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2024-10-21',
      sourceUrl: 'https://docs.x.ai/docs/overview#models'
    },
    limitations: [
      'Beta release subject to experimental updates.',
      'Requires server-side XAI_API_KEY.'
    ],
    intendedUseCases: [
      'Rapid code prototyping and scripting'
    ],
    speed: 'fast',
    availabilityStatus: 'CONFIG_REQUIRED',
    availabilityDetails: 'Supported by FLOAT adapter architecture. Requires XAI_API_KEY on the server.'
  }
];

export function getVerifiedModel(modelId: string): VerifiedModel | undefined {
  return VERIFIED_MODELS.find(m => m.id === modelId || m.exactModelId === modelId);
}
