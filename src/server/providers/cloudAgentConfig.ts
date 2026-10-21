// Ensure process environment satisfies CODEX_API_KEY and OPENAI_ENVIRONMENT_KEY
if (process.env.OPENAI_API_KEY) {
  process.env.OPENAI_ENVIRONMENT_KEY = process.env.OPENAI_ENVIRONMENT_KEY || process.env.OPENAI_API_KEY;
  process.env.CODEX_API_KEY = process.env.CODEX_API_KEY || process.env.OPENAI_ENVIRONMENT_KEY;
}

export const KNOWN_CLOUD_SESSIONS = Object.freeze([
  Object.freeze({
    id: 'sol',
    name: 'GPT-6.1 Sol Deep Reasoning',
    sessionId: 'sess_087a4d42ca75939b006ace64b295ac8193b83bd1fbfd9a4015',
    environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNlNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ',
    model: 'gpt-6.1-sol'
  }),
  Object.freeze({
    id: 'astra',
    name: 'GPT-6 Astra',
    sessionId: 'sess_0e5225d2ebb12ca1006acc98ff0200819cb89256c878d26a01',
    environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNjOThmZjA1YjA4MTkxOTNjYThiZjdjY2IzOGRjYw',
    model: 'gpt-6-astra'
  })
]);

export const GPT6_ASTRA_CLOUD_CONFIG = Object.freeze({
  modelId: 'gpt-6-astra',
  fallbackModel: 'gpt-4o',
  sessionId: 'sess_0e5225d2ebb12ca1006acc98ff0200819cb89256c878d26a01',
  environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNjOThmZjA1YjA4MTkxOTNjYThiZjdjY2IzOGRjYw',
  sessionStatus: 'connected' as const,
  fallbackStrategy: 'upstream_fallback_if_unreachable' as const,
  remoteUrl: 'https://api.openai.com/v1/agents/api/connect/rt_7k2m',
  execServerCommand: `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server --remote 'https://api.openai.com/v1/agents/api/connect/rt_7k2m' --environment-id 'ccarenv_b64_Y2NhcmVudl82YWNjOThmZjA1YjA4MTkxOTNjYThiZjdjY2IzOGRjYw'`,
  tier: 'Preview',
  type: 'Cloud Agent',
  provider: 'openai'
});

export interface UserCloudSessionConfig {
  modelId: string;
  sessionId: string;
  environmentId: string;
  remoteUrl: string;
  execServerCommand: string;
  sessionStatus: 'connected' | 'disconnected';
  updatedAt: number;
}

const SAFE_SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_TRACKED_USER_SESSIONS = 5_000;
const userCloudSessions = new Map<string, UserCloudSessionConfig>();

export function isValidCloudSessionIdentifier(value: unknown): value is string {
  return typeof value === 'string' && SAFE_SESSION_ID_REGEX.test(value.trim());
}

export function getUserCloudSessionConfig(userId?: string): UserCloudSessionConfig {
  if (userId && userCloudSessions.has(userId)) {
    return { ...userCloudSessions.get(userId)! };
  }
  return {
    modelId: GPT6_ASTRA_CLOUD_CONFIG.modelId,
    sessionId: GPT6_ASTRA_CLOUD_CONFIG.sessionId,
    environmentId: GPT6_ASTRA_CLOUD_CONFIG.environmentId,
    remoteUrl: GPT6_ASTRA_CLOUD_CONFIG.remoteUrl,
    execServerCommand: GPT6_ASTRA_CLOUD_CONFIG.execServerCommand,
    sessionStatus: GPT6_ASTRA_CLOUD_CONFIG.sessionStatus,
    updatedAt: Date.now()
  };
}

export function updateUserCloudSessionConfig(
  userId: string,
  updates: { sessionId?: unknown; environmentId?: unknown }
): { ok: true; config: UserCloudSessionConfig } | { ok: false; error: string } {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return { ok: false, error: 'Authenticated userId is required.' };
  }

  const current = getUserCloudSessionConfig(userId);
  let nextSessionId = current.sessionId;
  let nextEnvId = current.environmentId;

  if (updates.sessionId !== undefined) {
    if (!isValidCloudSessionIdentifier(updates.sessionId)) {
      return { ok: false, error: 'Invalid sessionId format. Only alphanumeric, underscore, and hyphen characters are permitted.' };
    }
    nextSessionId = updates.sessionId.trim();
  }

  if (updates.environmentId !== undefined) {
    if (!isValidCloudSessionIdentifier(updates.environmentId)) {
      return { ok: false, error: 'Invalid environmentId format. Only alphanumeric, underscore, and hyphen characters are permitted.' };
    }
    nextEnvId = updates.environmentId.trim();
  }

  const nextConfig: UserCloudSessionConfig = {
    ...current,
    sessionId: nextSessionId,
    environmentId: nextEnvId,
    execServerCommand: `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server --remote 'https://api.openai.com/v1/agents/api/connect/rt_7k2m' --environment-id '${nextEnvId}'`,
    updatedAt: Date.now()
  };

  if (!userCloudSessions.has(userId) && userCloudSessions.size >= MAX_TRACKED_USER_SESSIONS) {
    const oldestKey = userCloudSessions.keys().next().value;
    if (oldestKey) userCloudSessions.delete(oldestKey);
  }
  userCloudSessions.set(userId, nextConfig);
  return { ok: true, config: nextConfig };
}

export function resetUserCloudSessionsForTests(): void {
  userCloudSessions.clear();
}
