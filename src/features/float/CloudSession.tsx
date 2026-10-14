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
  const { active, startedAt, openModal, stop, sessionId, connect } = useCloudSession();
  const now = useTick(1000, active);

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => connect()}
        className="w-full py-2.5 px-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-b-0 border-emerald-300 dark:border-emerald-500/30 rounded-t-2xl text-xs text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/40 transition-colors flex items-center justify-between gap-1.5 cursor-pointer shadow-2xs"
      >
        <div className="flex items-center gap-2">
          <Cloud size={13} className="text-emerald-500" />
          <span>Attach session: <strong className="font-mono">sess_0e52...</strong> (GPT-6 Astra + Workspace)</span>
        </div>
        <span className="font-semibold text-[11px] underline">Connect Now</span>
      </button>
    );
  }

  const shortSession = sessionId ? `${sessionId.slice(0, 15)}...` : 'sess_0e5225d2ebb...';

  return (
    <div className="w-full py-2 px-4 bg-emerald-50 dark:bg-emerald-500/10 border border-b-0 border-emerald-200 dark:border-emerald-500/20 rounded-t-2xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2 shadow-2xs">
      <div className="flex items-center gap-2 truncate">
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <Check size={13} className="flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="truncate">
          Session <span className="font-mono">{shortSession}</span> · <span className="font-semibold text-emerald-600 dark:text-emerald-400">Connected</span> ({formatDuration(now - (startedAt ?? now))})
        </span>
        <span className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300/40">
          GPT-6 Astra + Workspace · Fallback ready
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button type="button" onClick={openModal} className="hover:underline text-[11px] opacity-80 cursor-pointer">
          Details
        </button>
        <button type="button" onClick={stop} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-[11px] cursor-pointer">
          Disconnect
        </button>
      </div>
    </div>
  );
}

export function CloudSessionModal() {
  const { modalOpen, closeModal, start, active, sessionId, environmentId, stop } = useCloudSession();

  if (!modalOpen) return null;

  const currentSessionId = sessionId || 'sess_0e5225d2ebb12ca1006acc98ff0200819cb89256c878d26a01';
  const currentEnvId = environmentId || 'ccarenv_b64_Y2NhcmVudl82YWNlNjRiMjljOTg4MTkxYjVhM2E4NmY4MmNiZTVkOQ';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-[2px] p-4 pt-[10vh]" onMouseDown={closeModal}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cloud execution session details"
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Cloud size={16} className="text-purple-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Cloud Session & Execution Sandbox</h2>
          </div>
          <button onClick={closeModal} aria-label="Close" className="p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
            <X size={15} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <Check size={14} /> Active Attached Session
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                CONNECTED
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">Session ID</span>
                <code className="text-slate-800 dark:text-slate-200 font-mono text-[11px] break-all bg-black/10 dark:bg-black/30 px-2 py-1 rounded block">
                  {currentSessionId}
                </code>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">Environment ID</span>
                <code className="text-slate-800 dark:text-slate-200 font-mono text-[11px] break-all bg-black/10 dark:bg-black/30 px-2 py-1 rounded block">
                  {currentEnvId}
                </code>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">Remote Connect Server</span>
                <code className="text-purple-700 dark:text-purple-300 font-mono text-[11px] break-all bg-black/10 dark:bg-black/30 px-2 py-1 rounded block">
                  https://api.openai.com/v1/agents/api/connect/rt_7k2m
                </code>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">Execution Server Command</span>
                <code className="text-emerald-800 dark:text-emerald-300 font-mono text-[10px] break-all bg-black/10 dark:bg-black/30 p-2 rounded block">
                  {`CODEX_API_KEY="$OPENAI_ENVIRONMENT_KEY" codex exec-server --remote 'https://api.openai.com/v1/agents/api/connect/rt_7k2m' --environment-id '${currentEnvId}'`}
                </code>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-4 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-white">Attached Targets</span>
              <span className="text-slate-500 text-[11px]">2 Active Subsystems</span>
            </div>
            <ul className="space-y-1.5 text-slate-600 dark:text-[#8B949E]">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                <span><strong className="text-slate-800 dark:text-slate-200">GPT-6 Astra (Preview):</strong> Attached with session & remote headers</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span><strong className="text-slate-800 dark:text-slate-200">Workspace Session:</strong> Attached for cloud/sandbox execution</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                <span><strong className="text-slate-800 dark:text-slate-200">Upstream Fallback:</strong> Automatic failover to GPT-4o if remote agent is unreachable</span>
              </li>
            </ul>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => {
                start('cloud-agent', 'astra-ccarenv', currentSessionId, currentEnvId);
                closeModal();
              }}
              className="flex-1 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check size={14} /> Re-sync Session
            </button>
            {active && (
              <button
                onClick={() => {
                  stop();
                  closeModal();
                }}
                className="py-2 px-4 rounded-lg border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
