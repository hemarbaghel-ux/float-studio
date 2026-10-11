import React from 'react';
import { X, BarChart3, MessageSquare, Cpu, Sparkles } from 'lucide-react';

interface UsageAnalyticsModalProps {
  onClose: () => void;
  onUpgradeClick?: () => void;
}

const STATS = [
  { label: 'Prompts this period', value: '12', icon: MessageSquare, hint: 'of 50 free' },
  { label: 'Tokens used', value: '48.2k', icon: Cpu, hint: 'approx.' },
  { label: 'Agent tasks', value: '3', icon: Sparkles, hint: 'completed' },
];

export function UsageAnalyticsModal({ onClose, onUpgradeClick }: UsageAnalyticsModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Usage analytics"
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center">
              <BarChart3 size={16} className="text-slate-600 dark:text-[#8B949E]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Usage Analytics</h2>
              <p className="text-[11px] text-slate-500 dark:text-[#8B949E]">Free plan · current period</p>
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
          <div className="grid grid-cols-3 gap-2">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-3 text-center"
              >
                <s.icon size={14} className="mx-auto text-slate-400 mb-1.5" />
                <div className="text-base font-bold text-slate-900 dark:text-white">{s.value}</div>
                <div className="text-[10px] text-slate-500 dark:text-[#8B949E] mt-0.5 leading-tight">{s.label}</div>
                <div className="text-[9px] text-slate-400 mt-0.5">{s.hint}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="text-slate-600 dark:text-[#8B949E]">Prompt quota</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">12 / 50</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
              <div className="h-full w-[24%] rounded-full bg-blue-500" />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-[#8B949E] leading-relaxed">
            Detailed charts live on the full Usage page. Upgrade to Start for higher limits and Cloud Agents.
          </p>
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-xs font-medium text-slate-600 dark:text-[#8B949E] border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
          >
            Close
          </button>
          {onUpgradeClick && (
            <button
              type="button"
              onClick={onUpgradeClick}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-black hover:opacity-90 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Sparkles size={13} />
              Upgrade to Start
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
