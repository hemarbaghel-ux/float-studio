import React, { useState } from 'react';
import { useIDEStore } from '../../store';
import { EditorTabs } from './EditorTabs';
import { CodeEditor } from './CodeEditor';
import { Breadcrumbs } from './Breadcrumbs';
import { Columns, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export function EditorArea() {
  const { openTabs, activeFileId, files } = useIDEStore();
  const [splitFileId, setSplitFileId] = useState<string | null>(null);

  const getFileContent = (id: string | null) => {
    if (!id) return '';
    const findContent = (nodes: any[]): string | null => {
      for (const node of nodes) {
        if (node.id === id) return node.content || '';
        if (node.children) {
          const res = findContent(node.children);
          if (res !== null) return res;
        }
      }
      return null;
    };
    return findContent(files) || '';
  };

  const getFileName = (id: string | null) => {
    if (!id) return '';
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
    return findName(files) || '';
  };

  const toggleSplit = () => {
    if (splitFileId) {
      setSplitFileId(null);
    } else {
      // Pick another open tab or the active file itself
      const anotherTab = openTabs.find(t => t.fileId !== activeFileId);
      setSplitFileId(anotherTab ? anotherTab.fileId : activeFileId);
    }
  };

  if (openTabs.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white dark:bg-[#0A0A0A] transition-colors">
        <div className="text-center text-slate-500 dark:text-[#8B949E] select-none">
          <div className="mb-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto text-slate-300 dark:text-[#2A2A2A]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-slate-800 dark:text-[#C9D1D9]">No Open Editors</h2>
          <p className="text-sm mt-2">Select a file from the explorer or press <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] rounded-md mx-1 text-xs font-mono">Cmd + Shift + P</kbd></p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-[#0A0A0A] min-w-0">
      <EditorTabs onToggleSplit={toggleSplit} isSplitActive={Boolean(splitFileId)} />
      
      {!splitFileId ? (
        // Standard Single Editor with Breadcrumbs
        <div className="flex-1 flex flex-col min-h-0">
          <Breadcrumbs fileId={activeFileId} />
          <div className="flex-1 relative min-h-0">
            <CodeEditor 
              fileId={activeFileId!} 
              fileName={getFileName(activeFileId)} 
              content={getFileContent(activeFileId)} 
            />
          </div>
        </div>
      ) : (
        // Side-by-Side Split Editor View
        <div className="flex-1 flex min-h-0 divide-x divide-slate-200 dark:divide-[#2A2A2A]">
          {/* Left Pane (Active File) */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <Breadcrumbs fileId={activeFileId} />
            <div className="flex-1 relative min-h-0">
              <CodeEditor 
                fileId={activeFileId!} 
                fileName={getFileName(activeFileId)} 
                content={getFileContent(activeFileId)} 
              />
            </div>
          </div>

          {/* Right Pane (Split File) */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <div className="flex items-center justify-between bg-slate-50 dark:bg-[#0E0E0E] border-b border-slate-200 dark:border-[#202020] pr-2">
              <div className="flex-1 min-w-0">
                <Breadcrumbs fileId={splitFileId} />
              </div>
              <button
                onClick={() => setSplitFileId(null)}
                title="Close Split Editor"
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded hover:bg-slate-200/50 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
            <div className="flex-1 relative min-h-0">
              <CodeEditor 
                fileId={splitFileId!} 
                fileName={getFileName(splitFileId)} 
                content={getFileContent(splitFileId)} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
