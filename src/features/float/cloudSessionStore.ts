import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CloudProfile {
  id: string;
  name: string;
  sessionId: string;
  environmentId: string;
  model: string;
}

export const AVAILABLE_PROFILES: CloudProfile[] = [
  {
    id: 'sol',
    name: 'GPT-6 Sol (Default)',
    sessionId: '',
    environmentId: '',
    model: 'GPT-6 Sol (Preview)',
  },
  {
    id: 'astra',
    name: 'GPT-6 Astra',
    sessionId: '',
    environmentId: '',
    model: 'GPT-6 Astra (Preview)',
  },
];

export const DEFAULT_CLOUD_SESSION = {
  sessionId: '',
  environmentId: '',
  region: 'cloud-agent',
  machine: 'sol-ccarenv',
  modelAttached: AVAILABLE_PROFILES[0].model,
  fallbackModel: 'gpt-6-astra',
  fallbackStrategy: 'upstream_fallback_if_unreachable',
  remoteUrl: '',
  execServerCommand: '',
};

export interface CloudSessionState {
  active: boolean;
  startedAt?: number;
  region?: string;
  machine?: string;
  sessionId?: string;
  environmentId?: string;
  remoteUrl?: string;
  execServerCommand?: string;
  status: 'connected' | 'connecting' | 'disconnected';
  fallbackReady: boolean;
  modelAttached?: string;
  modalOpen: boolean;
  start: (region?: string, machine?: string, sessionId?: string, environmentId?: string, modelAttached?: string) => void;
  stop: () => void;
  connect: (sessionId?: string, environmentId?: string, modelAttached?: string) => void;
  disconnect: () => void;
  openModal: () => void;
  closeModal: () => void;
}

function buildExecServerCommand(remoteUrl: string, environmentId: string, sessionId: string): string {
  if (!environmentId || !sessionId) return '';
  const remotePart = remoteUrl ? ` --remote '${remoteUrl}'` : '';
  return `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server${remotePart} --environment-id '${environmentId}' --session-id '${sessionId}'`;
}

/** Local browser & cloud session store for workspace execution and GPT-6 Astra/Sol attachment. */
export const useCloudSession = create<CloudSessionState>()(
  persist(
    (set) => ({
      active: false,
      startedAt: undefined,
      region: DEFAULT_CLOUD_SESSION.region,
      machine: DEFAULT_CLOUD_SESSION.machine,
      sessionId: DEFAULT_CLOUD_SESSION.sessionId,
      environmentId: DEFAULT_CLOUD_SESSION.environmentId,
      remoteUrl: DEFAULT_CLOUD_SESSION.remoteUrl,
      execServerCommand: DEFAULT_CLOUD_SESSION.execServerCommand,
      status: 'disconnected',
      fallbackReady: true,
      modelAttached: DEFAULT_CLOUD_SESSION.modelAttached,
      modalOpen: false,
      start: (
        region = DEFAULT_CLOUD_SESSION.region,
        machine = DEFAULT_CLOUD_SESSION.machine,
        sessionId = DEFAULT_CLOUD_SESSION.sessionId,
        environmentId = DEFAULT_CLOUD_SESSION.environmentId,
        modelAttached = DEFAULT_CLOUD_SESSION.modelAttached
      ) => {
        const isConfigured = Boolean(sessionId && environmentId);
        set({
          active: isConfigured,
          startedAt: isConfigured ? Date.now() : undefined,
          region,
          machine,
          sessionId,
          environmentId,
          modelAttached,
          remoteUrl: DEFAULT_CLOUD_SESSION.remoteUrl,
          execServerCommand: buildExecServerCommand(DEFAULT_CLOUD_SESSION.remoteUrl, environmentId, sessionId),
          status: isConfigured ? 'connected' : 'disconnected',
          fallbackReady: true,
          modalOpen: false
        });
      },
      stop: () =>
        set({
          active: false,
          startedAt: undefined,
          status: 'disconnected'
        }),
      connect: (
        sessionId = DEFAULT_CLOUD_SESSION.sessionId,
        environmentId = DEFAULT_CLOUD_SESSION.environmentId,
        modelAttached = DEFAULT_CLOUD_SESSION.modelAttached
      ) =>
        set((prev) => {
          const isConfigured = Boolean(sessionId && environmentId);
          return {
            active: isConfigured,
            startedAt: isConfigured ? (prev.startedAt || Date.now()) : undefined,
            sessionId,
            environmentId,
            modelAttached: modelAttached || prev.modelAttached || DEFAULT_CLOUD_SESSION.modelAttached,
            remoteUrl: prev.remoteUrl || DEFAULT_CLOUD_SESSION.remoteUrl,
            execServerCommand: buildExecServerCommand(prev.remoteUrl || DEFAULT_CLOUD_SESSION.remoteUrl, environmentId, sessionId),
            status: isConfigured ? 'connected' : 'disconnected',
            fallbackReady: true
          };
        }),
      disconnect: () =>
        set({
          active: false,
          status: 'disconnected'
        }),
      openModal: () => set({ modalOpen: true }),
      closeModal: () => set({ modalOpen: false }),
    }),
    {
      name: 'float_cloud_session_v5',
      version: 5,
      partialize: (s) => ({
        active: s.active,
        startedAt: s.startedAt,
        region: s.region,
        machine: s.machine,
        sessionId: s.sessionId,
        environmentId: s.environmentId,
        remoteUrl: s.remoteUrl,
        execServerCommand: s.execServerCommand,
        status: s.status,
        fallbackReady: s.fallbackReady,
        modelAttached: s.modelAttached,
      }),
    },
  ),
);

// Synchronize with server active session endpoint when an authenticated user is present
export async function syncCloudSessionWithServer(getToken?: () => Promise<string | null>): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const token = getToken ? await getToken() : null;
    if (!token) return;
    const res = await fetch('/api/session/current', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      useCloudSession.getState().disconnect();
      return;
    }
    const data = await res.json();
    if (data?.sessionId && data?.environmentId) {
      useCloudSession.getState().connect(data.sessionId, data.environmentId);
    } else {
      useCloudSession.getState().disconnect();
    }
  } catch {}
}

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
