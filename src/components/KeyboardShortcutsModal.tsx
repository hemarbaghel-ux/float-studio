import React, { useState } from 'react';
import { X, Search, Keyboard } from 'lucide-react';

interface ShortcutItem {
  id: string;
  category: 'General' | 'Navigation' | 'Editor' | 'AI & Execution';
  name: string;
  keys: string[];
}

export function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState('');

  const shortcuts: ShortcutItem[] = [
    { id: '1', category: 'General', name: 'Open Command Palette', keys: ['⌘', 'Shift', 'P'] },
    { id: '2', category: 'General', name: 'Quick Open / Find File', keys: ['⌘', 'P'] },
    { id: '3', category: 'General', name: 'Open Settings', keys: ['⌘', ','] },
    { id: '4', category: 'General', name: 'Close Modal or Overlay', keys: ['Esc'] },
    { id: '5', category: 'Navigation', name: 'Start New Chat', keys: ['⌘', 'N'] },
    { id: '6', category: 'Navigation', name: 'Toggle Primary Sidebar', keys: ['⌘', 'B'] },
    { id: '7', category: 'Navigation', name: 'Switch to Dashboard', keys: ['⌘', 'Shift', 'D'] },
    { id: '8', category: 'Editor', name: 'Save File / Workspace', keys: ['⌘', 'S'] },
    { id: '9', category: 'Editor', name: 'Format Code', keys: ['Shift', 'Alt', 'F'] },
    { id: '10', category: 'Editor', name: 'Toggle Line Comment', keys: ['⌘', '/'] },
    { id: '11', category: 'AI & Execution', name: 'Run Python Code in Terminal', keys: ['⌘', 'Enter'] },
    { id: '12', category: 'AI & Execution', name: 'Submit AI Chat Prompt', keys: ['Enter'] },
    { id: '13', category: 'AI & Execution', name: 'Multiline Prompt (Chat)', keys: ['Shift', 'Enter'] },
  ];

  const filtered = shortcuts.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-white flex items-center justify-center">
              <Keyboard size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Keyboard Shortcuts</h3>
              <p className="text-[11px] text-slate-400 dark:text-[#8B949E]">macOS and Windows / Linux shortcuts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-2.5 border-b border-slate-100 dark:border-white/5 shrink-0 bg-slate-50/50 dark:bg-black/20">
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 rounded-lg text-xs">
            <Search size={13} className="text-slate-400" />
            <input
              type="text"
              placeholder="Search shortcuts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-xs w-full text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Shortcuts list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs divide-y divide-slate-100 dark:divide-white/5">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-400 dark:text-[#8B949E]">
              No shortcuts found matching "{search}"
            </div>
          ) : (
            ['General', 'Navigation', 'Editor', 'AI & Execution'].map(cat => {
              const items = filtered.filter(f => f.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat} className="pt-3 first:pt-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#8B949E] block mb-2">
                    {cat}
                  </span>
                  <div className="space-y-1.5">
                    {items.map(item => (
                      <div key={item.id} className="flex items-center justify-between py-1 px-1 rounded hover:bg-slate-50 dark:hover:bg-white/5">
                        <span className="text-slate-700 dark:text-[#C9D1D9]">{item.name}</span>
                        <div className="flex items-center gap-1">
                          {item.keys.map((k, i) => (
                            <kbd key={i} className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded text-slate-600 dark:text-[#C9D1D9] shadow-sm">
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#111111] flex items-center justify-between text-[11px] text-slate-400 dark:text-[#8B949E] shrink-0">
          <span>Press <kbd className="px-1 py-0.5 font-mono bg-white dark:bg-white/10 rounded border border-slate-200 dark:border-white/10">Esc</kbd> to dismiss</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-900 text-white dark:bg-white dark:text-black rounded-md font-medium text-xs hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
