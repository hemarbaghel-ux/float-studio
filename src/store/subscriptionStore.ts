import { create } from 'zustand';
import { auth } from '../lib/firebase';

export type SubscriptionPlanId = 'free' | 'pro' | 'business' | 'ultimate';

export interface PlanDetails {
  id: SubscriptionPlanId;
  name: string;
  badge?: string;
  monthlyPrice: number;
  currency: 'USD';
  description: string;
  features: string[];
}

export const FLOAT_PLANS: Record<SubscriptionPlanId, PlanDetails> = {
  free: {
    id: 'free',
    name: 'FLOAT Free',
    monthlyPrice: 0,
    currency: 'USD',
    description: 'Essential developer tools for building and exploring code.',
    features: [
      'FLOAT Basic AI model with standard context',
      'Browser coding workspace & Monaco editor',
      'Basic codebase search and file tools',
      'Single-file review and proposals',
      'Standard community support'
    ]
  },
  pro: {
    id: 'pro',
    name: 'FLOAT Pro',
    badge: 'Most Popular',
    monthlyPrice: 20,
    currency: 'USD',
    description: 'For individual developers building seriously with AI agents.',
    features: [
      '500 Fast Frontier Model queries per month',
      'Unlimited everyday FLOAT Basic model assistance',
      'All 6 specialized developer agents (Coder, Reviewer, Planner, Debugger, Explorer, UI)',
      'Multi-file ChangeSet generation and visual diff review',
      'Advanced semantic repository context & search',
      'Priority server processing queue'
    ]
  },
  business: {
    id: 'business',
    name: 'FLOAT Business',
    badge: 'Teams',
    monthlyPrice: 40,
    currency: 'USD',
    description: 'For teams building, reviewing, and shipping software together.',
    features: [
      'Everything in Pro included',
      '1,200 Fast Frontier Model queries per user/month',
      'Shared team projects and synchronized workspaces',
      'Centralized team billing & license administration',
      'Team usage analytics & model intelligence tracking',
      'Enhanced security & team audit logs'
    ]
  },
  ultimate: {
    id: 'ultimate',
    name: 'FLOAT Ultimate',
    badge: 'Maximum Power',
    monthlyPrice: 100,
    currency: 'USD',
    description: 'For power users and teams running heavy agentic workflows.',
    features: [
      'Everything in Business included',
      '3,500 Fast Frontier Model queries per user/month',
      'Dedicated high-throughput inference lane',
      'Custom model routing and temperature defaults',
      'Early access to experimental autonomous agents',
      '24/7 dedicated engineering support'
    ]
  }
};

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
