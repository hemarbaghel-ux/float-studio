import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Cloud, Cpu, Loader2, X } from 'lucide-react';
import { formatDuration, useCloudSession } from './cloudSessionStore';

const REGIONS = [
  { id: 'ap-south-1', label: 'Mumbai', code: 'IN' },
  { id: 'ap-southeast-1', label: 'Singapore', code: 'SG' },
  { id: 'eu-west-1', label: 'Ireland', code: 'EU' },
  { id: 'us-east-1', label: 'Virginia', code: 'US' },
];

const MACHINES = [
  { id: '2 vCPU · 4 GB', label: 'Standard' },
  { id: '4 vCPU · 8 GB', label: 'Performance' },
  { id: '8 vCPU · 16 GB', label: 'Turbo' },
];

const BOOT_STEPS = ['Provisioning sandbox', 'Mounting workspace', 'Starting runtime', 'Ready'];

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
  const { active, startedAt, region, machine, openModal, stop } = useCloudSession();
  const now = useTick(1000, active);

  if (!active) {
    return (
      <button
        type="button"
        onClick={openModal}
        className="w-full py-2.5 px-4 bg-white/70 dark:bg-[#141414] border border-b-0 border-slate-200 dark:border-white/10 rounded-t-2xl text-xs text-slate-600 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <span>Cloud Agents require an active session</span>
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
      <Cloud size={13} />
      <span>
        Cloud session active · {region} · {machine} · {formatDuration(now - (startedAt ?? now))}
      </span>
      <button type="button" onClick={stop} className="ml-1 font-semibold hover:underline cursor-pointer">
        End
      </button>
    </div>
  );
}

export function CloudSessionModal() {
  const { modalOpen, closeModal, start } = useCloudSession();
  const [region, setRegion] = useState('ap-south-1');
  const [machine, setMachine] = useState(MACHINES[0].id);
  const [step, setStep] = useState(-1);

  useEffect(() => {
    if (!modalOpen) setStep(-1);
  }, [modalOpen]);

  if (!modalOpen) return null;

  const boot = async () => {
    for (let i = 0; i < BOOT_STEPS.length; i++) {
      setStep(i);
      await new Promise((r) => setTimeout(r, 450 + Math.random() * 300));
    }
    start(region, machine);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-[2px] p-4 pt-[10vh]" onMouseDown={closeModal}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Start a cloud session"
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Start a cloud session</h2>
          <button onClick={closeModal} aria-label="Close" className="p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
            <X size={15} />
          </button>
        </div>
        <div className="p-5">
          <p className="mb-4 text-xs text-slate-500 dark:text-[#8B949E]">
            Cloud Agents run shell commands, Node scripts and tests (<code className="font-mono">npm test</code>) in an isolated sandbox with your workspace mounted.
            Python keeps running in Pyodide.
          </p>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#6E7681]">Region</div>
          <div className="mb-4 grid grid-cols-2 gap-1.5">
            {REGIONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setRegion(r.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs cursor-pointer ${
                  region === r.id
                    ? 'border-slate-900 dark:border-white bg-slate-50 dark:bg-white/5'
                    : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                <span className="rounded bg-slate-100 dark:bg-white/10 px-1 font-mono text-[10px] text-slate-500 dark:text-[#8B949E]">{r.code}</span>
                <span>
                  <span className="block font-medium text-slate-900 dark:text-white">{r.label}</span>
                  <span className="block font-mono text-[10px] text-slate-400 dark:text-[#6E7681]">{r.id}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#6E7681]">Machine</div>
          <div className="mb-5 flex flex-col gap-1.5">
            {MACHINES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMachine(m.id)}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs cursor-pointer ${
                  machine === m.id
                    ? 'border-slate-900 dark:border-white bg-slate-50 dark:bg-white/5'
                    : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                <Cpu size={14} className="text-slate-400" />
                <span className="flex-1 font-medium text-slate-900 dark:text-white">{m.label}</span>
                <span className="font-mono text-[11px] text-slate-400 dark:text-[#6E7681]">{m.id}</span>
              </button>
            ))}
          </div>
          {step >= 0 ? (
            <div className="space-y-1.5 rounded-xl border border-slate-200 dark:border-white/10 p-3">
              {BOOT_STEPS.map((s, i) => (
                <div key={s} className={`flex items-center gap-2 text-xs ${i > step ? 'text-slate-400 dark:text-[#6E7681]' : 'text-slate-800 dark:text-white'}`}>
                  {i < step ? <Check size={13} className="text-emerald-500" /> : i === step ? <Loader2 size={13} className="animate-spin" /> : <span className="w-[13px]" />}
                  {s}
                </div>
              ))}
            </div>
          ) : (
            <button
              onClick={() => void boot()}
              className="w-full py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Cloud size={14} /> Start session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
