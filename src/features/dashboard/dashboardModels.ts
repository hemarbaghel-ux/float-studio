import { AIModel } from '../../types/ai';

/**
 * Keep the selectable dashboard catalog aligned with models the server router
 * explicitly supports. These entries describe API model IDs, not proof that the
 * current deployment has credentials or account access.
 */
export const DASHBOARD_MODELS: AIModel[] = [
  {
    id: 'gpt-4o-mini',
    displayName: 'GPT-4o mini',
    shortName: 'GPT-4o mini',
    provider: 'OpenAI',
    providerId: 'openai',
    family: 'gpt-4o',
    description: 'A fast, lower-cost OpenAI model for everyday coding questions, explanations, and smaller edits.',
    contextWindow: 128000,
    version: 'gpt-4o-mini',
    reasoningLevel: 'General reasoning',
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    capabilitiesList: ['Coding', 'Debugging', 'Explanations', 'Tool use', 'Vision'],
    status: 'CONFIG_REQUIRED',
    speed: 'fast',
    apiModelId: 'gpt-4o-mini',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    availability: 'Requires server-side OpenAI credentials and account access'
  },
  {
    id: 'gpt-4o',
    displayName: 'GPT-4o',
    shortName: 'GPT-4o',
    provider: 'OpenAI',
    providerId: 'openai',
    family: 'gpt-4o',
    description: 'A general-purpose multimodal OpenAI model for more involved coding, analysis, and development assistance.',
    contextWindow: 128000,
    version: 'gpt-4o',
    reasoningLevel: 'General reasoning',
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    capabilitiesList: ['Coding', 'Refactoring', 'Debugging', 'Tool use', 'Vision'],
    status: 'CONFIG_REQUIRED',
    speed: 'balanced',
    apiModelId: 'gpt-4o',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    availability: 'Requires server-side OpenAI credentials and account access'
  }
];
