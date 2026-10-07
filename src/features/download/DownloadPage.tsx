import React, { useState } from 'react';
import { ArrowLeft, Monitor, Apple, Terminal, Copy, Check, Sparkles, Download, Layers } from 'lucide-react';
import { FloatLogo, FloatWordmark } from '../../components/FloatLogo';

export function DownloadPage() {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const handleCopy = (cmd: string, id: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const platforms = [
    {
      id: 'mac-arm',
      name: 'macOS (Apple Silicon)',
      arch: 'ARM64 (M1 / M2 / M3 / M4)',
      icon: Apple,
      cmd: 'curl -fsSL https://float.ai/install.sh | bash',
      ext: '.dmg'
    },
    {
      id: 'mac-intel',
      name: 'macOS (Intel)',
      arch: 'x86_64',
      icon: Apple,
      cmd: 'curl -fsSL https://float.ai/install.sh | bash',
      ext: '.dmg'
    },
    {
      id: 'windows',
      name: 'Windows',
      arch: 'x64 (Windows 10 / 11)',
      icon: Monitor,
      cmd: 'winget install float-ai.float',
      ext: '.exe'
    },
    {
      id: 'linux',
      name: 'Linux',
      arch: 'x86_64 (.AppImage / .deb)',
      icon: Terminal,
      cmd: 'curl -fsSL https://float.ai/install-linux.sh | bash',
      ext: '.AppImage'
    }
  ];

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#0A0A08] text-slate-900 dark:text-[#E6EDF3] flex flex-col font-sans transition-colors">
      {/* Header */}
      <header className="h-16 border-b border-slate-200 dark:border-white/10 px-6 flex items-center justify-between bg-white/80 dark:bg-[#0A0A08]/80 backdrop-blur-md sticky top-0 z-30">
        <a href="/" className="flex items-center gap-2.5" aria-label="FLOAT home">
          <ArrowLeft size={16} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors" />
          <FloatLogo className="w-6 h-6" />
          <FloatWordmark className="h-4 text-slate-900 dark:text-white" />
          <span className="text-xs font-semibold text-slate-500 dark:text-[#8B949E]">/ Download</span>
        </a>
        <a
          href="/"
          className="px-4 py-2 bg-slate-900 text-white dark:bg-white dark:text-black rounded-full text-xs font-semibold hover:opacity-90 transition-opacity shadow-xs"
        >
          Open Web IDE
        </a>
      </header>

      {/* Main Download Content */}
      <section className="flex-1 max-w-5xl w-full mx-auto px-6 py-16 sm:py-20">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-medium mb-4">
            <Sparkles size={13} />
            <span>Native Desktop Performance</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
            Download FLOAT AI
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-[#8B949E] leading-relaxed">
            The complete AI coding environment for macOS, Windows, and Linux. Built with local symbol indexing, subagent parallelism, and full Monaco integration.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a
              href="/"
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md flex items-center gap-2"
            >
              <Download size={16} />
              <span>Launch Instant Web Workspace</span>
            </a>
          </div>
        </div>

        {/* Platforms Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          {platforms.map((p) => {
            const Icon = p.icon;
            const isCopied = copiedCmd === p.id;
            return (
              <div
                key={p.id}
                className="p-6 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121210] flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                        <Icon size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{p.name}</h3>
                        <p className="text-xs text-slate-500 dark:text-[#8B949E]">{p.arch}</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400">
                      {p.ext}
                    </span>
                  </div>

                  <div className="mb-4">
                    <span className="text-[11px] font-semibold text-slate-400 dark:text-[#6E7681] uppercase tracking-wider block mb-1.5">
                      Command Line Install
                    </span>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-100 dark:bg-[#181816] border border-slate-200/80 dark:border-white/5 font-mono text-xs text-slate-800 dark:text-[#C9D1D9]">
                      <span className="truncate pr-2">{p.cmd}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(p.cmd, p.id)}
                        className="p-1 hover:text-purple-600 dark:hover:text-purple-400 rounded cursor-pointer transition-colors shrink-0"
                        title="Copy command"
                      >
                        {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                <a
                  href="/"
                  className="w-full mt-2 py-2 px-4 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-xs font-semibold text-slate-800 dark:text-white transition-all text-center flex items-center justify-center gap-2"
                >
                  <Download size={13} />
                  <span>Download Standalone Installer</span>
                </a>
              </div>
            );
          })}
        </div>

        {/* Extensions & VS Code Parity */}
        <div className="p-8 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121210] shadow-sm">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Layers size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Migrating from VS Code or Cursor?
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-1">
                  Import your extensions, keybindings, and `.cursorrules` in one step. All familiar shortcuts (Cmd/Ctrl+K, Cmd/Ctrl+Shift+P) are configured automatically.
                </p>
              </div>
            </div>
            <a
              href="/"
              className="px-4 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 transition-opacity shrink-0"
            >
              Start Coding
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
