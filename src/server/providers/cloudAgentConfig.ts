// Ensure process environment satisfies CODEX_API_KEY and OPENAI_ENVIRONMENT_KEY
if (process.env.OPENAI_API_KEY) {
  process.env.OPENAI_ENVIRONMENT_KEY = process.env.OPENAI_ENVIRONMENT_KEY || process.env.OPENAI_API_KEY;
  process.env.CODEX_API_KEY = process.env.CODEX_API_KEY || process.env.OPENAI_ENVIRONMENT_KEY;
}

export const GPT6_ASTRA_CLOUD_CONFIG = {
  modelId: 'gpt-6-astra',
  fallbackModel: 'gpt-4o',
  sessionId: 'sess_0e5225d2ebb12ca1006acc98ff0200819cb89256c878d26a01',
  environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNlNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ',
  sessionStatus: 'connected' as const,
  fallbackStrategy: 'upstream_fallback_if_unreachable' as const,
  remoteUrl: 'https://api.openai.com/v1/agents/api/connect/rt_7k2m',
  execServerCommand: `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server --remote 'https://api.openai.com/v1/agents/api/connect/rt_7k2m' --environment-id 'ccarenv_b64_Y2NhcmVudl82YWNlNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ' --session-id 'sess_0e5225d2ebb12ca1006acc98ff0200819cb89256c878d26a01'`,
  tier: 'Preview',
  type: 'Cloud Agent',
  provider: 'openai'
};
