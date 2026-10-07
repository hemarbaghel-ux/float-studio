import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Sparkles, Shield, Zap, Building2, HelpCircle, AlertCircle, Loader2 } from 'lucide-react';
import { FloatLogo, FloatWordmark } from '../../components/FloatLogo';
import { useAuthStore } from '../../store/authStore';
import { apiFetch } from '../../services/api';

export function PricingPage() {
  const { user } = useAuthStore();
  const [config, setConfig] = useState<any>(null);
  const [currentSub, setCurrentSub] = useState<any>(null);
  const [loadingCheckout, setLoadingCheckout] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Fetch pricing configuration & plan definitions
    apiFetch('/api/subscription/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(() => {});

    // If authenticated, fetch current subscription tier
    if (user) {
      apiFetch('/api/subscription/status')
        .then(res => res.json())
        .then(data => setCurrentSub(data.subscription))
        .catch(() => {});
    }
  }, [user]);

  const handleSelectPlan = async (planId: string) => {
    if (planId === 'free') {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }

    if (!user) {
      window.history.pushState({}, '', '/sign-in');
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }

    if (!config?.isConfigured) {
      setErrorMsg('Stripe checkout is not configured on this server environment. Self-hosting and preview deployments use Free tier by default.');
      return;
    }

    try {
      setLoadingCheckout(planId);
      setErrorMsg(null);
      const res = await apiFetch('/api/subscription/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        setErrorMsg(data.error);
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to initiate checkout.');
    } finally {
      setLoadingCheckout(null);
    }
  };

  const plans = [
    {
      id: 'free',
      name: 'Hobby',
      price: '$0',
      period: 'forever',
      description: 'The foundation for exploring AI coding and daily development.',
      badge: null,
      highlight: false,
      features: [
        'FLOAT Basic & Gemini 3.1 Flash Lite access',
        'Monaco editor & multi-language syntax',
        'Tab autocomplete & ghost-text completions',
        'Ctrl+K / Cmd+K inline AI coding assistant',
        'Codebase symbol indexing & @ context picker',
        'Single-file diff reviews and validation'
      ]
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$20',
      period: 'per month',
      description: 'For engineers who rely on AI agents to plan, code, and review every day.',
      badge: 'Most Popular',
      highlight: true,
      features: [
        '500 Fast Frontier Model queries (Claude 3.5 Sonnet, GPT-4o, Gemini 2.5 Pro)',
        'Unlimited everyday Flash model assistance',
        'Multi-file Composer & Agent Mode',
        'Structured Plan Mode with approval gates',
        'Subagent parallel task orchestration',
        'Automatic codebase-wide index & semantic retrieval',
        'Sandboxed terminal sessions & test execution',
        'Priority server queue & zero data retention'
      ]
    },
    {
      id: 'business',
      name: 'Business',
      price: '$40',
      period: 'per user / month',
      description: 'For engineering teams building production software with shared rules and control.',
      badge: 'For Teams',
      highlight: false,
      features: [
        'Everything in Pro included',
        '1,200 Fast Frontier queries per seat/month',
        'Centralized team billing & seat administration',
        'Shared team rules (.float/rules/ & .cursorrules)',
        'Repository pull request review automations',
        'Model usage analytics & governance controls',
        'SOC2 compliance mode & enterprise security'
      ]
    }
  ];

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#0A0A08] text-slate-900 dark:text-[#E6EDF3] flex flex-col font-sans transition-colors">
      {/* Navigation Bar */}
      <header className="h-16 border-b border-slate-200 dark:border-white/10 px-6 flex items-center justify-between bg-white/80 dark:bg-[#0A0A08]/80 backdrop-blur-md sticky top-0 z-30">
        <a href="/" className="flex items-center gap-2.5" aria-label="FLOAT Home">
          <ArrowLeft size={16} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors" />
          <FloatLogo className="w-6 h-6" />
          <FloatWordmark className="h-4 text-slate-900 dark:text-white" />
          <span className="text-xs font-semibold text-slate-500 dark:text-[#8B949E]">/ Pricing</span>
        </a>
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="px-4 py-2 bg-slate-900 text-white dark:bg-white dark:text-black rounded-full text-xs font-semibold hover:opacity-90 transition-opacity shadow-xs"
          >
            Open FLOAT
          </a>
        </div>
      </header>

      {/* Main Hero & Pricing Matrix */}
      <section className="flex-1 max-w-6xl w-full mx-auto px-6 py-16 sm:py-20">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-medium mb-4">
            <Sparkles size={13} />
            <span>Transparent, developer-first pricing</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
            Build faster with AI coding superpowers
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-[#8B949E] leading-relaxed">
            Choose the plan that fits your coding workflow. Upgrade, downgrade, or cancel anytime.
          </p>

          {errorMsg && (
            <div className="mt-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-center gap-2 text-left">
              <AlertCircle size={16} className="shrink-0 text-amber-500" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Plan Cards */}
        <div className="grid md:grid-cols-3 gap-8 items-stretch mb-20">
          {plans.map((p) => {
            const isCurrent = currentSub?.planId === p.id;
            return (
              <div
                key={p.id}
                className={`relative flex flex-col rounded-2xl border p-8 transition-all ${
                  p.highlight
                    ? 'border-purple-500 bg-white dark:bg-[#12100C] shadow-xl shadow-purple-500/5 ring-1 ring-purple-500'
                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#121210] shadow-sm'
                }`}
              >
                {p.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 bg-purple-600 text-white rounded-full text-[11px] font-semibold tracking-wide uppercase shadow-sm">
                    {p.badge}
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{p.name}</h3>
                  <p className="mt-2 text-xs text-slate-500 dark:text-[#8B949E] min-h-[32px]">
                    {p.description}
                  </p>
                </div>

                <div className="mb-8 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-slate-900 dark:text-white">{p.price}</span>
                  <span className="text-xs font-medium text-slate-500 dark:text-[#8B949E]">/{p.period}</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectPlan(p.id)}
                  disabled={loadingCheckout !== null}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm ${
                    isCurrent
                      ? 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-white cursor-default'
                      : p.highlight
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200'
                  }`}
                >
                  {loadingCheckout === p.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isCurrent ? (
                    'Current Plan'
                  ) : p.id === 'free' ? (
                    'Get Started Free'
                  ) : (
                    `Upgrade to ${p.name}`
                  )}
                </button>

                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/5 flex-1 flex flex-col justify-between">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white mb-3">
                    Includes:
                  </div>
                  <ul className="space-y-2.5 text-xs text-slate-600 dark:text-[#C9D1D9]">
                    {p.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <Check size={14} className="text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {/* Feature Comparison Highlights */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121210] p-8 sm:p-10 mb-20 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 text-center">
            Security &amp; Privacy Guaranteed
          </h2>
          <div className="grid md:grid-cols-3 gap-6 text-sm">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <Shield size={20} />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white mb-1">Zero Data Retention</h4>
                <p className="text-xs text-slate-500 dark:text-[#8B949E] leading-relaxed">
                  Your code is never used to train third-party AI models. Requests are routed through ephemeral, isolated inference lanes.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <Zap size={20} />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white mb-1">Local Indexing &amp; Rules</h4>
                <p className="text-xs text-slate-500 dark:text-[#8B949E] leading-relaxed">
                  Repository rules (.float/rules/ and .cursorrules) are evaluated securely with automatic sensitive file and token exclusion.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <Building2 size={20} />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white mb-1">Bring Your Own Key (BYOK)</h4>
                <p className="text-xs text-slate-500 dark:text-[#8B949E] leading-relaxed">
                  Connect your own Google Gemini, OpenAI, Anthropic, or xAI keys in settings to pay providers directly at raw API rates.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 text-center">
            Frequently Asked Questions
          </h3>
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121210]">
              <div className="font-semibold text-slate-900 dark:text-white mb-1">
                Can I use my existing Cursor setup with FLOAT?
              </div>
              <p className="text-slate-500 dark:text-[#8B949E] leading-relaxed">
                Yes. FLOAT automatically discovers and honors `.cursorrules` files in your repositories alongside `.float/rules/`. Keybindings for Command Palette (Ctrl+Shift+P / Cmd+Shift+P) and Inline Assistant (Ctrl+K / Cmd+K) work out of the box.
              </p>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121210]">
              <div className="font-semibold text-slate-900 dark:text-white mb-1">
                What happens when I exhaust my Fast Frontier queries?
              </div>
              <p className="text-slate-500 dark:text-[#8B949E] leading-relaxed">
                You never lose access to coding. You continue to receive unlimited everyday queries powered by fast models like Gemini 3.1 Flash Lite and FLOAT Basic.
              </p>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121210]">
              <div className="font-semibold text-slate-900 dark:text-white mb-1">
                How do I switch AI models?
              </div>
              <p className="text-slate-500 dark:text-[#8B949E] leading-relaxed">
                Use the model picker in the AI Composer or Command Palette to switch seamlessly between Claude 3.5 Sonnet, GPT-4o, Gemini 2.5 Pro, and Grok.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
