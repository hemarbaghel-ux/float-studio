import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Terminal,
  FileCode,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Loader2,
  Wrench,
  Layers,
  Cpu
} from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ComposerEventTimelineProps {
  events: any[];
  isStreaming?: boolean;
}

export function ComposerEventTimeline({ events, isStreaming }: ComposerEventTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!events || events.length === 0) return null;

  // Filter out noisy raw deltas and duplicate empty events
  const displayEvents = events.filter(e => {
    if (!e || typeof e !== 'object') return false;
    if (e.type === 'delta') return false;
    if (e.type === 'thinking' && !e.content?.trim()) return false;
    return true;
  });

  if (displayEvents.length === 0) return null;

  const toolCallsCount = displayEvents.filter(e => e.type === 'tool_call').length;
  const testsRunCount = displayEvents.filter(e => e.type === 'test_result').length;
  const selfRepairsCount = displayEvents.filter(e => e.type === 'repair_proposal').length;
  const isFinished = displayEvents.some(e => e.type === 'completed' || e.type === 'done');

  return (
    <div className="w-full max-w-[96%] my-2 rounded-xl border border-slate-200/90 dark:border-white/10 bg-slate-50/80 dark:bg-[#141414] overflow-hidden text-xs font-sans shadow-xs transition-all">
      {/* Header bar */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between bg-slate-100/60 dark:bg-[#1a1a1a]/60 hover:bg-slate-100 dark:hover:bg-[#1e1e1e] transition-colors cursor-pointer select-none text-left"
      >
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <Loader2 size={13} className="text-blue-500 animate-spin shrink-0" />
          ) : (
            <Cpu size={13} className="text-purple-500 shrink-0" />
          )}
          <span className="font-semibold text-slate-700 dark:text-slate-200 text-[11px]">
            {isStreaming ? 'Composer Agent Running' : 'Composer Execution Steps'}
          </span>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
            {toolCallsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded bg-slate-200/70 dark:bg-white/10">
                {toolCallsCount} {toolCallsCount === 1 ? 'tool' : 'tools'}
              </span>
            )}
            {testsRunCount > 0 && (
              <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                {testsRunCount} {testsRunCount === 1 ? 'test' : 'tests'}
              </span>
            )}
            {selfRepairsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                {selfRepairsCount} repair
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-[10px]">
          <span>{displayEvents.length} events</span>
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
      </button>

      {/* Expanded Step List */}
      {isExpanded && (
        <div className="p-2.5 space-y-1.5 border-t border-slate-200/60 dark:border-white/5 max-h-56 overflow-y-auto">
          {displayEvents.map((evt, idx) => {
            const key = `evt-${idx}-${evt.type}`;
            switch (evt.type) {
              case 'started':
                return (
                  <div key={key} className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-400 font-mono">
                    <Sparkles size={11} className="text-purple-400 shrink-0" />
                    <span>Initialized session (mode: {evt.mode || 'agent'})</span>
                  </div>
                );

              case 'context_retrieval':
                return (
                  <div key={key} className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-400 font-mono">
                    <Layers size={11} className="text-blue-400 shrink-0" />
                    <span>Retrieved workspace context ({evt.filesCount || evt.count || 0} files)</span>
                  </div>
                );

              case 'iteration_start':
                return (
                  <div key={key} className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-semibold pt-1 border-t border-slate-200/40 dark:border-white/5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                    <span>Turn {evt.iteration || idx + 1}{evt.maxIterations ? ` / ${evt.maxIterations}` : ''}</span>
                  </div>
                );

              case 'tool_call': {
                const toolName = evt.toolName || evt.tool || 'unknown';
                const args = evt.parameters || evt.args || {};
                let summary = toolName;
                if (toolName === 'read_file' && args.path) summary = `read_file "${args.path}"`;
                else if (toolName === 'list_dir' && args.path) summary = `list_dir "${args.path}"`;
                else if (toolName === 'search_codebase' && args.query) summary = `search_codebase "${args.query}"`;
                else if (toolName === 'run_command' && args.command) summary = `$ ${args.command}`;
                else if (toolName === 'propose_changes') summary = `propose_changes (${(args.changes || []).length} files)`;

                return (
                  <div key={key} className="flex items-center justify-between text-[10px] font-mono bg-white dark:bg-[#1a1a1a] px-2 py-1 rounded border border-slate-200/50 dark:border-white/5">
                    <div className="flex items-center gap-1.5 truncate max-w-[80%]">
                      <Wrench size={11} className="text-amber-500 shrink-0" />
                      <span className="text-slate-800 dark:text-slate-200 truncate">{summary}</span>
                    </div>
                    <span className="text-[9px] text-slate-400 shrink-0">invoked</span>
                  </div>
                );
              }

              case 'tool_result': {
                const isSuccess = evt.result?.success !== false && !evt.error;
                return (
                  <div key={key} className="flex items-center justify-between text-[10px] font-mono pl-4 text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5 truncate max-w-[85%]">
                      {isSuccess ? (
                        <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
                      ) : (
                        <AlertTriangle size={10} className="text-rose-500 shrink-0" />
                      )}
                      <span className="truncate">
                        {evt.toolName || 'tool'}: {evt.error || 'ok'}
                      </span>
                    </div>
                    {typeof evt.durationMs === 'number' && (
                      <span className="text-[9px] text-slate-400 shrink-0">{evt.durationMs}ms</span>
                    )}
                  </div>
                );
              }

              case 'command_started':
                return (
                  <div key={key} className="flex items-center gap-1.5 text-[10px] font-mono text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20 px-2 py-0.5 rounded border border-blue-200/50 dark:border-blue-900/30">
                    <Terminal size={10} className="shrink-0" />
                    <span className="truncate">$ {evt.command}</span>
                  </div>
                );

              case 'test_result': {
                const passed = evt.passed ?? (evt.exitCode === 0);
                return (
                  <div
                    key={key}
                    className={cn(
                      "flex items-center justify-between text-[10px] font-mono px-2 py-1 rounded border",
                      passed
                        ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/30"
                        : "bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/30"
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {passed ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                      <span className="font-semibold">{passed ? 'Tests Passed' : 'Tests Failed'}</span>
                      {typeof evt.exitCode === 'number' && (
                        <span className="opacity-75">(exit {evt.exitCode})</span>
                      )}
                    </div>
                    {evt.output && (
                      <span className="text-[9px] truncate max-w-[150px] opacity-80">{evt.output.slice(0, 50)}</span>
                    )}
                  </div>
                );
              }

              case 'repair_proposal':
                return (
                  <div key={key} className="flex items-center gap-1.5 text-[10px] font-mono text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-2 py-1 rounded border border-amber-200 dark:border-amber-900/30">
                    <RotateCcw size={11} className="shrink-0 animate-spin" />
                    <span>Self-repairing regression: formulating fix proposal...</span>
                  </div>
                );

              case 'patch_applied':
                return (
                  <div key={key} className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                    <FileCode size={11} className="shrink-0" />
                    <span>Applied patch to {(evt.appliedFiles || []).join(', ') || 'workspace files'}</span>
                  </div>
                );

              case 'proposal_created':
                return (
                  <div key={key} className="flex items-center gap-1.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/20 px-2 py-1 rounded border border-purple-200 dark:border-purple-900/30">
                    <Sparkles size={11} className="shrink-0" />
                    <span>Multi-file proposal ready for human review</span>
                  </div>
                );

              case 'completed':
                return (
                  <div key={key} className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 pt-1">
                    <CheckCircle2 size={11} className="shrink-0" />
                    <span>Agent task completed successfully</span>
                  </div>
                );

              default:
                return null;
            }
          })}
        </div>
      )}
    </div>
  );
}
