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

// Reset memory state (useful for isolated unit tests)
export function resetSubscriptionMemoryState(): void {
  memorySubscriptions.clear;
  memoryProcessedEvents.clear();
}
