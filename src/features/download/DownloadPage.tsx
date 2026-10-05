import { ArrowLeft, Globe, MonitorDown } from 'lucide-react';
import { FloatLogo, FloatWordmark } from '../../components/FloatLogo';

export function DownloadPage() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#000000] text-slate-900 dark:text-[#E6EDF3] flex flex-col font-sans">
      <header className="h-14 border-b border-slate-200 dark:border-white/10 px-4 sm:px-6 flex items-center justify-between bg-white dark:bg-[#080808] sticky top-0 z-30">
        <a href="/" className="flex items-center gap-2.5" aria-label="FLOAT home">
          <ArrowLeft size={15} className="text-slate-400" />
          <FloatLogo className="w-5 h-5" />
          <FloatWordmark className="h-3.5 text-slate-900 dark:text-white" />
          <span className="text-xs font-semibold text-slate-600 dark:text-[#8B949E]">/ Download</span>
        </a>
        <a href="/" className="px-3.5 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-semibold hover:opacity-90">
          Open FLOAT
        </a>
      </header>

      <section className="flex-1 max-w-3xl w-full mx-auto px-5 py-16 sm:py-24">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 grid place-items-center shadow-sm">
            <Globe size={24} />
          </div>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-[#8B949E]">Browser app</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">Use FLOAT on the web</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 dark:text-[#8B949E]">
            FLOAT is currently available as a browser based coding workspace. Sign in to open your projects, chat with coding agents, review proposed edits, and use the supported in-browser terminal tools.
          </p>
          <a href="/" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-black hover:opacity-90">
            <Globe size={15} /> Open the web app
          </a>
        </div>

        <div className="mt-14 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0A0A] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <MonitorDown size={18} className="mt-0.5 shrink-0 text-slate-500" />
            <div>
              <h2 className="text-sm font-semibold">Desktop installers</h2>
              <p className="mt-1.5 text-xs leading-5 text-slate-600 dark:text-[#8B949E]">
                macOS, Windows, and Linux installers are not available in this release. This page will list real downloads and verified checksums when signed desktop builds are published.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
