// Ensure process environment satisfies CODEX_API_KEY and OPENAI_ENVIRONMENT_KEY
if (process.env.OPENAI_API_KEY) {
  process.env.OPENAI_ENVIRONMENT_KEY = process.env.OPENAI_ENVIRONMENT_KEY || process.env.OPENAI_API_KEY;
  process.env.CODEX_API_KEY = process.env.CODEX_API_KEY || process.env.OPENAI_ENVIRONMENT_KEY;
}

export interface CloudSessionProfile {
  id: string;
  name: string;
  sessionId: string;
  environmentId: string;
  remoteUrl: string;
  model: string;
  fallbackModel: string;
}

export const KNOWN_CLOUD_SESSIONS: CloudSessionProfile[] = [
  {
    id: 'sol',
    name: 'GPT-6.1 Sol',
    sessionId: 'sess_087a4d42ca75939b006ace64b295ac8193b83bd1fbfd9a4015',
    environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNjNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ',
    remoteUrl: 'https://api.openai.com/v1/agents/api/connect/rt_7k2m',
    model: 'gpt-6.1-sol',
    fallbackModel: 'gpt-4o'
  },
  {
    id: 'astra',
    name: 'New agent (GPT-6 Astra)',
    sessionId: 'sess_0e5225d2ebb12ca1006acc98ff0200819cb89256c878d26a01',
    environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNjOTNmZjA1YjA4MTkxOTNjYThiZjdjY2IzOGRjYw',
    remoteUrl: 'https://api.openai.com/v1/agents/api/connect/rt_7k2m',
    model: 'gpt-6-astra',
    fallbackModel: 'gpt-4o'
  }
];

export const GPT6_ASTRA_CLOUD_CONFIG = {
  modelId: 'gpt-6.1-sol',
  fallbackModel: 'gpt-4o',
  sessionId: 'sess_087a4d42ca75939b006ace64b295ac8193b83bd1fbfd9a4015',
  environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNjNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ',
  sessionStatus: 'connected' as const,
  fallbackStrategy: 'upstream_fallback_if_unreachable' as const,
  remoteUrl: 'https://api.openai.com/v1/agents/api/connect/rt_7k2m',
  execServerCommand: `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server --remote 'https://api.openai.com/v1/agents/api/connect/rt_7k2m' --environment-id 'ccarenv_b64_Y2NhcmVudl82YWNjNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ'`,
  tier: 'Preview',
  type: 'Cloud Agent',
  provider: 'openai'
};
