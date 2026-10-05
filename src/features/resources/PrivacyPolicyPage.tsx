import React from 'react';
import { ResourcesHeader } from './ResourcesHeader';
import { ResourcesFooter } from './ResourcesFooter';
import { AlertTriangle, ArrowLeft, Database, KeyRound, Server } from 'lucide-react';

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A0A] text-slate-900 dark:text-[#E6EDF3] flex flex-col font-sans transition-colors">
      <ResourcesHeader currentPath="/privacy" />
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-28">
        <button onClick={() => window.history.back()} className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white mb-8">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex items-center gap-3 mb-4 text-amber-700 dark:text-amber-300">
          <AlertTriangle size={20} />
          <span className="text-xs font-semibold uppercase tracking-wide">Privacy notice draft</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Privacy and data handling</h1>
        <p className="mt-4 text-base text-slate-600 dark:text-[#8B949E] leading-relaxed">
          This page summarizes how the current FLOAT application handles data. It is not a complete legal privacy policy. Before public launch, the service owner must add the legal entity and contact details, operating jurisdictions, retention periods, and complete subprocessors and review this notice for the actual deployment.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-slate-700 dark:text-[#C9D1D9]">
          <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white mb-3"><Database size={18} /> Data stored by FLOAT</h2>
            <p>FLOAT uses Firebase Authentication for account sign-in. Project and workspace features may store account-associated records in Cloud Firestore. Project snapshots and some conversation and preference data are also stored in browser storage on the device, separated by signed-in account. Clearing browser storage removes those local copies.</p>
          </section>

          <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white mb-3"><Server size={18} /> AI requests and providers</h2>
            <p>When you submit a request to an AI feature, FLOAT sends the prompt and any context needed for that request through the configured server and AI provider. The provider and processing terms depend on the deployment configuration. Do not submit secrets or personal data unless you have reviewed the terms and settings for your deployment.</p>
          </section>

          <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white mb-3"><KeyRound size={18} /> Credentials and integrations</h2>
            <p>Provider credentials and integration tokens are used to make requests to the services you connect. The production deployment must configure encryption keys, access controls, backups, and credential rotation. This page does not certify those controls or any security standard.</p>
          </section>

          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Details required before publishing</h2>
            <p>The service owner still needs to specify the data controller, a privacy contact, retention and deletion schedules, hosting and subprocessors, user rights and request process, and the jurisdictions in which the service operates. The production Firebase and AI provider configurations must be reviewed against the final notice.</p>
          </section>
        </div>
      </main>
      <ResourcesFooter />
    </div>
  );
}
