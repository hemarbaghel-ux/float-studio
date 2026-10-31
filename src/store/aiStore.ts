import { create } from 'zustand';
import { AIModel, Agent, ModelPreference, ProviderStatus } from '../types/ai';
import { INITIAL_MODELS, INITIAL_AGENTS } from '../features/ai/registry';
import { isProviderKeyConfigured } from '../data/verifiedModels';

export type ReasoningEffortLevel = 'low' | 'medium' | 'high';

interface AIStore {
  models: AIModel[];
  agents: Agent[];
  selectedModel: string;
  selectedEffort: ReasoningEffortLevel;
  selectedAgent: string;
  favoriteModels: string[];
  recentModels: string[];
  providers: Record<string, ProviderStatus>;
  modelHealthStatus: Record<string, 'ok' | 'error'>;
  statusSynced: boolean;
  preferences: ModelPreference;
  setModels: (models: AIModel[]) => void;
  setAgents: (agents: Agent[]) => void;
  setSelectedModel: (modelId: string) => void;
  setSelectedEffort: (effort: ReasoningEffortLevel) => void;
  toggleFavoriteModel: (modelId: string) => void;
  recordRecentModel: (modelId: string) => void;
  setSelectedAgent: (agentId: string) => void;
  updateProviderStatus: (providerId: string, status: Partial<ProviderStatus>) => void;
  updatePreferences: (prefs: Partial<ModelPreference>) => void;
  syncProviderStatus: () => Promise<void>;
}

export const defaultAgents: Agent[] = INITIAL_AGENTS;

export const VALID_FLOAT_MODELS = Array.from(
  new Set([
    ...INITIAL_MODELS.map((m) => m.id),
    'gemini-4-argon',
    'gpt-6-astra',
    'gpt-6-sol',
    'gpt-6-luna',
    'claude-sonnet-5-5',
    'claude-opus-5-5',
    'claude-haiku-5-5'
  ])
);

function inferProviderIdForModel(modelId: string, models: AIModel[] = INITIAL_MODELS): 'google' | 'openai' | 'anthropic' | string {
  const found = models.find((m) => m.id === modelId);
  if (found?.providerId) return found.providerId.toLowerCase();
  const normalized = String(modelId || '').toLowerCase();
  if (normalized.startsWith('gemini')) return 'google';
  if (normalized.startsWith('claude')) return 'anthropic';
  if (normalized.startsWith('gpt') || normalized.startsWith('o1') || normalized.startsWith('o3') || normalized.startsWith('o4')) {
    return 'openai';
  }
  return '';
}

export function isModelProviderConfigured(
  modelId: string,
  providers?: Record<string, ProviderStatus>,
  models: AIModel[] = INITIAL_MODELS
): boolean {
  const providerId = inferProviderIdForModel(modelId, models);
  if (!providerId) return false;
  if (providerId === 'auto') {
    if (providers) {
      return Boolean(providers.google?.configured || providers.openai?.configured || providers.anthropic?.configured);
    }
    return (
      isProviderKeyConfigured('google') ||
      isProviderKeyConfigured('openai') ||
      isProviderKeyConfigured('anthropic')
    );
  }
  if (providers && providerId in providers) {
    return Boolean(providers[providerId]?.configured);
  }
  if (providerId === 'google' || providerId === 'openai' || providerId === 'anthropic') {
    return isProviderKeyConfigured(providerId);
  }
  return false;
}

export function resolveDefaultSelectedModel(
  models: AIModel[] = INITIAL_MODELS,
  providers?: Record<string, ProviderStatus>,
  savedModelId?: string | null
): string {
  if (
    savedModelId &&
    VALID_FLOAT_MODELS.includes(savedModelId) &&
    isModelProviderConfigured(savedModelId, providers, models)
  ) {
    return savedModelId;
  }

  for (const model of models) {
    if (VALID_FLOAT_MODELS.includes(model.id) && isModelProviderConfigured(model.id, providers, models)) {
      return model.id;
    }
  }

  // Fallback to Argon (first catalog model) if no provider env key is detected yet
  return models[0]?.id || 'gemini-4-argon';
}

/**
 * Pure helper used by UI components (e.g. ModelSelector) and tests:
 * Hides a model in the UI if its provider key is missing (`configured === false`)
 * or if its health check failed (`modelHealthStatus[m.id] === 'error'`).
 */
export function filterVisibleModelsForUI(
  models: AIModel[],
  providers?: Record<string, ProviderStatus>,
  modelHealthStatus?: Record<string, 'ok' | 'error'>,
  statusSynced = false
): AIModel[] {
  return models.filter((m) => {
    if (m.status === 'CONFIG_REQUIRED' || m.status === 'UNAVAILABLE') {
      return false;
    }
    if (modelHealthStatus && modelHealthStatus[m.id] === 'error') {
      return false;
    }
    if (statusSynced && providers) {
      const pId = m.providerId?.toLowerCase();
      if (pId && pId !== 'auto' && providers[pId] && !providers[pId].configured) {
        return false;
      }
    }
    return true;
  });
}

const getInitialProviders = (): Record<string, ProviderStatus> => {
  const googleConfigured = isProviderKeyConfigured('google');
  const openaiConfigured = isProviderKeyConfigured('openai');
  const anthropicConfigured = isProviderKeyConfigured('anthropic');
  return {
    google: { enabled: true, configured: googleConfigured, defaultModel: 'gemini-4-argon' },
    openai: { enabled: true, configured: openaiConfigured, defaultModel: 'gpt-6-astra' },
    anthropic: { enabled: true, configured: anthropicConfigured, defaultModel: 'claude-sonnet-5-5' },
    auto: {
      enabled: true,
      configured: googleConfigured || openaiConfigured || anthropicConfigured,
      defaultModel: googleConfigured ? 'gemini-4-argon' : openaiConfigured ? 'gpt-6-astra' : 'claude-sonnet-5-5'
    }
  };
};

export const getInitialSelectedModel = (providersOverride?: Record<string, ProviderStatus>) => {
  const providers = providersOverride || getInitialProviders();
  let saved: string | null = null;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      saved = localStorage.getItem('float_selected_model');
    } catch {}
  }
  const resolved = resolveDefaultSelectedModel(INITIAL_MODELS, providers, saved);
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('float_selected_model', resolved);
    } catch {}
  }
  return resolved;
};

const getInitialEffort = (): ReasoningEffortLevel => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('float_selected_effort');
      if (saved === 'low' || saved === 'medium' || saved === 'high') {
        return saved;
      }
    } catch {}
  }
  return 'high';
};

const getInitialFavorites = (): string[] => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('float_favorite_models');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((m) => VALID_FLOAT_MODELS.includes(m));
          if (filtered.length > 0) return filtered;
        }
      }
    } catch {}
  }
  return ['gemini-4-argon', 'gpt-6-astra', 'gpt-6-sol'];
};

const getInitialRecents = (): string[] => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('float_recent_models');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((m) => VALID_FLOAT_MODELS.includes(m));
          if (filtered.length > 0) return filtered;
        }
      }
    } catch {}
  }
  return ['gemini-4-argon', 'gpt-6-astra', 'gpt-6-sol'];
};

export const useAIStore = create<AIStore>((set) => ({
  models: INITIAL_MODELS,
  agents: INITIAL_AGENTS,
  selectedModel: getInitialSelectedModel(),
  selectedEffort: getInitialEffort(),
  selectedAgent: 'main-agent',
  favoriteModels: getInitialFavorites(),
  recentModels: getInitialRecents(),
  providers: getInitialProviders(),
  modelHealthStatus: {},
  statusSynced: false,
  preferences: {
    preferredModel: getInitialSelectedModel(),
    fallbackModel: 'gemini-4-argon',
    speedPreference: 'fast',
    qualityPreference: 'high'
  },
  setModels: (models) => {
    const seen = new Set<string>();
    const deduplicated = models.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    set({ models: deduplicated });
  },
  setAgents: (agents) => set({ agents }),
  setSelectedModel: (selectedModel) => {
    set((state) => {
      const fallbackDefault = resolveDefaultSelectedModel(state.models, state.providers, null);
      const validModel = VALID_FLOAT_MODELS.includes(selectedModel) ? selectedModel : fallbackDefault;
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('float_selected_model', validModel);
        } catch {}
      }
      const updatedRecents = [
        validModel,
        ...state.recentModels.filter((id) => id !== validModel && VALID_FLOAT_MODELS.includes(id))
      ].slice(0, 5);
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('float_recent_models', JSON.stringify(updatedRecents));
        } catch {}
      }
      return { selectedModel: validModel, recentModels: updatedRecents };
    });
  },
  setSelectedEffort: (selectedEffort) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('float_selected_effort', selectedEffort);
      } catch {}
    }
    set({ selectedEffort });
  },
  toggleFavoriteModel: (modelId) => {
    set((state) => {
      const isFav = state.favoriteModels.includes(modelId);
      const favoriteModels = isFav
        ? state.favoriteModels.filter((id) => id !== modelId)
        : [...state.favoriteModels, modelId];
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('float_favorite_models', JSON.stringify(favoriteModels));
        } catch {}
      }
      return { favoriteModels };
    });
  },
  recordRecentModel: (modelId) => {
    set((state) => {
      const updatedRecents = [modelId, ...state.recentModels.filter((id) => id !== modelId)].slice(0, 5);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('float_recent_models', JSON.stringify(updatedRecents));
        } catch {}
      }
      return { recentModels: updatedRecents };
    });
  },
  setSelectedAgent: (selectedAgent) => set({ selectedAgent }),
  updateProviderStatus: (providerId, status) =>
    set((state) => ({
      providers: { ...state.providers, [providerId]: { ...state.providers[providerId], ...status } }
    })),
  updatePreferences: (prefs) =>
    set((state) => ({
      preferences: { ...state.preferences, ...prefs }
    })),
  syncProviderStatus: async () => {
    try {
      const [statusRes, healthRes] = await Promise.all([
        fetch('/api/ai/models/status', { headers: { Accept: 'application/json' } }).catch(() => null),
        fetch('/api/ai/health', { headers: { Accept: 'application/json' } }).catch(() => null)
      ]);

      let statusData: any = null;
      if (statusRes && statusRes.ok && (statusRes.headers.get('content-type') || '').includes('application/json')) {
        statusData = await statusRes.json().catch(() => null);
      }

      let healthData: any = null;
      if (healthRes && healthRes.ok && (healthRes.headers.get('content-type') || '').includes('application/json')) {
        healthData = await healthRes.json().catch(() => null);
      }

      if (statusData?.providers || healthData?.providers) {
        set((state) => {
          const updatedProviders = { ...state.providers };
          const updatedHealth: Record<string, 'ok' | 'error'> = { ...state.modelHealthStatus };

          if (statusData?.providers) {
            for (const [key, val] of Object.entries(
              statusData.providers as Record<string, { name: string; configured: boolean }>
            )) {
              updatedProviders[key] = {
                enabled: true,
                configured: val.configured,
                defaultModel: updatedProviders[key]?.defaultModel || ''
              };
            }
          }

          if (healthData?.providers) {
            for (const [pKey, pVal] of Object.entries(healthData.providers as Record<string, any>)) {
              if (typeof pVal?.configured === 'boolean') {
                updatedProviders[pKey] = {
                  enabled: true,
                  configured: pVal.configured,
                  defaultModel: updatedProviders[pKey]?.defaultModel || ''
                };
              }
              if (pVal?.models && typeof pVal.models === 'object') {
                for (const [mId, mReport] of Object.entries(pVal.models as Record<string, any>)) {
                  if (mReport?.status === 'ok' || mReport?.status === 'error') {
                    updatedHealth[mId] = mReport.status;
                  }
                }
              } else if (pVal?.modelAvailable === false) {
                for (const m of state.models) {
                  if (m.providerId?.toLowerCase() === pKey) {
                    updatedHealth[m.id] = 'error';
                  }
                }
              }
            }
          }

          const updatedModels = state.models.map((m) => {
            const pId = m.providerId?.toLowerCase();
            const isConfigured =
              pId === 'auto'
                ? Boolean(updatedProviders.openai?.configured || updatedProviders.google?.configured)
                : Boolean(updatedProviders[pId]?.configured);
            const healthFailed = updatedHealth[m.id] === 'error';

            if (!isConfigured) {
              return {
                ...m,
                status: 'CONFIG_REQUIRED' as const,
                availability: 'Add key to enable',
                availabilityDetails: 'Add key to enable'
              };
            }
            if (healthFailed) {
              return {
                ...m,
                status: 'UNAVAILABLE' as const,
                availability: 'Unavailable (health check failed)',
                availabilityDetails: 'Model health check failed'
              };
            }
            return {
              ...m,
              status: 'AVAILABLE' as const,
              availability: 'Available',
              availabilityDetails: m.availabilityDetails
            };
          });

          const nextSelectedModel = resolveDefaultSelectedModel(
            updatedModels,
            updatedProviders,
            state.selectedModel
          );
          if (typeof window !== 'undefined' && typeof localStorage !== 'undefined' && nextSelectedModel !== state.selectedModel) {
            try {
              localStorage.setItem('float_selected_model', nextSelectedModel);
            } catch {}
          }

          return {
            providers: updatedProviders,
            modelHealthStatus: updatedHealth,
            statusSynced: true,
            models: updatedModels,
            selectedModel: nextSelectedModel
          };
        });
      }
    } catch (err) {
      console.warn('Failed to sync provider status:', err);
    }
  }
}));
