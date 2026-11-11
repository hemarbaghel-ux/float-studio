/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import {
  getServerPriceId,
  FLOAT_PLANS,
  SubscriptionPlanId,
  BillingCycle,
} from '../src/server/subscription/stripeService';

describe('Addendum A.1 — Checkout & Billing Cycle Contract Verifications', () => {
  it('correctly returns distinct server-owned price IDs for monthly and yearly cycles', () => {
    const paidPlans: SubscriptionPlanId[] = ['pro', 'business', 'ultimate'];

    for (const plan of paidPlans) {
      const monthlyPriceId = getServerPriceId(plan, 'monthly');
      const yearlyPriceId = getServerPriceId(plan, 'yearly');

      expect(monthlyPriceId).toBeDefined();
      expect(yearlyPriceId).toBeDefined();
      expect(monthlyPriceId).not.toBe(yearlyPriceId);
      expect(monthlyPriceId).toContain(plan);
      expect(monthlyPriceId).toContain('monthly');
      expect(yearlyPriceId).toContain(plan);
      expect(yearlyPriceId).toContain('yearly');
    }
  });

  it('rejects free tier from requiring a Stripe price ID', () => {
    expect(() => getServerPriceId('free', 'monthly')).toThrow(
      /Free plan does not require a Stripe checkout session/
    );
  });

  it('rejects unknown or invalid plan identifiers', () => {
    // @ts-expect-error testing runtime validation
    expect(() => getServerPriceId('invalid_enterprise_tier', 'monthly')).toThrow(
      /Invalid plan identifier/
    );
  });

  it('rejects unknown billing cycles', () => {
    // @ts-expect-error testing runtime validation
    expect(() => getServerPriceId('pro', 'quarterly')).toThrow(
      /Invalid billing cycle/
    );
  });

  it('verifies that yearly pricing in FLOAT_PLANS offers expected annual discount', () => {
    const pro = FLOAT_PLANS.pro;
    const business = FLOAT_PLANS.business;

    // Pro: $20/mo monthly, $16/mo yearly ($192/yr) -> 20% savings
    expect(pro.monthlyPrice).toBe(20);
    expect(pro.yearlyPrice).toBe(16);
    expect(pro.yearlyAnnualTotal).toBe(192);
    expect(pro.yearlyDiscountPercent).toBe(20);

    // Business: $40/mo monthly, $32/mo yearly ($384/yr) -> 20% savings
    expect(business.monthlyPrice).toBe(40);
    expect(business.yearlyPrice).toBe(32);
    expect(business.yearlyAnnualTotal).toBe(384);
    expect(business.yearlyDiscountPercent).toBe(20);
  });
});
