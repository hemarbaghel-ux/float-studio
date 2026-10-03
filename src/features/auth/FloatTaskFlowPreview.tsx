import React, { useState, useEffect } from 'react';
import { CheckCircle2, ShieldCheck, Sparkles, Terminal, Code2, ArrowRight } from 'lucide-react';

interface FloatTaskFlowPreviewProps {
  className?: string;
}

/**
 * Illustrative brand visual demonstrating the transition from an idea to working code.
 * Clean, restrained, and unmistakably tailored to developer workflows.
 */
export function FloatTaskFlowPreview({ className = '' }: FloatTaskFlowPreviewProps) {
  const [activeStep, setActiveStep] = useState<number>(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleMotionChange);
    return () => mediaQuery.removeEventListener('change', handleMotionChange);
  }, []);

  // Step cycle (Idea -> Plan -> Code Resolution -> Checkpoint)
  useEffect(() => {
    if (reducedMotion) {
      setActiveStep(2); // Stay on clean resolved state
      return;
    }

    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 3);
    }, 4200);

    return () => clearInterval(interval);
  }, [reducedMotion]);

  return (
    <div 
      className={`w-full max-w-[420px] rounded-2xl bg-[#141412]/85 border border-white/10 backdrop-blur-md p-5 text-left shadow-2xl relative overflow-hidden select-none transition-all ${className}`}
      aria-label="Illustrative FLOAT Workflow Preview"
    >
      {/* Ambient subtle blue illumination behind card */}
      <div 
        className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl"
        aria-hidden="true"
      />

      {/* Header Bar */}
      <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-[11px] font-mono font-medium text-slate-300 uppercase tracking-wider">
            Workspace Workflow
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
          Illustrative
        </span>
      </div>

      {/* Stage 1: Idea / Intent Node */}
      <div className="mb-3.5 p-3 rounded-xl bg-white/[0.03] border border-white/5 transition-all duration-300">
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
          <span className="font-mono text-blue-400">01. Intent</span>
          <span className="text-[10px] text-slate-500 font-mono">SPECIFICATION</span>
        </div>
        <div className="text-xs text-slate-200 font-medium leading-relaxed">
          &quot;Construct secure session checkpoint with verified user ownership&quot;
        </div>
      </div>

      {/* Connecting Flow Line */}
      <div className="relative pl-6 py-1">
        <div className="absolute left-3.5 top-0 bottom-0 w-[1.5px] bg-gradient-to-b from-blue-500/40 via-blue-400/80 to-blue-500/20" />
        <div className="flex items-center gap-2 text-[10px] font-mono text-blue-400/90 py-0.5">
          <ArrowRight size={11} className="animate-pulse" />
          <span>Synthesizing plan across repository context</span>
        </div>
      </div>

      {/* Stage 2: Resolved Code Execution Block */}
      <div className="mt-2 mb-3.5 p-3 rounded-xl bg-[#0B0B09] border border-white/10 font-mono text-[11px] leading-relaxed text-slate-300 overflow-hidden">
        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-2 border-b border-white/5 pb-1.5">
          <div className="flex items-center gap-1.5">
            <Code2 size={12} className="text-blue-400" />
            <span className="text-slate-400">authSecurity.ts</span>
          </div>
          <span className="text-emerald-400/90 flex items-center gap-1 text-[10px]">
            <CheckCircle2 size={11} /> Verified
          </span>
        </div>
        <div className="text-slate-400 space-y-0.5">
          <p><span className="text-purple-400">const</span> session = <span className="text-blue-400">await</span> float.auth.<span className="text-amber-300">verifyToken</span>(token);</p>
          <p><span className="text-purple-400">const</span> workspace = <span className="text-blue-400">await</span> float.workspace.<span className="text-amber-300">load</span>({'{'} uid: session.uid {'}'});</p>
          <p className="text-emerald-400/80 mt-1">// Boundary enforced. No unauthorized state leakage.</p>
        </div>
      </div>

      {/* Footer Status Checkpoint */}
      <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
          <ShieldCheck size={13} />
          <span>Human-approved execution</span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">
          Zero regressions
        </span>
      </div>
    </div>
  );
}
