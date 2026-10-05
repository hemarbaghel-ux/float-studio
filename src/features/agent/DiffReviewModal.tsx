import React, { useState, useMemo } from 'react';
import { useIDEStore } from '../../store';
import { ChangeSet, Change } from '../../types';
import { X, Check, XCircle, AlertTriangle, FileCode, CheckSquare, Square, Columns, AlignJustify, Loader2, CheckCircle2 } from 'lucide-react';
import { cn, flattenFileTree } from '../../lib/utils';
import { DiffEditor } from '@monaco-editor/react';
import { auth } from '../../lib/firebase';
import { useValidationStore } from '../../store/validationStore';

interface DiffReviewModalProps {
  changeSet: ChangeSet;
  onClose: () => void;
}

export function DiffReviewModal({ changeSet, onClose }: DiffReviewModalProps) {
  const { files, projectId, settings, updateFileContent, addFile, deleteFile, saveProject, updateAiMessageChangeSet } = useIDEStore();

  const [selectedChangeIdx, setSelectedChangeIdx] = useState(0);
  const [approvedPaths, setApprovedPaths] = useState<Set<string>>(() => {
    // Default: all pending changes are approved initially
    return new Set(changeSet.changes.map(c => c.path));
  });
  const [isSideBySide, setIsSideBySide] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictFiles, setConflictFiles] = useState<string[]>([]);
  const [appliedStatus, setAppliedStatus] = useState<string | null>(null);

  const flatFiles = useMemo(() => flattenFileTree(files), [files]);

  // Compute live conflict detection against current store files
  const liveConflicts = useMemo(() => {
    const conflicts: string[] = [];
    for (const change of changeSet.changes) {
      const current = flatFiles.find(f => f.path === change.path);
      if (change.operation === 'modify' || change.operation === 'delete') {
        if (!current) {
          conflicts.push(`${change.path} (file missing)`);
        } else if (change.originalContent !== undefined) {
          const normalize = (content: string) => content.replace(/\r\n/g, '\n');
          if (normalize(current.content || '') !== normalize(change.originalContent)) {
            conflicts.push(`${change.path} (modified since proposal was created)`);
          }
        }
      } else if (change.operation === 'create' && current) {
        conflicts.push(`${change.path} (already exists)`);
      }
    }
    return conflicts;
  }, [changeSet.changes, flatFiles]);

  const selectedChange = changeSet.changes[selectedChangeIdx] || changeSet.changes[0];

  const totalAdditions = useMemo(() => {
    return changeSet.changes.reduce((sum, c) => sum + (c.diffStats?.additions || 0), 0);
  }, [changeSet.changes]);

  const totalDeletions = useMemo(() => {
    return changeSet.changes.reduce((sum, c) => sum + (c.diffStats?.deletions || 0), 0);
  }, [changeSet.changes]);

  const toggleApprove = (path: string) => {
    setApprovedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (approvedPaths.size === changeSet.changes.length) {
      setApprovedPaths(new Set());
    } else {
      setApprovedPaths(new Set(changeSet.changes.map(c => c.path)));
    }
  };

  const getLanguage = (path: string) => {
    if (path.endsWith('.py')) return 'python';
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.html')) return 'html';
    if (path.endsWith('.md')) return 'markdown';
    if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml';
    if (path.endsWith('.sh') || path.endsWith('.bash')) return 'shell';
    return 'plaintext';
  };

  // Helper to ensure parent folders exist in tree
  const ensureFolders = (pathParts: string[]): string | null => {
    let currentParentId: string | null = null;
    let currentPath = '';

    for (const part of pathParts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const existing = flatFiles.find(f => f.path === currentPath);
      if (existing) {
        currentParentId = existing.id;
      } else {
        const newId = Math.random().toString(36).substring(7);
        addFile(currentParentId, { id: newId, name: part, type: 'folder', children: [] });
        currentParentId = newId;
      }
    }
    return currentParentId;
  };

  // Apply changes to local store and cloud
  const applyLocally = (pathsToApply: string[]) => {
    for (const change of changeSet.changes) {
      if (!pathsToApply.includes(change.path)) continue;

      const pathParts = change.path.split('/');
      const fileName = pathParts.pop() || '';

      if (change.operation === 'modify' || change.operation === 'create') {
        const existing = flatFiles.find(f => f.path === change.path);
        if (existing) {
          updateFileContent(existing.id, change.proposedContent || '');
        } else if (change.operation === 'create') {
          const parentId = ensureFolders(pathParts);
          addFile(parentId, {
            id: Math.random().toString(36).substring(7),
            name: fileName,
            type: 'file',
            content: change.proposedContent || ''
          });
        }
      } else if (change.operation === 'delete') {
        const existing = flatFiles.find(f => f.path === change.path);
        if (existing) {
          deleteFile(existing.id);
        }
      }
    }
    saveProject();
  };

  const handleApply = async () => {
    if (approvedPaths.size === 0) {
      setErrorMessage('Please select at least one file to apply.');
      return;
    }

    if (liveConflicts.length > 0) {
      setErrorMessage(`Cannot apply: Conflicts detected on ${liveConflicts.join(', ')}. Discard or resolve local edits before applying.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const targetPaths = Array.from(approvedPaths);
    const targetProjectId = projectId || 'default-project';
    const targetProposalId = changeSet.proposalId || changeSet.id;

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';

      // Call server backend verification & application endpoint
      const response = await fetch(`/api/projects/${targetProjectId}/proposals/${targetProposalId}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          approvedPaths: targetPaths,
          currentFiles: flatFiles.map(f => ({ path: f.path, content: f.content }))
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 409) {
          setConflictFiles(data.conflicts?.map((c: any) => c.path) || ['File content has diverged']);
          throw new Error('Proposal is stale: Target files have changed since the proposal was created.');
        }
        throw new Error(data.error || `Server error (${response.status}) applying proposal.`);
      }

      const resData = await response.json();
      const applied = resData.appliedFiles || targetPaths;

      // Apply to local IDE state
      applyLocally(applied);

      const finalStatus = applied.length === changeSet.changes.length ? 'applied' : 'partially_applied';
      updateAiMessageChangeSet(changeSet.id, {
        ...changeSet,
        status: finalStatus,
        changes: changeSet.changes.map(c => ({
          ...c,
          status: applied.includes(c.path) ? 'applied' : 'rejected'
        }))
      });

      setAppliedStatus(`Applied ${applied.length} file${applied.length > 1 ? 's' : ''} successfully.`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to apply changes.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    const targetProjectId = projectId || 'default-project';
    const targetProposalId = changeSet.proposalId || changeSet.id;

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';

      await fetch(`/api/projects/${targetProjectId}/proposals/${targetProposalId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }).catch(() => {});

      updateAiMessageChangeSet(changeSet.id, {
        ...changeSet,
        status: 'rejected',
        changes: changeSet.changes.map(c => ({ ...c, status: 'rejected' }))
      });

      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error recording rejection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleValidateProposal = () => {
    const proposalId = changeSet.proposalId || changeSet.id;
    useValidationStore.getState().setSelectedTarget('proposal', proposalId);
    useIDEStore.setState({ bottomPanelOpen: true, bottomPanelTab: 'validation' });
    onClose();
    useValidationStore.getState().runValidation({
      projectId: projectId || 'default-project',
      target: 'proposal',
      proposalId,
      files: flatFiles.map(f => ({ path: f.path, content: f.content }))
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => !isSubmitting && onClose()}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-6xl h-[88vh] bg-white dark:bg-[#0D1117] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#30363D] flex flex-col overflow-hidden text-slate-800 dark:text-[#C9D1D9] z-10">

        {/* Header Bar */}
        <div className="px-6 py-3.5 border-b border-slate-200 dark:border-[#30363D] flex items-center justify-between shrink-0 bg-slate-50 dark:bg-[#161B22]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <FileCode size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  Review Code Proposal
                </h2>
                <span className={cn(
                  "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border",
                  changeSet.status === 'applied' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" :
                  changeSet.status === 'rejected' ? "bg-red-500/10 text-red-600 border-red-500/30" :
                  liveConflicts.length > 0 ? "bg-amber-500/10 text-amber-600 border-amber-500/30" :
                  "bg-purple-500/10 text-purple-600 border-purple-500/30"
                )}>
                  {liveConflicts.length > 0 ? 'Stale / Conflict' : changeSet.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-[#8B949E] truncate max-w-xl">
                {changeSet.description}
              </p>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Diff Stats Badge */}
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#0D1117] border border-slate-200 dark:border-[#30363D]">
              <span className="text-emerald-600 dark:text-[#7EE787]">+{totalAdditions}</span>
              <span className="text-red-500 dark:text-[#F85149]">-{totalDeletions}</span>
              <span className="text-slate-400 dark:text-[#8B949E]">lines</span>
            </div>

            {/* Split / Inline Toggle */}
            <button
              type="button"
              onClick={() => setIsSideBySide(!isSideBySide)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-[#30363D] hover:bg-slate-200/60 dark:hover:bg-[#21262D] text-slate-600 dark:text-[#C9D1D9] transition-colors cursor-pointer"
              title={isSideBySide ? "Switch to inline diff" : "Switch to side-by-side diff"}
            >
              {isSideBySide ? <Columns size={16} /> : <AlignJustify size={16} />}
            </button>

            <div className="w-px h-6 bg-slate-200 dark:bg-[#30363D]" />

            {/* Validate Action */}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleValidateProposal}
              className="px-3 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg border border-purple-500/20 transition-colors cursor-pointer flex items-center gap-1.5"
              title="Test proposed changes in isolated preview without applying"
            >
              <CheckCircle2 size={13} />
              <span>Validate Proposal</span>
            </button>

            {/* Reject Action */}
            <button
              type="button"
              disabled={isSubmitting || changeSet.status === 'applied'}
              onClick={handleReject}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-[#C9D1D9] hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 rounded-lg border border-slate-200 dark:border-[#30363D] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reject Proposal
            </button>

            {/* Apply Action */}
            <button
              type="button"
              disabled={isSubmitting || approvedPaths.size === 0 || liveConflicts.length > 0 || changeSet.status === 'applied'}
              onClick={handleApply}
              className="px-4 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-black dark:hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Applying...</span>
                </>
              ) : (
                <>
                  <Check size={13} />
                  <span>Apply Approved ({approvedPaths.size})</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200/50 dark:hover:bg-[#21262D] transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Warning / Error Banners */}
        {liveConflicts.length > 0 && (
          <div className="px-6 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/50 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 shrink-0">
            <AlertTriangle size={15} className="shrink-0" />
            <span>
              <strong>Conflict Warning:</strong> {liveConflicts.join('; ')}. The proposal is stale because files changed after generation. Overwriting is blocked to protect your edits.
            </span>
          </div>
        )}

        {errorMessage && (
          <div className="px-6 py-2.5 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900/50 flex items-center gap-2 text-xs text-red-700 dark:text-red-400 shrink-0">
            <XCircle size={15} className="shrink-0" />
            <span className="truncate">{errorMessage}</span>
          </div>
        )}

        {appliedStatus && (
          <div className="px-6 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-900/50 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 shrink-0">
            <Check size={15} className="shrink-0" />
            <span>{appliedStatus}</span>
          </div>
        )}

        {/* Main Body */}
        <div className="flex flex-1 min-h-0">

          {/* File Selector Sidebar */}
          <div className="w-72 border-r border-slate-200 dark:border-[#30363D] bg-slate-50/70 dark:bg-[#161B22] flex flex-col shrink-0">
            <div className="p-3 border-b border-slate-200 dark:border-[#30363D] flex items-center justify-between text-xs text-slate-500 dark:text-[#8B949E]">
              <span className="font-semibold text-slate-700 dark:text-[#C9D1D9]">
                Affected Files ({changeSet.changes.length})
              </span>
              <button
                type="button"
                onClick={toggleAll}
                className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
              >
                {approvedPaths.size === changeSet.changes.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-200/60 dark:divide-[#30363D]/60">
              {changeSet.changes.map((change, idx) => {
                const isSelected = selectedChangeIdx === idx;
                const isApproved = approvedPaths.has(change.path);
                const hasConflict = liveConflicts.some(c => c.startsWith(change.path));

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedChangeIdx(idx)}
                    className={cn(
                      "px-3.5 py-2.5 flex items-start gap-2.5 cursor-pointer transition-colors text-xs",
                      isSelected
                        ? "bg-purple-50/80 dark:bg-[#21262D] border-l-2 border-l-purple-600 dark:border-l-purple-400"
                        : "hover:bg-slate-100/70 dark:hover:bg-[#1F242C] border-l-2 border-l-transparent"
                    )}
                  >
                    {/* Checkbox for per-file approval */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleApprove(change.path);
                      }}
                      className="mt-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer shrink-0"
                    >
                      {isApproved ? (
                        <CheckSquare size={14} className="text-purple-600 dark:text-purple-400" />
                      ) : (
                        <Square size={14} />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-medium text-slate-900 dark:text-white truncate" title={change.path}>
                          {change.path.split('/').pop()}
                        </span>
                        <span className={cn(
                          "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0",
                          change.operation === 'create' ? "bg-emerald-500/10 text-emerald-600 dark:text-[#7EE787]" :
                          change.operation === 'delete' ? "bg-red-500/10 text-red-600 dark:text-[#F85149]" :
                          "bg-amber-500/10 text-amber-600 dark:text-[#FFA657]"
                        )}>
                          {change.operation}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-[#8B949E]">
                        <span className="truncate max-w-[130px]" title={change.path}>
                          {change.path}
                        </span>
                        {change.diffStats && (
                          <span className="font-mono text-[10px] shrink-0">
                            <span className="text-emerald-600 dark:text-[#7EE787]">+{change.diffStats.additions}</span>
                            {' '}
                            <span className="text-red-500 dark:text-[#F85149]">-{change.diffStats.deletions}</span>
                          </span>
                        )}
                      </div>

                      {hasConflict && (
                        <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                          <AlertTriangle size={11} />
                          <span>Diverged</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Diff View Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#0D1117]">
            {/* Diff Header */}
            <div className="px-4 py-2 border-b border-slate-200 dark:border-[#30363D] bg-slate-100/50 dark:bg-[#161B22] flex items-center justify-between text-xs font-mono text-slate-600 dark:text-[#8B949E]">
              <div className="flex items-center gap-2 truncate">
                <span className="font-semibold text-slate-800 dark:text-[#C9D1D9]">{selectedChange.path}</span>
                <span>·</span>
                <span>{getLanguage(selectedChange.path)}</span>
              </div>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400/80" /> Original (Left)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400/80" /> Proposed (Right)
                </span>
              </div>
            </div>

            {/* Monaco DiffEditor Container */}
            <div className="flex-1 relative min-h-0">
              <DiffEditor
                height="100%"
                language={getLanguage(selectedChange.path)}
                theme={
                  (typeof document !== 'undefined'
                    ? document.documentElement.classList.contains('dark')
                    : settings.theme !== 'light')
                    ? 'vs-dark'
                    : 'light'
                }
                original={selectedChange.operation === 'create' ? '' : (selectedChange.originalContent || '')}
                modified={selectedChange.operation === 'delete' ? '' : (selectedChange.proposedContent || '')}
                options={{
                  readOnly: true,
                  renderSideBySide: isSideBySide,
                  minimap: { enabled: false },
                  fontSize: settings.fontSize || 13,
                  smoothScrolling: true,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  fontFamily: settings.fontFamily || "'JetBrains Mono', 'Fira Code', Menlo, monospace"
                }}
              />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
