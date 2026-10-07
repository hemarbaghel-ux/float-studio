import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useSubscriptionStore, UserSubscriptionInfo, FLOAT_PLANS } from '../../store/subscriptionStore';
import { FloatLogo } from '../../components/FloatLogo';
import { 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Loader2, 
  RotateCw, 
  ShieldCheck, 
  CreditCard 
} from 'lucide-react';

export function CheckoutReturnPage() {
  const { user } = useAuthStore();
  const { checkSessionStatus, fetchSubscriptionStatus, subscription } = useSubscriptionStore();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionDetails, setSessionDetails] = useState<{
    status?: string;
    paymentStatus?: string;
    customerEmail?: string;
    planId?: string;
  } | null>(null);
  const [pollingAttempts, setPollingAttempts] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('session_id');
    if (!id) {
      setError('Missing checkout session_id parameter.');
      setLoading(false);
      return;
    }
    setSessionId(id);
  }, []);

  useEffect(() => {
    if (!sessionId || !user) return;

    let isMounted = true;
    setLoading(true);

    const verifySession = async () => {
      try {
        const details = await checkSessionStatus(sessionId);
        if (!isMounted) return;
        setSessionDetails(details);

        // Fetch authoritative, server-verified user subscription from database
        // NEVER grant paid access based only on URL query parameters or browser redirects!
        await fetchSubscriptionStatus();
        setLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Session verification error:', err);
        setError(err.message || 'Failed to verify checkout session.');
        setLoading(false);
      }
    };

    verifySession();

    return () => {
      isMounted = false;
    };
  }, [sessionId, user, checkSessionStatus, fetchSubscriptionStatus, pollingAttempts]);

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    setPollingAttempts((prev) => prev + 1);
  };

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const isComplete = sessionDetails?.status === 'complete';
  const isOpen = sessionDetails?.status === 'open';
  const planId = (sessionDetails?.planId || subscription?.planId || 'pro') as keyof typeof FLOAT_PLANS;
  const planConfig = FLOAT_PLANS[planId] || FLOAT_PLANS.pro;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg bg-[#111111] border border-white/10 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        {/* Header with FLOAT branding */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <FloatLogo className="w-6 h-6" />
            <span className="text-base font-bold text-white tracking-tight">FLOAT AI</span>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/5 text-slate-400">
            Subscription Verification
          </span>
        </div>

        {/* LOADING STATE */}
        {loading && (
          <div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-slate-400" />
            <div>
              <h2 className="text-sm font-semibold text-white">Verifying Checkout Session</h2>
              <p className="text-xs text-slate-400 mt-1">
                Authoritatively checking payment status and synchronizing account entitlements...
              </p>
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {!loading && error && (
          <div className="py-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mb-4">
              <AlertCircle size={24} />
            </div>
            <h2 className="text-base font-bold text-white mb-1">Session Verification Issue</h2>
            <p className="text-xs text-slate-400 mb-6 max-w-sm">
              {error}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleRefresh}
                className="px-4 py-2 rounded-lg bg-white/10 text-white text-xs font-medium hover:bg-white/15 flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCw size={13} />
                <span>Retry Check</span>
              </button>
              <button
                type="button"
                onClick={() => navigateTo('/pricing')}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 cursor-pointer"
              >
                View Plans
              </button>
            </div>
          </div>
        )}

        {/* SUCCESS / COMPLETE STATE */}
        {!loading && !error && isComplete && (
          <div className="py-4 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4 ring-8 ring-emerald-500/5">
              <CheckCircle2 size={32} />
            </div>
            
            <h2 className="text-xl font-bold text-white tracking-tight mb-1">
              Subscription Confirmed!
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              Thank you for subscribing to <strong className="text-white">{planConfig.name}</strong>. Your account has been upgraded.
            </p>

            {/* Receipt Summary Card */}
            <div className="w-full bg-[#161616] border border-white/5 rounded-xl p-4 mb-6 text-left space-y-2.5 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="text-slate-400">Plan</span>
                <span className="font-semibold text-white">{planConfig.name}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="text-slate-400">Billing</span>
                <span className="text-slate-200">${planConfig.monthlyPrice} / month</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="text-slate-400">Account</span>
                <span className="font-mono text-slate-300 text-[11px]">
                  {sessionDetails?.customerEmail || user?.email}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Status</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Active
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-6 bg-white/5 px-3 py-2 rounded-lg w-full justify-center">
              <ShieldCheck size={14} className="text-blue-400 shrink-0" />
              <span>Entitlements cryptographically verified by server webhooks.</span>
            </div>

            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => navigateTo('/')}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white text-black font-semibold text-xs hover:bg-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
              >
                <span>Open Workspace</span>
                <ArrowRight size={13} />
              </button>
              <button
                type="button"
                onClick={() => navigateTo('/dashboard')}
                className="py-2.5 px-4 rounded-xl bg-white/10 text-white font-medium text-xs hover:bg-white/15 transition-colors cursor-pointer"
              >
                Dashboard
              </button>
            </div>
          </div>
        )}

        {/* OPEN / PENDING STATE */}
        {!loading && !error && isOpen && (
          <div className="py-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4">
              <CreditCard size={24} />
            </div>
            <h2 className="text-base font-bold text-white mb-1">Payment Incomplete</h2>
            <p className="text-xs text-slate-400 mb-6 max-w-sm">
              Your checkout session is open. If you cancelled or closed the payment window early, you can retry checkout anytime.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleRefresh}
                className="px-4 py-2 rounded-lg bg-white/10 text-white text-xs font-medium hover:bg-white/15 flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCw size={13} />
                <span>Check Again</span>
              </button>
              <button
                type="button"
                onClick={() => navigateTo(`/checkout?plan=${planId}`)}
                className="px-4 py-2 rounded-lg bg-white text-black text-xs font-semibold hover:bg-slate-200 cursor-pointer"
              >
                Retry Checkout
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
