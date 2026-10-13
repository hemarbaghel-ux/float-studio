import { AIModel } from '../../types/ai';

/**
 * Featured OpenAI models for the FLOAT model selector with verified metadata structure.
 */
export const DASHBOARD_MODELS: AIModel[] = [
  {
    id: 'gpt-6-astra',
    displayName: 'GPT-6 Astra (Preview)',
    shortName: 'GPT-6 Astra',
    provider: 'OpenAI (Cloud Agent)',
    providerId: 'openai',
    family: 'codex',
    tier: 'Preview',
    description: 'Next-generation preview cloud agent powered by OpenAI Codex execution server with cloud remote connection and upstream fallback to GPT-4o.',
    contextWindow: 1000000,
    version: 'Preview rt_7k2m',
    reasoningLevel: 'Cloud Agent',
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    capabilitiesList: ['Coding', 'Reasoning', 'Cloud Agent', 'Tool use', 'Vision'],
    status: 'AVAILABLE',
    speed: 'fast',
    isNew: true,
    apiModelId: 'gpt-6-astra',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    availability: 'Preview / Cloud Agent',
    fallbackModel: 'gpt-4o',
    cloudAgentConfig: {
      remoteUrl: 'https://api.openai.com/v1/agents/api/connect/rt_7k2m',
      environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNlNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ',
      sessionId: 'sess_0e5225d2ebb12ca1006acc98ff0200819cb89256c878d26a01',
      sessionStatus: 'connected',
      fallbackStrategy: 'upstream_fallback_if_unreachable',
      execServerCommand: `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server --remote 'https://api.openai.com/v1/agents/api/connect/rt_7k2m' --environment-id 'ccarenv_b64_Y2NhcmVudl82YWNlNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ' --session-id 'sess_0e5225d2ebb12ca1006acc98ff0200819cb89256c878d26a01'`,
      fallbackModel: 'gpt-4o',
      mode: 'preview'
    }
  },
  {
    id: 'gpt-6.1-sol',
    displayName: 'GPT-6.1 Sol (Preview)',
    shortName: 'GPT-6.1 Sol',
    provider: 'OpenAI (Cloud Agent)',
    providerId: 'openai',
    family: 'codex',
    tier: 'Preview',
    description: 'Next-generation frontier preview model with deep architectural reasoning, autonomous system design, and advanced codex execution capabilities with upstream fallback to GPT-4o.',
    contextWindow: 1000000,
    version: 'Preview Sol',
    reasoningLevel: 'Deep Reasoning',
    capabilities: { coding: true, reasoning: true, tools: true, vision: true, structuredOutput: true, streaming: true, longContext: true },
    capabilitiesList: ['Coding', 'Deep Reasoning', 'Cloud Agent', 'Tool use', 'Vision'],
    status: 'AVAILABLE',
    speed: 'fast',
    isNew: true,
    apiModelId: 'gpt-6.1-sol',
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    availability: 'Preview / Cloud Agent',
    fallbackModel: 'gpt-4o',
    cloudAgentConfig: {
      remoteUrl: 'https://api.openai.com/v1/agents/api/connect/rt_7k2m',
      environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNlNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ',
      sessionId: 'sess_0e5225d2ebb12ca1006acc98ff0200819cb89256c878d26a01',
      sessionStatus: 'connected',
      fallbackStrategy: 'upstream_fallback_if_unreachable',
      execServerCommand: `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server --remote 'https://api.openai.com/v1/agents/api/connect/rt_7k2m' --environment-id 'ccarenv_b64_Y2NhcmVudl82YWNlNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ' --session-id 'sess_0e5225d2ebb12ca1006acc98ff0200819cb89256c878d26a01'`,
      fallbackModel: 'gpt-4o',
      mode: 'preview'
    }
  },
];
