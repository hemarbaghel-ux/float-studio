import { create } from 'zustand';
import { AIModel, ModelPreference, ProviderStatus } from '../types/ai';
import { INITIAL_MODELS } from '../features/ai/registry';

export type ReasoningEffortLevel = 'low' | 'medium' | 'high';

interface AIStore {
  models: AIModel[];
  selectedModel: string;
  selectedEffort: ReasoningEffortLevel;
  favoriteModels: string[];
  recentModels: string[];
  providers: Record<string, ProviderStatus>;
  preferences: ModelPreference;
  setModels: (models: AIModel[]) => void;
  setSelectedModel: (modelId: string) => void;
  setSelectedEffort: (effort: ReasoningEffortLevel) => void;
  toggleFavoriteModel: (modelId: string) => void;
  recordRecentModel: (modelId: string) => void;
  updateProviderStatus: (providerId: string, status: Partial<ProviderStatus>) => void;
  updatePreferences: (prefs: Partial<ModelPreference>) => void;
  syncProviderStatus: () => Promise<void>;
}

export const VALID_FLOAT_MODELS = Array.from(
  new Set([
    ...INITIAL_MODELS.map(m => m.id),
    'gpt-6-astra',
    'gpt-6.1-sol'
  ])
);

const getInitialSelectedModel = () => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('float_selected_model');
      if (saved && VALID_FLOAT_MODELS.includes(saved)) {
        return saved;
      }
      localStorage.setItem('float_selected_model', 'gpt-6-astra');
    } catch (err: any) {
      console.warn('[AIStore] LocalStorage access warning:', err?.message || err);
    }
  }
  return 'gpt-6-astra';
};

const getInitialEffort = (): ReasoningEffortLevel => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('float_selected_effort');
      if (saved === 'low' || saved === 'medium' || saved === 'high') {
        return saved;
      }
    } catch (err: any) {
      console.warn('[AIStore] LocalStorage access warning:', err?.message || err);
    }
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
          const filtered = parsed.filter(m => VALID_FLOAT_MODELS.includes(m));
          if (filtered.length > 0) return filtered;
        }
      }
    } catch (err: any) {
      console.warn('[AIStore] LocalStorage access warning:', err?.message || err);
    }
  }
  return ['gpt-6-astra', 'gpt-6.1-sol'];
};

const getInitialRecents = (): string[] => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('float_recent_models');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(m => VALID_FLOAT_MODELS.includes(m));
          if (filtered.length > 0) return filtered;
        }
      }
    } catch (err: any) {
      console.warn('[AIStore] LocalStorage access warning:', err?.message || err);
    }
  }
  return ['gpt-6-astra', 'gpt-6.1-sol'];
};

export const useAIStore = create<AIStore>((set) => ({
  models: INITIAL_MODELS,
  selectedModel: getInitialSelectedModel(),
  selectedEffort: getInitialEffort(),
  favoriteModels: getInitialFavorites(),
  recentModels: getInitialRecents(),
  providers: {
    openai: { enabled: true, configured: false, defaultModel: 'gpt-6-astra' },
    google: { enabled: true, configured: false, defaultModel: 'gemini-3.8-flash' },
    auto: { enabled: true, configured: false, defaultModel: 'gpt-6-astra' }
  },
  preferences: {
    preferredModel: 'gpt-6-astra',
    fallbackModel: 'gpt-6.1-sol',
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
  setSelectedModel: (selectedModel) => {
    const validModel = VALID_FLOAT_MODELS.includes(selectedModel) ? selectedModel : 'gpt-6-astra';
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('float_selected_model', validModel);
      } catch (err: any) {
      console.warn('[AIStore] LocalStorage access warning:', err?.message || err);
    }
    }
    set((state) => {
      const updatedRecents = [validModel, ...state.recentModels.filter(id => id !== validModel && VALID_FLOAT_MODELS.includes(id))].slice(0, 5);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('float_recent_models', JSON.stringify(updatedRecents));
        } catch (err: any) {
      console.warn('[AIStore] LocalStorage access warning:', err?.message || err);
    }
      }
      return { selectedModel: validModel, recentModels: updatedRecents };
    });
  },
  setSelectedEffort: (selectedEffort) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('float_selected_effort', selectedEffort);
      } catch (err: any) {
      console.warn('[AIStore] LocalStorage access warning:', err?.message || err);
    }
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
        } catch (err: any) {
      console.warn('[AIStore] LocalStorage access warning:', err?.message || err);
    }
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
        } catch (err: any) {
      console.warn('[AIStore] LocalStorage access warning:', err?.message || err);
    }
      }
      return { recentModels: updatedRecents };
    });
  },
  updateProviderStatus: (providerId, status) => set((state) => ({
    providers: { ...state.providers, [providerId]: { ...state.providers[providerId], ...status } }
  })),
  updatePreferences: (prefs) => set((state) => ({
    preferences: { ...state.preferences, ...prefs }
  })),
  syncProviderStatus: async () => {
    try {
      const res = await fetch('/api/ai/models/status', {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          // Non-JSON response (e.g. HTML gateway page during dev startup); safely ignore
          return;
        }
        const text = await res.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          return;
        }
        if (data && data.providers) {
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
                availability: isConfigured
                  ? 'Server credential is configured; model access has not been verified.'
                  : 'Server credential is not configured.'
              };
            });

            return { providers: updatedProviders, models: updatedModels };
          });
        }
      }

      const catalogRes = await fetch('/api/ai/models', { headers: { Accept: 'application/json' } });
      if (catalogRes.ok && (catalogRes.headers.get('content-type') || '').includes('application/json')) {
        const catalog = await catalogRes.json();
        if (Array.isArray(catalog?.models)) {
          const serverModels: AIModel[] = catalog.models.map((model: any) => ({
            id: model.id,
            exactModelId: model.apiModelId,
            apiModelId: model.apiModelId,
            providerId: model.providerId,
            provider: model.providerId === 'openai' ? 'OpenAI' : model.providerId === 'google' ? 'Google Gemini' : model.providerId,
            displayName: model.displayName,
            shortName: model.displayName,
            family: model.providerId,
            description: model.description,
            capabilities: model.capabilities,
            capabilitiesList: Object.entries(model.capabilities || {}).filter(([, enabled]) => enabled).map(([name]) => name),
            contextWindow: model.contextWindow || 0,
            status: model.status,
            speed: 'balanced',
            availability: model.availabilityDetails,
            availabilityDetails: model.availabilityDetails,
            limits: model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : undefined,
            pricing: model.pricing ? {
              inputCost: model.pricing.inputCostPer1M,
              outputCost: model.pricing.outputCostPer1M,
              currency: model.pricing.currency,
              effectiveDate: model.pricing.effectiveDate
            } : undefined,
            pricingUrl: model.pricing?.sourceUrl,
            supportsStreaming: model.capabilities?.streaming === true,
            supportsTools: model.capabilities?.tools === true,
            supportsVision: model.capabilities?.vision === true,
            supportsReasoning: model.capabilities?.reasoning === true
          }));
          if (serverModels.length > 0) set({ models: serverModels });
        }
      }
    } catch (err) {
      console.warn('Failed to sync provider status:', err);
    }
  }
}));
