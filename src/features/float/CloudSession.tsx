import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Cloud, X } from 'lucide-react';
import { formatDuration, useCloudSession } from './cloudSessionStore';

function useTick(ms: number, enabled: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
  return now;
}

/** Banner shown on top of the composer. Opens the session dialog or shows the live session. */
export function CloudSessionBanner() {
  const { active, startedAt, openModal, stop } = useCloudSession();
  const now = useTick(1000, active);

  if (!active) {
    return (
      <button
        type="button"
        onClick={openModal}
        className="w-full py-2.5 px-4 bg-white/70 dark:bg-[#141414] border border-b-0 border-slate-200 dark:border-white/10 rounded-t-2xl text-xs text-slate-600 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <span>Enable the isolated terminal sandbox</span>
        <ArrowRight size={13} />
      </button>
    );
  }

  return (
    <div className="w-full py-2 px-4 bg-emerald-50 dark:bg-emerald-500/10 border border-b-0 border-emerald-200 dark:border-emerald-500/20 rounded-t-2xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-center gap-2">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <Check size={13} />
      <span>
        Local sandbox active · {formatDuration(now - (startedAt ?? now))}
      </span>
      <button type="button" onClick={stop} className="ml-1 font-semibold hover:underline cursor-pointer">
        End
      </button>
    </div>
  );
}

export function CloudSessionModal() {
  const { modalOpen, closeModal, start } = useCloudSession();

  if (!modalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-[2px] p-4 pt-[10vh]" onMouseDown={closeModal}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Enable terminal sandbox"
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Enable terminal sandbox</h2>
          <button onClick={closeModal} aria-label="Close" className="p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
            <X size={15} />
          </button>
        </div>
        <div className="p-5">
          <div className="mb-5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-white">
              <Cloud size={14} /> Isolated browser worker
            </div>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-[#8B949E]">
              Supported shell commands run against your workspace files in this browser. Python runs in Pyodide. This does not start a remote VM; packages, external network access, and full operating-system commands are unavailable.
            </p>
          </div>
          <button
            onClick={() => start('Local browser', 'Isolated worker')}
            className="w-full py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Check size={14} /> Enable sandbox
          </button>
        </div>
      </div>
    </div>
  );
}
