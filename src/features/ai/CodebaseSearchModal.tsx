import React, { useState, useMemo } from 'react';
import { useIDEStore } from '../../store';
import { searchCodebase, SearchMatch } from '../../services/codebaseSearch';
import { Search, Code2, Check, X, FileText } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CodebaseSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMatch: (match: SearchMatch) => void;
  alreadyAttachedKeys: string[];
}

export function CodebaseSearchModal({
  isOpen,
  onClose,
  onSelectMatch,
  alreadyAttachedKeys
}: CodebaseSearchModalProps) {
  const { files, projectName } = useIDEStore();
  const [query, setQuery] = useState('');

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return searchCodebase(files, query, { maxResults: 12 });
  }, [files, query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" 
        onClick={onClose} 
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#282828] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[82vh] animate-in fade-in zoom-in-95 duration-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#282828] flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
          <div>
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Code2 size={16} className="text-purple-600 dark:text-purple-400" />
              <span>Search & Attach Code Excerpts</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">
              Find relevant functions, classes, or code blocks to attach to your prompt
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-slate-200 dark:border-[#282828] bg-white dark:bg-[#121212]">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-slate-400 dark:text-[#7D8590]" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search code across project (e.g. function name, class, import)..."
              className="w-full bg-slate-100 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-purple-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 scrollbar-thin">
          {!query.trim() ? (
            <div className="py-16 text-center text-xs text-slate-400 dark:text-[#7D8590] flex flex-col items-center gap-2">
              <Search size={22} className="opacity-40" />
              <span>Type a query to search codebase contents and filenames</span>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400 dark:text-[#7D8590]">
              No matches found for "{query}"
            </div>
          ) : (
            searchResults.map((match, idx) => {
              const matchKey = `${match.filePath}:${match.startLine}-${match.endLine}`;
              const isAttached = alreadyAttachedKeys.includes(matchKey);

              return (
                <div
                  key={`${matchKey}-${idx}`}
                  className={cn(
                    "p-3 rounded-xl border transition-all text-xs flex flex-col gap-2",
                    isAttached
                      ? "bg-purple-50/50 dark:bg-purple-500/10 border-purple-300 dark:border-purple-500/30"
                      : "bg-slate-50 dark:bg-[#161616] border-slate-200/80 dark:border-[#262626] hover:border-slate-300 dark:hover:border-[#383838]"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-mono text-[11px] text-slate-800 dark:text-[#C9D1D9]">
                      <FileText size={13} className="text-purple-600 dark:text-purple-400" />
                      <span className="font-semibold">{match.filePath}</span>
                      {match.symbol && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/15 text-purple-600 dark:text-purple-400 font-mono font-medium">
                          {match.symbol.kind} {match.symbol.name}
                        </span>
                      )}
                      <span className="text-slate-400 dark:text-[#7D8590]">
                        (lines {match.startLine}-{match.endLine})
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectMatch(match)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1",
                        isAttached
                          ? "bg-purple-200 dark:bg-purple-500/30 text-purple-800 dark:text-purple-200"
                          : "bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-black dark:hover:bg-slate-200"
                      )}
                    >
                      {isAttached ? (
                        <>
                          <Check size={11} />
                          <span>Attached</span>
                        </>
                      ) : (
                        <span>Attach Excerpt</span>
                      )}
                    </button>
                  </div>

                  {/* Code snippet display */}
                  <pre className="p-2.5 rounded-lg bg-slate-900 dark:bg-[#0D0D0D] text-slate-100 font-mono text-[11px] overflow-x-auto leading-relaxed scrollbar-thin">
                    <code>{match.contentExcerpt}</code>
                  </pre>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-[#282828] bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between text-xs text-slate-500 dark:text-[#8B949E]">
          <span>{searchResults.length} matches found</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-black rounded-lg font-medium transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
