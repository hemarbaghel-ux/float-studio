import React from 'react';
import { X, Sparkles, Check, Zap, Cloud, Shield } from 'lucide-react';

interface UpgradeToStartModalProps {
  onClose: () => void;
  onProceedToCheckout: () => void;
}

const FEATURES = [
  {
    icon: Cloud,
    title: 'Cloud Agents',
    description: 'Run long-lived coding agents in isolated cloud sandboxes with full shell access.',
  },
  {
    icon: Zap,
    title: 'Higher rate limits',
    description: 'More concurrent tasks, larger context windows, and priority model routing.',
  },
  {
    icon: Shield,
    title: 'Private workspaces',
    description: 'Encrypted project snapshots, team sharing, and SSO-ready account controls.',
  },
];

export function UpgradeToStartModal({ onClose, onProceedToCheckout }: UpgradeToStartModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade to Start"
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Sparkles size={16} className="text-blue-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Upgrade to Start</h2>
              <p className="text-[11px] text-slate-500 dark:text-[#8B949E]">Unlock Cloud Agents & pro limits</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600 dark:text-[#8B949E] leading-relaxed">
            You are on the <span className="font-semibold text-slate-800 dark:text-white">Free</span> plan.
            Start unlocks hosted cloud agents, higher usage, and collaboration features so FLOAT can
            build ambitious software the way Cursor does.
          </p>

          <ul className="space-y-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0">
                  <f.icon size={14} className="text-slate-600 dark:text-[#8B949E]" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Check size={12} className="text-emerald-500" />
                    {f.title}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-[#8B949E] mt-0.5 leading-relaxed">
                    {f.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">Start plan</div>
              <div className="text-[11px] text-slate-500 dark:text-[#8B949E]">Billed monthly · cancel anytime</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-slate-900 dark:text-white">$20</div>
              <div className="text-[10px] text-slate-400">/ month</div>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-xs font-medium text-slate-600 dark:text-[#8B949E] border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onProceedToCheckout}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-black hover:opacity-90 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Sparkles size={13} />
            Continue to checkout
          </button>
        </div>
      </div>
    </div>
  );
}
