import { adminDb } from './adminFirebase';
import type { EvalTask, EvalRun, Benchmark, HumanReview } from '../types/evals';

const taskCollection = () => adminDb.collection('evalTasks');
const runCollection = () => adminDb.collection('evaluationRuns');
const benchmarkCollection = () => adminDb.collection('benchmarks');
const reviewCollection = () => adminDb.collection('evalReviews');
const MAX_DOCUMENT_BYTES = 850 * 1024;

function toSafeDocument(value: unknown): Record<string, any> {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DOCUMENT_BYTES) {
    throw new Error('This evaluation record is too large to store safely. Reduce its files or output and retry.');
  }
  return JSON.parse(serialized);
}

export async function saveEvalTask(task: EvalTask): Promise<void> {
  await taskCollection().doc(task.id).set(toSafeDocument(task));
}

export async function getEvalTask(id: string, ownerId: string): Promise<EvalTask | null> {
  const snapshot = await taskCollection().doc(id).get();
  if (!snapshot.exists || snapshot.get('ownerId') !== ownerId) return null;
  return snapshot.data() as EvalTask;
}

export async function listEvalTasks(ownerId: string): Promise<EvalTask[]> {
  const snapshot = await taskCollection().where('ownerId', '==', ownerId).orderBy('createdAt', 'desc').limit(200).get();
  return snapshot.docs.map((document) => document.data() as EvalTask);
}

export async function deleteEvalTask(id: string, ownerId: string): Promise<boolean> {
  const reference = taskCollection().doc(id);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.get('ownerId') !== ownerId) return false;
    transaction.delete(reference);
    return true;
  });
}

export async function saveEvalRun(run: EvalRun): Promise<void> {
  await runCollection().doc(run.id).set(toSafeDocument({ ...run, updatedAt: Date.now() }), { merge: true });
}

export async function heartbeatEvalRun(id: string): Promise<void> {
  await runCollection().doc(id).update({ heartbeatAt: Date.now(), updatedAt: Date.now() });
}

export async function listRunningEvalRuns(): Promise<EvalRun[]> {
  const snapshot = await runCollection().where('status', '==', 'running').get();
  return snapshot.docs.map((document) => document.data() as EvalRun);
}

export async function failInterruptedEvalRun(id: string): Promise<boolean> {
  const reference = runCollection().doc(id);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.get('status') !== 'running') return false;
    const heartbeatAt = Number(snapshot.get('heartbeatAt') || 0);
    if (heartbeatAt && Date.now() - heartbeatAt < 60_000) return false;
    transaction.update(reference, {
      status: 'failed',
      errorType: 'WorkerInterrupted',
      errorMessage: 'Evaluation was interrupted when its worker stopped. Retry this run.',
      completedAt: Date.now(),
      updatedAt: Date.now(),
      heartbeatAt: null,
    });
    return true;
  });
}

export async function getEvalRun(id: string, ownerId: string): Promise<EvalRun | null> {
  const snapshot = await runCollection().doc(id).get();
  if (!snapshot.exists || snapshot.get('ownerId') !== ownerId) return null;
  return snapshot.data() as EvalRun;
}

export async function listEvalRuns(ownerId: string): Promise<EvalRun[]> {
  const snapshot = await runCollection().where('ownerId', '==', ownerId).orderBy('startedAt', 'desc').limit(200).get();
  return snapshot.docs.map((document) => document.data() as EvalRun);
}

export async function saveEvalBenchmark(benchmark: Benchmark): Promise<void> {
  await benchmarkCollection().doc(benchmark.id).set(toSafeDocument(benchmark));
}

export async function listEvalBenchmarks(ownerId: string): Promise<Benchmark[]> {
  const snapshot = await benchmarkCollection().where('ownerId', '==', ownerId).orderBy('createdAt', 'desc').limit(100).get();
  return snapshot.docs.map((document) => document.data() as Benchmark);
}

export async function getEvalBenchmark(id: string, ownerId: string): Promise<Benchmark | null> {
  const snapshot = await benchmarkCollection().doc(id).get();
  if (!snapshot.exists || snapshot.get('ownerId') !== ownerId) return null;
  return snapshot.data() as Benchmark;
}

export async function saveEvalReview(review: HumanReview): Promise<void> {
  await reviewCollection().doc(review.id).set(toSafeDocument(review));
}

export async function listEvalReviews(runId: string, ownerId: string): Promise<HumanReview[]> {
  const snapshot = await reviewCollection().where('runId', '==', runId).where('ownerId', '==', ownerId).get();
  return snapshot.docs.map((document) => document.data() as HumanReview);
}
