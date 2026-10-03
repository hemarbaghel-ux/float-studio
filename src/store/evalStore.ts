import { create } from 'zustand';
import { EvalTask, EvalRun, Benchmark, LeaderboardEntry, HumanReview } from '../types/evals';
import { evalService } from '../services/evalService';

interface EvalState {
  tasks: EvalTask[];
  runs: EvalRun[];
  benchmarks: Benchmark[];
  leaderboard: LeaderboardEntry[];
  selectedRun: EvalRun | null;
  activeBenchmark: Benchmark | null;
  isLoading: boolean;
  isPolling: boolean;
  selectedModelsForComparison: string[];
  selectedAgentsForComparison: string[];
  activeTab: string;
  error: string | null;

  // Actions
  setActiveTab: (tab: string) => void;
  setSelectedRun: (run: EvalRun | null) => void;
  setSelectedModelsForComparison: (models: string[]) => void;
  setSelectedAgentsForComparison: (agents: string[]) => void;
  setActiveBenchmark: (bench: Benchmark | null) => void;

  fetchTasks: () => Promise<void>;
  fetchRuns: () => Promise<void>;
  fetchBenchmarks: () => Promise<void>;
  fetchLeaderboard: (benchmarkId?: string, minEvaluations?: number) => Promise<void>;
  fetchAll: () => Promise<void>;

  createTask: (task: Omit<EvalTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<EvalTask>;
  deleteTask: (id: string) => Promise<void>;
  createBenchmark: (bench: Omit<Benchmark, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Benchmark>;

  runEval: (params: {
    taskId: string;
    modelId: string;
    agentId: string;
    providerId: string;
    benchmarkId?: string;
  }) => Promise<EvalRun>;

  runBatchEval: (params: {
    taskIds: string[];
    modelIds: string[];
    agentId: string;
    benchmarkId?: string;
  }) => Promise<void>;

  cancelRun: (id: string) => Promise<void>;
  retryRun: (id: string) => Promise<EvalRun>;
  submitReview: (review: Omit<HumanReview, 'id' | 'reviewTimestamp'>) => Promise<void>;
  exportRuns: (format: 'json' | 'csv') => void;
}

export const useEvalStore = create<EvalState>((set, get) => {
  let pollTimer: any = null;

  const startPollingIfNeeded = (runs: EvalRun[]) => {
    const hasActive = runs.some(r => r.status === 'running' || r.status === 'queued' || r.status === 'Running' || r.status === 'Queued');
    if (hasActive && !pollTimer) {
      pollTimer = setInterval(async () => {
        const latestRuns = await evalService.getRuns();
        set({ runs: latestRuns });

        // Update selectedRun if currently viewing an active run
        const currSelected = get().selectedRun;
        if (currSelected) {
          const updated = latestRuns.find(r => r.id === currSelected.id);
          if (updated) set({ selectedRun: updated });
        }

        const stillActive = latestRuns.some(r => r.status === 'running' || r.status === 'queued' || r.status === 'Running' || r.status === 'Queued');
        if (!stillActive && pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
          // Refresh leaderboard on completion
          get().fetchLeaderboard();
        }
      }, 1200);
    } else if (!hasActive && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  return {
    tasks: [],
    runs: [],
    benchmarks: [],
    leaderboard: [],
    selectedRun: null,
    activeBenchmark: null,
    isLoading: false,
    isPolling: false,
    selectedModelsForComparison: ['gpt-4o', 'gemini-3.1-flash-lite'],
    selectedAgentsForComparison: ['main-agent', 'coder-agent'],
    activeTab: 'overview',
    error: null,

    setActiveTab: (tab) => set({ activeTab: tab }),
    setSelectedRun: (run) => set({ selectedRun: run }),
    setSelectedModelsForComparison: (models) => set({ selectedModelsForComparison: models }),
    setSelectedAgentsForComparison: (agents) => set({ selectedAgentsForComparison: agents }),
    setActiveBenchmark: (bench) => set({ activeBenchmark: bench }),

    fetchTasks: async () => {
      try {
        const tasks = await evalService.getTasks();
        set({ tasks });
      } catch (e: any) {
        console.error('Failed to fetch tasks:', e);
      }
    },

    fetchRuns: async () => {
      try {
        const runs = await evalService.getRuns();
        set({ runs });
        startPollingIfNeeded(runs);
      } catch (e: any) {
        console.error('Failed to fetch runs:', e);
      }
    },

    fetchBenchmarks: async () => {
      try {
        const benchmarks = await evalService.getBenchmarks();
        set({ benchmarks });
      } catch (e: any) {
        console.error('Failed to fetch benchmarks:', e);
      }
    },

    fetchLeaderboard: async (benchmarkId, minEvaluations = 1) => {
      try {
        const leaderboard = await evalService.getLeaderboard(benchmarkId, minEvaluations);
        set({ leaderboard });
      } catch (e: any) {
        console.error('Failed to fetch leaderboard:', e);
      }
    },

    fetchAll: async () => {
      set({ isLoading: true, error: null });
      try {
        const [tasks, runs, benchmarks, leaderboard] = await Promise.all([
          evalService.getTasks(),
          evalService.getRuns(),
          evalService.getBenchmarks(),
          evalService.getLeaderboard()
        ]);
        set({ tasks, runs, benchmarks, leaderboard, isLoading: false });
        startPollingIfNeeded(runs);
      } catch (e: any) {
        set({ isLoading: false, error: e.message || 'Failed to initialize evaluations data.' });
      }
    },

    createTask: async (task) => {
      const created = await evalService.createTask(task);
      set((state) => ({ tasks: [...state.tasks, created] }));
      return created;
    },

    deleteTask: async (id) => {
      await evalService.deleteTask(id);
      set((state) => ({ tasks: state.tasks.filter(t => t.id !== id) }));
    },

    createBenchmark: async (bench) => {
      const created = await evalService.createBenchmark(bench);
      set((state) => ({ benchmarks: [...state.benchmarks, created] }));
      return created;
    },

    runEval: async (params) => {
      const run = await evalService.runEvaluation(params);
      set((state) => {
        const updated = [run, ...state.runs.filter(r => r.id !== run.id)];
        return { runs: updated, selectedRun: run };
      });
      startPollingIfNeeded([run]);
      return run;
    },

    runBatchEval: async ({ taskIds, modelIds, agentId, benchmarkId }) => {
      for (const modelId of modelIds) {
        for (const taskId of taskIds) {
          // provider is determined by model prefix or router
          const providerId = modelId.startsWith('gemini') ? 'google' : modelId.startsWith('claude') ? 'anthropic' : 'openai';
          await get().runEval({ taskId, modelId, agentId, providerId, benchmarkId });
        }
      }
    },

    cancelRun: async (id) => {
      await evalService.cancelRun(id);
      set((state) => ({
        runs: state.runs.map(r => r.id === id ? { ...r, status: 'cancelled' } : r),
        selectedRun: state.selectedRun?.id === id ? { ...state.selectedRun, status: 'cancelled' } : state.selectedRun
      }));
    },

    retryRun: async (id) => {
      const run = await evalService.retryRun(id);
      set((state) => ({
        runs: [run, ...state.runs.filter(r => r.id !== run.id)],
        selectedRun: run
      }));
      startPollingIfNeeded([run]);
      return run;
    },

    submitReview: async (review) => {
      const submitted = await evalService.submitReview(review);
      // Refresh run and runs
      await get().fetchRuns();
    },

    exportRuns: (format) => {
      const runs = get().runs;
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(runs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `float-evals-report-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // CSV export
        const headers = ['Run ID', 'Task', 'Model', 'Agent', 'Status', 'Score', 'Tests Passed', 'Duration (s)', 'Total Tokens', 'Cost (USD)', 'Date'];
        const rows = runs.map(r => [
          r.id,
          `"${(r.taskName || r.taskId).replace(/"/g, '""')}"`,
          r.modelId,
          r.agentId,
          r.status,
          r.finalScore ?? r.score ?? '',
          r.testsPassed ? 'Yes' : 'No',
          r.duration ?? '',
          r.totalTokens ?? '',
          r.estimatedCost ?? '',
          new Date(r.startedAt).toISOString()
        ]);
        const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `float-evals-report-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  };
});
