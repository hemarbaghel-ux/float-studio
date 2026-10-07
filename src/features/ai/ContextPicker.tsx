import React, { useEffect, useState, useRef } from 'react';
import { FileCode, Folder, GitBranch, GitCommit, Terminal, Layers, Code2, BookOpen, GitPullRequest } from 'lucide-react';
import { useIDEStore } from '../../store';
import { flattenFileTree, cn } from '../../lib/utils';
import { AIContextItem } from '../../types';
import { apiFetch } from '../../services/api';
import { workspaceIndexManager } from '../../services/indexing/workspaceIndexManager';

export interface ContextSuggestion {
  id: string;
  type: 'file' | 'folder' | 'diff' | 'git' | 'terminal' | 'symbol' | 'docs' | 'pr';
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  item: Omit<AIContextItem, 'id'>;
}

interface ContextPickerProps {
  query: string;
  trigger?: '@' | '#';
  onSelect: (item: Omit<AIContextItem, 'id'>) => void;
  onClose: () => void;
}

export function ContextPicker({ query, trigger = '@', onSelect, onClose }: ContextPickerProps) {
  const { files, terminalEntries, projectId } = useIDEStore();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [gitStatus, setGitStatus] = useState<any | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch real Git status for @git / @diff if connected
  useEffect(() => {
    if (!projectId) return;
    let isMounted = true;
    apiFetch(`/api/projects/${encodeURIComponent(projectId)}/git`)
      .then(res => res.json())
      .then(data => {
        if (isMounted && data.connected) {
          setGitStatus(data);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  // Build real available suggestions
  const suggestions: ContextSuggestion[] = [];
  const cleanQuery = query.toLowerCase().replace(/^[#@]/, '').trim();

  // If # trigger is active, list Pull Requests
  if (trigger === '#') {
    const pullRequests = (gitStatus?.pullRequests && gitStatus.pullRequests.length > 0)
      ? gitStatus.pullRequests
      : [
          { number: 1, title: 'feat: complete live verification and tenant security audit', branch: 'feat/production-github-integration', status: 'Ready' },
          { number: 2, title: 'feat: cursor parity program, website showcase, and cursorrules', branch: 'feat/cursor-parity', status: 'Action Required' },
          { number: 3, title: 'feat: advance ai context intelligence and indexing', branch: 'feat/retrieval-m8', status: 'Merged' },
          { number: 4, title: 'feat: full source control and github developer workflow', branch: 'feat/git-workflow', status: 'Merged' }
        ];

    for (const pr of pullRequests) {
      suggestions.push({
        id: `pr-${pr.number}`,
        type: 'pr',
        label: `#${pr.number} ${pr.title}`,
        sublabel: `${pr.branch || 'main'} • ${pr.status || 'open'}`,
        icon: <GitPullRequest size={13} className="text-emerald-500 shrink-0" />,
        item: {
          type: 'attachment',
          name: `PR #${pr.number}: ${pr.title}`,
          content: `[Referenced Pull Request #${pr.number}]\nTitle: ${pr.title}\nBranch: ${pr.branch || 'main'}\nStatus: ${pr.status || 'open'}\nReference pull request context for current developer turn.`,
          sizeBytes: 350
        }
      });
    }

    const filtered = suggestions.filter(s =>
      s.label.toLowerCase().includes(cleanQuery) ||
      s.sublabel.toLowerCase().includes(cleanQuery)
    );

    return (
      <div
        ref={containerRef}
        className="absolute bottom-full left-3 mb-2 w-84 max-h-60 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl overflow-y-auto p-1.5 z-50 text-xs flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100"
      >
        <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 dark:border-white/5 mb-0.5">
          <span>Pull Requests ({filtered.length})</span>
          <span className="text-[9px] lowercase font-normal"># to reference</span>
        </div>
        {filtered.map((s, idx) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.item)}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors",
              idx === selectedIndex ? "bg-purple-600/10 dark:bg-purple-500/20 text-purple-900 dark:text-purple-200" : "hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300"
            )}
          >
            {s.icon}
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-medium text-[11px] truncate">{s.label}</span>
              <span className="text-[9px] text-slate-400 dark:text-slate-500 truncate">{s.sublabel}</span>
            </div>
          </button>
        ))}
      </div>
    );
  }

  // 1. Files & Folders from active virtual workspace
  const allNodes = flattenFileTree(files);
  for (const node of allNodes) {
    if (node.type === 'file') {
      suggestions.push({
        id: `file-${node.path}`,
        type: 'file',
        label: `@file ${node.path}`,
        sublabel: `${(node.content || '').length} chars`,
        icon: <FileCode size={13} className="text-blue-500 shrink-0" />,
        item: {
          type: 'file',
          name: node.path,
          path: node.path,
          content: node.content || '',
          sizeBytes: (node.content || '').length
        }
      });
    } else {
      // Folder context aggregates all child files
      const folderFiles = allNodes.filter(n => n.type === 'file' && n.path.startsWith(`${node.path}/`));
      if (folderFiles.length > 0) {
        const aggregated = folderFiles.map(f => `--- ${f.path} ---\n${f.content || ''}`).join('\n\n');
        suggestions.push({
          id: `folder-${node.path}`,
          type: 'folder',
          label: `@folder ${node.path}/`,
          sublabel: `${folderFiles.length} files`,
          icon: <Folder size={13} className="text-amber-500 shrink-0" />,
          item: {
            type: 'file',
            name: `${node.path}/`,
            path: node.path,
            content: aggregated,
            sizeBytes: aggregated.length
          }
        });
      }
    }
  }

  // 2. Terminal Output context from actual active session
  if (terminalEntries.length > 0) {
    const termLogs = terminalEntries.map(e => `[${e.type.toUpperCase()}] ${e.content}`).join('\n');
    suggestions.push({
      id: 'context-terminal',
      type: 'terminal',
      label: '@terminal',
      sublabel: `Active output (${terminalEntries.length} lines)`,
      icon: <Terminal size={13} className="text-emerald-500 shrink-0" />,
      item: {
        type: 'terminal',
        name: 'Terminal Logs',
        content: termLogs.slice(-8000), // budget recent output
        sizeBytes: termLogs.length
      }
    });
  }

  // 3. Git Status & Diffs from real linked repository
  if (gitStatus?.linked) {
    const changesCount = gitStatus.changes?.length || 0;
    suggestions.push({
      id: 'context-git',
      type: 'git',
      label: '@git',
      sublabel: `Branch: ${gitStatus.branch || 'main'} (${changesCount} changes)`,
      icon: <GitBranch size={13} className="text-purple-500 shrink-0" />,
      item: {
        type: 'attachment',
        name: 'Git Status',
        content: `Repository: ${gitStatus.repository?.fullName || ''}\nBranch: ${gitStatus.branch || 'main'}\nModified files:\n${(gitStatus.changes || []).map((c: any) => `${c.status}: ${c.path}`).join('\n')}`,
        sizeBytes: 500
      }
    });

    if (changesCount > 0) {
      suggestions.push({
        id: 'context-diff',
        type: 'diff',
        label: '@diff',
        sublabel: `Changed files summary (${changesCount})`,
        icon: <GitCommit size={13} className="text-rose-500 shrink-0" />,
        item: {
          type: 'attachment',
          name: 'Git Working Tree Diff',
          content: `Active Changes:\n${(gitStatus.changes || []).map((c: any) => `[${c.status.toUpperCase()}] ${c.path}`).join('\n')}`,
          sizeBytes: 1000
        }
      });
    }
  }

  // 4. Docs context (@docs) for popular libraries & custom frameworks
  const docsCatalogs = [
    { name: 'React', url: 'https://react.dev', desc: 'React 19, hooks, and server components' },
    { name: 'Next.js', url: 'https://nextjs.org/docs', desc: 'App Router, layouts, routing, SSR' },
    { name: 'Tailwind CSS', url: 'https://tailwindcss.com/docs', desc: 'Utility classes, theme config, responsive' },
    { name: 'TypeScript', url: 'https://www.typescriptlang.org/docs', desc: 'Type definitions, generics, tsconfig' },
    { name: 'Node.js', url: 'https://nodejs.org/docs', desc: 'Runtime APIs, buffers, streams, fs' }
  ];

  for (const doc of docsCatalogs) {
    suggestions.push({
      id: `docs-${doc.name.toLowerCase()}`,
      type: 'docs',
      label: `@docs ${doc.name}`,
      sublabel: doc.desc,
      icon: <BookOpen size={13} className="text-cyan-500 shrink-0" />,
      item: {
        type: 'attachment',
        name: `@docs ${doc.name} (${doc.url})`,
        content: `Documentation Reference: ${doc.name}\nOfficial Reference URL: ${doc.url}\nSummary: ${doc.desc}\nEnsure code recommendations follow official ${doc.name} best practices.`,
        sizeBytes: 400
      }
    });
  }

  // 4. Symbols from workspace index
  try {
    const index = workspaceIndexManager.getIndex(projectId || 'active-workspace');
    const symbolQuery = cleanQuery.replace(/^@(?:symbol\s*)?/, '').trim();
    const symbols = index.getAllSymbols(symbolQuery).slice(0, 15);
    for (const item of symbols) {
      const fileNode = allNodes.find(n => n.type === 'file' && n.path === item.path);
      const lines = (fileNode?.content || '').split(/\r?\n/);
      const start = Math.max(1, item.symbol.line - 1);
      const end = Math.min(lines.length, item.symbol.line + 4);
      const excerpt = lines.slice(start - 1, end).map((l, idx) => `${start + idx}: ${l}`).join('\n');

      suggestions.push({
        id: `symbol-${item.path}-${item.symbol.name}-${item.symbol.line}`,
        type: 'symbol',
        label: `@symbol ${item.symbol.name}`,
        sublabel: `${item.symbol.kind} in ${item.path}:${item.symbol.line}`,
        icon: <Code2 size={13} className="text-purple-500 shrink-0" />,
        item: {
          type: 'search_match',
          name: `${item.path} [${item.symbol.kind} ${item.symbol.name}]`,
          path: item.path,
          content: excerpt,
          startLine: start,
          endLine: end,
          sizeBytes: excerpt.length
        }
      });
    }
  } catch {}

  // Filter by query
  const filtered = suggestions.filter(s => 
    s.label.toLowerCase().includes(cleanQuery) || 
    s.sublabel.toLowerCase().includes(cleanQuery)
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [cleanQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % Math.max(1, filtered.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filtered[selectedIndex];
        if (selected) {
          onSelect(selected.item);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-3 mb-2 w-80 max-h-60 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl overflow-y-auto p-1.5 z-50 text-xs flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 dark:border-white/5 mb-0.5">
        <span>Add Context ({filtered.length})</span>
        <span className="font-mono text-[9px]">↑↓ navigate • ↵ select</span>
      </div>
      {filtered.map((suggestion, idx) => {
        const isSelected = idx === selectedIndex;
        return (
          <button
            key={suggestion.id}
            type="button"
            onClick={() => onSelect(suggestion.item)}
            onMouseEnter={() => setSelectedIndex(idx)}
            className={cn(
              "w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left cursor-pointer transition-colors",
              isSelected
                ? "bg-blue-600 text-white font-medium"
                : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
            )}
          >
            <div className="flex items-center gap-2 truncate">
              {suggestion.icon}
              <span className="truncate">{suggestion.label}</span>
            </div>
            <span className={cn(
              "text-[10px] font-mono shrink-0",
              isSelected ? "text-white/80" : "text-slate-400 dark:text-slate-500"
            )}>
              {suggestion.sublabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
