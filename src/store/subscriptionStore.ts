import { create } from 'zustand';
import { auth } from '../lib/firebase';

export interface PlanDetails {
  id: string;
  name: string;
  badge?: string;
  monthlyPrice: number;
  currency: 'USD';
  description: string;
  features: string[];
}

export interface UserSubscriptionInfo {
  userId: string;
  planId: 'free' | 'pro' | 'business' | 'ultimate';
  planName?: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired';
  monthlyPrice?: number;
  currency?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  updatedAt: number;
}

interface SubscriptionState {
  subscription: UserSubscriptionInfo | null;
  publishableKey: string;
  isStripeConfigured: boolean;
  plans: Record<string, PlanDetails>;
  loading: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
  fetchSubscriptionStatus: () => Promise<UserSubscriptionInfo | null>;
  createCheckoutSession: (planId: string) => Promise<{ clientSecret: string; sessionId: string }>;
  checkSessionStatus: (sessionId: string) => Promise<{ status: string; paymentStatus: string; customerEmail?: string; planId?: string }>;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscription: null,
  publishableKey: '',
  isStripeConfigured: false,
  plans: {},
  loading: false,
  error: null,

  fetchConfig: async () => {
    try {
      const res = await fetch('/api/subscription/config');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      set({
        publishableKey: data.publishableKey || '',
        isStripeConfigured: Boolean(data.isConfigured),
        plans: data.plans || {}
      });
    } catch (err: any) {
      console.warn('Failed to load subscription config:', err);
    }
  },

  fetchSubscriptionStatus: async () => {
    const user = auth.currentUser;
    if (!user) {
      set({ subscription: null });
      return null;
    }

    set({ loading: true, error: null });
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/subscription/status', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error(`Failed to load subscription: ${res.status}`);
      }

      const data = await res.json();
      const subscription = data.subscription;
      set({ subscription, loading: false });
      return subscription;
    } catch (err: any) {
      console.error('Error fetching subscription status:', err);
      set({ error: err.message, loading: false });
      return null;
    }
  },

  createCheckoutSession: async (planId: string) => {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('You must be signed in to start a subscription.');
    }

    const token = await user.getIdToken();
    const res = await fetch('/api/subscription/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ planId })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create checkout session.');
    }

    return {
      clientSecret: data.clientSecret,
      sessionId: data.sessionId
    };
  },

  checkSessionStatus: async (sessionId: string) => {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required.');
    }

    const token = await user.getIdToken();
    const res = await fetch(`/api/subscription/session-status?session_id=${encodeURIComponent(sessionId)}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to check session status.');
    }

    return data;
  }
}));
