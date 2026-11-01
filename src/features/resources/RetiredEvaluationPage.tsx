import React from 'react';
import { ArrowLeft, BarChart3 } from 'lucide-react';

export function RetiredEvaluationPage() {
  const returnToModels = () => {
    window.history.pushState({}, '', '/models');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#0A0A08] text-slate-900 dark:text-white flex items-center justify-center px-6">
      <section className="max-w-lg text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 dark:bg-white/10">
          <BarChart3 size={22} aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Evaluations are unavailable</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-[#A1A1AA]">
          FLOAT’s evaluation workflows have been retired. Existing evaluation records are not changed.
        </p>
        <button
          type="button"
          onClick={returnToModels}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Browse models
        </button>
      </section>
    </main>
  );
}
