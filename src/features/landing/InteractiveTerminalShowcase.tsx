import React, { useState, useEffect, useRef } from 'react';
import {
  Play, Pause, RotateCcw, FastForward, Copy, Check,
  Terminal as TerminalIcon, ExternalLink, ShieldAlert, Sparkles, CheckCircle2
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface TerminalLine {
  text: string;
  type: 'prompt' | 'info' | 'success' | 'detail' | 'header';
  delayMs: number;
}

const DEMO_SEQUENCE: TerminalLine[] = [
  { text: '$ float validate --strict', type: 'prompt', delayMs: 400 },
  { text: 'FLOAT CLI v1.0.4 — Local Project Orchestrator', type: 'header', delayMs: 500 },
  { text: '⚡ Inspecting local workspace directory: ./src', type: 'info', delayMs: 600 },
  { text: '📁 Indexed 42 source files across 8 active feature modules', type: 'detail', delayMs: 600 },
  { text: '📋 Evaluating .float/rules/ and .cursorrules... (2 active rules loaded)', type: 'detail', delayMs: 600 },
  { text: '🔍 Building dependency import graph and symbol table...', type: 'info', delayMs: 700 },
  { text: '🧪 Executing strict TypeScript typecheck and test runners...', type: 'info', delayMs: 800 },
  { text: '✓ PASS: 45 test suites passed cleanly (0 failures, 186 assertions)', type: 'success', delayMs: 700 },
  { text: '🛡️ Running security guardrails and path boundary checks...', type: 'info', delayMs: 600 },
  { text: '✓ PASS: Zero path traversal escapes or protected config mutations', type: 'success', delayMs: 600 },
  { text: '🔎 Reviewing staged changes on branch: feat/api-resilience', type: 'detail', delayMs: 600 },
  { text: '✨ Verification complete: Zero blocking diagnostics found. Workspace healthy.', type: 'success', delayMs: 500 }
];

interface InteractiveTerminalShowcaseProps {
  onOpenWorkspace?: () => void;
}

export function InteractiveTerminalShowcase({ onOpenWorkspace }: InteractiveTerminalShowcaseProps) {
  const [displayedLineCount, setDisplayedLineCount] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    if (displayedLineCount < DEMO_SEQUENCE.length) {
      const nextLine = DEMO_SEQUENCE[displayedLineCount];
      timerRef.current = setTimeout(() => {
        setDisplayedLineCount(prev => prev + 1);
      }, nextLine.delayMs);
    } else {
      // Loop or stop after finish
      setIsPlaying(false);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, displayedLineCount]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayedLineCount]);

  const handlePlayPause = () => {
    if (displayedLineCount >= DEMO_SEQUENCE.length) {
      // Restart from beginning if reached end
      setDisplayedLineCount(1);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handleRestart = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setDisplayedLineCount(1);
    setIsPlaying(true);
  };

  const handleSkip = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setDisplayedLineCount(DEMO_SEQUENCE.length);
    setIsPlaying(false);
  };

  const handleCopyCommand = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText('float validate --strict');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-[#0F0E0C] text-slate-100 shadow-2xl overflow-hidden text-left font-mono">
      {/* Terminal Header */}
      <div className="h-11 bg-[#171613] border-b border-white/10 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
            <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
            <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
          </div>
          <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
            <TerminalIcon size={13} className="text-[#A1A1AA]" />
            <span className="font-semibold text-white">float-cli</span>
            <span className="text-[10px] text-slate-400">bash — 80x24</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePlayPause}
            className="p-1.5 rounded-md hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title={isPlaying ? "Pause playback" : "Resume playback"}
            aria-label={isPlaying ? "Pause terminal playback" : "Resume terminal playback"}
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          </button>

          <button
            type="button"
            onClick={handleRestart}
            className="p-1.5 rounded-md hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Restart demonstration from beginning"
            aria-label="Restart terminal demo"
          >
            <RotateCcw size={13} />
          </button>

          <button
            type="button"
            onClick={handleSkip}
            className="p-1.5 rounded-md hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Fast forward to completed output"
            aria-label="Fast forward terminal demo"
          >
            <FastForward size={13} />
          </button>

          <div className="h-3.5 w-px bg-white/20 mx-1" />

          <button
            type="button"
            onClick={handleCopyCommand}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Copy command to clipboard"
          >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="p-5 text-xs leading-relaxed min-h-[300px] max-h-[420px] overflow-y-auto space-y-1.5 bg-[#0C0B0A]">
        {DEMO_SEQUENCE.slice(0, displayedLineCount).map((line, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <span className={cn(
              "leading-relaxed",
              line.type === 'prompt' ? "text-purple-400 font-bold" :
              line.type === 'header' ? "text-slate-400 font-semibold" :
              line.type === 'success' ? "text-emerald-400 font-medium" :
              line.type === 'info' ? "text-cyan-300" :
              "text-slate-300"
            )}>
              {line.text}
            </span>
          </div>
        ))}

        {isPlaying && (
          <div className="inline-block w-2 h-4 bg-purple-500 translate-y-0.5 animate-pulse ml-1" />
        )}
        <div ref={terminalEndRef} />
      </div>

      {/* Terminal Footer with Action and Disclaimers */}
      <div className="px-5 py-3 bg-[#141310] border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] font-sans">
        <div className="text-slate-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          <span>Interactive demonstration. Deterministic workflow simulator (0 local shell access).</span>
        </div>

        {onOpenWorkspace && (
          <button
            type="button"
            onClick={onOpenWorkspace}
            className="px-3 py-1.5 rounded-lg bg-white text-black hover:bg-slate-200 transition-colors font-medium text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <span>Open Web Workspace</span>
            <ExternalLink size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
