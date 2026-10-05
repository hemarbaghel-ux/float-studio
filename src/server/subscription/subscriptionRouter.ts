import { Router, Request, Response } from 'express';
import { requireAuth } from '../authMiddleware';
import {
  FLOAT_PLANS,
  isStripeConfigured,
  validateStripeEnv,
  createCheckoutSession,
  retrieveCheckoutSession,
  verifyWebhookSignature,
  handleWebhookEvent
} from './stripeService';
import {
  SubscriptionPlanId,
  getUserSubscription
} from './subscriptionPersistence';

export const subscriptionRouter = Router();

/**
 * Public Configuration: exposes publishable key and plan information for UI rendering
 */
subscriptionRouter.get('/config', (_req: Request, res: Response) => {
  const envStatus = validateStripeEnv();
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    isConfigured: envStatus.isConfigured,
    warnings: envStatus.warnings,
    plans: FLOAT_PLANS
  });
});

/**
 * User Subscription Status: reads authoritative, verified subscription state from persistence.
 * Never trusts client query parameters or redirects for entitlement!
 */
subscriptionRouter.get('/status', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'User is not authenticated.' });
    }

    const subscription = await getUserSubscription(userId);
    const planConfig = FLOAT_PLANS[subscription.planId] || FLOAT_PLANS.free;

    res.json({
      subscription: {
        ...subscription,
        planName: planConfig.name,
        monthlyPrice: planConfig.monthlyPrice,
        currency: planConfig.currency
      }
    });
  } catch (err: any) {
    console.error('Error fetching subscription status:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch subscription status.' });
  }
});

/**
 * Create Stripe Embedded Checkout Session
 * Only uses server-side configured price IDs. Rejects client-supplied prices or amounts!
 */
subscriptionRouter.post('/create-checkout-session', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user?.uid;
    const email = req.user?.email;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }

    const { planId } = req.body || {};
    if (!planId || typeof planId !== 'string') {
      return res.status(400).json({ error: 'Missing required field: "planId".' });
    }

    const normalizedPlanId = planId.toLowerCase().trim() as SubscriptionPlanId;
    if (!['pro', 'business', 'ultimate'].includes(normalizedPlanId)) {
      return res.status(400).json({
        error: `Invalid planId "${planId}". Available paid subscription tiers: pro, business, ultimate.`
      });
    }

    if (!isStripeConfigured()) {
      return res.status(503).json({
        error: 'Stripe is not configured on this FLOAT deployment. Server environment variables (STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY) must be provided.',
        code: 'STRIPE_NOT_CONFIGURED'
      });
    }

    // Determine return origin
    const hostHeader = req.get('host') || 'localhost:3000';
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const origin = process.env.APP_URL || `${proto}://${hostHeader}`;

    const sessionData = await createCheckoutSession({
      userId,
      email,
      planId: normalizedPlanId,
      origin
    });

    res.json({
      clientSecret: sessionData.clientSecret,
      sessionId: sessionData.sessionId,
      planId: normalizedPlanId
    });
  } catch (err: any) {
    console.error('Error creating checkout session:', err);
    res.status(500).json({ error: err.message || 'Failed to create checkout session.' });
  }
});

/**
 * Check Embedded Checkout Session Status upon return
 */
subscriptionRouter.get('/session-status', requireAuth, async (req: any, res: Response) => {
  try {
    const sessionId = req.query.session_id as string;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Missing "session_id" query parameter.' });
    }

    if (!isStripeConfigured()) {
      return res.status(503).json({ error: 'Stripe is not configured.' });
    }

    const session = await retrieveCheckoutSession(sessionId);

    // Verify session belongs to the requesting authenticated user
    const sessionUserId = session.client_reference_id || session.metadata?.userId;
    if (sessionUserId && sessionUserId !== req.user?.uid) {
      return res.status(403).json({ error: 'Forbidden: Checkout session belongs to another user.' });
    }

    res.json({
      status: session.status,
      paymentStatus: session.payment_status,
      customerEmail: session.customer_details?.email || session.customer_email,
      planId: session.metadata?.planId,
      clientReferenceId: session.client_reference_id
    });
  } catch (err: any) {
    console.error('Error checking session status:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve session status.' });
  }
});

/**
 * Stripe Webhook Handler:
 * Invoked directly with raw body buffer for HMAC-SHA256 signature verification.
 */
export async function handleStripeWebhook(req: Request, res: Response) {
  const signature = req.headers['stripe-signature'] as string;
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header.' });
  }

  let event: any;
  try {
    event = verifyWebhookSignature(req.body, signature);
  } catch (err: any) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  try {
    const result = await handleWebhookEvent(event);
    res.json({ received: true, ...result });
  } catch (err: any) {
    console.error(`Error processing webhook event ${event.id}:`, err);
    res.status(500).json({ error: 'Webhook processing error.' });
  }
}
