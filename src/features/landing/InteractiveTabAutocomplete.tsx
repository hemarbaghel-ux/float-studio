import React, { useState, useEffect } from 'react';
import { Sparkles, Check, RotateCcw, ArrowRight, CornerDownLeft, Zap, Play } from 'lucide-react';
import { cn } from '../../lib/utils';

interface TabScenario {
  id: string;
  name: string;
  filename: string;
  prefix: string[];
  ghostLines: string[];
  suffix: string[];
  explanation: string;
}

const TAB_SCENARIOS: TabScenario[] = [
  {
    id: 'hook',
    name: 'Stateful React Hook',
    filename: 'useProjectIndex.ts',
    prefix: [
      '// Custom hook with optimistic caching and AbortSignal',
      'export function useProjectIndex(projectId: string) {',
      '  const [status, setStatus] = useState<IndexStatus>("idle");'
    ],
    ghostLines: [
      '  const query = useQuery({',
      '    queryKey: ["project-index", projectId],',
      '    queryFn: ({ signal }) => fetchIndexSummary(projectId, signal),',
      '    staleTime: 1000 * 60 * 5,',
      '  });',
      '  return { ...query, isIndexing: status === "indexing" };'
    ],
    suffix: ['}'],
    explanation: 'FLOAT predicts both the query definition and the computed return signature based on surrounding project hooks.'
  },
  {
    id: 'middleware',
    name: 'Stream Validator',
    filename: 'streamPipeline.ts',
    prefix: [
      'export async function* transformEventStream(reader: ReadableStreamDefaultReader) {',
      '  const decoder = new TextDecoder();'
    ],
    ghostLines: [
      '  while (true) {',
      '    const { done, value } = await reader.read();',
      '    if (done) break;',
      '    const chunk = decoder.decode(value, { stream: true });',
      '    yield parseServerSentEvents(chunk);',
      '  }'
    ],
    suffix: ['}'],
    explanation: 'Multi-line stream consumer generated instantaneously with proper asynchronous iteration and buffer flushing.'
  },
  {
    id: 'prediction',
    name: 'Cursor Jump Prediction',
    filename: 'paymentRoute.ts',
    prefix: [
      'export async function handleCheckoutSession(sessionId: string) {',
      '  const session = await stripe.checkout.sessions.retrieve(sessionId);',
      '  if (session.payment_status === "paid") {'
    ],
    ghostLines: [
      '    await database.subscriptions.markActive({',
      '      customerId: session.customer as string,',
      '      planId: session.metadata?.planId,',
      '    });',
      '    // -> Cursor automatically predicts jump to audit logger below'
    ],
    suffix: [
      '  }',
      '  return session;',
      '}'
    ],
    explanation: 'FLOAT not only predicts code; it predicts where your cursor will edit next across control flow branches.'
  }
];

export function InteractiveTabAutocomplete() {
  const [activeScenarioIndex, setActiveScenarioIndex] = useState(0);
  const [isAccepted, setIsAccepted] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);

  const scenario = TAB_SCENARIOS[activeScenarioIndex];

  // Reset acceptance when scenario changes
  useEffect(() => {
    setIsAccepted(false);
  }, [activeScenarioIndex]);

  const handleAccept = () => {
    setIsAccepted(true);
  };

  const handleReset = () => {
    setIsAccepted(false);
  };

  return (
    <div className="w-full rounded-2xl border border-white/[0.08] bg-[#0E0F14]/90 backdrop-blur-xl shadow-2xl overflow-hidden text-left">
      {/* Top Header */}
      <div className="h-11 bg-[#13141B] border-b border-white/[0.06] px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
            <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
            <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
          </div>
          <span className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
            <span className="text-violet-400">⚡</span>
            <span>{scenario.filename}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Scenario selector tabs */}
          <div className="hidden sm:flex items-center rounded-lg bg-white/[0.04] p-0.5 text-xs">
            {TAB_SCENARIOS.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setActiveScenarioIndex(idx)}
                className={cn(
                  "px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer",
                  idx === activeScenarioIndex
                    ? "bg-white text-black font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                {s.name}
              </button>
            ))}
          </div>

          {isAccepted ? (
            <button
              onClick={handleReset}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.06] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          ) : (
            <button
              onClick={handleAccept}
              className="px-3 py-1 rounded-lg bg-white text-black font-semibold text-xs hover:bg-neutral-200 flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <span>Press Tab</span>
              <kbd className="px-1 py-0.2 bg-black/10 rounded font-mono text-[10px]">⇥</kbd>
            </button>
          )}
        </div>
      </div>

      {/* Editor Body */}
      <div className="p-5 font-mono text-xs leading-relaxed bg-[#0B0C10] overflow-x-auto select-text min-h-[260px]">
        {/* Prefix lines */}
        {scenario.prefix.map((line, idx) => (
          <div key={`prefix-${idx}`} className="flex hover:bg-white/[0.02] px-1 rounded">
            <span className="w-8 shrink-0 text-zinc-600 text-right pr-4 select-none tabular-nums">
              {idx + 1}
            </span>
            <span className={cn(
              "flex-1",
              line.startsWith('//') ? "text-zinc-500" :
              line.includes('export') || line.includes('function') ? "text-violet-400" :
              line.includes('useState') ? "text-blue-400" :
              "text-zinc-200"
            )}>
              {line}
            </span>
          </div>
        ))}

        {/* Ghost / Accepted Lines */}
        {scenario.ghostLines.map((line, idx) => {
          const lineNumber = scenario.prefix.length + idx + 1;
          return (
            <div
              key={`ghost-${idx}`}
              className={cn(
                "flex px-1 rounded transition-all duration-300",
                isAccepted
                  ? "bg-emerald-500/[0.08] text-emerald-300 font-medium"
                  : "bg-violet-500/[0.05] text-zinc-400/80 italic border-l border-violet-400/50"
              )}
            >
              <span className="w-8 shrink-0 text-zinc-600 text-right pr-4 select-none tabular-nums not-italic">
                {lineNumber}
              </span>
              <span className="flex-1 flex items-center justify-between">
                <span>{line}</span>
                {!isAccepted && idx === 0 && (
                  <span className="text-[10px] text-violet-400 font-sans not-italic px-2 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 hidden md:inline">
                    Tab ⇥ to complete
                  </span>
                )}
              </span>
            </div>
          );
        })}

        {/* Suffix lines */}
        {scenario.suffix.map((line, idx) => {
          const lineNumber = scenario.prefix.length + scenario.ghostLines.length + idx + 1;
          return (
            <div key={`suffix-${idx}`} className="flex hover:bg-white/[0.02] px-1 rounded">
              <span className="w-8 shrink-0 text-zinc-600 text-right pr-4 select-none tabular-nums">
                {lineNumber}
              </span>
              <span className="text-zinc-300">{line}</span>
            </div>
          );
        })}
      </div>

      {/* Footer explanation bar */}
      <div className="px-4 py-3 bg-[#101117] border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between text-xs text-zinc-400 gap-2">
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-violet-400 shrink-0" />
          <span className="text-[11px] leading-snug">{scenario.explanation}</span>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-[11px] font-mono">
          <span className="text-zinc-500">Latency: <span className="text-emerald-400">24ms</span></span>
          <span className="text-zinc-500">Cache: <span className="text-zinc-300">Monaco Copilot</span></span>
        </div>
      </div>
    </div>
  );
}
