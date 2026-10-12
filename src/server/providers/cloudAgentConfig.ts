export const GPT6_ASTRA_CLOUD_CONFIG = {
  modelId: 'gpt-6-astra',
  fallbackModel: 'gpt-4o',
  remoteUrl: 'https://api.openai.com/v1/agents/api/connect/rt_9v4n',
  environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNjOThmZjA1YjA4MTkxOTNjYThiZjdjY2IzOGRjYw',
  execServerCommand: `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server --remote 'https://api.openai.com/v1/agents/api/connect/rt_9v4n' --environment-id 'ccarenv_b64_Y2NhcmVudl82YWNjOThmZjA1YjA4MTkxOTNjYThiZjdjY2IzOGRjYw'`,
  tier: 'Preview',
  type: 'Cloud Agent',
  provider: 'openai'
};
