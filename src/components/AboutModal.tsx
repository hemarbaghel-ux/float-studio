import React from 'react';
import { X, ShieldCheck, Heart, Sparkles, ExternalLink, Code2 } from 'lucide-react';
import { FloatLogo, FloatWordmark } from './FloatLogo';

export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-md bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <FloatLogo className="w-5 h-5" />
            <FloatWordmark className="h-3.5 text-slate-900 dark:text-white" />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          <div className="flex flex-col items-center text-center gap-2 pb-2">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-black flex items-center justify-center shadow-lg">
              <FloatLogo className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">FLOAT AI Studio</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white border border-slate-200 dark:border-white/15">
              v1.2.0-beta • Build 2026.09
            </span>
            <p className="text-slate-500 dark:text-[#8B949E] text-xs max-w-xs mt-1">
              AI-native developer workspace combining Monaco Editor, Pyodide Python 3.12 runtime, and multi-model agent routing.
            </p>
          </div>

          <div className="space-y-2 border-t border-slate-100 dark:border-white/5 pt-3">
            <div className="flex items-center justify-between text-slate-600 dark:text-[#C9D1D9]">
              <span>Runtime Engine</span>
              <span className="font-mono text-slate-800 dark:text-white">React 19 + TypeScript + Vite</span>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-[#C9D1D9]">
              <span>Code Editor</span>
              <span className="font-mono text-slate-800 dark:text-white">Monaco Editor 4.7.0</span>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-[#C9D1D9]">
              <span>Local Execution</span>
              <span className="font-mono text-slate-800 dark:text-white">Pyodide WebAssembly Python 3.12</span>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-[#C9D1D9]">
              <span>Cloud Persistence</span>
              <span className="font-mono text-slate-800 dark:text-white">Cloud Firestore & Firebase Auth</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5 text-[11px] text-slate-500 dark:text-[#8B949E] leading-relaxed">
            FLOAT is built with security-first defaults, zero telemetry selling, and explicit diff reviews prior to applying code modifications.
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#111111] flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <div className="flex items-center gap-3">
            <a href="/resources/docs" className="hover:text-blue-500 transition-colors">Documentation</a>
            <span>•</span>
            <a href="/pricing" className="hover:text-blue-500 transition-colors">Pricing</a>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-900 text-white dark:bg-white dark:text-black rounded-md font-medium text-xs hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
