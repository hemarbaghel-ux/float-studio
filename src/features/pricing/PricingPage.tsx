
import React, { useEffect } from 'react';
import { 
  Sparkles, 
  Check, 
  Zap, 
  Users, 
  Building2, 
  Lock, 
  ArrowLeft, 
  Sun, 
  Moon 
} from 'lucide-react';
import { FLOAT_PLANS, useSubscriptionStore, SubscriptionPlanId, BillingCycle } from '../../store/subscriptionStore';
import { useIDEStore, applyThemeToDocument } from '../../store';
import { FloatLogo } from '../../components/FloatLogo';
import { PricingComparisonMatrix } from './PricingComparisonMatrix';

export function PricingPage() {
  const { subscription, fetchSubscriptionStatus } = useSubscriptionStore();
  const { settings, updateSettings } = useIDEStore();
  const [billingCycle, setBillingCycle] = React.useState<BillingCycle>('monthly');
  const currentPlanId = subscription?.planId || 'free';

  useEffect(() => {
    fetchSubscriptionStatus?.();
  }, [fetchSubscriptionStatus]);

  const handleSelectPlan = (planId: SubscriptionPlanId) => {
    if (planId === 'free') {
      window.history.pushState({}, '', '/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }
    window.history.pushState({}, '', `/checkout?plan=${planId}&billing=${billingCycle}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0A0A0A] dark:text-[#E6EDF3] transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-white/10 dark:bg-[#0A0A0A]/80">
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="flex items-center gap-2.5 text-slate-900 dark:text-white group cursor-pointer"
          >
            <FloatLogo className="w-6 h-6" />
            <span className="font-semibold tracking-tight text-sm">FLOAT AI</span>
          </a>

          <div className="flex items-center gap-3">
            <a
              href="/dashboard"
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/dashboard');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-[#8B949E] dark:hover:text-white transition-colors cursor-pointer"
            >
              Dashboard
            </a>
            <button
              type="button"
              onClick={() => {
                const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
                updateSettings({ theme: nextTheme });
                applyThemeToDocument(nextTheme);
              }}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title="Toggle theme"
            >
              {settings.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-4xl px-6 pt-16 pb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 mb-4">
          <Sparkles size={13} />
          <span>Flexible Plans for Developers & Teams</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-4">
          Transparent, Predictable Pricing
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-[#8B949E] max-w-2xl mx-auto mb-8">
          Start for free, power up with frontier agentic intelligence, or deploy collaborative team workspaces. Upgrade, downgrade, or cancel anytime.
        </p>

        {/* Monthly vs Yearly Billing Toggle */}
        <div className="inline-flex items-center gap-3 bg-slate-200/70 dark:bg-white/5 p-1.5 rounded-2xl border border-slate-300/80 dark:border-white/10 shadow-xs">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              billingCycle === 'monthly'
                ? 'bg-white text-slate-900 dark:bg-[#1A1813] dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'
            }`}
            aria-pressed={billingCycle === 'monthly'}
          >
            Monthly billing
          </button>

          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              billingCycle === 'yearly'
                ? 'bg-white text-slate-900 dark:bg-[#1A1813] dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'
            }`}
            aria-pressed={billingCycle === 'yearly'}
          >
            <span>Annual billing</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
              Save 20%
            </span>
          </button>
        </div>

        {billingCycle === 'yearly' && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-3 font-medium animate-fadeIn">
            ✓ 20% discount applied. Billed annually with flexible cancellation anytime.
          </p>
        )}
      </section>

      {/* Pricing Cards Grid */}
      <section className="mx-auto max-w-6xl px-6 pb-20 w-full">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* FREE PLAN */}
          <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#0D0D0D] flex flex-col justify-between shadow-sm relative">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">FLOAT Free</h3>
                <Sparkles size={16} className="text-slate-500 dark:text-slate-400" />
              </div>
              <p className="text-xs text-slate-500 dark:text-[#8B949E] min-h-[36px]">
                {FLOAT_PLANS.free.description}
              </p>
              <div className="mt-4 mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-slate-900 dark:text-white">$0</span>
                  <span className="text-xs text-slate-500 dark:text-[#8B949E]"> / month</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 min-h-[18px]">
                  Always free for personal exploration
                </div>
              </div>

              <div className="space-y-2.5 pt-4 border-t border-slate-100 dark:border-white/5">
                {FLOAT_PLANS.free.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <Check size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-4">
              <button
                type="button"
                onClick={() => handleSelectPlan('free')}
                disabled={currentPlanId === 'free'}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  currentPlanId === 'free'
                    ? 'bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-500 cursor-default'
                    : 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/20'
                }`}
              >
                {currentPlanId === 'free' ? 'Current Plan' : 'Get Started Free'}
              </button>
            </div>
          </article>

          {/* PRO PLAN (HIGHLIGHTED) */}
          <article className="rounded-2xl border-2 border-blue-500 bg-white p-6 dark:bg-[#111111] flex flex-col justify-between shadow-xl relative ring-4 ring-blue-500/10">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-sm">
              Most Popular
            </div>

            <div>
              <div className="flex items-center justify-between mb-3 mt-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">FLOAT Pro</h3>
                <Zap size={16} className="text-blue-500" />
              </div>
              <p className="text-xs text-slate-500 dark:text-[#8B949E] min-h-[36px]">
                {FLOAT_PLANS.pro.description}
              </p>
              <div className="mt-4 mb-6">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                    ${billingCycle === 'yearly' ? FLOAT_PLANS.pro.yearlyPrice : FLOAT_PLANS.pro.monthlyPrice}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-[#8B949E]"> / month</span>
                  {billingCycle === 'yearly' && (
                    <span className="text-xs line-through text-slate-400 ml-1">
                      ${FLOAT_PLANS.pro.monthlyPrice}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-[#8B949E] mt-1 min-h-[18px]">
                  {billingCycle === 'yearly' ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      Billed ${FLOAT_PLANS.pro.yearlyAnnualTotal}/year (save $48/yr)
                    </span>
                  ) : (
                    'Billed monthly, cancel anytime'
                  )}
                </div>
              </div>

              <div className="space-y-2.5 pt-4 border-t border-slate-100 dark:border-white/5">
                {FLOAT_PLANS.pro.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <Check size={14} className="text-blue-500 shrink-0 mt-0.5" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-4">
              <button
                type="button"
                onClick={() => handleSelectPlan('pro')}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-md ${
                  currentPlanId === 'pro'
                    ? 'bg-emerald-600 text-white cursor-default'
                    : 'bg-blue-600 text-white hover:bg-blue-500'
                }`}
              >
                {currentPlanId === 'pro' ? 'Current Plan (Active)' : `Upgrade to Pro (${billingCycle === 'yearly' ? '$16/mo' : '$20/mo'})`}
              </button>
            </div>
          </article>

          {/* BUSINESS PLAN */}
          <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#0D0D0D] flex flex-col justify-between shadow-sm relative">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">FLOAT Business</h3>
                <Users size={16} className="text-purple-500" />
              </div>
              <p className="text-xs text-slate-500 dark:text-[#8B949E] min-h-[36px]">
                {FLOAT_PLANS.business.description}
              </p>
              <div className="mt-4 mb-6">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                    ${billingCycle === 'yearly' ? FLOAT_PLANS.business.yearlyPrice : FLOAT_PLANS.business.monthlyPrice}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-[#8B949E]"> / user / mo</span>
                  {billingCycle === 'yearly' && (
                    <span className="text-xs line-through text-slate-400 ml-1">
                      ${FLOAT_PLANS.business.monthlyPrice}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-[#8B949E] mt-1 min-h-[18px]">
                  {billingCycle === 'yearly' ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      Billed ${FLOAT_PLANS.business.yearlyAnnualTotal}/user/yr (save $96/user)
                    </span>
                  ) : (
                    'Billed monthly per active seat'
                  )}
                </div>
              </div>

              <div className="space-y-2.5 pt-4 border-t border-slate-100 dark:border-white/5">
                {FLOAT_PLANS.business.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <Check size={14} className="text-purple-500 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-4">
              <button
                type="button"
                onClick={() => handleSelectPlan('business')}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  currentPlanId === 'business'
                    ? 'bg-emerald-600 text-white cursor-default'
                    : 'bg-slate-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-slate-200'
                }`}
              >
                {currentPlanId === 'business' ? 'Current Plan (Active)' : `Upgrade to Business (${billingCycle === 'yearly' ? '$32/mo' : '$40/mo'})`}
              </button>
            </div>
          </article>

          {/* ULTIMATE PLAN */}
          <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#0D0D0D] flex flex-col justify-between shadow-sm relative">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">FLOAT Ultimate</h3>
                <Building2 size={16} className="text-amber-500" />
              </div>
              <p className="text-xs text-slate-500 dark:text-[#8B949E] min-h-[36px]">
                {FLOAT_PLANS.ultimate.description}
              </p>
              <div className="mt-4 mb-6">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                    ${billingCycle === 'yearly' ? FLOAT_PLANS.ultimate.yearlyPrice : FLOAT_PLANS.ultimate.monthlyPrice}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-[#8B949E]"> / user / mo</span>
                  {billingCycle === 'yearly' && (
                    <span className="text-xs line-through text-slate-400 ml-1">
                      ${FLOAT_PLANS.ultimate.monthlyPrice}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-[#8B949E] mt-1 min-h-[18px]">
                  {billingCycle === 'yearly' ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      Billed ${FLOAT_PLANS.ultimate.yearlyAnnualTotal}/user/yr (save $240/user)
                    </span>
                  ) : (
                    'Billed monthly per active seat'
                  )}
                </div>
              </div>

              <div className="space-y-2.5 pt-4 border-t border-slate-100 dark:border-white/5">
                {FLOAT_PLANS.ultimate.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <Check size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-4">
              <button
                type="button"
                onClick={() => handleSelectPlan('ultimate')}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  currentPlanId === 'ultimate'
                    ? 'bg-emerald-600 text-white cursor-default'
                    : 'bg-slate-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-slate-200'
                }`}
              >
                {currentPlanId === 'ultimate' ? 'Current Plan (Active)' : `Choose Ultimate (${billingCycle === 'yearly' ? '$80/mo' : '$100/mo'})`}
              </button>
            </div>
          </article>
        </div>

        {/* Security & Payment Assurance Banner */}
        <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#0D0D0D] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600 dark:text-[#8B949E]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Lock size={18} />
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white">Secure Stripe Checkout & Instant Webhook Provisioning</h4>
              <p className="mt-0.5 text-slate-500 dark:text-[#8B949E]">
                All transactions are encrypted with 256-bit SSL. Entitlements are activated automatically via signed server webhooks.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-[11px] bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded text-slate-700 dark:text-slate-300">
              Cancel Anytime
            </span>
          </div>
        </div>

        {/* Feature Comparison Matrix */}
        <div className="mt-16 pt-12 border-t border-slate-200 dark:border-white/10">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Detailed Plan Comparison</h2>
            <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-[#8B949E]">Compare all capabilities, model access, and team features across plans.</p>
          </div>
          <PricingComparisonMatrix onSelectPlan={handleSelectPlan} billingCycle={billingCycle} />
        </div>
      </section>
    </main>
  );
}
