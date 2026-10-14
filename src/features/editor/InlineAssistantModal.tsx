import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowRight, X, Loader2, AlertCircle, Check, RotateCcw, FileDiff } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { useAIStore } from '../../store/aiStore';
import { ChangeSet } from '../../types';
import { ModelSelector } from '../ai/ModelSelector';

interface InlineAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  filePath: string;
  language: string;
  fullCode: string;
  selectedCode: string;
  startLine?: number;
  endLine?: number;
  editorPosition?: { top: number; left: number } | null;
  initialInstruction?: string;
  onProposalCreated: (changeSet: ChangeSet) => void;
  onApplyDirectly?: (newContent: string) => void;
}

export function InlineAssistantModal({
  isOpen,
  onClose,
  fileName,
  filePath,
  language,
  fullCode,
  selectedCode,
  startLine,
  endLine,
  editorPosition,
  initialInstruction,
  onProposalCreated,
  onApplyDirectly
}: InlineAssistantModalProps) {
  const [instruction, setInstruction] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDiff, setPendingDiff] = useState<{
    proposedContent: string;
    transformedSelection?: string;
    diffStats?: { additions: number; deletions: number };
    changeSet: ChangeSet;
  } | null>(null);
  const { selectedModel, setSelectedModel } = useAIStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen) {
      setInstruction(initialInstruction || '');
      setErrorMessage(null);
      setPendingDiff(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setPendingDiff(null);
    }
  }, [isOpen, initialInstruction]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!instruction.trim() || isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';

      const response = await fetch('/api/ai/transform', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        signal: abortController.signal,
        body: JSON.stringify({
          instruction: instruction.trim(),
          selectedCode: selectedCode || fullCode,
          fullCode,
          startLine,
          endLine,
          fileName,
          language,
          model: selectedModel || 'gpt-6-astra'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to transform code.`);
      }

      const data = await response.json();
      if (data.cancelled) {
        return;
      }

      const proposedContent = data.proposedContent || '';

      // Construct a valid ChangeSet matching FLOAT's proposal architecture
      const changeSetId = `cs-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const changeSet: ChangeSet = {
        id: changeSetId,
        description: `Inline AI: ${instruction.trim()}`,
        status: 'pending',
        changes: [
          {
            path: filePath || fileName,
            operation: 'modify',
            originalContent: fullCode,
            proposedContent,
            diffStats: data.diffStats || { additions: 1, deletions: 1 },
            status: 'pending'
          }
        ]
      };

      if (onApplyDirectly) {
        setPendingDiff({
          proposedContent,
          transformedSelection: data.transformedSelection,
          diffStats: data.diffStats,
          changeSet
        });
      } else {
        onClose();
        onProposalCreated(changeSet);
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || /abort/i.test(err.message || '')) {
        return;
      }
      setErrorMessage(err.message || 'An error occurred during transformation.');
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleAccept = () => {
    if (pendingDiff) {
      if (onApplyDirectly) {
        onApplyDirectly(pendingDiff.proposedContent);
      } else {
        onProposalCreated(pendingDiff.changeSet);
      }
      onClose();
    }
  };

  const handleReject = () => {
    setPendingDiff(null);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (pendingDiff) {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleReject();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleAccept();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasSelection = Boolean(selectedCode && selectedCode.trim() && startLine !== undefined && endLine !== undefined);

  const containerStyle: React.CSSProperties = editorPosition
    ? {
        position: 'fixed',
        top: Math.min(Math.max(16, editorPosition.top), window.innerHeight - 380),
        left: Math.min(Math.max(16, editorPosition.left), window.innerWidth - 600),
        zIndex: 50
      }
    : {};

  return (
    <div
      className={editorPosition ? "fixed inset-0 z-50 pointer-events-none" : "fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40 backdrop-blur-xs"}
      onClick={onClose}
    >
      <div 
        style={containerStyle}
        className="pointer-events-auto w-full max-w-xl bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / Target indicator */}
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-100 dark:border-[#202020] bg-slate-50/50 dark:bg-[#181818]/50">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-[#A1A1AA]">
            <Sparkles size={13} className="text-blue-500" />
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {pendingDiff ? 'Diff Ready' : 'Inline AI Assistant'}
            </span>
            <span className="text-slate-400 dark:text-[#555]">•</span>
            <span className="font-mono text-[11px] truncate max-w-[180px]">{fileName}</span>
            {hasSelection && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40">
                Lines {startLine}-{endLine}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-[#202020] text-slate-500 dark:text-slate-400 rounded border border-slate-200 dark:border-[#2E2E2E]">
              Esc to cancel
            </kbd>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Diff Review View */}
        {pendingDiff ? (
          <div className="p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Proposed Changes</span>
                {pendingDiff.diffStats && (
                  <span className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-emerald-600 dark:text-emerald-400">+{pendingDiff.diffStats.additions}</span>
                    <span className="text-rose-600 dark:text-rose-400">-{pendingDiff.diffStats.deletions}</span>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  onProposalCreated(pendingDiff.changeSet);
                  onClose();
                }}
                className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                <FileDiff size={12} />
                <span>Full Diff Viewer</span>
              </button>
            </div>

            {/* Snippet preview */}
            {pendingDiff.transformedSelection && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-[#282828] bg-slate-50 dark:bg-[#0E0E0E] p-2.5 font-mono text-xs text-slate-800 dark:text-slate-200">
                <pre className="whitespace-pre-wrap">{pendingDiff.transformedSelection}</pre>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-[#222]">
              <button
                type="button"
                onClick={() => setPendingDiff(null)}
                className="px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-md flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RotateCcw size={12} />
                <span>Refine prompt</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReject}
                  className="px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md border border-rose-200 dark:border-rose-900/40 transition-colors cursor-pointer"
                >
                  Reject (Esc)
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-md shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Check size={13} />
                  <span>Accept (Enter ↵)</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Form Body */
          <form onSubmit={handleSubmit} className="p-3">
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder={hasSelection ? `Edit selection (e.g. "Add null check", "Refactor to helper function")...` : `Edit ${fileName} (e.g. "Add error handling", "Convert to async/await")...`}
                className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-[#1A1A1A] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-[#666] border border-slate-200 dark:border-[#333] rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!instruction.trim() || isLoading}
                className="absolute right-2 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <span>Generate</span>
                    <ArrowRight size={12} />
                  </>
                )}
              </button>
            </div>

            {/* Quick Action Chips */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {[
                { label: 'Fix', prompt: 'Find and fix bugs, errors, or edge cases in this code' },
                { label: 'Refactor', prompt: 'Refactor this code for readability, clean structure, and modern standards' },
                { label: 'Optimize', prompt: 'Optimize performance and reduce redundant computations' },
                { label: 'Add Tests', prompt: 'Generate unit tests covering core behavior and boundary cases' },
                { label: 'Document', prompt: 'Add clear JSDoc / documentation comments and types' },
                { label: 'Explain', prompt: 'Add comments explaining how this logic works step by step' }
              ].map(chip => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    setInstruction(chip.prompt);
                    inputRef.current?.focus();
                  }}
                  className="px-2 py-0.5 rounded text-[11px] bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-[#A1A1AA] transition-colors cursor-pointer"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Model selection and footer hints */}
            <div className="flex items-center justify-between mt-2.5 px-0.5 pt-1 text-xs text-slate-500 dark:text-[#777]">
              <div className="flex items-center gap-2">
                <span className="text-[11px]">Model:</span>
                <ModelSelector
                  activeModelId={selectedModel}
                  onModelChange={setSelectedModel}
                  variant="compact"
                />
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span>Accept diff directly into editor</span>
                <kbd className="px-1 py-0.5 font-mono bg-slate-100 dark:bg-[#202020] rounded text-[10px] border border-slate-200 dark:border-[#2E2E2E]">
                  Enter ↵
                </kbd>
              </div>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="mt-2.5 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <div className="flex-1">{errorMessage}</div>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
