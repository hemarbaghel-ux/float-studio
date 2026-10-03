import React from 'react';
import { ResourcesHeader } from './ResourcesHeader';
import { ResourcesFooter } from './ResourcesFooter';
import { Shield, Lock, EyeOff, Server, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { CURRENT_POLICY_VERSION } from '../../services/consentService';

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A0A] text-slate-900 dark:text-[#E6EDF3] flex flex-col font-sans transition-colors">
      <ResourcesHeader currentPath="/privacy" />

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-28">
        {/* Navigation & Header */}
        <div className="mb-10">
          <button
            onClick={() => {
              window.history.back();
            }}
            className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white mb-6 transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-3 mb-3">
            <span className="p-2 rounded-xl bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white">
              <Shield size={22} />
            </span>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-600 dark:text-[#8B949E]">
              Policy Version {CURRENT_POLICY_VERSION} • Effective September 2026
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            FLOAT Privacy Policy & Data Sharing Standards
          </h1>
          <p className="mt-3 text-base text-slate-600 dark:text-[#8B949E] leading-relaxed">
            Privacy-first design is a core engineering requirement of FLOAT. This document explains exactly how your data is handled, the clear boundary between essential service processing and optional improvement sharing, and how you retain total control over your code and telemetry.
          </p>
        </div>

        {/* Quick Summary Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <div className="p-5 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 shadow-xs">
            <div className="text-emerald-500 mb-2">
              <Lock size={20} />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Zero Model Training</h3>
            <p className="text-xs text-slate-500 dark:text-[#8B949E] leading-relaxed">
              FLOAT does not train, fine-tune, or distribute public foundation models on your private codebases or prompts.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 shadow-xs">
            <div className="text-blue-500 mb-2">
              <EyeOff size={20} />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Opt-In by Default (OFF)</h3>
            <p className="text-xs text-slate-500 dark:text-[#8B949E] leading-relaxed">
              Optional product telemetry and data sharing is set to OFF for all new users. You can change or withdraw consent anytime in Settings.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 shadow-xs">
            <div className="text-purple-500 mb-2">
              <Server size={20} />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">No Secret Harvesting</h3>
            <p className="text-xs text-slate-500 dark:text-[#8B949E] leading-relaxed">
              API keys, OAuth tokens, passwords, and detected credentials are automatically redacted and excluded from all telemetry.
            </p>
          </div>
        </div>

        {/* Detailed Sections */}
        <div className="space-y-10 text-sm leading-relaxed text-slate-700 dark:text-[#C9D1D9]">
          
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400">01</span>
              Essential Service Processing vs. Optional Data Sharing
            </h2>
            <p>
              To provide an honest developer experience, FLOAT distinguishes strictly between:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-[#A1A1AA]">
              <li>
                <strong className="text-slate-900 dark:text-white">Essential Service Processing:</strong> When you submit a prompt, execute an agent command, or format code, that request and its necessary context files are transmitted over TLS to the AI provider you selected (Google Gemini, OpenAI, Anthropic, or xAI) so the model can generate a response. This transmission is technically mandatory to fulfill your request. Disabling optional data sharing does not disable essential AI functionality.
              </li>
              <li>
                <strong className="text-slate-900 dark:text-white">Optional Product-Improvement Sharing:</strong> An optional opt-in choice that allows FLOAT to receive aggregated telemetry (such as feature usage frequency, system latencies, and non-sensitive error status codes) to diagnose bugs and improve application reliability.
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400">02</span>
              What Happens When Data Sharing is OFF (Default)
            </h2>
            <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-medium">
                <CheckCircle2 size={16} className="text-emerald-500" />
                <span>Strict Telemetry Exclusion</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-[#8B949E]">
                When Data Sharing is OFF:
              </p>
              <ul className="list-disc pl-5 text-xs text-slate-600 dark:text-[#8B949E] space-y-1">
                <li>No optional diagnostic telemetry, feature tracking, or interaction metrics are recorded.</li>
                <li>Your prompts, agent loops, and virtual workspace files are not saved to any internal improvement dataset.</li>
                <li>FLOAT operates purely as a private stateless conduit for your selected AI models.</li>
              </ul>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400">03</span>
              What Happens When Data Sharing is ON
            </h2>
            <p>
              If you explicitly toggle Data Sharing ON, FLOAT only collects the following limited categories:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-slate-600 dark:text-[#A1A1AA]">
              <li>High-level feature usage counts (e.g. editor tab switches, model selector activations).</li>
              <li>Network latency metrics and model response round-trip durations.</li>
              <li>Standard HTTP error status codes (e.g. provider rate-limits or timeouts) to help us diagnose outages.</li>
              <li>Explicit user ratings or thumbs-up/down feedback submitted directly via the interface.</li>
            </ul>
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>
                Even when Data Sharing is ON, FLOAT’s sanitization pipeline automatically scrubs and drops sensitive tokens, passwords, `.env` file keys, and raw codebase buffers.
              </span>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400">04</span>
              AI Model Providers & Sub-Processors
            </h2>
            <p>
              FLOAT connects to verified AI providers based on your workspace selections. Each provider operates under their respective developer API enterprise terms:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141414]">
                <div className="font-semibold text-slate-900 dark:text-white mb-1">Google Gemini API</div>
                <div className="text-slate-500 dark:text-[#8B949E]">Processed via Google Cloud enterprise services. Enterprise API payloads are not used to train Google models.</div>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141414]">
                <div className="font-semibold text-slate-900 dark:text-white mb-1">OpenAI API</div>
                <div className="text-slate-500 dark:text-[#8B949E]">Processed via OpenAI API endpoints. Subject to OpenAI's 30-day abuse-monitoring retention policy with zero training on API data.</div>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141414]">
                <div className="font-semibold text-slate-900 dark:text-white mb-1">Anthropic Claude API</div>
                <div className="text-slate-500 dark:text-[#8B949E]">Processed via Anthropic Commercial API terms. Customer inputs and completions are not used to train Anthropic models.</div>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141414]">
                <div className="font-semibold text-slate-900 dark:text-white mb-1">xAI Grok API</div>
                <div className="text-slate-500 dark:text-[#8B949E]">Processed via xAI developer API endpoints according to configured platform credentials.</div>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400">05</span>
              Persistence, Firestore Security & Consent Revocation
            </h2>
            <p>
              Your consent preference is securely stored in Cloud Firestore under document path <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10">/userConsents/{'{userId}'}</code>, protected by Firestore Security Rules enforcing that only your verified Firebase authentication UID can read, write, or modify your consent record.
            </p>
            <p>
              You may view, modify, or immediately withdraw your consent at any time by navigating to <strong className="text-slate-900 dark:text-white">Settings → Privacy & Data</strong>. Revocation takes effect immediately for all subsequent interactions.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400">06</span>
              Questions & Privacy Contact
            </h2>
            <p>
              If you have any questions or data access requests regarding FLOAT’s privacy controls, you can reach out through the in-app Help Center or by reviewing the open documentation.
            </p>
          </section>
        </div>
      </main>

      <ResourcesFooter />
    </div>
  );
}
