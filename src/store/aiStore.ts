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
  'gemini-pro'
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
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
  }
  return ['gemini-3.1-flash-lite', 'claude-3-7-sonnet-20250219', 'o3-mini', 'gemini-3.8-flash'];
};

const getInitialRecents = (): string[] => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('float_recent_models');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
  }
  return ['auto', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
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
    google: { enabled: true, configured: true, defaultModel: 'gemini-3.1-flash-lite' },
    openai: { enabled: true, configured: false, defaultModel: 'gpt-4o' },
    anthropic: { enabled: true, configured: false, defaultModel: 'claude-3-7-sonnet-20250219' },
    xai: { enabled: true, configured: false, defaultModel: 'grok-2-1212' },
    deepseek: { enabled: true, configured: false, defaultModel: 'deepseek-chat' },
    auto: { enabled: true, configured: true, defaultModel: 'gemini-3.1-flash-lite' },
  },
  preferences: {
    preferredModel: 'auto',
    fallbackModel: 'gemini-3.1-flash-lite',
    speedPreference: 'fast',
    qualityPreference: 'high'
  },
  setModels: (models) => set({ models }),
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
              if (pId === 'auto') return m;
              const isConfigured = updatedProviders[pId]?.configured ?? false;
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
