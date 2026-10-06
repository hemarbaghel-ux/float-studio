import { FieldValue } from 'firebase-admin/firestore';
import type { Transaction } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { adminDb } from './adminFirebase';

const tasks = () => adminDb.collection('agentTasks');
const events = () => adminDb.collection('agentTaskEvents');
const results = () => adminDb.collection('agentTaskResults');
const workspaces = () => adminDb.collection('agentTaskWorkspaces');
const projectLeases = () => adminDb.collection('agentProjectLeases');
const PROJECT_LEASE_MS = 45_000;

function projectLeaseId(ownerId: string, projectId: string): string {
  return createHash('sha256').update(`${ownerId}:${projectId}`).digest('hex');
}

export async function saveAgentTaskWorkspace(taskId: string, ownerId: string, projectId: string, files: unknown[]): Promise<void> {
  const serialized = JSON.stringify(files);
  if (Buffer.byteLength(serialized, 'utf8') > 850 * 1024) throw new Error('Agent workspace snapshot exceeds the durable storage limit.');
  await workspaces().doc(taskId).set({ taskId, ownerId, projectId, files: JSON.parse(serialized), createdAt: Date.now() });
}

export async function getAgentTaskWorkspace(taskId: string, ownerId: string): Promise<any[] | null> {
  const snapshot = await workspaces().doc(taskId).get();
  if (!snapshot.exists || snapshot.get('ownerId') !== ownerId) return null;
  return Array.isArray(snapshot.get('files')) ? snapshot.get('files') : null;
}

export async function deleteAgentTaskWorkspace(taskId: string, ownerId: string): Promise<void> {
  const reference = workspaces().doc(taskId);
  await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists && snapshot.get('ownerId') === ownerId) transaction.delete(reference);
  });
}

export async function saveAgentTask(task: Record<string, unknown>): Promise<void> {
  await tasks().doc(String(task.id)).set(task);
}

export async function updateAgentTask(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const reference = tasks().doc(id);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return false;
    if (patch.workerId && snapshot.get('workerId') !== patch.workerId) return false;
    const existingStatus = snapshot.get('status');
    const incomingStatus = patch.status;
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(existingStatus) && incomingStatus && incomingStatus !== existingStatus) return false;
    const update: Record<string, unknown> = { ...patch, updatedAt: Date.now() };
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED', 'QUEUED'].includes(String(incomingStatus))) {
      update.workerId = FieldValue.delete() as unknown as string;
      update.heartbeatAt = FieldValue.delete() as unknown as number;
    }
    transaction.set(reference, update, { merge: true });
    return true;
  });
}

export async function appendAgentEvent(event: Record<string, unknown>): Promise<void> {
  const safeEvent = { ...event };
  if (safeEvent.payload !== undefined) {
    try {
      const serialized = JSON.stringify(safeEvent.payload);
      if (Buffer.byteLength(serialized, 'utf8') > 300 * 1024) {
        safeEvent.payload = { truncated: true, preview: serialized.slice(0, 20_000) };
      } else {
        safeEvent.payload = JSON.parse(serialized);
      }
    } catch {
      safeEvent.payload = { omitted: true, reason: 'Payload could not be serialized.' };
    }
  }
  const taskReference = tasks().doc(String(event.taskId));
  const eventReference = events().doc(String(event.id));
  await adminDb.runTransaction(async transaction => {
    const taskSnapshot = await transaction.get(taskReference);
    // Timestamp-sized sequence keeps new ordered IDs ahead of legacy events that predate sequencing.
    const sequence = Math.max(Number(taskSnapshot.get('eventSequence') || 0), Date.now() * 1_000) + 1;
    const persistedEvent = { ...safeEvent, sequence };
    transaction.set(eventReference, persistedEvent);
    transaction.set(taskReference, {
      eventSequence: sequence,
      lastEvent: { id: event.id, type: event.type, message: String(event.message || '').slice(0, 2_000), timestamp: event.timestamp, sequence },
      updatedAt: event.timestamp || Date.now(),
    }, { merge: true });
  });
}

export async function readAgentTask(id: string): Promise<any | null> {
  const snapshot = await tasks().doc(id).get();
  return snapshot.exists ? snapshot.data() : null;
}

/** Persist GitHub workflow state only on a task owned by this user and project. */
export async function updateAgentTaskGitHubState(
  id: string,
  ownerId: string,
  projectId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const reference = tasks().doc(id);
  return adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.get('ownerId') !== ownerId || snapshot.get('projectId') !== projectId) return false;
    const current = (snapshot.get('github') || {}) as Record<string, unknown>;
    transaction.set(reference, { github: { ...current, ...patch }, updatedAt: Date.now() }, { merge: true });
    return true;
  });
}

export async function listAgentTasks(ownerId: string): Promise<any[]> {
  const snapshot = await tasks().where('ownerId', '==', ownerId).get();
  return snapshot.docs.map((document) => document.data());
}

export async function completeAgentTask(taskId: string, ownerId: string, workerId: string, result: unknown): Promise<boolean> {
  const serialized = JSON.stringify(result);
  if (Buffer.byteLength(serialized, 'utf8') > 850 * 1024) {
    throw new Error('Agent result is too large to persist safely.');
  }
  const taskRef = tasks().doc(taskId);
  const resultRef = results().doc(taskId);
  return adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(taskRef);
    if (!snapshot.exists || snapshot.get('ownerId') !== ownerId || snapshot.get('workerId') !== workerId) return false;
    if (!['PLANNING', 'INSPECTING', 'WAITING_FOR_TOOL', 'EXECUTING', 'VALIDATING'].includes(String(snapshot.get('status')))) return false;
    const projectId = String(snapshot.get('projectId') || '');
    const leaseReference = projectLeases().doc(projectLeaseId(ownerId, projectId));
    const lease = await transaction.get(leaseReference);
    if (!lease.exists || lease.get('taskId') !== taskId || lease.get('workerId') !== workerId || Number(lease.get('expiresAt') || 0) <= Date.now()) return false;
    const now = Date.now();
    transaction.set(resultRef, { taskId, ownerId, result: JSON.parse(serialized), updatedAt: Date.now() });
    transaction.set(taskRef, {
      status: 'COMPLETED', progress: 100, updatedAt: now,
      workerId: FieldValue.delete(), heartbeatAt: FieldValue.delete(),
    }, { merge: true });
    return true;
  });
}

export async function getAgentTaskResult(taskId: string, ownerId: string): Promise<any | null> {
  const snapshot = await results().doc(taskId).get();
  if (!snapshot.exists || snapshot.get('ownerId') !== ownerId) return null;
  return snapshot.get('result') ?? null;
}

export async function listAgentTaskResults(ownerId: string): Promise<Record<string, any>> {
  const snapshot = await results().where('ownerId', '==', ownerId).get();
  return Object.fromEntries(snapshot.docs.map((document) => [document.id, document.get('result')]));
}

export async function listAgentEvents(ownerId: string, taskId?: string): Promise<any[]> {
  const snapshot = await events().where('ownerId', '==', ownerId).get();
  return snapshot.docs
    .map((document) => document.data())
    .filter((event) => !taskId || event.taskId === taskId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export async function listQueuedAgentTasks(): Promise<any[]> {
  const snapshot = await tasks().where('status', '==', 'QUEUED').get();
  return snapshot.docs.map((document) => document.data());
}

export async function listRunningAgentTasks(): Promise<any[]> {
  const snapshot = await tasks().where('status', 'in', ['PLANNING', 'INSPECTING', 'WAITING_FOR_TOOL', 'EXECUTING', 'VALIDATING']).get();
  return snapshot.docs.map((document) => document.data());
}

export async function failInterruptedAgentTask(task: any): Promise<boolean> {
  const reference = tasks().doc(String(task.id));
  return adminDb.runTransaction(async (transaction) => {
    const latest = await transaction.get(reference);
    if (!latest.exists || !['PLANNING', 'INSPECTING', 'WAITING_FOR_TOOL', 'EXECUTING', 'VALIDATING'].includes(latest.get('status'))) return false;
    const heartbeatAt = Number(latest.get('heartbeatAt') || 0);
    if (heartbeatAt && Date.now() - heartbeatAt < 60_000) return false;
    transaction.update(reference, {
      status: 'FAILED',
      error: 'This task was interrupted when its worker stopped. You can safely retry it with the saved snapshot.',
      isRetryable: true,
      updatedAt: Date.now(),
      workerId: FieldValue.delete(),
      heartbeatAt: FieldValue.delete(),
    });
    return true;
  });
}

/** Only one app instance can claim a queued task for execution. */
export async function claimQueuedAgentTask(id: string, workerId: string): Promise<boolean> {
  const reference = tasks().doc(id);
  return adminDb.runTransaction(async (transaction: Transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.get('status') !== 'QUEUED') return false;
    const ownerId = String(snapshot.get('ownerId') || '');
    const projectId = String(snapshot.get('projectId') || '');
    if (!ownerId || !projectId) return false;
    const leaseReference = projectLeases().doc(projectLeaseId(ownerId, projectId));
    const lease = await transaction.get(leaseReference);
    const existingLease = lease.data();
    if (lease.exists && Number(existingLease?.expiresAt || 0) > Date.now() && existingLease?.taskId !== id) return false;
    transaction.update(reference, {
      status: 'PLANNING',
      workerId,
      heartbeatAt: Date.now(),
      updatedAt: Date.now(),
    });
    transaction.set(leaseReference, {
      ownerId, projectId, taskId: id, workerId,
      acquiredAt: Date.now(), expiresAt: Date.now() + PROJECT_LEASE_MS,
    });
    return true;
  });
}

export async function heartbeatAgentTask(id: string, workerId: string): Promise<{ active: boolean; status?: string }> {
  const reference = tasks().doc(id);
  return adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.get('workerId') !== workerId) return { active: false, status: snapshot.get('status') };
    const status = String(snapshot.get('status') || '');
    if (!['PLANNING', 'INSPECTING', 'WAITING_FOR_TOOL', 'EXECUTING', 'VALIDATING'].includes(status)) return { active: false, status };
    const ownerId = String(snapshot.get('ownerId') || '');
    const projectId = String(snapshot.get('projectId') || '');
    const leaseReference = projectLeases().doc(projectLeaseId(ownerId, projectId));
    const lease = await transaction.get(leaseReference);
    if (!lease.exists || lease.get('taskId') !== id || lease.get('workerId') !== workerId) return { active: false, status };
    const now = Date.now();
    transaction.update(reference, { heartbeatAt: now, updatedAt: now });
    transaction.set(leaseReference, { expiresAt: now + PROJECT_LEASE_MS, heartbeatAt: now }, { merge: true });
    return { active: true, status };
  });
}

export async function releaseAgentProjectLease(taskId: string, ownerId: string, workerId: string): Promise<void> {
  const taskReference = tasks().doc(taskId);
  await adminDb.runTransaction(async transaction => {
    const taskSnapshot = await transaction.get(taskReference);
    if (!taskSnapshot.exists || taskSnapshot.get('ownerId') !== ownerId) return;
    const projectId = String(taskSnapshot.get('projectId') || '');
    if (!projectId) return;
    const leaseReference = projectLeases().doc(projectLeaseId(ownerId, projectId));
    const lease = await transaction.get(leaseReference);
    if (lease.exists && lease.get('taskId') === taskId && lease.get('workerId') === workerId) transaction.delete(leaseReference);
  });
}

