import { adminDb, hasAdminCredentials, isPermissionDeniedError } from '../adminFirebase';

export type SubscriptionPlanId = 'free' | 'pro' | 'business' | 'ultimate';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired';

export interface UserSubscription {
  userId: string;
  planId: SubscriptionPlanId;
  status: SubscriptionStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: number; // Unix timestamp in seconds
  cancelAtPeriodEnd?: boolean;
  updatedAt: number;
}

// In-memory fallback map for test environments where admin Firebase credentials are not provisioned
const memorySubscriptions = new Map<string, UserSubscription>();
const memoryProcessedEvents = new Set<string>();

export async function getUserSubscription(userId: string): Promise<UserSubscription> {
  if (!userId || typeof userId !== 'string') {
    return {
      userId: '',
      planId: 'free',
      status: 'active',
      updatedAt: Date.now()
    };
  }

  const defaultSub: UserSubscription = {
    userId,
    planId: 'free',
    status: 'active',
    updatedAt: Date.now()
  };

  if (!hasAdminCredentials()) {
    return memorySubscriptions.get(userId) || defaultSub;
  }

  try {
    const docRef = adminDb.collection('userSubscriptions').doc(userId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return defaultSub;
    }
    const data = snap.data();
    return {
      userId,
      planId: (data?.planId as SubscriptionPlanId) || 'free',
      status: (data?.status as SubscriptionStatus) || 'active',
      stripeCustomerId: data?.stripeCustomerId,
      stripeSubscriptionId: data?.stripeSubscriptionId,
      currentPeriodEnd: data?.currentPeriodEnd,
      cancelAtPeriodEnd: data?.cancelAtPeriodEnd,
      updatedAt: data?.updatedAt || Date.now()
    };
  } catch (err: any) {
    if (isPermissionDeniedError(err)) {
      return memorySubscriptions.get(userId) || defaultSub;
    }
    console.error(`Error reading user subscription for ${userId}:`, err);
    return memorySubscriptions.get(userId) || defaultSub;
  }
}

export async function updateUserSubscription(subscription: UserSubscription): Promise<void> {
  if (!subscription || !subscription.userId) {
    throw new Error('Subscription must include a valid userId');
  }

  const record: UserSubscription = {
    ...subscription,
    updatedAt: Date.now()
  };

  // Always mirror in memory for rapid retrieval and test isolation
  memorySubscriptions.set(subscription.userId, record);

  if (!hasAdminCredentials()) {
    return;
  }

  try {
    const docRef = adminDb.collection('userSubscriptions').doc(subscription.userId);
    await docRef.set(record, { merge: true });
  } catch (err: any) {
    if (isPermissionDeniedError(err)) {
      return;
    }
    console.error(`Failed to persist subscription for ${subscription.userId} to Firestore:`, err);
    throw err;
  }
}

export async function isWebhookEventProcessed(eventId: string): Promise<boolean> {
  if (!eventId) return false;

  if (memoryProcessedEvents.has(eventId)) {
    return true;
  }

  if (!hasAdminCredentials()) {
    return false;
  }

  try {
    const docRef = adminDb.collection('processedWebhookEvents').doc(eventId);
    const snap = await docRef.get();
    return snap.exists;
  } catch {
    return memoryProcessedEvents.has(eventId);
  }
}

export async function recordProcessedWebhookEvent(eventId: string, eventType: string): Promise<void> {
  if (!eventId) return;

  memoryProcessedEvents.add(eventId);

  if (!hasAdminCredentials()) {
    return;
  }

  try {
    const docRef = adminDb.collection('processedWebhookEvents').doc(eventId);
    await docRef.set({
      eventId,
      eventType,
      processedAt: Date.now()
    });
  } catch (err) {
    console.warn(`Could not save webhook event ${eventId} to Firestore:`, err);
  }
}

export interface UserUsageSummary {
  userId: string;
  monthKey: string;
  totalQueries: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  updatedAt: number;
}

export const PLAN_MONTHLY_QUERY_LIMITS: Record<SubscriptionPlanId, number> = {
  free: 50,
  pro: 500,
  business: 1200,
  ultimate: 3500
};

const memoryUsage = new Map<string, UserUsageSummary>();

function currentMonthKey(timestamp = Date.now()): string {
  const d = new Date(timestamp);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function recordTokenUsage(params: {
  userId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<UserUsageSummary> {
  const { userId, inputTokens, outputTokens } = params;
  const monthKey = currentMonthKey();
  const key = `${userId}:${monthKey}`;
  const existing = memoryUsage.get(key) || {
    userId,
    monthKey,
    totalQueries: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    updatedAt: Date.now()
  };

  const inTok = Math.max(0, Math.floor(Number(inputTokens) || 0));
  const outTok = Math.max(0, Math.floor(Number(outputTokens) || 0));
  const updated: UserUsageSummary = {
    userId,
    monthKey,
    totalQueries: existing.totalQueries + 1,
    totalInputTokens: existing.totalInputTokens + inTok,
    totalOutputTokens: existing.totalOutputTokens + outTok,
    totalTokens: existing.totalTokens + inTok + outTok,
    updatedAt: Date.now()
  };
  memoryUsage.set(key, updated);

  if (hasAdminCredentials() && userId) {
    try {
      await adminDb.collection('userTokenUsage').doc(key).set(updated, { merge: true });
    } catch {
      // Best-effort mirror to Firestore
    }
  }
  return updated;
}

export async function getUserUsageSummary(userId: string): Promise<UserUsageSummary> {
  const monthKey = currentMonthKey();
  const key = `${userId}:${monthKey}`;
  const fallback: UserUsageSummary = memoryUsage.get(key) || {
    userId,
    monthKey,
    totalQueries: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    updatedAt: Date.now()
  };

  if (!hasAdminCredentials() || !userId) {
    return fallback;
  }

  try {
    const snap = await adminDb.collection('userTokenUsage').doc(key).get();
    if (!snap.exists) return fallback;
    const data = snap.data() as Partial<UserUsageSummary>;
    const merged: UserUsageSummary = {
      userId,
      monthKey,
      totalQueries: Math.max(fallback.totalQueries, Number(data?.totalQueries || 0)),
      totalInputTokens: Math.max(fallback.totalInputTokens, Number(data?.totalInputTokens || 0)),
      totalOutputTokens: Math.max(fallback.totalOutputTokens, Number(data?.totalOutputTokens || 0)),
      totalTokens: Math.max(fallback.totalTokens, Number(data?.totalTokens || 0)),
      updatedAt: Number(data?.updatedAt || fallback.updatedAt)
    };
    memoryUsage.set(key, merged);
    return merged;
  } catch {
    return fallback;
  }
}

export async function checkPlanLimit(userId: string): Promise<{
  allowed: boolean;
  planId: SubscriptionPlanId;
  monthlyLimit: number;
  usedQueries: number;
  remainingQueries: number;
  usage: UserUsageSummary;
}> {
  const sub = await getUserSubscription(userId);
  const effectivePlan: SubscriptionPlanId =
    sub.status === 'active' || sub.status === 'trialing' ? sub.planId : 'free';
  const monthlyLimit = PLAN_MONTHLY_QUERY_LIMITS[effectivePlan] ?? PLAN_MONTHLY_QUERY_LIMITS.free;
  const usage = await getUserUsageSummary(userId);
  const remainingQueries = Math.max(0, monthlyLimit - usage.totalQueries);
  return {
    allowed: usage.totalQueries < monthlyLimit,
    planId: effectivePlan,
    monthlyLimit,
    usedQueries: usage.totalQueries,
    remainingQueries,
    usage
  };
}

// Reset memory state (useful for isolated unit tests)
export function resetSubscriptionMemoryState(): void {
  memorySubscriptions.clear();
  memoryProcessedEvents.clear();
  memoryUsage.clear();
}

export const clearSubscriptionCache = resetSubscriptionMemoryState;

