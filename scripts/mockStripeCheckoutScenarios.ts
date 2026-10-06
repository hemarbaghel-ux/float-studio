/**
 * Mock Stripe Checkout Scenarios Testing Utility
 * 
 * Verifies success, cancellation, idempotency, and error handling
 * across the entire FLOAT subscription checkout and webhook flow.
 * 
 * Run with: tsx scripts/mockStripeCheckoutScenarios.ts
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import Stripe from 'stripe';
import {
  FLOAT_PLANS,
  getServerPriceId,
  validateStripeEnv,
  handleWebhookEvent
} from '../src/server/subscription/stripeService';
import {
  getUserSubscription,
  updateUserSubscription,
  isWebhookEventProcessed,
  recordProcessedWebhookEvent,
  UserSubscription,
  SubscriptionPlanId
} from '../src/server/subscription/subscriptionPersistence';

// Color formatting for console test output
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;

let totalTests = 0;
let passedTests = 0;

function runScenario(description: string, fn: () => void | Promise<void>) {
  totalTests++;
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passedTests++;
      console.log(`  ${green('✓')} ${description}`);
    })
    .catch((err) => {
      console.error(`  ${red('✗')} ${description}`);
      console.error(`    ${red(err.message || String(err))}`);
      throw err;
    });
}

/**
 * Helper to generate a realistic mock Stripe webhook event
 */
function createMockStripeEvent(type: string, dataObject: any, eventId?: string): Stripe.Event {
  const id = eventId || `evt_test_${crypto.randomBytes(8).toString('hex')}`;
  return {
    id,
    object: 'event',
    api_version: '2025-02-24.acacia' as any,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: dataObject
    },
    livemode: false,
    pending_webhooks: 0,
    request: {
      id: `req_${crypto.randomBytes(6).toString('hex')}`,
      idempotency_key: null
    },
    type: type as any
  };
}

async function main() {
  console.log(bold('\n======================================================'));
  console.log(bold('  FLOAT AI — Stripe Checkout Scenarios Test Suite'));
  console.log(bold('======================================================\n'));

  // --------------------------------------------------------------------------
  // SCENARIO GROUP 1: Plan Configuration & Server-side Price Enforcement
  // --------------------------------------------------------------------------
  console.log(bold('[Group 1] Plan Configuration & Server Price Enforcement'));

  await runScenario('Free plan configuration has $0 price and cannot create paid session', () => {
    assert.strictEqual(FLOAT_PLANS.free.monthlyPrice, 0);
    assert.strictEqual(FLOAT_PLANS.free.id, 'free');
    assert.throws(
      () => getServerPriceId('free'),
      /Free plan does not require a Stripe checkout session/
    );
  });

  await runScenario('Server-side Price IDs enforced for Pro, Business, and Ultimate', () => {
    const proPrice = getServerPriceId('pro');
    const businessPrice = getServerPriceId('business');
    const ultimatePrice = getServerPriceId('ultimate');

    assert.ok(proPrice && typeof proPrice === 'string');
    assert.ok(businessPrice && typeof businessPrice === 'string');
    assert.ok(ultimatePrice && typeof ultimatePrice === 'string');

    // Prices must be distinct across tiers
    assert.notStrictEqual(proPrice, businessPrice);
    assert.notStrictEqual(businessPrice, ultimatePrice);
  });

  await runScenario('Invalid plan identifier rejected by server validation', () => {
    assert.throws(() => getServerPriceId('invalid_tier' as any));
    assert.throws(() => getServerPriceId('' as any));
  });

  // --------------------------------------------------------------------------
  // SCENARIO GROUP 2: Webhook Success & Instant Entitlement Activation
  // --------------------------------------------------------------------------
  console.log(bold('\n[Group 2] Webhook Success & Entitlement Activation'));

  const testUserA = `user_succ_${crypto.randomBytes(4).toString('hex')}`;

  await runScenario('New user starts on default free tier before checkout', async () => {
    const sub = await getUserSubscription(testUserA);
    assert.strictEqual(sub.userId, testUserA);
    assert.strictEqual(sub.planId, 'free');
    assert.strictEqual(sub.status, 'active');
  });

  await runScenario('Webhook checkout.session.completed activates Pro subscription', async () => {
    const mockSession: Partial<Stripe.Checkout.Session> = {
      id: `cs_test_${crypto.randomBytes(8).toString('hex')}`,
      client_reference_id: testUserA,
      customer: 'cus_float_pro_userA',
      subscription: {
        id: 'sub_float_pro_123',
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400
      } as any,
      metadata: {
        userId: testUserA,
        planId: 'pro'
      }
    };

    const event = createMockStripeEvent('checkout.session.completed', mockSession);
    const result = await handleWebhookEvent(event);

    assert.strictEqual(result.handled, true);
    assert.ok(!result.duplicate);

    // Verify persistence state immediately reflects active Pro status
    const updatedSub = await getUserSubscription(testUserA);
    assert.strictEqual(updatedSub.userId, testUserA);
    assert.strictEqual(updatedSub.planId, 'pro');
    assert.strictEqual(updatedSub.status, 'active');
    assert.strictEqual(updatedSub.stripeCustomerId, 'cus_float_pro_userA');
    assert.strictEqual(updatedSub.stripeSubscriptionId, 'sub_float_pro_123');
    assert.strictEqual(updatedSub.cancelAtPeriodEnd, false);
  });

  await runScenario('Webhook checkout.session.completed activates Business subscription', async () => {
    const testUserB = `user_biz_${crypto.randomBytes(4).toString('hex')}`;
    const mockSession: Partial<Stripe.Checkout.Session> = {
      id: `cs_test_${crypto.randomBytes(8).toString('hex')}`,
      client_reference_id: testUserB,
      customer: 'cus_float_biz_userB',
      subscription: 'sub_float_biz_456',
      metadata: {
        userId: testUserB,
        planId: 'business'
      }
    };

    const event = createMockStripeEvent('checkout.session.completed', mockSession);
    const result = await handleWebhookEvent(event);
    assert.strictEqual(result.handled, true);

    const sub = await getUserSubscription(testUserB);
    assert.strictEqual(sub.planId, 'business');
    assert.strictEqual(sub.status, 'active');
    assert.strictEqual(sub.stripeSubscriptionId, 'sub_float_biz_456');
  });

  // --------------------------------------------------------------------------
  // SCENARIO GROUP 3: Subscription Update & Renewal
  // --------------------------------------------------------------------------
  console.log(bold('\n[Group 3] Subscription Update & Lifecycle Modifications'));

  await runScenario('customer.subscription.updated handles renewal & status update', async () => {
    const newPeriodEnd = Math.floor(Date.now() / 1000) + 60 * 86400;
    const mockSubscription: any = {
      id: 'sub_float_pro_123',
      customer: 'cus_float_pro_userA',
      status: 'active',
      current_period_end: newPeriodEnd,
      cancel_at_period_end: false,
      metadata: {
        userId: testUserA,
        planId: 'pro'
      }
    };

    const event = createMockStripeEvent('customer.subscription.updated', mockSubscription);
    const result = await handleWebhookEvent(event);
    assert.strictEqual(result.handled, true);

    const sub = await getUserSubscription(testUserA);
    assert.strictEqual(sub.planId, 'pro');
    assert.strictEqual(sub.status, 'active');
    assert.strictEqual(sub.currentPeriodEnd, newPeriodEnd);
  });

  await runScenario('customer.subscription.updated handles past_due payment warning', async () => {
    const mockSubscription: Partial<Stripe.Subscription> = {
      id: 'sub_float_pro_123',
      customer: 'cus_float_pro_userA',
      status: 'past_due',
      cancel_at_period_end: false,
      metadata: {
        userId: testUserA,
        planId: 'pro'
      }
    };

    const event = createMockStripeEvent('customer.subscription.updated', mockSubscription);
    await handleWebhookEvent(event);

    const sub = await getUserSubscription(testUserA);
    assert.strictEqual(sub.status, 'past_due');
    assert.strictEqual(sub.planId, 'pro');
  });

  // --------------------------------------------------------------------------
  // SCENARIO GROUP 4: Cancellation & Downgrade to Free Tier
  // --------------------------------------------------------------------------
  console.log(bold('\n[Group 4] Cancellation Scenarios'));

  await runScenario('customer.subscription.deleted safely downgrades user to Free tier', async () => {
    const mockSubscription: Partial<Stripe.Subscription> = {
      id: 'sub_float_pro_123',
      customer: 'cus_float_pro_userA',
      status: 'canceled',
      metadata: {
        userId: testUserA,
        planId: 'pro'
      }
    };

    const event = createMockStripeEvent('customer.subscription.deleted', mockSubscription);
    const result = await handleWebhookEvent(event);
    assert.strictEqual(result.handled, true);

    // Entitlement verification: user is now returned to free plan with canceled status
    const sub = await getUserSubscription(testUserA);
    assert.strictEqual(sub.planId, 'free');
    assert.strictEqual(sub.status, 'canceled');
  });

  // --------------------------------------------------------------------------
  // SCENARIO GROUP 5: Idempotency & Duplicate Webhook Rejection
  // --------------------------------------------------------------------------
  console.log(bold('\n[Group 5] Idempotency & Duplicate Webhook Handling'));

  await runScenario('Identical webhook event processed once and deduplicated on retry', async () => {
    const duplicateEventId = `evt_dup_${crypto.randomBytes(6).toString('hex')}`;
    const testUserC = `user_dup_${crypto.randomBytes(4).toString('hex')}`;

    const mockSession: Partial<Stripe.Checkout.Session> = {
      id: 'cs_test_dup',
      client_reference_id: testUserC,
      metadata: {
        userId: testUserC,
        planId: 'ultimate'
      }
    };

    const event = createMockStripeEvent('checkout.session.completed', mockSession, duplicateEventId);

    // First arrival: processes normally
    const firstResult = await handleWebhookEvent(event);
    assert.strictEqual(firstResult.handled, true);
    assert.strictEqual(firstResult.duplicate, undefined);

    const subAfterFirst = await getUserSubscription(testUserC);
    assert.strictEqual(subAfterFirst.planId, 'ultimate');

    // Second arrival of same event ID: detected as duplicate
    const secondResult = await handleWebhookEvent(event);
    assert.strictEqual(secondResult.handled, true);
    assert.strictEqual(secondResult.duplicate, true);
    assert.ok(secondResult.details?.includes('already processed'));
  });

  // --------------------------------------------------------------------------
  // SCENARIO GROUP 6: Error Resilience & Environment Validation
  // --------------------------------------------------------------------------
  console.log(bold('\n[Group 6] Error Resilience & Environment Validation'));

  await runScenario('validateStripeEnv correctly reports missing configuration', () => {
    const envStatus = validateStripeEnv();
    assert.ok(typeof envStatus.isConfigured === 'boolean');
    assert.ok(Array.isArray(envStatus.warnings));
    assert.ok('pricesConfigured' in envStatus);
  });

  await runScenario('handleWebhookEvent handles unhandled event types gracefully', async () => {
    const unknownEvent = createMockStripeEvent('unknown.event.type', { dummy: true });
    const result = await handleWebhookEvent(unknownEvent);
    assert.strictEqual(result.handled, true);
    assert.ok(result.details?.includes('Unhandled event type'));
  });

  await runScenario('handleWebhookEvent rejects malformed event objects', async () => {
    await assert.rejects(
      () => handleWebhookEvent(null as any),
      /Invalid Stripe webhook event/
    );
    await assert.rejects(
      () => handleWebhookEvent({} as any),
      /Invalid Stripe webhook event/
    );
  });

  // --------------------------------------------------------------------------
  // SCENARIO GROUP 7: HTTP Endpoint Security & Signature Verification
  // --------------------------------------------------------------------------
  console.log(bold('\n[Group 7] HTTP Endpoint Security & Signature Verification'));

  await runScenario('GET /api/subscription/config returns valid public plan catalog', async () => {
    const res = await fetch('http://localhost:3000/api/subscription/config');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.ok(json.plans);
    assert.ok(json.plans.pro);
    assert.ok(json.plans.business);
    assert.ok(json.plans.ultimate);
  });

  await runScenario('Unauthenticated GET /api/subscription/status returns 401 Unauthorized', async () => {
    const res = await fetch('http://localhost:3000/api/subscription/status');
    assert.strictEqual(res.status, 401);
  });

  await runScenario('Unauthenticated POST /api/subscription/create-checkout-session returns 401', async () => {
    const res = await fetch('http://localhost:3000/api/subscription/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: 'pro' })
    });
    assert.strictEqual(res.status, 401);
  });

  await runScenario('Webhook without stripe-signature header rejected with 400', async () => {
    const res = await fetch('http://localhost:3000/api/subscription/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'checkout.session.completed' })
    });
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.error?.includes('Missing stripe-signature'));
  });

  await runScenario('Webhook with invalid signature header rejected with 400', async () => {
    const res = await fetch('http://localhost:3000/api/subscription/webhook', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'stripe-signature': 't=123456,v1=fake_signature_abc'
      },
      body: JSON.stringify({ type: 'checkout.session.completed' })
    });
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.error?.includes('Webhook signature verification failed'));
  });

  console.log(bold('\n======================================================'));
  console.log(bold(`  Result: ${green(`${passedTests}/${totalTests} Scenarios Passed Successfully!`)}`));
  console.log(bold('======================================================\n'));
}

main().catch((err) => {
  console.error(red('\nTest execution failed:'), err);
  process.exit(1);
});
