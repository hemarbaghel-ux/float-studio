/**
 * Cloud-agent credentials and session identifiers must be supplied by the deployment
 * environment. FLOAT must not embed guessed or copied session IDs in source control.
 * A configured value is not proof of a live connection; the server reports that
 * distinction separately until a real provider handshake is implemented.
 */
export const GPT6_ASTRA_CLOUD_CONFIG = {
  modelId: 'gpt-6-astra',
  fallbackModel: 'gpt-6.1-sol',
  sessionId: process.env.FLOAT_CLOUD_SESSION_ID?.trim() || undefined,
  environmentId: process.env.FLOAT_CLOUD_ENVIRONMENT_ID?.trim() || undefined,
  sessionStatus: 'disconnected' as const,
  fallbackStrategy: 'disabled_until_verified' as const,
  remoteUrl: process.env.FLOAT_CLOUD_REMOTE_URL?.trim() || undefined,
  execServerCommand: undefined,
  tier: 'Preview',
  type: 'Cloud Agent',
  provider: 'openai'
};
