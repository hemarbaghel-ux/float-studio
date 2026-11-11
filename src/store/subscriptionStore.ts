import { create } from 'zustand';
import { auth } from '../lib/firebase';

export type SubscriptionPlanId = 'free' | 'pro' | 'business' | 'ultimate';
export type BillingCycle = 'monthly' | 'yearly';

export interface PlanDetails {
  id: SubscriptionPlanId;
  name: string;
  badge?: string;
  monthlyPrice: number;
  yearlyPrice: number; // monthly equivalent when billed annually
  yearlyAnnualTotal: number; // total billed annually
  yearlyDiscountPercent: number; // e.g. 20%
  currency: 'USD';
  description: string;
  features: string[];
}

export const FLOAT_PLANS: Record<SubscriptionPlanId, PlanDetails> = {
  free: {
    id: 'free',
    name: 'FLOAT Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    yearlyAnnualTotal: 0,
    yearlyDiscountPercent: 0,
    currency: 'USD',
    description: 'Essential developer tools for building and exploring code.',
    features: [
      'GPT-6 Astra and GPT-6.1 Sol model selection (server access required)',
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
    yearlyPrice: 16, // $16/mo billed annually ($192/yr) -> save 20%
    yearlyAnnualTotal: 192,
    yearlyDiscountPercent: 20,
    currency: 'USD',
    description: 'For individual developers building with AI chat and reviewable code proposals.',
    features: [
      '500 Fast Frontier Model queries per month',
      'GPT-6 Astra and GPT-6.1 Sol model selection (server access required)',
      'AI chat with selected workspace context',
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
    yearlyPrice: 32, // $32/user/mo billed annually ($384/yr) -> save 20%
    yearlyAnnualTotal: 384,
    yearlyDiscountPercent: 20,
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
    yearlyPrice: 80, // $80/user/mo billed annually ($960/yr) -> save 20%
    yearlyAnnualTotal: 960,
    yearlyDiscountPercent: 20,
    currency: 'USD',
    description: 'For power users and teams with higher AI usage needs.',
    features: [
      'Everything in Business included',
      '3,500 Fast Frontier Model queries per user/month',
      'Dedicated high-throughput inference lane',
      'Custom model routing and temperature defaults',
      'GPT-6 Astra and GPT-6.1 Sol model selection (server access required)',
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

export interface CreateCheckoutSessionParams {
  planId: string;
  billingCycle?: 'monthly' | 'yearly';
  idempotencyKey?: string;
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
  createCheckoutSession: (params: string | CreateCheckoutSessionParams) => Promise<{ clientSecret: string; sessionId: string; planId?: string; billingCycle?: string }>;
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

  createCheckoutSession: async (params: string | CreateCheckoutSessionParams) => {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('You must be signed in to start a subscription.');
    }

    const payload: CreateCheckoutSessionParams = typeof params === 'string'
      ? { planId: params, billingCycle: 'monthly' }
      : {
          planId: params.planId,
          billingCycle: params.billingCycle || 'monthly',
          idempotencyKey: params.idempotencyKey
        };

    const token = await user.getIdToken();
    const res = await fetch('/api/subscription/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create checkout session.');
    }

    return {
      clientSecret: data.clientSecret,
      sessionId: data.sessionId,
      planId: data.planId,
      billingCycle: data.billingCycle
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
