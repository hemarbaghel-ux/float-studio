/**
 * Server-side Cloud Agent Session Configuration Store
 * Scoped per authenticated user (uid) to prevent cross-tenant state pollution.
 * Reads defaults from environment variables; never contains hard-coded ccarenv_b64_/rt_/sess_0 IDs.
 */
import {
  GPT6_ASTRA_CLOUD_CONFIG,
  GPT6_SOL_CLOUD_CONFIG,
  isCloudAgentConfigured
} from '../../data/cloudAgentConstants';
import { getServerDocDurable, saveServerDocDurable } from '../durableState';

export { GPT6_ASTRA_CLOUD_CONFIG, GPT6_SOL_CLOUD_CONFIG, isCloudAgentConfigured };

export interface CloudAgentRuntimeConfig {
  modelId: string;
  displayName: string;
  sessionId: string;
  environmentId: string;
  remoteUrl: string;
  execServerCommand: string;
  sessionStatus: 'connected' | 'disconnected' | 'reconnecting';
  solSessionId: string;
  solEnvironmentId: string;
  astraSessionId: string;
  astraEnvironmentId: string;
  updatedAt: number;
}

export interface KnownCloudSessionEntry {
  id: string;
  name: string;
  modelId: string;
  sessionId: string;
  environmentId: string;
  remoteUrl: string;
}

export function getKnownCloudSessions(): KnownCloudSessionEntry[] {
  const solSess = process.env.FLOAT_SOL_SESSION_ID?.trim() || '';
  const solEnv = process.env.FLOAT_SOL_ENVIRONMENT_ID?.trim() || '';
  const astraSess = process.env.FLOAT_ASTRA_SESSION_ID?.trim() || '';
  const astraEnv = process.env.FLOAT_ASTRA_ENVIRONMENT_ID?.trim() || '';
  const remoteUrl = process.env.FLOAT_CLOUD_AGENT_REMOTE_URL?.trim() || '';

  const list: KnownCloudSessionEntry[] = [];
  if (solSess && solEnv) {
    list.push({
      id: 'sol',
      name: 'GPT-6 Sol',
      modelId: 'gpt-6-sol',
      sessionId: solSess,
      environmentId: solEnv,
      remoteUrl
    });
  }
  if (astraSess && astraEnv) {
    list.push({
      id: 'astra',
      name: 'GPT-6 Astra',
      modelId: 'gpt-6-astra',
      sessionId: astraSess,
      environmentId: astraEnv,
      remoteUrl
    });
  }
  return list;
}

export const KNOWN_CLOUD_SESSIONS: KnownCloudSessionEntry[] = [];

function buildExecCommand(remoteUrl: string, environmentId: string, sessionId: string): string {
  if (!environmentId || !sessionId) return '';
  const remoteFlag = remoteUrl ? ` --remote '${remoteUrl}'` : '';
  return `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server${remoteFlag} --environment-id '${environmentId}' --session-id '${sessionId}'`;
}

function createDefaultUserConfig(): CloudAgentRuntimeConfig {
  const astraSessionId = process.env.FLOAT_ASTRA_SESSION_ID?.trim() || GPT6_ASTRA_CLOUD_CONFIG.sessionId || '';
  const astraEnvironmentId = process.env.FLOAT_ASTRA_ENVIRONMENT_ID?.trim() || GPT6_ASTRA_CLOUD_CONFIG.environmentId || '';
  const solSessionId = process.env.FLOAT_SOL_SESSION_ID?.trim() || GPT6_SOL_CLOUD_CONFIG.sessionId || '';
  const solEnvironmentId = process.env.FLOAT_SOL_ENVIRONMENT_ID?.trim() || GPT6_SOL_CLOUD_CONFIG.environmentId || '';
  const remoteUrl = process.env.FLOAT_CLOUD_AGENT_REMOTE_URL?.trim() || GPT6_ASTRA_CLOUD_CONFIG.remoteUrl || '';

  const sessionId = astraSessionId || solSessionId || '';
  const environmentId = astraEnvironmentId || solEnvironmentId || '';
  const isConfigured = Boolean(sessionId && environmentId);

  return {
    modelId: 'gpt-6-astra',
    displayName: 'GPT-6 Astra',
    sessionId,
    environmentId,
    remoteUrl,
    execServerCommand: buildExecCommand(remoteUrl, environmentId, sessionId),
    sessionStatus: isConfigured ? 'connected' : 'disconnected',
    solSessionId,
    solEnvironmentId,
    astraSessionId,
    astraEnvironmentId,
    updatedAt: Date.now(),
  };
}

// Per-user isolated map: uid -> CloudAgentRuntimeConfig
const userSessionConfigs = new Map<string, CloudAgentRuntimeConfig>();

export function getUserCloudSessionConfig(uid: string): CloudAgentRuntimeConfig {
  const key = uid || 'anonymous';
  let cfg = userSessionConfigs.get(key);
  if (!cfg) {
    cfg = createDefaultUserConfig();
    userSessionConfigs.set(key, cfg);
  }
  return { ...cfg };
}

export async function getUserCloudSessionConfigDurable(uid: string): Promise<CloudAgentRuntimeConfig> {
  const key = uid || 'anonymous';
  const stored = await getServerDocDurable<CloudAgentRuntimeConfig>('server_cloud_sessions', key, key).catch(() => null);
  if (stored && typeof stored.sessionId === 'string') {
    userSessionConfigs.set(key, stored);
    return { ...stored };
  }
  return getUserCloudSessionConfig(key);
}

export function updateUserCloudSessionConfig(
  uid: string,
  patch: { sessionId?: string; environmentId?: string; sessionStatus?: 'connected' | 'disconnected' | 'reconnecting'; remoteUrl?: string }
): { ok: true; config: CloudAgentRuntimeConfig } | { ok: false; error: string } {
  const key = uid || 'anonymous';
  const current = getUserCloudSessionConfig(key);

  if (patch.sessionId !== undefined) {
    const trimmed = String(patch.sessionId).trim();
    if (!trimmed || trimmed.length > 128 || !/^[a-zA-Z0-9_\-]+$/.test(trimmed)) {
      return { ok: false, error: 'Invalid sessionId format.' };
    }
    current.sessionId = trimmed;
    current.astraSessionId = trimmed;
  }

  if (patch.environmentId !== undefined) {
    const trimmed = String(patch.environmentId).trim();
    if (!trimmed || trimmed.length > 128 || !/^[a-zA-Z0-9_\-]+$/.test(trimmed)) {
      return { ok: false, error: 'Invalid environmentId format.' };
    }
    current.environmentId = trimmed;
    current.astraEnvironmentId = trimmed;
  }

  if (typeof patch.remoteUrl === 'string') {
    current.remoteUrl = patch.remoteUrl.trim();
  }

  if (patch.sessionStatus) {
    current.sessionStatus = patch.sessionStatus;
  } else {
    current.sessionStatus = current.sessionId && current.environmentId ? 'connected' : 'disconnected';
  }

  current.execServerCommand = buildExecCommand(current.remoteUrl, current.environmentId, current.sessionId);
  current.updatedAt = Date.now();
  userSessionConfigs.set(key, current);
  return { ok: true, config: { ...current } };
}

export async function updateUserCloudSessionConfigDurable(
  uid: string,
  patch: { sessionId?: string; environmentId?: string; sessionStatus?: 'connected' | 'disconnected' | 'reconnecting'; remoteUrl?: string }
): Promise<{ ok: true; config: CloudAgentRuntimeConfig } | { ok: false; error: string }> {
  const res = updateUserCloudSessionConfig(uid, patch);
  if (!res.ok) return res;
  const key = uid || 'anonymous';
  await saveServerDocDurable('server_cloud_sessions', key, key, res.config).catch(() => undefined);
  return res;
}

export function resetCloudSessionConfigsForTests(): void {
  userSessionConfigs.clear();
}

export const resetUserCloudSessionsForTests = resetCloudSessionConfigsForTests;

