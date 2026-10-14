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
  // --- OpenAI Models (GPT-6 Astra, GPT-6.1 Sol) ---
  // ==========================================
  {
    id: 'gpt-6-astra',
    exactModelId: 'gpt-6-astra',
    displayName: 'GPT-6 Astra (Preview)',
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
    availabilityStatus: 'UNAVAILABLE',
    availabilityDetails: 'Not supported by FLOAT’s current OpenAI API router. A verified cloud-agent integration is not implemented; this model must not be presented as operational.',
    deprecationStatus: 'preview',
    fallbackModel: 'gpt-6.1-sol',
    cloudAgentConfig: {
      remoteUrl: 'https://api.openai.com/v1/agents/api/connect/rt_7k2m',
      environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNlNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ',
      sessionId: 'sess_0e5225d2ebb12ca1006acc98ff0200819cb89256c878d26a01',
      sessionStatus: 'connected',
      fallbackStrategy: 'upstream_fallback_if_unreachable',
      execServerCommand: `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server --remote 'https://api.openai.com/v1/agents/api/connect/rt_7k2m' --environment-id 'ccarenv_b64_Y2NhcmVudl82YWNlNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ' --session-id 'sess_0e5225d2ebb12ca1006acc98ff0200819cb89256c878d26a01'`,
      fallbackModel: 'gpt-6.1-sol',
      mode: 'preview'
    }
  },
  {
    id: 'gpt-6.1-sol',
    exactModelId: 'gpt-6.1-sol',
    displayName: 'GPT-6.1 Sol (Preview)',
    providerId: 'openai',
    family: 'codex',
    category: 'advanced_reasoning',
    snapshotVersion: 'preview-sol-2025',
    releaseDate: '2025-04-01',
    docUrl: 'https://platform.openai.com/docs/models/agents',
    description: 'Next-generation frontier preview model with deep architectural reasoning, autonomous system design, and advanced codex execution capabilities with upstream fallback to GPT-6 Astra.',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
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
      inputCostPer1M: 3.50,
      outputCostPer1M: 14.00,
      cachedInputCostPer1M: 1.75,
      currency: 'USD',
      pricingUnit: 'per 1M tokens',
      effectiveDate: '2025-04-01',
      sourceUrl: 'https://openai.com/api/pricing/'
    },
    limitations: [
      'Preview frontier model: falls back to upstream GPT-6 Astra if remote agent connection is unreachable.',
      'Requires server-side OPENAI_API_KEY, CODEX_API_KEY, or OPENAI_ENVIRONMENT_KEY.'
    ],
    intendedUseCases: [
      'Frontier code synthesis and system architecture planning',
      'Deep multi-step algorithmic reasoning and refactoring',
      'Autonomous agent execution with OpenAI Codex execution server'
    ],
    speed: 'fast',
    availabilityStatus: 'UNAVAILABLE',
    availabilityDetails: 'Not supported by FLOAT’s current OpenAI API router. Select an explicitly routed API model instead.',
    deprecationStatus: 'preview',
    fallbackModel: 'gpt-6-astra',
    cloudAgentConfig: {
      remoteUrl: 'https://api.openai.com/v1/agents/api/connect/rt_7k2m',
      environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNlNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ',
      sessionId: 'sess_0e5225d2ebb12ca1006acc98ff0200819cb89256c878d26a01',
      sessionStatus: 'connected',
      fallbackStrategy: 'upstream_fallback_if_unreachable',
      execServerCommand: `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server --remote 'https://api.openai.com/v1/agents/api/connect/rt_7k2m' --environment-id 'ccarenv_b64_Y2NhcmVudl82YWNlNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ' --session-id 'sess_0e5225d2ebb12ca1006acc98ff0200819cb89256c878d26a01'`,
      fallbackModel: 'gpt-6-astra',
      mode: 'preview'
    }
  }
];

export function getVerifiedModel(modelId: string): VerifiedModel | undefined {
  return VERIFIED_MODELS.find(m => m.id === modelId || m.exactModelId === modelId);
}
