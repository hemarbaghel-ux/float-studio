import React, { useEffect, useState, useRef } from 'react';
import { loadStripe, Stripe, StripeEmbeddedCheckout } from '@stripe/stripe-js';
import { useAuthStore } from '../../store/authStore';
import { useSubscriptionStore, FLOAT_PLANS, SubscriptionPlanId } from '../../store/subscriptionStore';
import { FloatLogo } from '../../components/FloatLogo';
import { SignUpPage } from '../auth/SignUpPage';
import { 
  Check, 
  ShieldCheck, 
  Lock, 
  ArrowLeft, 
  Sparkles, 
  AlertTriangle, 
  Loader2, 
  RefreshCw,
  ExternalLink,
  Zap,
  Users,
  Building2,
  CheckCircle2
} from 'lucide-react';

export function CheckoutPage() {
  const { user, loading: authLoading } = useAuthStore();
  const { 
    publishableKey, 
    isStripeConfigured, 
    fetchConfig, 
    createCheckoutSession,
    subscription,
    fetchSubscriptionStatus
  } = useSubscriptionStore();

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanId>('pro');
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  const checkoutContainerRef = useRef<HTMLDivElement>(null);
  const embeddedCheckoutRef = useRef<StripeEmbeddedCheckout | null>(null);

  // Parse plan from query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const planParam = params.get('plan') as SubscriptionPlanId;
    if (planParam && ['pro', 'business', 'ultimate'].includes(planParam)) {
      setSelectedPlan(planParam);
    }
  }, []);

  // Fetch subscription configuration on mount
  useEffect(() => {
    fetchConfig();
    if (user) {
      fetchSubscriptionStatus();
    }
  }, [fetchConfig, user, fetchSubscriptionStatus]);

  // Set Stripe promise when publishableKey becomes available
  useEffect(() => {
    if (publishableKey && publishableKey.trim() !== '') {
      setStripePromise(loadStripe(publishableKey));
    } else {
      setStripePromise(null);
    }
  }, [publishableKey]);

  // Create checkout session whenever selectedPlan or user changes
  useEffect(() => {
    if (!user || authLoading) return;

    let isMounted = true;
    setSessionLoading(true);
    setSessionError(null);
    setClientSecret(null);

    // Destroy existing embedded checkout instance if any
    if (embeddedCheckoutRef.current) {
      try {
        embeddedCheckoutRef.current.destroy();
      } catch (err) {
        console.warn('Error destroying existing checkout instance:', err);
      }
      embeddedCheckoutRef.current = null;
    }

    if (checkoutContainerRef.current) {
      checkoutContainerRef.current.innerHTML = '';
    }

    createCheckoutSession(selectedPlan)
      .then((res) => {
        if (!isMounted) return;
        setClientSecret(res.clientSecret);
        setSessionLoading(false);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        console.error('Failed to create checkout session:', err);
        setSessionError(err.message || 'Unable to start checkout session.');
        setSessionLoading(false);
      });

    return () => {
      isMounted = false;
      if (embeddedCheckoutRef.current) {
        try {
          embeddedCheckoutRef.current.destroy();
        } catch {
          // ignore cleanup errors
        }
        embeddedCheckoutRef.current = null;
      }
    };
  }, [user, authLoading, selectedPlan, createCheckoutSession]);

  // Mount Stripe Embedded Checkout when clientSecret & stripePromise are available
  useEffect(() => {
    if (!clientSecret || !stripePromise || !checkoutContainerRef.current) return;

    let isCancelled = false;

    stripePromise.then((stripe) => {
      if (isCancelled || !stripe || !checkoutContainerRef.current) return;

      (stripe as any).initEmbeddedCheckout({
        clientSecret,
      })
      .then((embeddedCheckout) => {
        if (isCancelled || !checkoutContainerRef.current) {
          embeddedCheckout.destroy();
          return;
        }
        checkoutContainerRef.current.innerHTML = '';
        embeddedCheckout.mount(checkoutContainerRef.current);
        embeddedCheckoutRef.current = embeddedCheckout;
      })
      .catch((mountErr) => {
        if (isCancelled) return;
        console.error('Error mounting embedded checkout:', mountErr);
        setSessionError(mountErr.message || 'Failed to render Stripe checkout elements.');
      });
    });

    return () => {
      isCancelled = true;
      if (embeddedCheckoutRef.current) {
        try {
          embeddedCheckoutRef.current.destroy();
        } catch {
          // ignore
        }
        embeddedCheckoutRef.current = null;
      }
    };
  }, [clientSecret, stripePromise]);

  const handleSelectPlan = (planId: SubscriptionPlanId) => {
    if (planId === selectedPlan) return;
    setSelectedPlan(planId);
    const newUrl = `${window.location.pathname}?plan=${planId}`;
    window.history.replaceState({}, '', newUrl);
  };

  const planConfig = FLOAT_PLANS[selectedPlan] || FLOAT_PLANS.pro;

  // 1. Loading auth state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center gap-4 text-white">
        <FloatLogo className="w-10 h-10 animate-pulse" />
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          <span>Verifying authentication...</span>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated user: require sign-in and preserve return URL
  if (!user) {
    const returnUrl = window.location.pathname + window.location.search;
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#121212] border border-white/10 rounded-2xl p-6 shadow-2xl text-center mb-6">
          <div className="flex justify-center mb-4">
            <FloatLogo className="w-10 h-10" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Sign in to subscribe to FLOAT {planConfig.name}</h1>
          <p className="text-xs text-slate-400 mb-6">
            A Firebase user account is required to link your subscription and sync your developer agents.
          </p>
          <div className="text-left">
            <SignUpPage initialMode="signin" isModal={false} returnTo={returnUrl} />
          </div>
        </div>
      </div>
    );
  }

  // 3. Authenticated checkout layout: responsive two-column
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-white/10 bg-[#0E0E0E] px-6 flex items-center justify-between">
        <a 
          href="/pricing" 
          onClick={(e) => {
            e.preventDefault();
            window.history.pushState({}, '', '/pricing');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span>Back to Plans</span>
        </a>

        <div className="flex items-center gap-2">
          <FloatLogo className="w-5 h-5" />
          <span className="text-sm font-semibold tracking-tight text-white">FLOAT AI</span>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
            Checkout
          </span>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-2">
          <span className="hidden sm:inline">Signed in as</span>
          <span className="text-slate-200 font-mono text-[11px] bg-white/5 px-2 py-1 rounded">
            {user.email || user.uid.substring(0, 8)}
          </span>
        </div>
      </header>

      {/* Main Two-Column Layout */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 max-w-7xl w-full mx-auto shadow-2xl">
        {/* LEFT COLUMN: Dark FLOAT Plan Summary */}
        <section className="lg:col-span-5 bg-[#0D0D0D] p-6 sm:p-10 border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col justify-between">
          <div>
            {/* Plan switcher tabs */}
            <div className="mb-8">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3 block">
                Select Your Plan
              </span>
              <div className="grid grid-cols-3 gap-2 bg-[#141414] p-1 rounded-xl border border-white/5">
                {(['pro', 'business', 'ultimate'] as SubscriptionPlanId[]).map((planId) => {
                  const p = FLOAT_PLANS[planId];
                  const isSelected = selectedPlan === planId;
                  return (
                    <button
                      key={planId}
                      type="button"
                      onClick={() => handleSelectPlan(planId)}
                      className={`py-2 px-2 rounded-lg text-xs font-medium transition-all text-center flex flex-col items-center justify-center cursor-pointer ${
                        isSelected 
                          ? 'bg-white text-black shadow-md font-semibold' 
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className="capitalize">{planId}</span>
                      <span className={`text-[10px] ${isSelected ? 'text-slate-600' : 'text-slate-500'}`}>
                        ${p.monthlyPrice}/mo
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Plan header & price */}
            <div className="mb-6 pb-6 border-b border-white/10">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">{planConfig.name}</h1>
                {planConfig.badge && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    {planConfig.badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                {planConfig.description}
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-extrabold text-white tracking-tight">${planConfig.monthlyPrice}</span>
                <span className="text-xs text-slate-400">/ month</span>
                <span className="text-[11px] text-slate-500 ml-2">USD, billed monthly</span>
              </div>
            </div>

            {/* Features Included List */}
            <div className="space-y-3 mb-8">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                Included with {planConfig.name}
              </span>
              {planConfig.features.map((feature, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-300">
                  <div className="w-4 h-4 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check size={11} strokeWidth={3} />
                  </div>
                  <span className="leading-tight">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Security & Guarantees Footer */}
          <div className="pt-6 border-t border-white/10 space-y-3 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <Lock size={13} className="text-emerald-400 shrink-0" />
              <span>256-bit SSL encrypted & powered by Stripe payment infrastructure</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={13} className="text-blue-400 shrink-0" />
              <span>Cancel or adjust your plan anytime directly from account settings</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={13} className="text-amber-400 shrink-0" />
              <span>Entitlements verified cryptographically via signed Stripe webhooks</span>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Light Payment Area */}
        <section className="lg:col-span-7 bg-white text-slate-900 p-6 sm:p-10 flex flex-col justify-start">
          <div className="max-w-xl w-full mx-auto">
            {/* Header in Payment area */}
            <div className="mb-6 pb-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">Complete Payment</h2>
                <p className="text-xs text-slate-500">
                  Select your preferred payment method below.
                </p>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-[11px] font-medium text-slate-600">
                <Lock size={12} className="text-emerald-600" />
                <span>Stripe Secure</span>
              </div>
            </div>

            {/* UNCONFIGURED STRIPE FALLBACK STATE */}
            {!isStripeConfigured ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-900 my-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-amber-900">
                      Stripe Configuration Required
                    </h3>
                    <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                      To accept live subscription payments on this FLOAT deployment, the server administrator must configure Stripe environment credentials in <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px]">.env</code>:
                    </p>

                    <div className="mt-3 bg-white/80 p-3 rounded-lg border border-amber-200 font-mono text-[11px] space-y-1 text-slate-800">
                      <div><span className="font-semibold text-slate-900">STRIPE_SECRET_KEY</span>="sk_test_..."</div>
                      <div><span className="font-semibold text-slate-900">STRIPE_PUBLISHABLE_KEY</span>="pk_test_..."</div>
                      <div><span className="font-semibold text-slate-900">STRIPE_WEBHOOK_SECRET</span>="whsec_..."</div>
                      <div><span className="font-semibold text-slate-900">STRIPE_PRICE_ID_PRO</span>="price_..."</div>
                      <div><span className="font-semibold text-slate-900">STRIPE_PRICE_ID_BUSINESS</span>="price_..."</div>
                      <div><span className="font-semibold text-slate-900">STRIPE_PRICE_ID_ULTIMATE</span>="price_..."</div>
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => fetchConfig()}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <RefreshCw size={12} />
                        <span>Recheck Configuration</span>
                      </button>
                      <a 
                        href="https://dashboard.stripe.com/apikeys" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-amber-800 hover:text-amber-900 underline flex items-center gap-1"
                      >
                        <span>Stripe Dashboard</span>
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* SESSION LOADING STATE */}
            {sessionLoading && isStripeConfigured ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
                <span className="text-xs font-medium text-slate-600">
                  Initializing secure Stripe checkout for FLOAT {planConfig.name}...
                </span>
              </div>
            ) : null}

            {/* SESSION ERROR STATE */}
            {sessionError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 my-4">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-xs font-semibold text-red-900">Unable to load checkout</h4>
                    <p className="mt-0.5 text-xs text-red-700">{sessionError}</p>
                    <button
                      type="button"
                      onClick={() => handleSelectPlan(selectedPlan)}
                      className="mt-3 px-3 py-1 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-700 cursor-pointer"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* STRIPE EMBEDDED CHECKOUT CONTAINER */}
            <div 
              ref={checkoutContainerRef} 
              id="checkout" 
              className={`w-full min-h-[420px] transition-opacity duration-300 ${sessionLoading ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
