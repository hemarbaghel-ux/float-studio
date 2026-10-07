import React from 'react';
import { ChevronRight, FileCode, Folder } from 'lucide-react';
import { useIDEStore } from '../../store';
import { FileNode } from '../../types';

interface BreadcrumbsProps {
  fileId: string | null;
}

export function Breadcrumbs({ fileId }: BreadcrumbsProps) {
  const { files, projectName } = useIDEStore();

  if (!fileId) return null;

  // Find path segments to active file
  const findPathSegments = (
    nodes: FileNode[],
    targetId: string,
    currentPath: Array<{ name: string; isFolder: boolean }> = []
  ): Array<{ name: string; isFolder: boolean }> | null => {
    for (const node of nodes) {
      const next = [...currentPath, { name: node.name, isFolder: node.type === 'folder' }];
      if (node.id === targetId) return next;
      if (node.children) {
        const found = findPathSegments(node.children, targetId, next);
        if (found) return found;
      }
    }
    return null;
  };

  const segments = findPathSegments(files, fileId) || [];

  return (
    <div className="h-6 px-3 bg-slate-50 dark:bg-[#0E0E0E] border-b border-slate-200 dark:border-[#202020] flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#8B949E] select-none overflow-x-auto no-scrollbar font-mono">
      <span className="font-sans font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[120px]">
        {projectName}
      </span>
      {segments.map((seg, idx) => {
        const isLast = idx === segments.length - 1;
        return (
          <React.Fragment key={idx}>
            <ChevronRight size={11} className="text-slate-400 dark:text-slate-600 shrink-0" />
            <div className="flex items-center gap-1 truncate">
              {seg.isFolder ? (
                <Folder size={11} className="text-amber-500/80 shrink-0" />
              ) : (
                <FileCode size={11} className="text-blue-500/80 shrink-0" />
              )}
              <span className={isLast ? "text-slate-900 dark:text-slate-200 font-medium" : ""}>
                {seg.name}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
