import React, { useState, useRef, useEffect } from 'react';
import {
  Play, RotateCcw, Check, X, Eye, Sparkles,
  ArrowRight, FileCode, Split, CheckCircle2, AlertCircle,
  Terminal, ShieldCheck, ChevronRight, CornerDownLeft,
  Layers, CheckCheck, FileText, Cpu, Command
} from 'lucide-react';
import { cn } from '../../lib/utils';

// Multi-file realistic codebase files for Composer Demo
interface DemoFile {
  id: string;
  filename: string;
  path: string;
  language: string;
  additions: number;
  deletions: number;
  originalCode: string;
  proposedCode: string;
  diffSummary: string;
}

const DEMO_FILES: DemoFile[] = [
  {
    id: 'users-api',
    filename: 'users.ts',
    path: 'src/api/users.ts',
    language: 'TypeScript',
    additions: 26,
    deletions: 4,
    diffSummary: 'Added AbortController request timeout and ApiError handling',
    originalCode: `// src/api/users.ts - Production API Client
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
}`,
    proposedCode: `// src/api/users.ts - Production API Client
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
}`
  },
  {
    id: 'auth-middleware',
    filename: 'auth.ts',
    path: 'src/middleware/auth.ts',
    language: 'TypeScript',
    additions: 14,
    deletions: 2,
    diffSummary: 'Integrated rate-limit header checks and bearer validation',
    originalCode: `// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }
  next();
}`,
    proposedCode: `// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { verifyBearerToken } from '../lib/jwt';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Valid Bearer token required' });
  }

  try {
    const token = authHeader.slice(7);
    const decoded = verifyBearerToken(token);
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired session token' });
  }
}`
  },
  {
    id: 'user-types',
    filename: 'types.ts',
    path: 'src/types/user.ts',
    language: 'TypeScript',
    additions: 9,
    deletions: 0,
    diffSummary: 'Added ApiErrorPayload and RequestAuditContext types',
    originalCode: `// src/types/user.ts
export interface UserSession {
  userId: string;
  email: string;
  issuedAt: number;
}`,
    proposedCode: `// src/types/user.ts
export interface UserSession {
  userId: string;
  email: string;
  issuedAt: number;
}

export interface ApiErrorPayload {
  statusCode: number;
  message: string;
  timestamp: string;
  path: string;
}

export interface RequestAuditContext {
  traceId: string;
  initiatorId: string;
  ipAddress?: string;
}`
  }
];

type DemoState = 'idle' | 'analyzing' | 'proposed' | 'diff' | 'applied' | 'rejected';

interface InteractiveCodeHeroDemoProps {
  onOpenWorkspace?: () => void;
}

export function InteractiveCodeHeroDemo({ onOpenWorkspace }: InteractiveCodeHeroDemoProps) {
  const [activeFileId, setActiveFileId] = useState<string>('users-api');
  const [demoState, setDemoState] = useState<DemoState>('idle');
  const [viewMode, setViewMode] = useState<'editor' | 'diff'>('editor');
  const [analyzingStep, setAnalyzingStep] = useState(0);
  const [selectedModel, setSelectedModel] = useState<'claude' | 'gpt4o' | 'gemini'>('claude');
  const [promptInput, setPromptInput] = useState('Add resilient error handling and request timeouts across our user API and middleware');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeFile = DEMO_FILES.find(f => f.id === activeFileId) || DEMO_FILES[0];

  const analysisSteps = [
    'Parsing AST across 3 related files in repo...',
    'Injecting AbortController timeout into src/api/users.ts...',
    'Validating Bearer token integrity in src/middleware/auth.ts...',
    'Synthesizing TypeScript type signatures in src/types/user.ts...'
  ];

  // Clean up timers
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleAsk = () => {
    setDemoState('analyzing');
    setAnalyzingStep(0);
    setViewMode('editor');

    const stepTime = 550;
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

  const handleApplyAll = () => {
    setDemoState('applied');
    setViewMode('editor');
  };

  const handleRejectAll = () => {
    setDemoState('rejected');
    setViewMode('editor');
  };

  const handleReset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setDemoState('idle');
    setViewMode('editor');
    setAnalyzingStep(0);
  };

  const currentCode = demoState === 'applied' ? activeFile.proposedCode : activeFile.originalCode;

  const totalAdditions = DEMO_FILES.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = DEMO_FILES.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <div className="w-full max-w-5xl mx-auto rounded-xl border border-white/[0.08] bg-[#0E0F14]/90 backdrop-blur-xl shadow-2xl overflow-hidden transition-all text-left">
      {/* Top Demo Header Bar - Cursor Composer Style */}
      <div className="h-11 bg-[#13141B] border-b border-white/[0.06] px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <div className="w-3 h-3 rounded-full bg-[#FF5F56]/80" />
            <div className="w-3 h-3 rounded-full bg-[#FFBD2E]/80" />
            <div className="w-3 h-3 rounded-full bg-[#27C93F]/80" />
          </div>

          <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />

          {/* Composer Mode Indicator */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
              <Layers size={13} className="text-violet-400" />
              <span>Composer</span>
            </span>
            <span className="text-[11px] font-mono text-zinc-400 px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.05]">
              {DEMO_FILES.length} files staged
            </span>
          </div>
        </div>

        {/* View & Diff Controls */}
        <div className="flex items-center gap-2">
          {(demoState === 'proposed' || demoState === 'diff') && (
            <div className="flex items-center rounded-lg bg-white/[0.06] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('editor')}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
                  viewMode === 'editor'
                    ? "bg-white text-black font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                Code View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('diff')}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1",
                  viewMode === 'diff'
                    ? "bg-white text-black font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <Split size={11} />
                <span>Diff View</span>
              </button>
            </div>
          )}

          {demoState !== 'idle' && (
            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.06] flex items-center gap-1 transition-colors cursor-pointer"
              title="Reset demonstration"
              aria-label="Reset interactive code demo"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-violet-500/10 text-violet-300 border border-violet-500/20">
            <Sparkles size={11} />
            <span>Interactive Multi-File</span>
          </div>
        </div>
      </div>

      {/* File Tabs Bar - Switch between modified files */}
      <div className="flex items-center border-b border-white/[0.06] bg-[#0A0B0F] px-2 overflow-x-auto">
        {DEMO_FILES.map((file) => {
          const isActive = file.id === activeFileId;
          return (
            <button
              key={file.id}
              onClick={() => setActiveFileId(file.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-xs font-mono border-b-2 transition-all cursor-pointer whitespace-nowrap",
                isActive
                  ? "border-violet-500 text-white bg-white/[0.04]"
                  : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]"
              )}
            >
              <FileCode size={13} className={isActive ? "text-violet-400" : "text-zinc-500"} />
              <span>{file.filename}</span>
              {(demoState === 'proposed' || demoState === 'diff') && (
                <span className="text-[10px] text-emerald-400 font-mono">
                  +{file.additions} -{file.deletions}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Interactive Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[480px]">
        {/* Left Side: Code Editor / Multi-file Diff Surface */}
        <div className="lg:col-span-8 flex flex-col border-b lg:border-b-0 lg:border-r border-white/[0.06] bg-[#0B0C10]">
          {/* Status banner */}
          <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between text-xs bg-[#101117]">
            <div className="flex items-center gap-2">
              <span className={cn(
                "w-2 h-2 rounded-full",
                demoState === 'applied' ? "bg-emerald-400" :
                demoState === 'proposed' || demoState === 'diff' ? "bg-amber-400" :
                demoState === 'analyzing' ? "bg-violet-400 animate-pulse" :
                "bg-zinc-500"
              )} />
              <span className="font-mono text-zinc-300 text-[11px]">
                {demoState === 'idle' && `${activeFile.path} · buffer unmodified`}
                {demoState === 'analyzing' && `Composer analyzing multi-file dependencies...`}
                {(demoState === 'proposed' || demoState === 'diff') && `${activeFile.path} · diff staged`}
                {demoState === 'applied' && `Changes applied across all ${DEMO_FILES.length} files`}
                {demoState === 'rejected' && `Proposal reverted · buffer restored`}
              </span>
            </div>

            {(demoState === 'proposed' || demoState === 'diff') && (
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Total: +{totalAdditions} · -{totalDeletions}
              </span>
            )}
          </div>

          {/* Code display surface */}
          <div className="flex-1 p-4 font-mono text-xs leading-relaxed overflow-x-auto select-text">
            {viewMode === 'editor' ? (
              <div className="space-y-0.5">
                {currentCode.split('\n').map((line, idx) => (
                  <div key={idx} className="flex hover:bg-white/[0.03] px-1 rounded transition-colors">
                    <span className="w-8 shrink-0 text-zinc-600 text-right pr-4 select-none tabular-nums">
                      {idx + 1}
                    </span>
                    <span className={cn(
                      "flex-1 font-mono",
                      line.startsWith('//') ? "text-zinc-500" :
                      line.includes('export') || line.includes('function') || line.includes('class') || line.includes('import') ? "text-violet-400" :
                      line.includes('throw') || line.includes('try') || line.includes('catch') ? "text-amber-400" :
                      line.includes('Promise') || line.includes('AbortController') || line.includes('verifyBearerToken') ? "text-blue-400" :
                      "text-zinc-200"
                    )}>
                      {line}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              /* High-fidelity Diff Comparison View */
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 px-1">
                  <span>{activeFile.path}</span>
                  <span className="text-zinc-500">{activeFile.diffSummary}</span>
                </div>

                <div className="rounded-lg border border-white/[0.06] overflow-hidden text-[11px] bg-[#08090D]">
                  <div className="bg-white/[0.03] px-3 py-1 font-mono text-[10px] text-zinc-500 border-b border-white/[0.05]">
                    @@ Staged diff for {activeFile.filename} @@
                  </div>

                  {activeFile.id === 'users-api' ? (
                    <>
                      {/* Removed old unhandled fetch */}
                      <div className="bg-red-500/10 text-red-300 px-3 py-0.5 flex border-l-2 border-red-500">
                        <span className="w-5 select-none font-bold text-red-500">-</span>
                        <span>export async function fetchUserProfile(userId: string): Promise&lt;User&gt; &#123;</span>
                      </div>
                      <div className="bg-red-500/10 text-red-300 px-3 py-0.5 flex border-l-2 border-red-500">
                        <span className="w-5 select-none font-bold text-red-500">-</span>
                        <span>&nbsp;&nbsp;const response = await fetch(`/api/v1/users/$&#123;userId&#125;`);</span>
                      </div>
                      <div className="bg-red-500/10 text-red-300 px-3 py-0.5 flex border-l-2 border-red-500">
                        <span className="w-5 select-none font-bold text-red-500">-</span>
                        <span>&nbsp;&nbsp;const data = await response.json();</span>
                      </div>
                      <div className="bg-red-500/10 text-red-300 px-3 py-0.5 flex border-l-2 border-red-500">
                        <span className="w-5 select-none font-bold text-red-500">-</span>
                        <span>&nbsp;&nbsp;return data;</span>
                      </div>

                      {/* Added new robust resilient logic */}
                      <div className="bg-emerald-500/10 text-emerald-300 px-3 py-0.5 flex border-l-2 border-emerald-500">
                        <span className="w-5 select-none font-bold text-emerald-400">+</span>
                        <span>export async function fetchUserProfile(userId: string, timeoutMs = 8000): Promise&lt;User&gt; &#123;</span>
                      </div>
                      <div className="bg-emerald-500/10 text-emerald-300 px-3 py-0.5 flex border-l-2 border-emerald-500">
                        <span className="w-5 select-none font-bold text-emerald-400">+</span>
                        <span>&nbsp;&nbsp;const controller = new AbortController();</span>
                      </div>
                      <div className="bg-emerald-500/10 text-emerald-300 px-3 py-0.5 flex border-l-2 border-emerald-500">
                        <span className="w-5 select-none font-bold text-emerald-400">+</span>
                        <span>&nbsp;&nbsp;const timer = setTimeout(() =&gt; controller.abort(), timeoutMs);</span>
                      </div>
                      <div className="bg-emerald-500/10 text-emerald-300 px-3 py-0.5 flex border-l-2 border-emerald-500">
                        <span className="w-5 select-none font-bold text-emerald-400">+</span>
                        <span>&nbsp;&nbsp;try &#123;</span>
                      </div>
                      <div className="bg-emerald-500/10 text-emerald-300 px-3 py-0.5 flex border-l-2 border-emerald-500">
                        <span className="w-5 select-none font-bold text-emerald-400">+</span>
                        <span>&nbsp;&nbsp;&nbsp;&nbsp;const response = await fetch(`/api/v1/users/$&#123;userId&#125;`, &#123; signal: controller.signal &#125;);</span>
                      </div>
                      <div className="bg-emerald-500/10 text-emerald-300 px-3 py-0.5 flex border-l-2 border-emerald-500">
                        <span className="w-5 select-none font-bold text-emerald-400">+</span>
                        <span>&nbsp;&nbsp;&nbsp;&nbsp;if (!response.ok) throw new ApiError(response.status, response.statusText);</span>
                      </div>
                      <div className="bg-emerald-500/10 text-emerald-300 px-3 py-0.5 flex border-l-2 border-emerald-500">
                        <span className="w-5 select-none font-bold text-emerald-400">+</span>
                        <span>&nbsp;&nbsp;&nbsp;&nbsp;return await response.json();</span>
                      </div>
                    </>
                  ) : activeFile.id === 'auth-middleware' ? (
                    <>
                      <div className="bg-red-500/10 text-red-300 px-3 py-0.5 flex border-l-2 border-red-500">
                        <span className="w-5 select-none font-bold text-red-500">-</span>
                        <span>&nbsp;&nbsp;const token = req.headers.authorization?.split(' ')[1];</span>
                      </div>
                      <div className="bg-emerald-500/10 text-emerald-300 px-3 py-0.5 flex border-l-2 border-emerald-500">
                        <span className="w-5 select-none font-bold text-emerald-400">+</span>
                        <span>&nbsp;&nbsp;const authHeader = req.headers.authorization;</span>
                      </div>
                      <div className="bg-emerald-500/10 text-emerald-300 px-3 py-0.5 flex border-l-2 border-emerald-500">
                        <span className="w-5 select-none font-bold text-emerald-400">+</span>
                        <span>&nbsp;&nbsp;if (!authHeader?.startsWith('Bearer ')) &#123; return res.status(401)... &#125;</span>
                      </div>
                      <div className="bg-emerald-500/10 text-emerald-300 px-3 py-0.5 flex border-l-2 border-emerald-500">
                        <span className="w-5 select-none font-bold text-emerald-400">+</span>
                        <span>&nbsp;&nbsp;const decoded = verifyBearerToken(authHeader.slice(7));</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bg-emerald-500/10 text-emerald-300 px-3 py-0.5 flex border-l-2 border-emerald-500">
                        <span className="w-5 select-none font-bold text-emerald-400">+</span>
                        <span>export interface ApiErrorPayload &#123; statusCode: number; message: string; &#125;</span>
                      </div>
                      <div className="bg-emerald-500/10 text-emerald-300 px-3 py-0.5 flex border-l-2 border-emerald-500">
                        <span className="w-5 select-none font-bold text-emerald-400">+</span>
                        <span>export interface RequestAuditContext &#123; traceId: string; initiatorId: string; &#125;</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Cursor Composer Command Palette & Multi-file Inspector */}
        <div className="lg:col-span-4 p-5 flex flex-col justify-between bg-[#0E0F14]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                <Command size={13} className="text-violet-400" />
                <span>Composer Session</span>
              </div>

              {/* Model Selector pill */}
              <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.06] rounded px-2 py-0.5 text-[11px] text-zinc-300 font-mono">
                <Cpu size={11} className="text-violet-400" />
                <span>Claude 3.7</span>
              </div>
            </div>

            {/* Context Mentions Bar */}
            <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
              <span className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
                @src/api/
              </span>
              <span className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
                @src/middleware/
              </span>
              <span className="px-2 py-0.5 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                @Git:main
              </span>
            </div>

            {/* Prompt input card */}
            <div className="rounded-xl border border-white/[0.08] bg-[#14151D] p-3 text-xs">
              <div className="text-[11px] text-zinc-400 font-medium mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-violet-300">
                  <Sparkles size={12} />
                  <span>Instruction</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-500">Cmd + I</span>
              </div>
              <p className="text-zinc-200 font-medium leading-relaxed">
                "{promptInput}"
              </p>
            </div>

            {/* State-dependent guidance & action panels */}
            {demoState === 'idle' && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs space-y-3">
                <div className="text-zinc-400 text-[11px] leading-relaxed">
                  Composer coordinates edits across <strong className="text-zinc-200">3 separate files</strong> simultaneously with full diff review.
                </div>
                <button
                  type="button"
                  onClick={handleAsk}
                  className="w-full py-2.5 px-4 rounded-lg bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <Sparkles size={14} />
                  <span>Generate Multi-File Diff</span>
                </button>
              </div>
            )}

            {demoState === 'analyzing' && (
              <div className="rounded-xl border border-violet-500/20 bg-violet-950/20 p-3.5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-violet-300">
                  <span className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />
                  <span>Synthesizing Multi-File Edits</span>
                </div>
                <div className="space-y-1.5">
                  {analysisSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "text-[11px] flex items-center gap-2 transition-opacity",
                        idx <= analyzingStep ? "opacity-100 text-zinc-200 font-medium" : "opacity-30 text-zinc-500"
                      )}
                    >
                      {idx < analyzingStep ? (
                        <Check size={12} className="text-emerald-400 shrink-0" />
                      ) : idx === analyzingStep ? (
                        <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin shrink-0" />
                      ) : (
                        <span className="w-3 h-3 rounded-full border border-zinc-600 shrink-0" />
                      )}
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(demoState === 'proposed' || demoState === 'diff') && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-950/15 p-3.5 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    <span>3 Files Modified</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">Uncommitted</span>
                </div>

                <div className="space-y-1 text-[11px] font-mono text-zinc-300 border-t border-white/[0.06] pt-2">
                  {DEMO_FILES.map((f) => (
                    <div
                      key={f.id}
                      onClick={() => { setActiveFileId(f.id); setViewMode('diff'); }}
                      className={cn(
                        "flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors",
                        f.id === activeFileId ? "bg-white/[0.08] text-white" : "hover:bg-white/[0.03] text-zinc-400"
                      )}
                    >
                      <span className="truncate">{f.filename}</span>
                      <span className="text-emerald-400 shrink-0">+{f.additions} -{f.deletions}</span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={handleApplyAll}
                    className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    <CheckCheck size={13} />
                    <span>Accept All (⌘↵)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRejectAll}
                    className="py-2 px-3 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-zinc-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <X size={13} />
                    <span>Reject All (Esc)</span>
                  </button>
                </div>
              </div>
            )}

            {demoState === 'applied' && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 size={14} />
                  <span>All Changes Accepted</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  All 3 files updated cleanly in working tree. 0 diagnostics, clean build.
                </p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full py-2 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 font-medium text-xs transition-colors cursor-pointer"
                >
                  Test Another Refactor
                </button>
              </div>
            )}

            {demoState === 'rejected' && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                  <RotateCcw size={14} />
                  <span>Proposal Reverted</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Working tree restored to pristine state. Zero modifications applied.
                </p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full py-2 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 font-medium text-xs transition-colors cursor-pointer"
                >
                  Reset Demo
                </button>
              </div>
            )}
          </div>

          {/* Bottom CTA to launch workspace */}
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-400">
            <span>Human-in-the-loop control</span>
            {onOpenWorkspace && (
              <button
                type="button"
                onClick={onOpenWorkspace}
                className="text-violet-400 hover:text-violet-300 font-medium flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>Try in Workspace</span>
                <ArrowRight size={11} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
