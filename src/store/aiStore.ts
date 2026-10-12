import { create } from 'zustand';
import { AIModel, Agent, ModelPreference, ProviderStatus } from '../types/ai';
import { INITIAL_MODELS, INITIAL_AGENTS } from '../features/ai/registry';

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

const OBSOLETE_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-pro',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-pro',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.1-pro-preview',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
  'claude-opus-5.5',
  'claude-opus-5',
  'claude-fable-5.1',
  'claude-sonnet-5.5',
  'grok-4.7',
  'grok-4.6',
  'grok-2-1212',
  'grok-2',
  'grok-2-vision-1212',
  'grok-beta',
  'composer-2.5',
  'muse-spark-1.3'
];

const getInitialSelectedModel = () => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('float_selected_model');
      if (saved && !OBSOLETE_MODELS.includes(saved)) {
        return saved;
      }
      if (saved && OBSOLETE_MODELS.includes(saved)) {
        localStorage.setItem('float_selected_model', 'auto');
      }
    } catch {}
  }
  return 'auto';
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
  return 'medium';
};

const getInitialFavorites = (): string[] => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('float_favorite_models');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && !parsed.some(m => OBSOLETE_MODELS.includes(m))) return parsed;
      }
    } catch {}
  }
  return ['gpt-4o', 'o3-mini', 'gpt-4o-mini', 'o1'];
};

const getInitialRecents = (): string[] => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('float_recent_models');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && !parsed.some(m => OBSOLETE_MODELS.includes(m))) return parsed;
      }
    } catch {}
  }
  return ['auto', 'gpt-4o', 'gpt-4o-mini'];
};

export const useAIStore = create<AIStore>((set) => ({
  models: INITIAL_MODELS,
  agents: INITIAL_AGENTS,
  selectedModel: getInitialSelectedModel(),
  selectedEffort: getInitialEffort(),
  selectedAgent: 'main-agent',
  favoriteModels: getInitialFavorites(),
  recentModels: getInitialRecents(),
  providers: {
    openai: { enabled: true, configured: false, defaultModel: 'gpt-4o' },
    auto: { enabled: true, configured: false, defaultModel: 'gpt-4o' }
  },
  preferences: {
    preferredModel: 'auto',
    fallbackModel: 'gpt-4o-mini',
    speedPreference: 'fast',
    qualityPreference: 'high'
  },
  setModels: (models) => {
    const seen = new Set<string>();
    const deduplicated = models.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    set({ models: deduplicated });
  },
  setAgents: (agents) => set({ agents }),
  setSelectedModel: (selectedModel) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('float_selected_model', selectedModel);
      } catch {}
    }
    set((state) => {
      const updatedRecents = [selectedModel, ...state.recentModels.filter(id => id !== selectedModel)].slice(0, 5);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('float_recent_models', JSON.stringify(updatedRecents));
        } catch {}
      }
      return { selectedModel, recentModels: updatedRecents };
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
        ? state.favoriteModels.filter(id => id !== modelId)
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
      const updatedRecents = [modelId, ...state.recentModels.filter(id => id !== modelId)].slice(0, 5);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('float_recent_models', JSON.stringify(updatedRecents));
        } catch {}
      }
      return { recentModels: updatedRecents };
    });
  },
  setSelectedAgent: (selectedAgent) => set({ selectedAgent }),
  updateProviderStatus: (providerId, status) => set((state) => ({
    providers: { ...state.providers, [providerId]: { ...state.providers[providerId], ...status } }
  })),
  updatePreferences: (prefs) => set((state) => ({
    preferences: { ...state.preferences, ...prefs }
  })),
  syncProviderStatus: async () => {
    try {
      const res = await fetch('/api/ai/models/status');
      if (res.ok) {
        const data = await res.json();
        if (data.providers) {
          set((state) => {
            const updatedProviders = { ...state.providers };
            for (const [key, val] of Object.entries(data.providers as Record<string, { name: string; configured: boolean }>)) {
              updatedProviders[key] = {
                enabled: true,
                configured: val.configured,
                defaultModel: updatedProviders[key]?.defaultModel || ''
              };
            }

            // Sync model availability based on real provider configuration
            const updatedModels = state.models.map((m) => {
              const pId = m.providerId?.toLowerCase();
              const isConfigured = (pId === 'auto' || pId === 'openai')
                ? (updatedProviders.openai?.configured ?? false)
                : (updatedProviders[pId]?.configured ?? false);
              return {
                ...m,
                status: isConfigured ? ('AVAILABLE' as const) : ('CONFIG_REQUIRED' as const),
                availability: isConfigured ? 'Available' : 'Configuration required'
              };
            });

            return { providers: updatedProviders, models: updatedModels };
          });
        }
      }
    } catch (err) {
      console.error('Failed to sync provider status:', err);
    }
  }
}));
