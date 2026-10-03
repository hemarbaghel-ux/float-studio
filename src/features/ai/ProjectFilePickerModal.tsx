import React, { useState, useMemo } from 'react';
import { useIDEStore } from '../../store';
import { flattenFileTree } from '../../lib/utils';
import { Search, File, Check, X, FileCode } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ProjectFilePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFile: (file: { id: string; path: string; name: string; content?: string }) => void;
  alreadyAttachedPaths: string[];
}

export function ProjectFilePickerModal({
  isOpen,
  onClose,
  onSelectFile,
  alreadyAttachedPaths
}: ProjectFilePickerModalProps) {
  const { files, projectName } = useIDEStore();
  const [searchQuery, setSearchQuery] = useState('');

  const projectFiles = useMemo(() => {
    return flattenFileTree(files).filter(f => f.type === 'file');
  }, [files]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return projectFiles;
    const q = searchQuery.toLowerCase().trim();
    return projectFiles.filter(f => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q));
  }, [projectFiles, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" 
        onClick={onClose} 
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#282828] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#282828] flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
          <div>
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <FileCode size={16} className="text-purple-600 dark:text-purple-400" />
              <span>Attach Project Files</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">
              Select files from {projectName || 'workspace'} to include in AI context
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search project files by name or path..."
              className="w-full bg-slate-100 dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-purple-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Files List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-white/[0.03] scrollbar-thin">
          {filteredFiles.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 dark:text-[#7D8590]">
              {searchQuery ? `No files matching "${searchQuery}"` : 'No files in this project yet'}
            </div>
          ) : (
            filteredFiles.map(file => {
              const isAttached = alreadyAttachedPaths.includes(file.path);
              const sizeKB = file.content ? (file.content.length / 1024).toFixed(1) : '0';

              return (
                <div
                  key={file.id}
                  onClick={() => {
                    onSelectFile(file);
                  }}
                  className={cn(
                    "px-3 py-2.5 rounded-xl flex items-center justify-between text-xs cursor-pointer transition-colors group",
                    isAttached 
                      ? "bg-purple-50/50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 font-medium" 
                      : "hover:bg-slate-50 dark:hover:bg-white/[0.04] text-slate-700 dark:text-[#C9D1D9]"
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate min-w-0 mr-3">
                    <File size={14} className={isAttached ? "text-purple-600 dark:text-purple-400 shrink-0" : "text-slate-400 dark:text-[#7D8590] shrink-0"} />
                    <span className="font-mono text-xs truncate">{file.path}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-400 dark:text-[#6E7681]">{sizeKB} KB</span>
                    {isAttached ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/20 px-2 py-0.5 rounded-md">
                        <Check size={11} /> Attached
                      </span>
                    ) : (
                      <span className="opacity-0 group-hover:opacity-100 text-[11px] font-medium text-slate-600 dark:text-[#A1A1AA] bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-md transition-opacity">
                        Attach
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-[#282828] bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between text-xs text-slate-500 dark:text-[#8B949E]">
          <span>{projectFiles.length} project files available</span>
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
