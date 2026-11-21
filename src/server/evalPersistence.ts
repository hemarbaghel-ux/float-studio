/**
 * FLOAT Studio — In-Memory Eval State Store
 * 
 * Replaces legacy heavy Firestore eval database collections (evalTasks, evaluationRuns, benchmarks)
 * with a zero-cost in-memory cache. Eliminates database clutter and cloud query costs.
 */

import type { EvalTask, EvalRun, Benchmark, HumanReview } from '../types/evals';

const inMemoryTasks = new Map<string, EvalTask>();
const inMemoryRuns = new Map<string, EvalRun>();
const inMemoryBenchmarks = new Map<string, Benchmark>();
const inMemoryReviews = new Map<string, HumanReview[]>();

export async function saveEvalTask(task: EvalTask): Promise<void> {
  inMemoryTasks.set(task.id, { ...task });
}

export async function getEvalTask(id: string, ownerId: string): Promise<EvalTask | null> {
  const task = inMemoryTasks.get(id);
  if (!task || task.ownerId !== ownerId) return null;
  return task;
}

export async function listEvalTasks(ownerId: string): Promise<EvalTask[]> {
  return Array.from(inMemoryTasks.values())
    .filter(t => t.ownerId === ownerId)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function deleteEvalTask(id: string, ownerId: string): Promise<boolean> {
  const task = inMemoryTasks.get(id);
  if (!task || task.ownerId !== ownerId) return false;
  inMemoryTasks.delete(id);
  return true;
}

export async function saveEvalRun(run: EvalRun): Promise<void> {
  inMemoryRuns.set(run.id, { ...run, updatedAt: Date.now() });
}

export async function heartbeatEvalRun(id: string): Promise<void> {
  const run = inMemoryRuns.get(id);
  if (run) {
    run.heartbeatAt = Date.now();
    run.updatedAt = Date.now();
  }
}

export async function listRunningEvalRuns(): Promise<EvalRun[]> {
  return Array.from(inMemoryRuns.values()).filter(r => r.status === 'running');
}

export async function failInterruptedEvalRun(id: string): Promise<boolean> {
  const run = inMemoryRuns.get(id);
  if (!run || run.status !== 'running') return false;
  run.status = 'failed';
  run.errorType = 'WorkerInterrupted';
  run.errorMessage = 'Evaluation was interrupted. In-memory worker recycled.';
  run.completedAt = Date.now();
  run.updatedAt = Date.now();
  return true;
}

export async function getEvalRun(id: string, ownerId: string): Promise<EvalRun | null> {
  const run = inMemoryRuns.get(id);
  if (!run || run.ownerId !== ownerId) return null;
  return run;
}

export async function listEvalRuns(ownerId: string): Promise<EvalRun[]> {
  return Array.from(inMemoryRuns.values())
    .filter(r => r.ownerId === ownerId)
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

export async function saveEvalBenchmark(benchmark: Benchmark): Promise<void> {
  inMemoryBenchmarks.set(benchmark.id, { ...benchmark });
}

export async function listEvalBenchmarks(ownerId: string): Promise<Benchmark[]> {
  return Array.from(inMemoryBenchmarks.values()).filter(b => b.ownerId === ownerId);
}

export async function getEvalBenchmark(id: string, ownerId: string): Promise<Benchmark | null> {
  const bm = inMemoryBenchmarks.get(id);
  if (!bm || bm.ownerId !== ownerId) return null;
  return bm;
}

export async function saveEvalReview(review: HumanReview): Promise<void> {
  const existing = inMemoryReviews.get(review.runId) || [];
  existing.push(review);
  inMemoryReviews.set(review.runId, existing);
}

export async function listEvalReviews(runId: string, ownerId: string): Promise<HumanReview[]> {
  const list = inMemoryReviews.get(runId) || [];
  return list.filter(r => r.ownerId === ownerId);
}
