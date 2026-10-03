import React from 'react';
import { FeatureDetail } from './types';
import { Terminal, Shield, CheckCircle2, Bot, Layers, Search, Code, ArrowRight, CornerDownLeft, GitBranch, RefreshCw, FileText, Lock } from 'lucide-react';

interface MockupProps {
  feature: FeatureDetail;
}

export function FeatureMockup({ feature }: MockupProps) {
  switch (feature.mockupType) {
    case 'plan':
      return (
        <div className="w-full bg-[#12100C] border border-white/10 rounded-xl overflow-hidden shadow-2xl text-left font-sans text-xs">
          <div className="h-8 bg-[#1A1814] border-b border-white/5 flex items-center px-4 justify-between text-[#8B949E]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
              <span className="ml-2 font-mono text-[11px] text-white">Plan Mission Control</span>
            </div>
            <span className="bg-[#FF5F56]/20 text-[#FF5F56] px-2 py-0.5 rounded text-[10px] font-semibold">PLANNING</span>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <div className="p-3 bg-[#1E1C18] border border-white/10 rounded-lg text-slate-300">
              <span className="text-[#8B949E] uppercase text-[10px] font-bold block mb-1">PROMPT</span>
              "Implement role-based authorization across workspace routes with admin/member/viewer permissions"
            </div>
            <div className="p-4 bg-[#161410] border border-white/5 rounded-lg flex flex-col gap-2.5">
              <div className="text-[11px] text-[#A1A1AA] uppercase tracking-wider font-bold">FLOAT Clarification Questions</div>
              <div className="text-white font-medium text-sm">How should the Viewer role interact with the Monaco editor?</div>
              <div className="flex flex-col gap-1.5 mt-1">
                <div className="flex items-center gap-2 text-slate-400 p-1.5 rounded hover:bg-white/5"><span className="w-4 h-4 rounded bg-white/10 flex items-center justify-center text-[10px] text-white">1</span> Full edit access with disabled save</div>
                <div className="flex items-center gap-2 text-white bg-[#FF5F56]/15 border border-[#FF5F56]/40 p-1.5 rounded"><span className="w-4 h-4 rounded bg-[#FF5F56] flex items-center justify-center text-[10px] text-white font-bold">2</span> Read-only editor with lock icon and disabled actions (Selected)</div>
                <div className="flex items-center gap-2 text-slate-400 p-1.5 rounded hover:bg-white/5"><span className="w-4 h-4 rounded bg-white/10 flex items-center justify-center text-[10px] text-white">3</span> Blur editor content until upgrade</div>
              </div>
            </div>
            <div className="border border-emerald-500/20 bg-emerald-950/20 p-3 rounded-lg flex items-center justify-between text-emerald-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>3-Phase Execution Plan Prepared (4 files targeted)</span>
              </div>
              <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded text-[11px]">Ready to Run</span>
            </div>
          </div>
        </div>
      );

    case 'design':
      return (
        <div className="w-full bg-[#161410] border border-white/10 rounded-xl overflow-hidden shadow-2xl text-left font-sans text-xs">
          <div className="h-8 bg-[#1A1814] border-b border-white/5 flex items-center px-4 justify-between text-[#8B949E]">
            <div className="flex items-center gap-2 font-mono text-[11px] text-white">
              <span className="text-blue-400">❖</span> Preview: http://localhost:3000
            </div>
            <span className="text-emerald-400 font-mono text-[10px]">HMR 24ms</span>
          </div>
          <div className="p-6 flex flex-col gap-4 font-serif text-slate-300">
            <h3 className="text-xl text-white italic">Acme Labs UI Preview</h3>
            <p className="font-sans text-slate-400 leading-relaxed text-xs">
              Software creation is changing. Inspect visual DOM elements directly in preview to rewrite styles and layout properties.
            </p>
            <div className="p-3 bg-[#1E1C18] border border-blue-500/40 rounded-lg font-sans relative">
              <div className="absolute -top-2.5 left-3 bg-blue-500 text-white text-[9px] font-mono px-1.5 py-0.2 rounded font-bold">
                JoinTeamLink &lt;a&gt; (Selected)
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-white font-medium">Join our engineering team →</span>
                <span className="text-blue-400 font-mono text-[10px]">w-auto px-4 py-2</span>
              </div>
            </div>
            <div className="p-2.5 bg-black/40 border border-white/10 rounded font-sans flex items-center justify-between text-slate-300">
              <span className="text-[11px]">Directive: "Transform link into dark-mode high-contrast button with focus-ring"</span>
              <span className="text-[#FF5F56] font-bold">Applied ✓</span>
            </div>
          </div>
        </div>
      );

    case 'debug':
      return (
        <div className="w-full bg-[#12100C] border border-white/10 rounded-xl overflow-hidden shadow-2xl text-left font-mono text-xs">
          <div className="h-8 bg-[#1A1814] border-b border-white/5 flex items-center px-4 justify-between text-[#8B949E]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
              <span className="text-white text-[11px]">Runtime Diagnostic Session</span>
            </div>
            <span className="text-rose-400 text-[10px] font-bold">EXCEPTION CAUGHT</span>
          </div>
          <div className="p-5 flex flex-col gap-3 font-sans">
            <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-lg text-rose-300 text-xs">
              <span className="font-mono font-bold block mb-1">TypeError: Cannot read properties of undefined (reading 'coords')</span>
              at Tooltip.tsx:42:18 in handleHover
            </div>
            <div className="flex flex-col gap-1.5 text-[11px] text-slate-400 font-mono bg-[#161410] p-3 rounded border border-white/5">
              <div className="text-white font-bold mb-1">Causal Instrumentation:</div>
              <div>[✓] Inspected mousemove listener in ChartRenderer.tsx</div>
              <div>[✓] Detected stale closure over null container bounds</div>
              <div>[✓] Verified fix: wrap with useRef container callback</div>
            </div>
            <div className="bg-[#1E1C18] border border-white/10 p-2.5 rounded text-xs flex justify-between items-center text-slate-300 font-mono">
              <span className="flex items-center gap-2"><FileText size={14} className="text-blue-400" /> Tooltip.tsx</span>
              <span className="text-emerald-400 font-bold">+3 -1 lines (Fixed)</span>
            </div>
          </div>
        </div>
      );

    case 'terminal':
      return (
        <div className="w-full bg-[#0A0A08] border border-white/10 rounded-xl overflow-hidden shadow-2xl text-left font-mono text-xs">
          <div className="h-8 bg-[#161410] border-b border-white/5 flex items-center px-4 justify-between text-[#8B949E]">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-emerald-400" />
              <span className="text-slate-300 text-[11px]">bash - ~/float/workspace</span>
            </div>
            <span className="text-emerald-400 text-[10px]">SANDBOXED</span>
          </div>
          <div className="p-5 text-slate-300 flex flex-col gap-2 leading-relaxed">
            <div className="text-slate-400">$ npm run build</div>
            <div className="text-slate-500">&gt; float-ai@0.2.0 build</div>
            <div className="text-slate-500">&gt; tsc -b &amp;&amp; vite build</div>
            <div className="text-white mt-1">vite v6.2.0 building for production...</div>
            <div className="text-slate-400">✓ 1,248 modules transformed.</div>
            <div className="text-slate-400">dist/index.html                   1.42 kB │ gzip:  0.64 kB</div>
            <div className="text-slate-400">dist/assets/index-D8x2kL.js      342.15 kB │ gzip: 98.40 kB</div>
            <div className="text-emerald-400 font-bold mt-2">✓ built in 1.84s (0 errors, 0 warnings)</div>
          </div>
        </div>
      );

    case 'git':
      return (
        <div className="w-full bg-[#161410] border border-white/10 rounded-xl overflow-hidden shadow-2xl text-left font-sans text-xs">
          <div className="h-8 bg-[#1A1814] border-b border-white/5 flex items-center px-4 justify-between text-[#8B949E]">
            <div className="flex items-center gap-2">
              <GitBranch size={14} className="text-purple-400" />
              <span className="text-white text-[11px]">Checkpoint Ledger</span>
            </div>
            <span className="text-purple-400 text-[10px]">TIME TRAVEL ACTIVE</span>
          </div>
          <div className="p-4 flex flex-col gap-2 font-mono text-[11px]">
            <div className="flex justify-between text-slate-500 p-1"><span>Set up project architecture</span><span>Jan 8</span></div>
            <div className="flex justify-between text-slate-500 p-1"><span>Add Google OAuth provider</span><span>Jan 12</span></div>
            <div className="flex justify-between text-white bg-white/5 p-2 rounded border border-purple-500/30">
              <span className="flex items-center gap-1.5 font-bold text-purple-300">
                <RefreshCw size={12} className="animate-spin text-purple-400" /> [CHECKPOINT] Add multiplayer canvas
              </span>
              <span className="text-slate-400 text-[10px]">Yesterday ↶ Revert</span>
            </div>
            <div className="flex justify-between text-slate-400 p-1"><span>Improve AST indexing speed</span><span>3h ago</span></div>
            <div className="flex justify-between text-emerald-400 font-bold p-1"><span>Ship to staging deployment</span><span>Now</span></div>
          </div>
        </div>
      );

    case 'models':
      return (
        <div className="w-full bg-[#12100C] border border-white/10 rounded-xl overflow-hidden shadow-2xl text-left font-sans text-xs">
          <div className="h-8 bg-[#1A1814] border-b border-white/5 flex items-center px-4 justify-between text-[#8B949E]">
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-amber-400" />
              <span className="text-white text-[11px]">Subagent Parallel Orchestrator</span>
            </div>
            <span className="text-amber-400 text-[10px] font-bold">3 ACTIVE WORKERS</span>
          </div>
          <div className="p-4 flex flex-col gap-2.5">
            <div className="p-3 bg-[#1E1C18] border border-white/10 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-white font-medium">Subagent 1: Refactor authMiddleware.ts</div>
                <div className="text-[10px] text-slate-400">Claude 3.7 Sonnet • Deep Reasoning</div>
              </div>
              <span className="text-emerald-400 font-mono text-[11px]">Done (2.1s)</span>
            </div>
            <div className="p-3 bg-[#1E1C18] border border-white/10 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-white font-medium">Subagent 2: Build MissionControl.tsx UI</div>
                <div className="text-[10px] text-slate-400">xAI Grok 2 • Frontend generation</div>
              </div>
              <span className="text-amber-400 font-mono text-[11px]">Running...</span>
            </div>
            <div className="p-3 bg-[#1E1C18] border border-white/10 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-white font-medium">Subagent 3: Index benchmark datasets</div>
                <div className="text-[10px] text-slate-400">Gemini 2.5 Flash • High-throughput</div>
              </div>
              <span className="text-emerald-400 font-mono text-[11px]">Done (0.8s)</span>
            </div>
          </div>
        </div>
      );

    case 'search':
      return (
        <div className="w-full bg-[#12100C] border border-white/10 rounded-xl overflow-hidden shadow-2xl text-left font-sans text-xs">
          <div className="h-8 bg-[#1A1814] border-b border-white/5 flex items-center px-4 justify-between text-[#8B949E]">
            <div className="flex items-center gap-2">
              <Search size={14} className="text-[#FF5F56]" />
              <span className="text-white text-[11px]">Instant Grep & Symbol Index</span>
            </div>
            <span className="text-emerald-400 font-mono text-[10px]">38ms (14,290 files)</span>
          </div>
          <div className="p-4 flex flex-col gap-3 font-mono text-[11px]">
            <div className="p-2 bg-[#1E1C18] border border-white/10 rounded text-white flex items-center justify-between">
              <span>"payment_intent.payment_failed"</span>
              <span className="text-[10px] text-slate-500 font-sans">Regex: OFF</span>
            </div>
            <div className="flex flex-col gap-1.5 text-slate-400">
              <div className="text-white font-sans text-xs font-semibold">lib/stripe/webhooks.ts:84</div>
              <div className="bg-[#161410] p-2 rounded border border-white/5 text-slate-300">
                <span className="text-slate-500">84</span> case 'payment_intent.payment_failed':<br />
                <span className="text-slate-500">85</span> &nbsp;&nbsp;await PaymentService.handlePaymentFailure(event);
              </div>
            </div>
          </div>
        </div>
      );

    case 'agents':
      return (
        <div className="w-full bg-[#12100C] border border-white/10 rounded-xl overflow-hidden shadow-2xl text-left font-sans text-xs">
          <div className="h-8 bg-[#1A1814] border-b border-white/5 flex items-center px-4 justify-between text-[#8B949E]">
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-[#FF5F56]" />
              <span className="text-white text-[11px]">Autonomous Task Runner</span>
            </div>
            <span className="bg-[#FF5F56] text-white text-[10px] font-bold px-2 py-0.5 rounded">STEP 4/5</span>
          </div>
          <div className="p-5 flex flex-col gap-3">
            <div className="p-3 bg-[#1E1C18] border border-white/10 rounded text-slate-200">
              "Add affine gap alignment algorithm with tests in sequence_alignment.py"
            </div>
            <div className="flex flex-col gap-1.5 font-mono text-[11px] text-slate-400 bg-[#161410] p-3 rounded border border-white/5">
              <div>[Thought 6s] Formulate Gotoh matrix state equations</div>
              <div>[Read] bio/sequence_alignment.py (142 lines)</div>
              <div>[Diff] Mutated +38 -6 lines in sequence_alignment.py</div>
              <div className="text-emerald-400 font-bold">[Terminal] pytest tests/test_alignment.py (8 passed)</div>
            </div>
            <div className="flex justify-between items-center bg-white/5 p-2 rounded text-slate-300">
              <span>Ready for human review</span>
              <button className="px-3 py-1 bg-white text-black font-semibold rounded text-xs">Review Diff</button>
            </div>
          </div>
        </div>
      );

    case 'enterprise':
      return (
        <div className="w-full bg-[#12100C] border border-white/10 rounded-xl overflow-hidden shadow-2xl text-left font-sans text-xs">
          <div className="h-8 bg-[#1A1814] border-b border-white/5 flex items-center px-4 justify-between text-[#8B949E]">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-blue-400" />
              <span className="text-white text-[11px]">Enterprise Governance Gateway</span>
            </div>
            <span className="text-emerald-400 text-[10px] font-bold">SOC 2 / ISO 27001</span>
          </div>
          <div className="p-5 flex flex-col gap-3 font-mono text-[11px]">
            <div className="p-3 bg-[#1E1C18] border border-white/10 rounded flex flex-col gap-1.5">
              <div className="text-white font-sans font-medium text-xs">Active Session: alex@enterprise-corp.com</div>
              <div className="text-slate-400">SAML SSO: Okta Verified (MFA Active)</div>
              <div className="text-slate-400">Data Retention Policy: ZERO RETENTION (ZDR)</div>
            </div>
            <div className="p-3 bg-[#161410] border border-white/5 rounded text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-2"><Lock size={14} className="text-amber-400" /> Secret Redaction Gateway</span>
              <span className="text-emerald-400">100% Enforced</span>
            </div>
          </div>
        </div>
      );

    default:
      return (
        <div className="w-full bg-[#12100C] border border-white/10 rounded-xl p-8 flex flex-col items-center justify-center text-center shadow-2xl">
          <Code size={36} className="text-[#FF5F56] mb-3" />
          <h4 className="text-white font-medium text-sm mb-1">{feature.title} Visual Overview</h4>
          <p className="text-slate-400 text-xs max-w-sm">{feature.headline}</p>
        </div>
      );
  }
}
