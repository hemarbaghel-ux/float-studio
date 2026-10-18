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
    name: 'GPT-6.1 Sol (Default)',
    sessionId: 'sess_087a4d42ca75939b006ace64b295ac8193b83bd1fbfd9a4015',
    environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNjNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ',
    model: 'GPT-6.1 Sol (Preview)',
  },
  {
    id: 'astra',
    name: 'GPT-6 Astra',
    sessionId: 'sess_0e5225d2ebb12ca1006acc98ff0200819cb89256c878d26a01',
    environmentId: 'ccarenv_b64_Y2NhcmVudl82YWNlNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ',
    model: 'GPT-6 Astra (Preview)',
  },
];

export const DEFAULT_CLOUD_SESSION = {
  sessionId: AVAILABLE_PROFILES[0].sessionId,
  environmentId: AVAILABLE_PROFILES[0].environmentId,
  region: 'cloud-agent',
  machine: 'sol-ccarenv',
  modelAttached: AVAILABLE_PROFILES[0].model,
  fallbackModel: 'gpt-6-astra',
  fallbackStrategy: 'upstream_fallback_if_unreachable',
  remoteUrl: 'https://api.openai.com/v1/agents/api/connect/rt_7k2m',
  execServerCommand: `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server --remote 'https://api.openai.com/v1/agents/api/connect/rt_7k2m' --environment-id '${AVAILABLE_PROFILES[0].environmentId}' --session-id '${AVAILABLE_PROFILES[0].sessionId}'`,
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

/** Local browser & cloud session store for workspace execution and GPT-6 Astra attachment. */
export const useCloudSession = create<CloudSessionState>()(
  persist(
    (set) => ({
      active: true,
      startedAt: Date.now(),
      region: DEFAULT_CLOUD_SESSION.region,
      machine: DEFAULT_CLOUD_SESSION.machine,
      sessionId: DEFAULT_CLOUD_SESSION.sessionId,
      environmentId: DEFAULT_CLOUD_SESSION.environmentId,
      remoteUrl: DEFAULT_CLOUD_SESSION.remoteUrl,
      execServerCommand: DEFAULT_CLOUD_SESSION.execServerCommand,
      status: 'connected',
      fallbackReady: true,
      modelAttached: DEFAULT_CLOUD_SESSION.modelAttached,
      modalOpen: false,
      start: (
        region = DEFAULT_CLOUD_SESSION.region,
        machine = DEFAULT_CLOUD_SESSION.machine,
        sessionId = DEFAULT_CLOUD_SESSION.sessionId,
        environmentId = DEFAULT_CLOUD_SESSION.environmentId,
        modelAttached = DEFAULT_CLOUD_SESSION.modelAttached
      ) =>
        set({
          active: true,
          startedAt: Date.now(),
          region,
          machine,
          sessionId,
          environmentId,
          modelAttached,
          remoteUrl: DEFAULT_CLOUD_SESSION.remoteUrl,
          execServerCommand: `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server --remote 'https://api.openai.com/v1/agents/api/connect/rt_7k2m' --environment-id '${environmentId}' --session-id '${sessionId}'`,
          status: 'connected',
          fallbackReady: true,
          modalOpen: false
        }),
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
        set((prev) => ({
          active: true,
          startedAt: prev.startedAt || Date.now(),
          sessionId,
          environmentId,
          modelAttached: modelAttached || prev.modelAttached || DEFAULT_CLOUD_SESSION.modelAttached,
          remoteUrl: DEFAULT_CLOUD_SESSION.remoteUrl,
          execServerCommand: `CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server --remote 'https://api.openai.com/v1/agents/api/connect/rt_7k2m' --environment-id '${environmentId}' --session-id '${sessionId}'`,
          status: 'connected',
          fallbackReady: true
        })),
      disconnect: () =>
        set({
          active: false,
          status: 'disconnected'
        }),
      openModal: () => set({ modalOpen: true }),
      closeModal: () => set({ modalOpen: false }),
    }),
    {
      name: 'float_cloud_session_v4',
      version: 4,
      onRehydrateStorage: () => (state) => {
        if (state) {
          // If state is not connected to the target session or has outdated environment ID, ensure connected defaults
          if (!state.sessionId || !state.active || state.status !== 'connected' || state.environmentId !== DEFAULT_CLOUD_SESSION.environmentId) {
            state.active = true;
            state.status = 'connected';
            state.sessionId = DEFAULT_CLOUD_SESSION.sessionId;
            state.environmentId = DEFAULT_CLOUD_SESSION.environmentId;
            state.remoteUrl = DEFAULT_CLOUD_SESSION.remoteUrl;
            state.execServerCommand = DEFAULT_CLOUD_SESSION.execServerCommand;
            state.region = DEFAULT_CLOUD_SESSION.region;
            state.machine = DEFAULT_CLOUD_SESSION.machine;
            state.modelAttached = DEFAULT_CLOUD_SESSION.modelAttached;
            state.fallbackReady = true;
            if (!state.startedAt) state.startedAt = Date.now();
          }
        }
      },
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

// Synchronize with server active session endpoint on startup
if (typeof window !== 'undefined') {
  try {
    fetch('/api/session/current')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.sessionId) {
          useCloudSession.getState().connect(data.sessionId, data.environmentId);
        }
      })
      .catch(() => {});
  } catch {}
}

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

