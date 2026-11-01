/**
 * Shared Cloud Agent configuration constants for GPT-6 Sol and GPT-6 Astra.
 * Reads session and environment identifiers from environment variables when
 * executing on the server. Never contains hard-coded session or environment IDs.
 */

export interface CloudAgentEndpointConfig {
  modelId: string;
  displayName: string;
  sessionId: string;
  environmentId: string;
  remoteUrl: string;
}

function getEnvVar(name: string): string {
  if (typeof process !== 'undefined' && process.env && typeof process.env[name] === 'string') {
    return process.env[name]!.trim();
  }
  return '';
}

export const GPT6_SOL_CLOUD_CONFIG: CloudAgentEndpointConfig = {
  modelId: 'gpt-6-sol',
  displayName: 'GPT-6 Sol',
  get sessionId(): string {
    return getEnvVar('FLOAT_SOL_SESSION_ID');
  },
  get environmentId(): string {
    return getEnvVar('FLOAT_SOL_ENVIRONMENT_ID');
  },
  get remoteUrl(): string {
    return getEnvVar('FLOAT_CLOUD_AGENT_REMOTE_URL');
  },
};

export const GPT6_ASTRA_CLOUD_CONFIG: CloudAgentEndpointConfig = {
  modelId: 'gpt-6-astra',
  displayName: 'GPT-6 Astra',
  get sessionId(): string {
    return getEnvVar('FLOAT_ASTRA_SESSION_ID');
  },
  get environmentId(): string {
    return getEnvVar('FLOAT_ASTRA_ENVIRONMENT_ID');
  },
  get remoteUrl(): string {
    return getEnvVar('FLOAT_CLOUD_AGENT_REMOTE_URL');
  },
};

export function isCloudAgentConfigured(
  config: Partial<CloudAgentEndpointConfig> | null | undefined
): boolean {
  if (!config) return false;
  return Boolean(
    config.sessionId &&
      config.sessionId.trim().length > 0 &&
      config.environmentId &&
      config.environmentId.trim().length > 0
  );
}
