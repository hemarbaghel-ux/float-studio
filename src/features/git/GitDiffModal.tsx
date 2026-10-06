import React, { useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { X, Columns, AlignJustify, FileCode, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useIDEStore } from '../../store';

export interface GitDiffItem {
  path: string;
  status: string;
  before?: string;
  after?: string;
  patch?: string;
}

interface GitDiffModalProps {
  patches: GitDiffItem[];
  initialPath?: string;
  onClose: () => void;
}

export function GitDiffModal({ patches, initialPath, onClose }: GitDiffModalProps) {
  const { settings } = useIDEStore();
  const initialIndex = Math.max(0, patches.findIndex(p => p.path === initialPath));
  const [selectedIdx, setSelectedIdx] = useState(initialIndex);
  const [isSideBySide, setIsSideBySide] = useState(true);

  const current = patches[selectedIdx] || patches[0];

  const getLanguage = (filePath: string) => {
    if (filePath.endsWith('.py')) return 'python';
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'javascript';
    if (filePath.endsWith('.json')) return 'json';
    if (filePath.endsWith('.css')) return 'css';
    if (filePath.endsWith('.html')) return 'html';
    if (filePath.endsWith('.md')) return 'markdown';
    return 'plaintext';
  };

  const isDark = typeof document !== 'undefined'
    ? document.documentElement.classList.contains('dark')
    : settings.theme !== 'light';

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl h-[85vh] bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-900 dark:text-white">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-[#161616]">
          <div className="flex items-center gap-2 min-w-0">
            <FileCode size={18} className="text-blue-500 shrink-0" />
            <span className="font-semibold text-sm truncate">{current.path}</span>
            <span className={cn(
              "text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold shrink-0",
              current.status === 'added' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
              current.status === 'deleted' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' :
              'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            )}>
              {current.status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-white/10 p-0.5 bg-slate-100 dark:bg-white/5">
              <button
                onClick={() => setIsSideBySide(true)}
                title="Side by Side"
                className={cn(
                  "p-1.5 rounded text-xs transition-colors cursor-pointer",
                  isSideBySide
                    ? "bg-white dark:bg-[#252525] text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <Columns size={14} />
              </button>
              <button
                onClick={() => setIsSideBySide(false)}
                title="Inline"
                className={cn(
                  "p-1.5 rounded text-xs transition-colors cursor-pointer",
                  !isSideBySide
                    ? "bg-white dark:bg-[#252525] text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <AlignJustify size={14} />
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body: Sidebar + Monaco Diff Editor */}
        <div className="flex-1 flex min-h-0">
          {/* File selector list */}
          {patches.length > 1 && (
            <div className="w-60 border-r border-slate-200 dark:border-white/10 overflow-y-auto shrink-0 bg-slate-50/50 dark:bg-[#141414]/50">
              <div className="p-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Changed Files ({patches.length})
              </div>
              <div className="space-y-0.5 px-1.5 pb-2">
                {patches.map((p, idx) => (
                  <button
                    key={p.path}
                    onClick={() => setSelectedIdx(idx)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 truncate transition-colors cursor-pointer",
                      selectedIdx === idx
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
                        : "text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-white/5"
                    )}
                  >
                    <span className="truncate">{p.path}</span>
                    <span className={cn(
                      "text-[9px] uppercase font-mono font-bold shrink-0",
                      p.status === 'added' ? 'text-emerald-500' :
                      p.status === 'deleted' ? 'text-rose-500' :
                      'text-amber-500'
                    )}>
                      {p.status === 'added' ? 'A' : p.status === 'deleted' ? 'D' : 'M'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Monaco Diff Editor */}
          <div className="flex-1 relative min-h-0 min-w-0">
            <DiffEditor
              original={current.before ?? ''}
              modified={current.after ?? ''}
              language={getLanguage(current.path)}
              theme={isDark ? 'vs-dark' : 'light'}
              options={{
                renderSideBySide: isSideBySide,
                readOnly: true,
                fontSize: settings.fontSize || 13,
                fontFamily: settings.fontFamily || "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 12 },
                smoothScrolling: true,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
