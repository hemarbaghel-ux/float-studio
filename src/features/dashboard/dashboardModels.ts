import { AIModel } from '../../types/ai';

/**
 * Frontier models exclusively supported in FLOAT AI:
 * - GPT-6.1 Sol (Preview) - Default workspace frontier model
 * - GPT-6 Astra (Preview) - Next-generation preview cloud agent
 */
export const DASHBOARD_MODELS: AIModel[] = [
  {
    id: 'gpt-6.1-sol',
    displayName: 'GPT-6.1 Sol Deep Reasoning',
    shortName: 'GPT-6.1 Sol',
    provider: 'OpenAI',
    providerId: 'openai',
    family: 'codex',
    description: 'Next-generation frontier reasoning model with deep architectural analysis, autonomous system design, and advanced agent session capabilities with Gemini fallback.',
    contextWindow: 1000000,
    version: 'preview-sol-2025',
    reasoningLevel: 'Deep Reasoning',
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    capabilitiesList: ['Coding', 'Deep Reasoning', 'System Architecture', 'Tool use', 'Vision'],
    status: 'AVAILABLE',
    speed: 'fast',
    isNew: true,
    apiModelId: 'gpt-6.1-sol',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    availability: 'Available',
    pricing: {
      inputCost: 3.50,
      outputCost: 14.00,
      currency: 'USD',
      effectiveDate: '2025-04-01'
    }
  },
  {
    id: 'gpt-6-astra',
    displayName: 'GPT-6 Astra Deep Reasoning',
    shortName: 'GPT-6 Astra',
    provider: 'OpenAI',
    providerId: 'openai',
    family: 'codex',
    description: 'Next-generation preview cloud agent powered by OpenAI Codex execution server and agent session with Gemini fallback.',
    contextWindow: 1000000,
    version: 'preview-rt_7k2m',
    reasoningLevel: 'Cloud Agent',
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    capabilitiesList: ['Coding', 'Autonomous Agent', 'Cloud Execution', 'Tool use', 'Vision'],
    status: 'AVAILABLE',
    speed: 'fast',
    isNew: true,
    apiModelId: 'gpt-6-astra',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    availability: 'Available',
    pricing: {
      inputCost: 3.00,
      outputCost: 12.00,
      currency: 'USD',
      effectiveDate: '2025-03-01'
    }
  }
];
