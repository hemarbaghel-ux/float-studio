import { AIModel } from '../../types/ai';
import { GPT6_ASTRA_CLOUD_CONFIG } from '../../data/cloudAgentConstants';
import { MODEL_CONFIG, isProviderKeyConfigured } from '../../data/verifiedModels';

/**
 * Verified flagship models in the FLOAT AI workspace selector.
 * Every model entry uses its exact upstream API model ID (zero aliases).
 */
export const DASHBOARD_MODELS: AIModel[] = [
  {
    id: 'gemini-4-argon',
    exactModelId: 'gemini-4-argon',
    displayName: 'Gemini 4 Argon',
    shortName: 'Gemini 4 Argon',
    provider: 'Google Gemini',
    providerId: 'google',
    family: 'gemini-4',
    isNew: true,
    description: 'Google flagship coding and deep reasoning model with 1M token context and 1M token output capacity.',
    contextWindow: MODEL_CONFIG.models['gemini-4-argon'].contextWindow ?? 1000000,
    version: 'gemini-4-argon',
    reasoningLevel: 'High',
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    capabilitiesList: ['Coding', 'Reasoning', 'Tool use', 'Vision'],
    status: isProviderKeyConfigured('google') ? 'AVAILABLE' : 'CONFIG_REQUIRED',
    speed: 'fast',
    apiModelId: 'gemini-4-argon',
    fallbackModel: 'gpt-6-astra',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    availability: isProviderKeyConfigured('google') ? 'Available' : 'Add key to enable',
    pricing: {
      inputCost: MODEL_CONFIG.models['gemini-4-argon'].inputCostPer1M as any,
      outputCost: MODEL_CONFIG.models['gemini-4-argon'].outputCostPer1M as any,
      currency: MODEL_CONFIG.currency,
      effectiveDate: MODEL_CONFIG.effectiveDate
    },
    limits: {
      maxOutputTokens: MODEL_CONFIG.models['gemini-4-argon'].maxOutputTokens ?? 1000000
    }
  },
  {
    id: 'gpt-6-astra',
    exactModelId: 'gpt-6-astra',
    displayName: 'GPT-6 Astra Flagship Coding',
    shortName: 'GPT-6 Astra',
    provider: 'OpenAI',
    providerId: 'openai',
    family: 'codex',
    tier: 'Preview',
    description: 'Next-generation flagship coding agent powered by OpenAI Codex execution server with cloud remote connection and deep developer assistance.',
    contextWindow: MODEL_CONFIG.models['gpt-6-astra'].contextWindow ?? 1000000,
    version: 'gpt-6-astra',
    reasoningLevel: 'Balanced',
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    capabilitiesList: ['Coding', 'Reasoning', 'Tool use', 'Vision'],
    status: isProviderKeyConfigured('openai') ? 'AVAILABLE' : 'CONFIG_REQUIRED',
    speed: 'fast',
    apiModelId: 'gpt-6-astra',
    fallbackModel: 'gpt-6-sol',
    cloudAgentConfig: GPT6_ASTRA_CLOUD_CONFIG as any,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    availability: isProviderKeyConfigured('openai') ? 'Available' : 'Add key to enable',
    pricing: {
      inputCost: MODEL_CONFIG.models['gpt-6-astra'].inputCostPer1M as any,
      outputCost: MODEL_CONFIG.models['gpt-6-astra'].outputCostPer1M as any,
      currency: MODEL_CONFIG.currency,
      effectiveDate: MODEL_CONFIG.effectiveDate
    },
    limits: {
      maxOutputTokens: MODEL_CONFIG.models['gpt-6-astra'].maxOutputTokens ?? 32768
    }
  },
  {
    id: 'gpt-6-sol',
    exactModelId: 'gpt-6-sol',
    displayName: 'GPT-6 Sol Deep Reasoning',
    shortName: 'GPT-6 Sol',
    provider: 'OpenAI',
    providerId: 'openai',
    family: 'codex',
    isNew: true,
    description: 'Frontier deep-reasoning model tuned for complex architecture design, algorithm synthesis, multi-step refactoring, and root-cause debugging.',
    contextWindow: MODEL_CONFIG.models['gpt-6-sol'].contextWindow ?? 1000000,
    version: 'gpt-6-sol',
    reasoningLevel: 'High',
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    capabilitiesList: ['Coding', 'Reasoning', 'Tool use', 'Vision'],
    status: isProviderKeyConfigured('openai') ? 'AVAILABLE' : 'CONFIG_REQUIRED',
    speed: 'fast',
    apiModelId: 'gpt-6-sol',
    fallbackModel: 'gpt-6-astra',
    cloudAgentConfig: GPT6_ASTRA_CLOUD_CONFIG as any,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    availability: isProviderKeyConfigured('openai') ? 'Available' : 'Add key to enable',
    pricing: {
      inputCost: MODEL_CONFIG.models['gpt-6-sol'].inputCostPer1M as any,
      outputCost: MODEL_CONFIG.models['gpt-6-sol'].outputCostPer1M as any,
      currency: MODEL_CONFIG.currency,
      effectiveDate: MODEL_CONFIG.effectiveDate
    },
    limits: {
      maxOutputTokens: MODEL_CONFIG.models['gpt-6-sol'].maxOutputTokens ?? 65536
    }
  }
];
