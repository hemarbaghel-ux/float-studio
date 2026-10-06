import React, { useEffect } from 'react';
import { 
  ArrowLeft, 
  Check, 
  Sparkles, 
  Zap, 
  Users, 
  Building2, 
  ShieldCheck, 
  HelpCircle,
  ArrowRight,
  Lock,
  Layers,
  Cpu
} from 'lucide-react';
import { FloatLogo } from '../../components/FloatLogo';
import { useAuthStore } from '../../store/authStore';
import { useSubscriptionStore, FLOAT_PLANS, SubscriptionPlanId } from '../../store/subscriptionStore';

export function PricingPage() {
  const { user } = useAuthStore();
  const { subscription, fetchSubscriptionStatus } = useSubscriptionStore();

  useEffect(() => {
    if (user) {
      fetchSubscriptionStatus();
    }
  }, [user, fetchSubscriptionStatus]);

  const currentPlanId = subscription?.planId || 'free';

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleSelectPlan = (planId: SubscriptionPlanId) => {
    if (planId === 'free') {
      navigateTo('/');
      return;
    }
    navigateTo(`/checkout?plan=${planId}`);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#080808] dark:text-[#E6EDF3] flex flex-col font-sans">
      {/* Sticky Navigation Header */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 dark:border-white/10 dark:bg-[#080808]/80">
        <a 
          href="/" 
          onClick={(e) => {
            e.preventDefault();
            navigateTo('/');
          }}
          aria-label="Back to FLOAT" 
          className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-200 hover:text-black dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={15} className="text-slate-500" />
          <FloatLogo className="h-5 w-5" />
          <span className="text-sm font-semibold tracking-tight">FLOAT AI</span>
        </a>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-[#8B949E] hidden sm:inline">Signed in as:</span>
              <span className="font-mono text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-white/10 px-2 py-1 rounded text-[11px]">
                {user.email || user.uid.slice(0, 8)}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {currentPlanId} plan
              </span>
            </div>
          ) : (
            <button
              onClick={() => navigateTo('/sign-up')}
              className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-black dark:hover:text-white cursor-pointer px-3 py-1.5"
            >
              Sign In
            </button>
          )}

          <button 
            onClick={() => navigateTo('/')} 
            className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 dark:bg-white dark:text-black cursor-pointer shadow-sm transition-all"
          >
            Open Workspace
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-5xl px-6 pt-16 pb-12 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
          Transparent Developer Pricing
        </p>
        <h1 className="mt-3 text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Powerful AI agents for every workflow
        </h1>
        <p className="mt-4 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed text-slate-600 dark:text-[#8B949E]">
          Build faster with FLOAT Basic everyday coding assistance or unlock frontier multi-agent capabilities with Pro, Business, and Ultimate tiers.
        </p>
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
                <span className="text-3xl font-extrabold text-slate-900 dark:text-white">$0</span>
                <span className="text-xs text-slate-500 dark:text-[#8B949E]"> / month</span>
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
                <span className="text-3xl font-extrabold text-slate-900 dark:text-white">$20</span>
                <span className="text-xs text-slate-500 dark:text-[#8B949E]"> / month</span>
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
                {currentPlanId === 'pro' ? 'Current Plan (Active)' : 'Upgrade to Pro'}
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
                <span className="text-3xl font-extrabold text-slate-900 dark:text-white">$40</span>
                <span className="text-xs text-slate-500 dark:text-[#8B949E]"> / user / month</span>
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
                {currentPlanId === 'business' ? 'Current Plan (Active)' : 'Upgrade to Business'}
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
                <span className="text-3xl font-extrabold text-slate-900 dark:text-white">$100</span>
                <span className="text-xs text-slate-500 dark:text-[#8B949E]"> / user / month</span>
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
                {currentPlanId === 'ultimate' ? 'Current Plan (Active)' : 'Choose Ultimate'}
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
      </section>
    </main>
  );
}
