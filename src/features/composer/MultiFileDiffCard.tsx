import React, { useState } from 'react';
import {
  Check, X, FileDiff, ChevronDown, ChevronRight,
  FileCode, AlertCircle, Loader2, Sparkles, RotateCcw, Play
} from 'lucide-react';
import { ChangeSet, Change } from '../../types';
import { useIDEStore } from '../../store';
import { apiFetch } from '../../services/api';
import { rejectProposalRequest } from '../proposals/proposalRequests';
import { cn, flattenFileTree } from '../../lib/utils';
import { v4 as uuidv4 } from 'uuid';

interface MultiFileDiffCardProps {
  changeSet: ChangeSet;
  onOpenFullReview?: (changeSet: ChangeSet) => void;
  onUpdated?: (updated: ChangeSet) => void;
}

export function MultiFileDiffCard({
  changeSet,
  onOpenFullReview,
  onUpdated
}: MultiFileDiffCardProps) {
  const {
    projectId,
    files,
    applyExecutionChanges,
    saveProject,
    updateAiMessageChangeSet
  } = useIDEStore();

  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>(() => {
    // Expand first file by default
    const initial: Record<string, boolean> = {};
    if (changeSet.changes.length > 0) {
      initial[changeSet.changes[0].path] = true;
    }
    return initial;
  });

  const [isApplying, setIsApplying] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isRunningTerminal, setIsRunningTerminal] = useState(false);

  const handleRunInTerminal = async () => {
    setIsRunningTerminal(true);
    const store = useIDEStore.getState();
    if (!store.bottomPanelOpen) store.toggleBottomPanel();
    store.setBottomPanelTab('terminal');

    const hasPython = changeSet.changes.some(c => c.path.endsWith('.py')) ||
      flattenFileTree(store.files).some(f => f.name.endsWith('.py'));
    const testCmd = hasPython ? 'python -m unittest' : 'npm test';

    store.addTerminalEntry({ type: 'command', content: testCmd });
    try {
      const { runShell } = await import('../float/sandbox');
      const { sandboxFs } = await import('../float/workspaceFs');
      const { output, code } = await runShell(testCmd, sandboxFs());
      if (output) {
        store.addTerminalEntry({ type: code === 0 ? 'output' : 'error', content: output });
      }
    } catch (err: any) {
      store.addTerminalEntry({ type: 'error', content: "Error: " + (err?.message || err) });
    } finally {
      setIsRunningTerminal(false);
    }
  };
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);

  const toggleExpand = (path: string) => {
    setExpandedFiles(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const isPending = changeSet.status === 'pending' || changeSet.status === 'pending_review' || changeSet.status === 'stale';
  const isApplied = changeSet.status === 'applied';
  const isRejected = changeSet.status === 'rejected';

  const totalAdditions = changeSet.changes.reduce((acc, c) => acc + (c.diffStats?.additions || 0), 0);
  const totalDeletions = changeSet.changes.reduce((acc, c) => acc + (c.diffStats?.deletions || 0), 0);

  const flatFiles = React.useMemo(() => flattenFileTree(files || []), [files]);
  const flatFileMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const f of flatFiles) {
      if (f.type === 'file') map.set(f.path || f.name, f.content || '');
    }
    return map;
  }, [flatFiles]);

  const conflicts = React.useMemo(() => {
    const set = new Set<string>();
    for (const change of changeSet.changes) {
      if (change.status === 'applied') continue;
      const currentContent = flatFileMap.get(change.path);
      if (change.operation === 'modify' && currentContent !== undefined && change.originalContent !== undefined) {
        if (currentContent !== change.originalContent) {
          set.add(change.path);
        }
      } else if (change.operation === 'create' && currentContent !== undefined) {
        set.add(change.path);
      }
    }
    return set;
  }, [changeSet.changes, flatFileMap]);


  const applyLocally = async (pathsToApply: string[]) => {
    const changedFiles: Array<{ path: string; content?: string }> = [];
    const deletedFiles: string[] = [];

    for (const change of changeSet.changes) {
      if (!pathsToApply.includes(change.path)) continue;
      if (change.operation === 'modify' || change.operation === 'create') {
        changedFiles.push({ path: change.path, content: change.proposedContent || '' });
      } else if (change.operation === 'delete') {
        deletedFiles.push(change.path);
      }
    }

    applyExecutionChanges(changedFiles, deletedFiles);
    return saveProject();
  };

  const handleRejectSingleFile = async (change: Change) => {
    if (isApplying || isRejecting) return;
    const updatedChanges = changeSet.changes.map(c =>
      c.path === change.path ? { ...c, status: 'rejected' as const } : c
    );
    const allResolved = updatedChanges.every(c => c.status === 'applied' || c.status === 'rejected');
    const anyApplied = updatedChanges.some(c => c.status === 'applied');
    const newStatus: ChangeSet['status'] = allResolved
      ? (anyApplied ? 'partially_applied' : 'rejected')
      : 'pending_review';

    const updatedChangeSet: ChangeSet = {
      ...changeSet,
      status: newStatus,
      changes: updatedChanges
    };

    updateAiMessageChangeSet(changeSet.id, updatedChangeSet);
    onUpdated?.(updatedChangeSet);
  };

  const handleUndo = async () => {
    if (isApplying || isRejecting) return;
    setIsApplying(true);
    setErrorMessage(null);

    try {
      const undoChanged: Array<{ path: string; content?: string }> = [];
      const undoDeleted: string[] = [];

      for (const change of changeSet.changes) {
        if (change.status === 'applied') {
          if (change.operation === 'create') {
            undoDeleted.push(change.path);
          } else if (change.operation === 'modify') {
            undoChanged.push({ path: change.path, content: change.originalContent ?? '' });
          } else if (change.operation === 'delete') {
            undoChanged.push({ path: change.path, content: change.originalContent ?? '' });
          }
        }
      }

      applyExecutionChanges(undoChanged, undoDeleted);
      const saveResult = await saveProject();
      if (saveResult.status !== 'synced') {
        console.warn('Workspace saved locally; cloud sync reported:', saveResult.message);
      }

      const updatedChangeSet: ChangeSet = {
        ...changeSet,
        status: 'pending_review',
        changes: changeSet.changes.map(c => ({ ...c, status: 'pending' as const }))
      };

      updateAiMessageChangeSet(changeSet.id, updatedChangeSet);
      onUpdated?.(updatedChangeSet);
      setSuccessStatus('Undid applied changes. Reverted files to original contents.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to undo changes.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleAcceptAll = async () => {
    if (isApplying || isRejecting) return;
    if (conflicts.size > 0) {
      const proceed = window.confirm(`${conflicts.size} file(s) were modified in the workspace after this proposal was created. Applying will overwrite those changes. Do you want to apply anyway?`);
      if (!proceed) return;
    }
    setIsApplying(true);
    setErrorMessage(null);

    const targetPaths = changeSet.changes.map(c => c.path);
    const targetProjectId = projectId || 'default-project';
    const targetProposalId = changeSet.proposalId || changeSet.id;

    try {
      const saveResult = await applyLocally(targetPaths);
      if (saveResult.status === 'error') {
        throw new Error(`Persistence failed: ${saveResult.message}`);
      }

      const response = await apiFetch(
        `/api/projects/${encodeURIComponent(targetProjectId)}/proposals/${encodeURIComponent(targetProposalId)}/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvedPaths: targetPaths })
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${response.status}) applying proposal.`);
      }

      const updatedChangeSet: ChangeSet = {
        ...changeSet,
        status: 'applied',
        changes: changeSet.changes.map(c => ({ ...c, status: 'applied' }))
      };

      updateAiMessageChangeSet(changeSet.id, updatedChangeSet);
      onUpdated?.(updatedChangeSet);
      setSuccessStatus(`Applied ${targetPaths.length} file${targetPaths.length > 1 ? 's' : ''} to workspace.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to apply changes.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleRejectAll = async () => {
    if (isApplying || isRejecting) return;
    setIsRejecting(true);
    setErrorMessage(null);

    const targetProjectId = projectId || 'default-project';
    const targetProposalId = changeSet.proposalId || changeSet.id;

    try {
      await rejectProposalRequest(targetProjectId, targetProposalId, apiFetch);
      const updatedChangeSet: ChangeSet = {
        ...changeSet,
        status: 'rejected',
        changes: changeSet.changes.map(c => ({ ...c, status: 'rejected' }))
      };

      updateAiMessageChangeSet(changeSet.id, updatedChangeSet);
      onUpdated?.(updatedChangeSet);
      setSuccessStatus('Proposal rejected.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reject proposal.');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleApplySingleFile = async (change: Change) => {
    if (isApplying || isRejecting) return;
    if (conflicts.has(change.path)) {
      const proceed = window.confirm(`File "${change.path}" was modified in the workspace after this proposal was created. Applying will overwrite those changes. Do you want to apply anyway?`);
      if (!proceed) return;
    }
    setIsApplying(true);
    setErrorMessage(null);

    const targetPaths = [change.path];
    const targetProjectId = projectId || 'default-project';
    const targetProposalId = changeSet.proposalId || changeSet.id;

    try {
      const saveResult = await applyLocally(targetPaths);
      if (saveResult.status === 'error') {
        throw new Error(`Persistence failed: ${saveResult.message}`);
      }

      const response = await apiFetch(
        `/api/projects/${encodeURIComponent(targetProjectId)}/proposals/${encodeURIComponent(targetProposalId)}/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvedPaths: targetPaths })
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${response.status}) applying file.`);
      }

      const updatedChanges = changeSet.changes.map(c =>
        c.path === change.path ? { ...c, status: 'applied' as const } : c
      );
      const allApplied = updatedChanges.every(c => c.status === 'applied');
      const updatedChangeSet: ChangeSet = {
        ...changeSet,
        status: allApplied ? 'applied' : 'partially_applied',
        changes: updatedChanges
      };

      updateAiMessageChangeSet(changeSet.id, updatedChangeSet);
      onUpdated?.(updatedChangeSet);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to apply file.');
    } finally {
      setIsApplying(false);
    }
  };

  // Generate simple inline unified diff preview lines
  const renderDiffSnippet = (change: Change) => {
    const original = (change.originalContent || '').split('\n');
    const proposed = (change.proposedContent || '').split('\n');

    return (
      <div className="max-h-56 overflow-y-auto bg-slate-950 dark:bg-[#0A0A0A] text-slate-200 p-2.5 font-mono text-[11px] leading-relaxed border-t border-slate-200 dark:border-[#222222] select-text">
        {change.operation === 'create' ? (
          proposed.slice(0, 30).map((line: string, idx: number) => (
            <div key={idx} className="flex bg-emerald-950/30 text-emerald-400">
              <span className="w-6 shrink-0 text-slate-500 select-none text-right pr-2">+</span>
              <span className="truncate whitespace-pre-wrap">{line}</span>
            </div>
          ))
        ) : change.operation === 'delete' ? (
          original.slice(0, 30).map((line: string, idx: number) => (
            <div key={idx} className="flex bg-rose-950/30 text-rose-400">
              <span className="w-6 shrink-0 text-slate-500 select-none text-right pr-2">-</span>
              <span className="truncate whitespace-pre-wrap">{line}</span>
            </div>
          ))
        ) : (
          proposed.slice(0, 40).map((line: string, idx: number) => {
            const origLine = original[idx];
            const isDifferent = origLine !== line;
            return (
              <div
                key={idx}
                className={cn(
                  "flex",
                  isDifferent ? "bg-emerald-950/30 text-emerald-300 font-medium" : "text-slate-400"
                )}
              >
                <span className="w-6 shrink-0 text-slate-500 select-none text-right pr-2">
                  {isDifferent ? '+' : ' '}
                </span>
                <span className="truncate whitespace-pre-wrap">{line}</span>
              </div>
            );
          })
        )}
      </div>
    );
  };

  return (
    <div className="my-3 w-full bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-xl overflow-hidden shadow-sm">
      {/* Top Banner / Summary */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 dark:bg-[#161616] border-b border-slate-200 dark:border-[#222222]">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-blue-500" />
          <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
            {changeSet.changes.length} {changeSet.changes.length === 1 ? 'file' : 'files'} changed
          </span>
          <span className="text-slate-400 dark:text-[#555]">•</span>
          <span className="flex items-center gap-1 font-mono text-[11px]">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">+{totalAdditions}</span>
            <span className="text-rose-600 dark:text-rose-400 font-medium">-{totalDeletions}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onOpenFullReview && (
            <button
              type="button"
              onClick={() => onOpenFullReview(changeSet)}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
              title="Open full-screen side-by-side Monaco diff viewer"
            >
              <FileDiff size={12} />
              <span className="hidden sm:inline">Side-by-side</span>
            </button>
          )}

          {isPending && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isApplying || isRejecting}
                onClick={handleRejectAll}
                className="px-2.5 py-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded border border-rose-200 dark:border-rose-900/40 transition-colors cursor-pointer disabled:opacity-50"
                title="Reject all changes (Esc)"
              >
                {isRejecting ? <Loader2 size={11} className="animate-spin" /> : 'Reject All'}
              </button>
              <button
                type="button"
                disabled={isApplying || isRejecting}
                onClick={handleAcceptAll}
                className="px-3 py-1 text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded shadow-xs flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                title="Accept all changes and apply to workspace (Ctrl+Enter)"
              >
                {isApplying ? <Loader2 size={11} className="animate-spin" /> : <Check size={12} />}
                <span>Accept All</span>
              </button>
            </div>
          )}

          {isApplied && (
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 flex items-center gap-1">
                <Check size={11} /> Applied
              </span>
              <button
                type="button"
                disabled={isApplying || isRejecting}
                onClick={handleUndo}
                className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 flex items-center gap-1 cursor-pointer transition-colors"
                title="Undo applied changes and restore previous file contents"
              >
                <RotateCcw size={11} /> Undo
              </button>
              <button
                type="button"
                disabled={isRunningTerminal}
                onClick={handleRunInTerminal}
                className="px-2.5 py-0.5 rounded text-[11px] font-medium bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40 flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                title="Run tests in terminal to verify applied changes"
              >
                {isRunningTerminal ? <Loader2 size={10} className="animate-spin text-purple-600 dark:text-purple-400" /> : <Play size={10} className="fill-purple-600 dark:fill-purple-400 text-purple-600 dark:text-purple-400" />}
                <span>Run in Terminal</span>
              </button>
            </div>
          )}
          {changeSet.status === 'partially_applied' && (
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40 flex items-center gap-1">
                Partially Applied
              </span>
              <button
                type="button"
                disabled={isApplying || isRejecting}
                onClick={handleUndo}
                className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 flex items-center gap-1 cursor-pointer transition-colors"
                title="Undo applied changes and restore previous file contents"
              >
                <RotateCcw size={11} /> Undo
              </button>
            </div>
          )}

          {isRejected && (
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 flex items-center gap-1">
              <X size={11} /> Rejected
            </span>
          )}
        </div>
      </div>

      {/* Error / Success Notifications */}
      {errorMessage && (
        <div className="px-3.5 py-2 bg-rose-50 dark:bg-rose-950/30 border-b border-rose-100 dark:border-rose-900/30 text-rose-700 dark:text-rose-400 text-xs flex items-center gap-1.5">
          <AlertCircle size={13} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successStatus && (
        <div className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-1.5">
          <Check size={13} className="shrink-0" />
          <span>{successStatus}</span>
        </div>
      )}


      {/* Stale Base Conflict Warning Banner */}
      {conflicts.size > 0 && isPending && (
        <div className="px-3.5 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="font-medium truncate">
              Stale base conflict: {conflicts.size} file{conflicts.size > 1 ? 's' : ''} modified in workspace since proposal was generated.
            </span>
          </div>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono shrink-0">Review before applying</span>
        </div>
      )}

      {/* File-by-File Review Cards */}
      <div className="divide-y divide-slate-100 dark:divide-[#1E1E1E]">
        {changeSet.changes.map((change, index) => {
          const isExpanded = Boolean(expandedFiles[change.path]);
          const fileApplied = change.status === 'applied';

          return (
            <div key={index} className="flex flex-col">
              {/* File Row Header */}
              <div
                className="flex items-center justify-between px-3 py-2 hover:bg-slate-50/80 dark:hover:bg-white/5 cursor-pointer transition-colors"
                onClick={() => toggleExpand(change.path)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-400">
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </span>
                  <FileCode size={13} className="text-slate-500 shrink-0" />
                  {conflicts.has(change.path) && !fileApplied && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 uppercase tracking-wider" title="Workspace file was modified after proposal was generated">
                      Conflict
                    </span>
                  )}
                  <span className="font-mono text-xs text-slate-800 dark:text-[#C9D1D9] truncate">
                    {change.path}
                  </span>
                  <span
                    className={cn(
                      "px-1.5 py-0.2 rounded text-[10px] font-mono uppercase font-bold",
                      change.operation === 'create'
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : change.operation === 'delete'
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                    )}
                  >
                    {change.operation}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 shrink-0" onClick={e => e.stopPropagation()}>
                  {change.diffStats && (
                    <span className="text-[11px] font-mono">
                      <span className="text-emerald-600 dark:text-emerald-400">+{change.diffStats.additions}</span>{' '}
                      <span className="text-rose-600 dark:text-rose-400">-{change.diffStats.deletions}</span>
                    </span>
                  )}

                  {isPending && !fileApplied && change.status !== 'rejected' && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={isApplying || isRejecting}
                        onClick={() => handleRejectSingleFile(change)}
                        className="px-2 py-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded border border-rose-200 dark:border-rose-900/40 cursor-pointer transition-colors"
                        title="Reject this file only"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={isApplying}
                        onClick={() => handleApplySingleFile(change)}
                        className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-300 rounded cursor-pointer transition-colors"
                        title="Apply this file only"
                      >
                        Accept
                      </button>
                    </div>
                  )}
                  {change.status === 'rejected' && (
                    <span className="text-rose-500 text-[11px] flex items-center gap-0.5">
                      <X size={11} /> Rejected
                    </span>
                  )}

                  {fileApplied && (
                    <span className="text-emerald-600 dark:text-emerald-400 text-[11px] flex items-center gap-0.5">
                      <Check size={11} /> Applied
                    </span>
                  )}
                </div>
              </div>

              {/* Inline Snippet Diff */}
              {isExpanded && renderDiffSnippet(change)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
