import { adminDb, hasAdminCredentials } from '../adminFirebase';
import type { Plan } from '../../types/plan';

const plans = () => adminDb.collection('plans');
const MAX_PLAN_BYTES = 500 * 1024;

// In-memory fallback map for test environments or when Firebase Admin credentials are not provided
const memoryPlans = new Map<string, Plan>();

export async function savePlanDurable(plan: Plan, ownerId: string): Promise<void> {
  const serialized = JSON.stringify({ ...plan, ownerId });
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PLAN_BYTES) {
    throw new Error('This plan is too large to save safely.');
  }

  memoryPlans.set(plan.id, JSON.parse(serialized));

  if (hasAdminCredentials()) {
    try {
      await plans().doc(plan.id).set(JSON.parse(serialized));
    } catch (e) {
      console.warn('[PlanPersistence] Admin Firestore write skipped/failed; persisted in-memory:', e);
    }
  }
}

export async function getPlanDurable(id: string, ownerId: string): Promise<Plan | null> {
  if (hasAdminCredentials()) {
    try {
      const snap = await plans().doc(id).get();
      if (snap.exists && snap.get('ownerId') === ownerId) {
        return snap.data() as Plan;
      }
    } catch (e) {
      console.warn('[PlanPersistence] Admin Firestore read skipped/failed; checking memory:', e);
    }
  }

  const memory = memoryPlans.get(id);
  if (memory && (memory as any).ownerId === ownerId) {
    return memory;
  }
  return null;
}

export async function listPlansDurable(projectId: string, ownerId: string): Promise<Plan[]> {
  if (hasAdminCredentials()) {
    try {
      const snap = await plans().where('ownerId', '==', ownerId).get();
      return snap.docs
        .map(doc => doc.data() as Plan)
        .filter(plan => plan.projectId === projectId)
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.warn('[PlanPersistence] Admin Firestore list skipped/failed; checking memory:', e);
    }
  }

  return Array.from(memoryPlans.values())
    .filter(plan => (plan as any).ownerId === ownerId && plan.projectId === projectId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function updatePlanDurable(id: string, ownerId: string, updates: Partial<Plan>): Promise<Plan | null> {
  const existing = await getPlanDurable(id, ownerId);
  if (!existing) return null;

  const updated: Plan = {
    ...existing,
    ...updates,
    id: existing.id,
    projectId: existing.projectId,
    conversationId: existing.conversationId
  };

  await savePlanDurable(updated, ownerId);
  return updated;
}
