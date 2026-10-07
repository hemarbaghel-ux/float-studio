import React, { useState, useRef, useEffect } from 'react';
import {
  Play, RotateCcw, Check, X, Eye, Sparkles,
  ArrowRight, FileCode, Split, CheckCircle2, AlertCircle,
  Terminal, ShieldCheck, ChevronRight, CornerDownLeft
} from 'lucide-react';
import { cn } from '../../lib/utils';

// Realistic API client code file
const ORIGINAL_CODE = `// src/api/users.ts - Production API Client
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'developer' | 'viewer';
}

export async function fetchUserProfile(userId: string): Promise<User> {
  const response = await fetch(\`/api/v1/users/\${userId}\`);
  const data = await response.json();
  return data;
}

export async function updateUserRole(userId: string, role: string) {
  const res = await fetch(\`/api/v1/users/\${userId}/role\`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role })
  });
  return res.json();
}`;

const PROPOSED_CODE = `// src/api/users.ts - Production API Client
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'developer' | 'viewer';
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchUserProfile(userId: string, timeoutMs = 8000): Promise<User> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(\`/api/v1/users/\${userId}\`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new ApiError(response.status, \`User request failed: \${response.statusText}\`);
    }

    return await response.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new ApiError(408, \`Request timed out after \${timeoutMs}ms\`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function updateUserRole(userId: string, role: string) {
  const res = await fetch(\`/api/v1/users/\${userId}/role\`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role })
  });
  if (!res.ok) {
    throw new ApiError(res.status, \`Role update failed: \${res.statusText}\`);
  }
  return res.json();
}`;

type DemoState = 'idle' | 'analyzing' | 'proposed' | 'diff' | 'applied' | 'rejected';

interface InteractiveCodeHeroDemoProps {
  onOpenWorkspace?: () => void;
}

export function InteractiveCodeHeroDemo({ onOpenWorkspace }: InteractiveCodeHeroDemoProps) {
  const [demoState, setDemoState] = useState<DemoState>('idle');
  const [viewMode, setViewMode] = useState<'editor' | 'diff'>('editor');
  const [diffLayout, setDiffLayout] = useState<'split' | 'unified'>('split');
  const [analyzingStep, setAnalyzingStep] = useState(0);
  const [promptInput, setPromptInput] = useState('Add resilient error handling and request timeouts to this API client');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analysisSteps = [
    'Parsing TypeScript AST and type signatures...',
    'Evaluating unhandled network exceptions in fetch calls...',
    'Synthesizing resilient error boundary with AbortController...',
    'Generating proposed changes with diff stats (+26, -4)...'
  ];

  // Clean up any timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleAsk = () => {
    setDemoState('analyzing');
    setAnalyzingStep(0);
    setViewMode('editor');

    // Deterministic simulation through 4 steps
    const stepTime = 600;
    timerRef.current = setTimeout(() => {
      setAnalyzingStep(1);
      timerRef.current = setTimeout(() => {
        setAnalyzingStep(2);
        timerRef.current = setTimeout(() => {
          setAnalyzingStep(3);
          timerRef.current = setTimeout(() => {
            setDemoState('proposed');
            setViewMode('diff');
          }, stepTime);
        }, stepTime);
      }, stepTime);
    }, stepTime);
  };

  const handleShowDiff = () => {
    setViewMode('diff');
  };

  const handleApply = () => {
    setDemoState('applied');
    setViewMode('editor');
  };

  const handleReject = () => {
    setDemoState('rejected');
    setViewMode('editor');
  };

  const handleReset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setDemoState('idle');
    setViewMode('editor');
    setAnalyzingStep(0);
  };

  const currentCode = demoState === 'applied' ? PROPOSED_CODE : ORIGINAL_CODE;

  return (
    <div className="w-full max-w-5xl mx-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#12110D] shadow-2xl overflow-hidden transition-all text-left">
      {/* Top Demo Header Bar */}
      <div className="h-11 bg-slate-100/90 dark:bg-[#1A1813] border-b border-slate-200 dark:border-white/10 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
            <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
            <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-700 dark:text-[#C9D1D9]">
            <FileCode size={13} className="text-purple-600 dark:text-purple-400" />
            <span>src/api/users.ts</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400 font-sans">
              TypeScript
            </span>
          </div>
        </div>

        {/* View / Diff Controls */}
        <div className="flex items-center gap-2">
          {(demoState === 'proposed' || demoState === 'diff') && (
            <div className="flex items-center rounded-lg bg-slate-200/80 dark:bg-white/10 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode('editor')}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer",
                  viewMode === 'editor'
                    ? "bg-white dark:bg-[#201E18] text-slate-900 dark:text-white shadow-xs font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                Code View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('diff')}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer flex items-center gap-1",
                  viewMode === 'diff'
                    ? "bg-white dark:bg-[#201E18] text-slate-900 dark:text-white shadow-xs font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <Split size={11} />
                <span>Diff View</span>
              </button>
            </div>
          )}

          {/* Reset button */}
          {demoState !== 'idle' && (
            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 flex items-center gap-1 transition-colors cursor-pointer"
              title="Reset demonstration"
              aria-label="Reset interactive code demo"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
            <Sparkles size={11} />
            <span>Interactive Demo</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[460px]">
        {/* Left Side: Code Editor / Diff Surface */}
        <div className="lg:col-span-8 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0D0C09]">

          {/* Status banner */}
          <div className="px-4 py-2 border-b border-slate-200 dark:border-white/5 flex items-center justify-between text-xs bg-white/70 dark:bg-[#14120E]">
            <div className="flex items-center gap-2">
              <span className={cn(
                "w-2 h-2 rounded-full",
                demoState === 'applied' ? "bg-emerald-500 animate-pulse" :
                demoState === 'proposed' || demoState === 'diff' ? "bg-amber-500 animate-pulse" :
                demoState === 'analyzing' ? "bg-purple-500 animate-pulse" :
                "bg-slate-400"
              )} />
              <span className="font-medium text-slate-800 dark:text-[#C9D1D9]">
                {demoState === 'idle' && 'Buffer: Original (unmodified)'}
                {demoState === 'analyzing' && 'FLOAT is analyzing src/api/users.ts...'}
                {(demoState === 'proposed' || demoState === 'diff') && 'Diff Staged: Review before applying'}
                {demoState === 'applied' && 'Changes Applied: Resilient error handling active'}
                {demoState === 'rejected' && 'Proposal Rejected: Buffer restored to original'}
              </span>
            </div>

            {(demoState === 'proposed' || demoState === 'diff') && (
              <span className="text-[11px] font-mono text-emerald-600 dark:text-[#7EE787] bg-emerald-500/10 px-2 py-0.5 rounded">
                +26 lines · -4 lines
              </span>
            )}
          </div>

          {/* Code display surface */}
          <div className="flex-1 p-4 font-mono text-xs leading-relaxed overflow-x-auto select-text">
            {viewMode === 'editor' ? (
              <div className="space-y-0.5">
                {currentCode.split('\n').map((line, idx) => (
                  <div key={idx} className="flex hover:bg-slate-200/40 dark:hover:bg-white/5 px-1 rounded transition-colors">
                    <span className="w-8 shrink-0 text-slate-400 dark:text-[#6E7681] text-right pr-4 select-none">
                      {idx + 1}
                    </span>
                    <span className={cn(
                      "flex-1 font-mono",
                      line.startsWith('//') ? "text-slate-400 dark:text-[#8B949E]" :
                      line.includes('export') || line.includes('function') || line.includes('class') ? "text-purple-600 dark:text-[#D2A8FF]" :
                      line.includes('throw') || line.includes('try') || line.includes('catch') ? "text-amber-600 dark:text-[#FFA657]" :
                      line.includes('Promise') || line.includes('AbortController') ? "text-blue-600 dark:text-[#79C0FF]" :
                      "text-slate-800 dark:text-[#C9D1D9]"
                    )}>
                      {line}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              /* High-fidelity Diff Comparison View */
              <div className="space-y-1">
                <div className="text-[11px] font-sans font-semibold text-slate-500 dark:text-slate-400 mb-2 px-1">
                  Comparing Original vs Proposed Changes:
                </div>
                {/* Visual diff lines */}
                <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden text-[11px]">
                  <div className="bg-slate-100 dark:bg-white/5 px-3 py-1 font-sans text-[10px] text-slate-500 dark:text-slate-400">
                    @@ -8,7 +8,27 @@ fetchUserProfile
                  </div>

                  {/* Removed old unhandled fetch */}
                  <div className="bg-red-500/15 dark:bg-red-950/30 text-red-700 dark:text-red-300 px-3 py-0.5 flex">
                    <span className="w-5 select-none font-bold text-red-500">-</span>
                    <span>export async function fetchUserProfile(userId: string): Promise&lt;User&gt; &#123;</span>
                  </div>
                  <div className="bg-red-500/15 dark:bg-red-950/30 text-red-700 dark:text-red-300 px-3 py-0.5 flex">
                    <span className="w-5 select-none font-bold text-red-500">-</span>
                    <span>&nbsp;&nbsp;const response = await fetch(`/api/v1/users/$&#123;userId&#125;`);</span>
                  </div>
                  <div className="bg-red-500/15 dark:bg-red-950/30 text-red-700 dark:text-red-300 px-3 py-0.5 flex">
                    <span className="w-5 select-none font-bold text-red-500">-</span>
                    <span>&nbsp;&nbsp;const data = await response.json();</span>
                  </div>
                  <div className="bg-red-500/15 dark:bg-red-950/30 text-red-700 dark:text-red-300 px-3 py-0.5 flex">
                    <span className="w-5 select-none font-bold text-red-500">-</span>
                    <span>&nbsp;&nbsp;return data;</span>
                  </div>

                  {/* Added new robust resilient logic */}
                  <div className="bg-emerald-500/15 dark:bg-emerald-950/30 text-emerald-800 dark:text-[#7EE787] px-3 py-0.5 flex">
                    <span className="w-5 select-none font-bold text-emerald-500">+</span>
                    <span>export async function fetchUserProfile(userId: string, timeoutMs = 8000): Promise&lt;User&gt; &#123;</span>
                  </div>
                  <div className="bg-emerald-500/15 dark:bg-emerald-950/30 text-emerald-800 dark:text-[#7EE787] px-3 py-0.5 flex">
                    <span className="w-5 select-none font-bold text-emerald-500">+</span>
                    <span>&nbsp;&nbsp;const controller = new AbortController();</span>
                  </div>
                  <div className="bg-emerald-500/15 dark:bg-emerald-950/30 text-emerald-800 dark:text-[#7EE787] px-3 py-0.5 flex">
                    <span className="w-5 select-none font-bold text-emerald-500">+</span>
                    <span>&nbsp;&nbsp;const timer = setTimeout(() =&gt; controller.abort(), timeoutMs);</span>
                  </div>
                  <div className="bg-emerald-500/15 dark:bg-emerald-950/30 text-emerald-800 dark:text-[#7EE787] px-3 py-0.5 flex">
                    <span className="w-5 select-none font-bold text-emerald-500">+</span>
                    <span>&nbsp;&nbsp;try &#123;</span>
                  </div>
                  <div className="bg-emerald-500/15 dark:bg-emerald-950/30 text-emerald-800 dark:text-[#7EE787] px-3 py-0.5 flex">
                    <span className="w-5 select-none font-bold text-emerald-500">+</span>
                    <span>&nbsp;&nbsp;&nbsp;&nbsp;const response = await fetch(`/api/v1/users/$&#123;userId&#125;`, &#123; signal: controller.signal &#125;);</span>
                  </div>
                  <div className="bg-emerald-500/15 dark:bg-emerald-950/30 text-emerald-800 dark:text-[#7EE787] px-3 py-0.5 flex">
                    <span className="w-5 select-none font-bold text-emerald-500">+</span>
                    <span>&nbsp;&nbsp;&nbsp;&nbsp;if (!response.ok) throw new ApiError(response.status, response.statusText);</span>
                  </div>
                  <div className="bg-emerald-500/15 dark:bg-emerald-950/30 text-emerald-800 dark:text-[#7EE787] px-3 py-0.5 flex">
                    <span className="w-5 select-none font-bold text-emerald-500">+</span>
                    <span>&nbsp;&nbsp;&nbsp;&nbsp;return await response.json();</span>
                  </div>
                  <div className="bg-emerald-500/15 dark:bg-emerald-950/30 text-emerald-800 dark:text-[#7EE787] px-3 py-0.5 flex">
                    <span className="w-5 select-none font-bold text-emerald-500">+</span>
                    <span>&nbsp;&nbsp;&#125; catch (err: any) &#123; ... &#125;</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Interactive AI Assistant / Proposal Controller */}
        <div className="lg:col-span-4 p-5 flex flex-col justify-between bg-white dark:bg-[#12110D]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#8B949E]">
                FLOAT Assistant
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 font-mono">
                Ask · Plan · Review
              </span>
            </div>

            {/* Prompt input / Instruction card */}
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1A1813] p-3 text-xs">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1 flex items-center gap-1.5">
                <Sparkles size={12} className="text-purple-600 dark:text-purple-400" />
                <span>Developer Prompt:</span>
              </div>
              <p className="text-slate-800 dark:text-[#EDEDED] font-medium leading-relaxed">
                "{promptInput}"
              </p>
            </div>

            {/* State-dependent guidance & action panels */}
            {demoState === 'idle' && (
              <div className="rounded-xl border border-slate-200/80 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 p-3 text-xs space-y-3">
                <div className="text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
                  Notice the current <code className="text-purple-600 dark:text-purple-400">src/api/users.ts</code> file lacks timeout protection and error handling.
                </div>
                <button
                  type="button"
                  onClick={handleAsk}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-black font-semibold text-xs hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <Sparkles size={14} />
                  <span>Ask FLOAT to Propose Change</span>
                </button>
              </div>
            )}

            {demoState === 'analyzing' && (
              <div className="rounded-xl border border-purple-200 dark:border-purple-500/20 bg-purple-50/50 dark:bg-purple-950/15 p-3.5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-purple-700 dark:text-purple-300">
                  <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping" />
                  <span>Autonomous Analysis in Progress</span>
                </div>
                <div className="space-y-1.5">
                  {analysisSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "text-[11px] flex items-center gap-2 transition-opacity",
                        idx <= analyzingStep ? "opacity-100 text-slate-800 dark:text-slate-200 font-medium" : "opacity-30 text-slate-400"
                      )}
                    >
                      {idx < analyzingStep ? (
                        <Check size={12} className="text-emerald-500 shrink-0" />
                      ) : idx === analyzingStep ? (
                        <span className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin shrink-0" />
                      ) : (
                        <span className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" />
                      )}
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(demoState === 'proposed' || demoState === 'diff') && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/15 p-3.5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                  <AlertCircle size={14} />
                  <span>Staged Proposal Ready for Human Review</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
                  The original source file remains <strong>100% untouched</strong>. Inspect the diff preview, then choose to apply or reject.
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleApply}
                    className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <Check size={13} />
                    <span>Apply Changes</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    className="py-2 px-3 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/20 text-slate-800 dark:text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <X size={13} />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            )}

            {demoState === 'applied' && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/15 p-3.5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 size={15} />
                  <span>Changes Applied Successfully</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
                  <code className="text-purple-600 dark:text-purple-400">src/api/users.ts</code> now contains resilient error handling, custom <code className="font-mono">ApiError</code>, and 8-second request timeouts.
                </p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-white/15 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw size={12} />
                  <span>Revert & Re-run Demo</span>
                </button>
              </div>
            )}

            {demoState === 'rejected' && (
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3.5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <ShieldCheck size={14} className="text-amber-500" />
                  <span>Proposal Discarded Safely</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
                  The buffer was restored to its original state. Zero unauthorized modifications occurred.
                </p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full py-2 px-3 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-black font-semibold text-xs hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw size={12} />
                  <span>Try Again</span>
                </button>
              </div>
            )}
          </div>

          {/* Bottom Callout / Transparency Notice */}
          <div className="pt-4 border-t border-slate-100 dark:border-white/5 text-[10px] text-slate-400 dark:text-[#7D8590] leading-relaxed flex items-center justify-between">
            <span>Deterministic isolated product demonstration.</span>
            {onOpenWorkspace && (
              <button
                type="button"
                onClick={onOpenWorkspace}
                className="text-purple-600 dark:text-purple-400 hover:underline font-medium inline-flex items-center gap-0.5 cursor-pointer"
              >
                Launch IDE <ArrowRight size={10} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
