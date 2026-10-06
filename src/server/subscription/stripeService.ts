import Stripe from 'stripe';
import {
  SubscriptionPlanId,
  SubscriptionStatus,
  UserSubscription,
  getUserSubscription,
  updateUserSubscription,
  isWebhookEventProcessed,
  recordProcessedWebhookEvent
} from './subscriptionPersistence';

export interface PlanConfig {
  id: SubscriptionPlanId;
  name: string;
  badge?: string;
  monthlyPrice: number;
  currency: 'USD';
  description: string;
  features: string[];
}

export const FLOAT_PLANS: Record<SubscriptionPlanId, PlanConfig> = {
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

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2025-02-24.acacia' as any
    });
  }
  return stripeClient;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY);
}

export function validateStripeEnv(): {
  isConfigured: boolean;
  publishableKeyConfigured: boolean;
  secretKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  pricesConfigured: {
    pro: boolean;
    business: boolean;
    ultimate: boolean;
  };
  warnings: string[];
} {
  const secret = Boolean(process.env.STRIPE_SECRET_KEY);
  const publishable = Boolean(process.env.STRIPE_PUBLISHABLE_KEY);
  const webhook = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const pricePro = Boolean(process.env.STRIPE_PRICE_ID_PRO);
  const priceBusiness = Boolean(process.env.STRIPE_PRICE_ID_BUSINESS);
  const priceUltimate = Boolean(process.env.STRIPE_PRICE_ID_ULTIMATE);

  const warnings: string[] = [];
  if (!secret) warnings.push('STRIPE_SECRET_KEY is not set. Checkout sessions cannot be created.');
  if (!publishable) warnings.push('STRIPE_PUBLISHABLE_KEY is not set. Client-side embedded checkout cannot initialize.');
  if (!webhook) warnings.push('STRIPE_WEBHOOK_SECRET is not set. Inbound payment webhooks cannot be cryptographically verified.');
  if (!pricePro) warnings.push('STRIPE_PRICE_ID_PRO is not set (will fallback to server default or report configuration needed).');

  return {
    isConfigured: secret && publishable,
    secretKeyConfigured: secret,
    publishableKeyConfigured: publishable,
    webhookSecretConfigured: webhook,
    pricesConfigured: {
      pro: pricePro,
      business: priceBusiness,
      ultimate: priceUltimate
    },
    warnings
  };
}

export function getServerPriceId(planId: SubscriptionPlanId): string {
  if (planId === 'free') {
    throw new Error('Free plan does not require a Stripe checkout session.');
  }

  let priceId = '';
  if (planId === 'pro') {
    priceId = process.env.STRIPE_PRICE_ID_PRO || '';
  } else if (planId === 'business') {
    priceId = process.env.STRIPE_PRICE_ID_BUSINESS || '';
  } else if (planId === 'ultimate') {
    priceId = process.env.STRIPE_PRICE_ID_ULTIMATE || '';
  }

  if (!priceId) {
    // Provide a recognizable fallback identifier if not set in environment
    // to allow validation or test mocking without crashing
    priceId = `price_float_${planId}_monthly`;
  }

  return priceId;
}

export async function createCheckoutSession(params: {
  userId: string;
  email?: string;
  planId: SubscriptionPlanId;
  origin: string;
}): Promise<{ clientSecret: string; sessionId: string; url?: string }> {
  const { userId, email, planId, origin } = params;

  if (!userId || typeof userId !== 'string') {
    throw new Error('Valid Firebase authenticated user ID is required.');
  }

  if (!['pro', 'business', 'ultimate'].includes(planId)) {
    throw new Error(`Invalid plan identifier "${planId}". Valid subscription plans are pro, business, and ultimate.`);
  }

  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured on this FLOAT deployment. Server administrator must set STRIPE_SECRET_KEY.');
  }

  const priceId = getServerPriceId(planId);
  const cleanOrigin = origin.replace(/\/+$/, '');
  const returnUrl = `${cleanOrigin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;

  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    ui_mode: 'embedded',
    mode: 'subscription',
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    customer_email: email || undefined,
    client_reference_id: userId,
    metadata: {
      userId,
      planId
    },
    subscription_data: {
      metadata: {
        userId,
        planId
      }
    },
    return_url: returnUrl
  };

  const session = await stripe.checkout.sessions.create(sessionConfig);

  if (!session.client_secret) {
    throw new Error('Stripe failed to generate a client_secret for the embedded checkout session.');
  }

  return {
    clientSecret: session.client_secret,
    sessionId: session.id,
    url: session.url || undefined
  };
}

export async function retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured on this FLOAT deployment.');
  }

  return await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'customer']
  });
}

export function verifyWebhookSignature(rawBody: Buffer | string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured on the FLOAT server.');
  }

  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('STRIPE_SECRET_KEY is not configured on the FLOAT server.');
  }

  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

export async function handleWebhookEvent(event: Stripe.Event): Promise<{
  handled: boolean;
  duplicate?: boolean;
  details?: string;
}> {
  if (!event || !event.id) {
    throw new Error('Invalid Stripe webhook event object');
  }

  // Idempotency: avoid double-processing events
  const isDuplicate = await isWebhookEventProcessed(event.id);
  if (isDuplicate) {
    return {
      handled: true,
      duplicate: true,
      details: `Event ${event.id} was already processed previously.`
    };
  }

  let handled = false;
  let details = '';

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id || session.metadata?.userId;
      const planId = (session.metadata?.planId as SubscriptionPlanId) || 'pro';

      if (userId) {
        let currentPeriodEnd: number | undefined;
        let stripeSubscriptionId: string | undefined;

        if (session.subscription) {
          if (typeof session.subscription === 'string') {
            stripeSubscriptionId = session.subscription;
          } else {
            stripeSubscriptionId = (session.subscription as Stripe.Subscription).id;
            const subObj = session.subscription as Stripe.Subscription;
            currentPeriodEnd = (subObj as any).current_period_end;
          }
        }

        await updateUserSubscription({
          userId,
          planId,
          status: 'active',
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
          stripeSubscriptionId,
          currentPeriodEnd,
          cancelAtPeriodEnd: false,
          updatedAt: Date.now()
        });

        handled = true;
        details = `Updated subscription for user ${userId} to ${planId} (active).`;
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.userId;
      const planId = (subscription.metadata?.planId as SubscriptionPlanId) || 'pro';

      if (userId) {
        const statusMap: Record<string, SubscriptionStatus> = {
          active: 'active',
          trialing: 'trialing',
          past_due: 'past_due',
          canceled: 'canceled',
          unpaid: 'unpaid',
          incomplete: 'incomplete',
          incomplete_expired: 'incomplete_expired'
        };

        const mappedStatus = statusMap[subscription.status] || 'active';
        const currentPeriodEnd = (subscription as any).current_period_end;

        await updateUserSubscription({
          userId,
          planId: mappedStatus === 'canceled' ? 'free' : planId,
          status: mappedStatus,
          stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
          stripeSubscriptionId: subscription.id,
          currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          updatedAt: Date.now()
        });

        handled = true;
        details = `Subscription updated for user ${userId}: status=${mappedStatus}.`;
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.userId;

      if (userId) {
        await updateUserSubscription({
          userId,
          planId: 'free',
          status: 'canceled',
          stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
          stripeSubscriptionId: subscription.id,
          cancelAtPeriodEnd: false,
          updatedAt: Date.now()
        });

        handled = true;
        details = `Subscription cancelled for user ${userId}. Reverted to free tier.`;
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = (invoice as any).subscription;
      handled = true;
      details = `Invoice payment succeeded for subscription ${subId}.`;
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = (invoice as any).subscription;
      handled = true;
      details = `Invoice payment failed for subscription ${subId}.`;
      break;
    }

    default:
      handled = true;
      details = `Unhandled event type ${event.type} acknowledged.`;
      break;
  }

  // Mark event as processed for idempotency
  await recordProcessedWebhookEvent(event.id, event.type);

  return { handled, details };
}
