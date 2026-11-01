import React, { useState } from 'react';
import {
  Check, X, FileDiff, ChevronDown, ChevronRight,
  FileCode, AlertCircle, Loader2, Sparkles
} from 'lucide-react';
import { ChangeSet, Change } from '../../types';
import { useIDEStore } from '../../store';
import { apiFetch } from '../../services/api';
import { rejectProposalRequest } from '../proposals/proposalRequests';
import { cn } from '../../lib/utils';
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
    updateFileContent,
    addFile,
    deleteFile,
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

  const applyLocally = async (pathsToApply: string[]) => {
    for (const change of changeSet.changes) {
      if (!pathsToApply.includes(change.path)) continue;
      if (change.operation === 'modify' || change.operation === 'create') {
        const pathSegments = change.path.split('/');
        const fileName = pathSegments[pathSegments.length - 1];
        try {
          updateFileContent(change.path, change.proposedContent || '');
        } catch {
          addFile(null, {
            id: uuidv4(),
            name: fileName,
            type: 'file',
            content: change.proposedContent || ''
          });
        }
      } else if (change.operation === 'delete') {
        deleteFile(change.path);
      }
    }
    return saveProject();
  };

  const handleAcceptAll = async () => {
    if (isApplying || isRejecting) return;
    setIsApplying(true);
    setErrorMessage(null);

    const targetPaths = changeSet.changes.map(c => c.path);
    const targetProjectId = projectId || 'default-project';
    const targetProposalId = changeSet.proposalId || changeSet.id;

    try {
      const saveResult = await applyLocally(targetPaths);
      if (saveResult.status !== 'synced') {
        throw new Error(`Cloud persistence failed, proposal remains pending: ${saveResult.message}`);
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
    setIsApplying(true);
    setErrorMessage(null);

    const targetPaths = [change.path];
    const targetProjectId = projectId || 'default-project';
    const targetProposalId = changeSet.proposalId || changeSet.id;

    try {
      const saveResult = await applyLocally(targetPaths);
      if (saveResult.status !== 'synced') {
        throw new Error(`Cloud persistence failed: ${saveResult.message}`);
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
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 flex items-center gap-1">
              <Check size={11} /> Applied
            </span>
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

                  {isPending && !fileApplied && (
                    <button
                      type="button"
                      disabled={isApplying}
                      onClick={() => handleApplySingleFile(change)}
                      className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-300 rounded cursor-pointer transition-colors"
                      title="Apply this file only"
                    >
                      Accept
                    </button>
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
