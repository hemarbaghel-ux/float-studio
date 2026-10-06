import React from 'react';
import { useIDEStore } from '../../store';
import { X, Circle, Play, Loader2, Columns } from 'lucide-react';
import { cn } from '../../lib/utils';

interface EditorTabsProps {
  onToggleSplit?: () => void;
  isSplitActive?: boolean;
}

export function EditorTabs({ onToggleSplit, isSplitActive }: EditorTabsProps) {
  const { openTabs, activeFileId, setActiveFile, closeTab, files, runActiveCode, isRunningCode } = useIDEStore();

  const getFileName = (id: string) => {
    const findName = (nodes: any[]): string | null => {
      for (const node of nodes) {
        if (node.id === id) return node.name;
        if (node.children) {
          const res = findName(node.children);
          if (res !== null) return res;
        }
      }
      return null;
    };
    return findName(files) || 'Unknown';
  };

  return (
    <div className="flex items-center justify-between bg-slate-100 dark:bg-[#0A0A0A] border-b border-slate-200 dark:border-[#2A2A2A] select-none h-9">
      <div className="flex h-full overflow-x-auto no-scrollbar flex-1">
        {openTabs.map(tab => {
          const isActive = tab.fileId === activeFileId;
          const name = getFileName(tab.fileId);

          return (
            <div 
              key={tab.id}
              onClick={() => setActiveFile(tab.fileId)}
              className={cn(
                "flex items-center min-w-[120px] max-w-[200px] h-full px-3 text-xs cursor-pointer border-r border-slate-200 dark:border-[#2A2A2A] transition-colors group relative",
                isActive 
                  ? "bg-white dark:bg-[#141414] text-slate-900 dark:text-[#C9D1D9] border-t-2 border-t-slate-900 dark:border-t-white font-medium" 
                  : "text-slate-500 dark:text-[#8B949E] hover:bg-slate-200/60 dark:hover:bg-[#1C1C1C] hover:text-slate-900 dark:hover:text-white border-t-2 border-t-transparent"
              )}
            >
              <span className="truncate flex-1 mr-2">{name}</span>
              <button 
                className={cn(
                  "w-4 h-4 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-[#2A2A2A] transition-colors",
                  tab.isModified && !isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                {tab.isModified ? <Circle size={8} className="fill-current text-slate-900 dark:text-white" /> : <X size={12} />}
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 px-2 shrink-0">
        {onToggleSplit && (
          <button
            onClick={onToggleSplit}
            title={isSplitActive ? "Close Split Editor" : "Split Editor Right"}
            className={cn(
              "p-1.5 rounded text-xs transition-colors cursor-pointer",
              isSplitActive
                ? "bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/5"
            )}
          >
            <Columns size={13} />
          </button>
        )}

        <button
          onClick={runActiveCode}
          disabled={isRunningCode}
          title="Run Python File (Ctrl+Enter)"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded border border-emerald-500/20 transition-all disabled:opacity-50 cursor-pointer active:scale-95"
        >
          {isRunningCode ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} className="fill-current" />}
          <span>{isRunningCode ? 'Running...' : 'Run'}</span>
        </button>
      </div>
    </div>
  );
}
