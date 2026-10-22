import { AIModel } from '../../types/ai';
import { GPT6_ASTRA_CLOUD_CONFIG } from '../../server/providers/cloudAgentConfig';

/**
 * Verified OpenAI & FLOAT Basic models in the FLOAT AI workspace selector.
 */
export const DASHBOARD_MODELS: AIModel[] = [
  {
    id: 'gpt-6-astra',
    displayName: 'GPT-6 Astra Flagship Coding',
    shortName: 'GPT-6 Astra',
    provider: 'OpenAI',
    providerId: 'openai',
    family: 'codex',
    tier: 'Preview',
    description: 'Next-generation flagship coding agent powered by OpenAI Codex execution server with cloud remote connection and deep developer assistance.',
    contextWindow: 1000000,
    version: 'preview-rt_7k2m',
    reasoningLevel: 'Balanced',
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    capabilitiesList: ['Coding', 'Reasoning', 'Tool use', 'Vision'],
    status: 'AVAILABLE',
    speed: 'fast',
    apiModelId: 'gpt-6-astra',
    fallbackModel: 'gpt-6.1-sol',
    cloudAgentConfig: GPT6_ASTRA_CLOUD_CONFIG as any,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    availability: 'Available',
    pricing: { inputCost: 3.00, outputCost: 12.00, currency: 'USD', effectiveDate: '2025-03-01' }
  },
  {
    id: 'gpt-6.1-sol',
    displayName: 'GPT-6.1 Sol Deep Reasoning',
    shortName: 'GPT-6.1 Sol',
    provider: 'OpenAI',
    providerId: 'openai',
    family: 'codex',
    isNew: true,
    description: 'Frontier deep-reasoning model tuned for complex architecture design, algorithm synthesis, multi-step refactoring, and root-cause debugging.',
    contextWindow: 1000000,
    version: 'preview-sol-2025',
    reasoningLevel: 'High',
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    capabilitiesList: ['Coding', 'Reasoning', 'Tool use', 'Vision'],
    status: 'AVAILABLE',
    speed: 'fast',
    apiModelId: 'gpt-6.1-sol',
    fallbackModel: 'gpt-6-astra',
    cloudAgentConfig: GPT6_ASTRA_CLOUD_CONFIG as any,
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    availability: 'Available',
    pricing: { inputCost: 3.50, outputCost: 14.00, currency: 'USD', effectiveDate: '2025-04-01' }
  }
];
