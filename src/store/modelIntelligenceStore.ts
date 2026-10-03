import { create } from 'zustand';
import { 
  VERIFIED_MODELS, 
  VerifiedModel, 
  AvailabilityStatus 
} from '../data/verifiedModels';
import { 
  VERIFIED_BENCHMARK_DEFINITIONS, 
  VERIFIED_BENCHMARK_SCORES, 
  VerifiedBenchmarkDefinition, 
  VerifiedBenchmarkScore,
  EvaluatorType
} from '../data/verifiedBenchmarks';

export interface ProviderServerStatus {
  name: string;
  configured: boolean;
}

export interface WorkloadPreset {
  id: string;
  name: string;
  description: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export const WORKLOAD_PRESETS: WorkloadPreset[] = [
  {
    id: 'small-fix',
    name: 'Small Bug Fix / Syntax Repair',
    description: 'Single function edit with error traceback and unit test check.',
    inputTokens: 3500,
    outputTokens: 600,
    cachedTokens: 1000
  },
  {
    id: 'feature-refactor',
    name: 'Feature Implementation / Refactor',
    description: 'Multi-file coordination with module imports and type definitions.',
    inputTokens: 35000,
    outputTokens: 4500,
    cachedTokens: 15000
  },
  {
    id: 'repo-scan',
    name: 'Full Repository Architecture Scan',
    description: 'Deep codebase context loading across multiple directories.',
    inputTokens: 160000,
    outputTokens: 8000,
    cachedTokens: 80000
  },
  {
    id: 'high-volume-batch',
    name: 'Continuous Agentic Dev Loop (1M Batch)',
    description: 'Extensive iterative test and patch cycle with persistent context.',
    inputTokens: 1000000,
    outputTokens: 150000,
    cachedTokens: 600000
  }
];

interface ModelIntelligenceState {
  models: VerifiedModel[];
  benchmarks: VerifiedBenchmarkDefinition[];
  benchmarkScores: VerifiedBenchmarkScore[];
  providerStatus: Record<string, ProviderServerStatus>;
  selectedBenchmarkId: string;
  selectedProviderFilter: string;
  selectedEvaluatorFilter: string;
  searchQuery: string;
  selectedModelId: string | null;
  comparisonModelIds: string[];
  activeWorkload: WorkloadPreset;
  customInputTokens: number;
  customOutputTokens: number;
  customCachedTokens: number;
  isLoadingStatus: boolean;
  lastStatusCheck: number | null;

  // Actions
  fetchProviderStatus: () => Promise<void>;
  setSelectedBenchmarkId: (id: string) => void;
  setSelectedProviderFilter: (provider: string) => void;
  setSelectedEvaluatorFilter: (evaluator: string) => void;
  setSearchQuery: (query: string) => void;
  setSelectedModelId: (id: string | null) => void;
  toggleComparisonModel: (id: string) => void;
  clearComparison: () => void;
  setActiveWorkload: (workload: WorkloadPreset) => void;
  setCustomTokens: (input: number, output: number, cached: number) => void;
  calculateModelCost: (modelId: string, inputTokens?: number, outputTokens?: number, cachedTokens?: number) => {
    inputCost: number;
    outputCost: number;
    cachedCost: number;
    totalCost: number;
    currency: string;
  } | null;
}

export const useModelIntelligenceStore = create<ModelIntelligenceState>((set, get) => ({
  models: VERIFIED_MODELS,
  benchmarks: VERIFIED_BENCHMARK_DEFINITIONS,
  benchmarkScores: VERIFIED_BENCHMARK_SCORES,
  providerStatus: {},
  selectedBenchmarkId: 'all',
  selectedProviderFilter: 'all',
  selectedEvaluatorFilter: 'all',
  searchQuery: '',
  selectedModelId: null,
  comparisonModelIds: ['gemini-3.1-flash-lite', 'claude-3-7-sonnet-20250219'],
  activeWorkload: WORKLOAD_PRESETS[1], // Feature Refactor
  customInputTokens: WORKLOAD_PRESETS[1].inputTokens,
  customOutputTokens: WORKLOAD_PRESETS[1].outputTokens,
  customCachedTokens: WORKLOAD_PRESETS[1].cachedTokens,
  isLoadingStatus: false,
  lastStatusCheck: null,

  fetchProviderStatus: async () => {
    set({ isLoadingStatus: true });
    try {
      const res = await fetch('/api/ai/models/status');
      if (res.ok) {
        const data = await res.json();
        const providers: Record<string, ProviderServerStatus> = data.providers || {};
        
        // Dynamically update model availability statuses based on server provider status
        const updatedModels = get().models.map(model => {
          const providerInfo = providers[model.providerId];
          let status: AvailabilityStatus = model.availabilityStatus;
          let details = model.availabilityDetails;

          if (providerInfo) {
            if (providerInfo.configured) {
              status = 'AVAILABLE';
              details = `Verified active in FLOAT runtime via ${providerInfo.name} integration.`;
            } else {
              status = 'CONFIG_REQUIRED';
              details = `Provider-supported architecture. Server-side API key (${model.providerId.toUpperCase()}_API_KEY) is required.`;
            }
          }

          return {
            ...model,
            availabilityStatus: status,
            availabilityDetails: details
          };
        });

        set({
          providerStatus: providers,
          models: updatedModels,
          isLoadingStatus: false,
          lastStatusCheck: Date.now()
        });
      } else {
        set({ isLoadingStatus: false });
      }
    } catch {
      set({ isLoadingStatus: false });
    }
  },

  setSelectedBenchmarkId: (id: string) => set({ selectedBenchmarkId: id }),
  setSelectedProviderFilter: (provider: string) => set({ selectedProviderFilter: provider }),
  setSelectedEvaluatorFilter: (evaluator: string) => set({ selectedEvaluatorFilter: evaluator }),
  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setSelectedModelId: (id: string | null) => set({ selectedModelId: id }),

  toggleComparisonModel: (id: string) => {
    const current = get().comparisonModelIds;
    if (current.includes(id)) {
      set({ comparisonModelIds: current.filter(m => m !== id) });
    } else {
      if (current.length >= 4) {
        set({ comparisonModelIds: [...current.slice(1), id] });
      } else {
        set({ comparisonModelIds: [...current, id] });
      }
    }
  },

  clearComparison: () => set({ comparisonModelIds: [] }),

  setActiveWorkload: (workload: WorkloadPreset) => {
    set({
      activeWorkload: workload,
      customInputTokens: workload.inputTokens,
      customOutputTokens: workload.outputTokens,
      customCachedTokens: workload.cachedTokens
    });
  },

  setCustomTokens: (input: number, output: number, cached: number) => {
    set({
      customInputTokens: Math.max(0, input),
      customOutputTokens: Math.max(0, output),
      customCachedTokens: Math.max(0, Math.min(cached, input))
    });
  },

  calculateModelCost: (modelId: string, inputTokens?: number, outputTokens?: number, cachedTokens?: number) => {
    const model = get().models.find(m => m.id === modelId);
    if (!model || !model.pricing) return null;

    const inTokens = inputTokens !== undefined ? inputTokens : get().customInputTokens;
    const outTokens = outputTokens !== undefined ? outputTokens : get().customOutputTokens;
    const cacheTokens = cachedTokens !== undefined ? cachedTokens : get().customCachedTokens;

    // Normalization per 1M tokens: tokens / 1,000,000 * rate
    const uncachedTokens = Math.max(0, inTokens - cacheTokens);
    const inputCost = (uncachedTokens / 1_000_000) * model.pricing.inputCostPer1M;
    const outputCost = (outTokens / 1_000_000) * model.pricing.outputCostPer1M;
    const cachedRate = model.pricing.cachedInputCostPer1M !== undefined 
      ? model.pricing.cachedInputCostPer1M 
      : model.pricing.inputCostPer1M * 0.5;
    const cachedCost = (cacheTokens / 1_000_000) * cachedRate;

    return {
      inputCost,
      outputCost,
      cachedCost,
      totalCost: inputCost + outputCost + cachedCost,
      currency: 'USD'
    };
  }
}));
