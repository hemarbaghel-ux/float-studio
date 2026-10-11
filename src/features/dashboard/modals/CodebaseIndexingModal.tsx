import React, { useState } from 'react';
import { X, Code2, FolderOpen, GitBranch, Loader2, Check } from 'lucide-react';

interface CodebaseIndexingModalProps {
  onClose: () => void;
}

export function CodebaseIndexingModal({ onClose }: CodebaseIndexingModalProps) {
  const [status, setStatus] = useState<'idle' | 'indexing' | 'done'>('idle');
  const [progress, setProgress] = useState(0);

  const startIndexing = () => {
    if (status === 'indexing') return;
    setStatus('indexing');
    setProgress(0);
    let p = 0;
    const t = setInterval(() => {
      p += 8 + Math.random() * 12;
      if (p >= 100) {
        p = 100;
        clearInterval(t);
        setProgress(100);
        setStatus('done');
      } else {
        setProgress(Math.floor(p));
      }
    }, 280);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Codebase indexing"
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Code2 size={16} className="text-purple-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Codebase</h2>
              <p className="text-[11px] text-slate-500 dark:text-[#8B949E]">
                Index your project for agent context{' '}
                <span className="text-purple-600 dark:text-purple-400 font-medium">Early Beta</span>
              </p>
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
          <p className="text-xs text-slate-600 dark:text-[#8B949E] leading-relaxed">
            FLOAT builds a searchable index of your workspace so agents can navigate files, symbols,
            and docs like Cursor. Indexing runs in the browser against your current project snapshot.
          </p>

          <div className="space-y-2">
            <div className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03]">
              <FolderOpen size={14} className="text-slate-500 dark:text-[#8B949E] shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-800 dark:text-white">Local workspace</div>
                <div className="text-[10px] text-slate-400 truncate">Files saved in this FLOAT project</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03]">
              <GitBranch size={14} className="text-slate-500 dark:text-[#8B949E] shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-800 dark:text-white">Git sync (optional)</div>
                <div className="text-[10px] text-slate-400 truncate">Connect a repo under Integrations</div>
              </div>
            </div>
          </div>

          {status !== 'idle' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600 dark:text-[#8B949E] flex items-center gap-1.5">
                  {status === 'indexing' ? (
                    <>
                      <Loader2 size={12} className="animate-spin" /> Indexing symbols & paths...
                    </>
                  ) : (
                    <>
                      <Check size={12} className="text-emerald-500" /> Index ready
                    </>
                  )}
                </span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-xs font-medium text-slate-600 dark:text-[#8B949E] border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={status === 'done' ? onClose : startIndexing}
            disabled={status === 'indexing'}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
          >
            {status === 'indexing' && <Loader2 size={13} className="animate-spin" />}
            {status === 'done' ? 'Done' : status === 'indexing' ? 'Indexing...' : 'Start indexing'}
          </button>
        </div>
      </div>
    </div>
  );
}
