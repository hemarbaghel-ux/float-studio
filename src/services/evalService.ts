import { EvalTask, EvalRun, Benchmark, HumanReview, LeaderboardEntry } from '../types/evals';
import { ConsentService } from './consentService';
import { apiFetch } from './api';

export const evalService = {
  // Tasks
  async getTasks(): Promise<EvalTask[]> {
    try {
      const res = await apiFetch('/api/evals/tasks');
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Failed to fetch tasks from server:', e);
    }
    return [];
  },

  async createTask(task: Omit<EvalTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<EvalTask> {
    const res = await apiFetch('/api/evals/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create task');
    }
    return await res.json();
  },

  async deleteTask(id: string): Promise<boolean> {
    const res = await apiFetch(`/api/evals/tasks/${id}`, { method: 'DELETE' });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success;
  },

  // Runs
  async getRuns(): Promise<EvalRun[]> {
    try {
      const res = await apiFetch('/api/evals/runs');
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Failed to fetch runs from server:', e);
    }
    return [];
  },

  async getRun(id: string): Promise<EvalRun | null> {
    try {
      const res = await apiFetch(`/api/evals/runs/${id}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`Failed to fetch run ${id}:`, e);
    }
    return null;
  },

  async runEvaluation(params: {
    taskId: string;
    modelId: string;
    agentId: string;
    providerId: string;
    benchmarkId?: string;
  }): Promise<EvalRun> {
    const isSharingAllowed = ConsentService.isSharingAllowed();
    const res = await apiFetch('/api/evals/run', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Float-Data-Sharing': isSharingAllowed ? 'true' : 'false'
      },
      body: JSON.stringify({
        ...params,
        dataSharingAllowed: isSharingAllowed
      })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to start evaluation run');
    }
    const run: EvalRun = await res.json();

    return run;
  },

  async cancelRun(id: string): Promise<boolean> {
    const res = await apiFetch(`/api/evals/runs/${id}/cancel`, { method: 'POST' });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success;
  },

  async retryRun(id: string): Promise<EvalRun> {
    const isSharingAllowed = ConsentService.isSharingAllowed();
    const res = await apiFetch(`/api/evals/runs/${id}/retry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Float-Data-Sharing': isSharingAllowed ? 'true' : 'false'
      },
      body: JSON.stringify({
        dataSharingAllowed: isSharingAllowed
      })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to retry evaluation');
    }
    return await res.json();
  },

  // Benchmarks
  async getBenchmarks(): Promise<Benchmark[]> {
    try {
      const res = await apiFetch('/api/evals/benchmarks');
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Failed to fetch benchmarks:', e);
    }
    return [];
  },

  async getBenchmark(id: string): Promise<Benchmark | null> {
    try {
      const res = await apiFetch(`/api/evals/benchmarks/${id}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`Failed to fetch benchmark ${id}:`, e);
    }
    return null;
  },

  async createBenchmark(bench: Omit<Benchmark, 'id' | 'createdAt' | 'updatedAt'>): Promise<Benchmark> {
    const res = await apiFetch('/api/evals/benchmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bench)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create benchmark');
    }
    return await res.json();
  },

  // Leaderboard
  async getLeaderboard(benchmarkId?: string, minEvaluations = 1): Promise<LeaderboardEntry[]> {
    try {
      const url = new URL('/api/evals/leaderboard', window.location.origin);
      if (benchmarkId) url.searchParams.set('benchmarkId', benchmarkId);
      if (minEvaluations) url.searchParams.set('minEvaluations', minEvaluations.toString());

      const res = await apiFetch(url.toString());
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Failed to fetch leaderboard:', e);
    }
    return [];
  },

  // Model Analytics
  async getModelAnalytics(modelId: string) {
    try {
      const res = await apiFetch(`/api/evals/models/${encodeURIComponent(modelId)}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`Failed to fetch model analytics for ${modelId}:`, e);
    }
    return null;
  },

  // Human Reviews
  async submitReview(review: Omit<HumanReview, 'id' | 'reviewTimestamp'>): Promise<HumanReview> {
    const res = await apiFetch('/api/evals/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(review)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to submit review');
    }
    return await res.json();
  },

  async getReviews(runId: string): Promise<HumanReview[]> {
    try {
      const res = await apiFetch(`/api/evals/reviews/${runId}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`Failed to fetch reviews for run ${runId}:`, e);
    }
    return [];
  }
};
