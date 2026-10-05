import React, { useMemo, useState } from 'react';
import { useIDEStore } from '../../store';
import { useValidationStore } from '../../store/validationStore';
import { flattenFileTree, cn } from '../../lib/utils';
import { 
  Play, 
  RotateCw, 
  StopCircle, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Sparkles, 
  FileCode, 
  Info, 
  ChevronRight, 
  ChevronDown, 
  X, 
  Loader2
} from 'lucide-react';
import { ValidationDiagnostic } from '../../types/validation';

export interface ValidationPanelProps {
  className?: string;
  onClose?: () => void;
}

export function ValidationPanel({ className, onClose }: ValidationPanelProps) {
  const { files, projectId, aiMessages, openFile, setActiveFile } = useIDEStore();
  const {
    currentRun,
    isRunning,
    selectedTarget,
    selectedProposalId,
    filterSeverity,
    selectedDiagnostic,
    explanation,
    isExplaining,
    explanationError,
    errorMessage,
    setSelectedTarget,
    setFilterSeverity,
    setSelectedDiagnostic,
    clearExplanation,
    runValidation,
    cancelValidation,
    explainError
  } = useValidationStore();

  const [expandedCheckIdx, setExpandedCheckIdx] = useState<number | null>(null);

  // Extract proposals from recent AI messages if any exist
  const availableProposals = useMemo(() => {
    const list: Array<{ id: string; description: string; status: string }> = [];
    for (const msg of aiMessages) {
      if (msg.changeSet && msg.changeSet.id) {
        list.push({
          id: msg.changeSet.proposalId || msg.changeSet.id,
          description: msg.changeSet.description || 'Proposed Code Changes',
          status: msg.changeSet.status
        });
      }
    }
    return list;
  }, [aiMessages]);

  const flatFiles = useMemo(() => flattenFileTree(files), [files]);

  const handleStartValidation = () => {
    const targetFiles = flatFiles.filter(f => f.type === 'file').map(f => ({ path: f.path, content: f.content }));
    runValidation({
      projectId: projectId || 'default-project',
      target: selectedTarget,
      proposalId: selectedTarget === 'proposal' ? selectedProposalId : undefined,
      files: targetFiles
    });
  };

  const handleCancel = () => {
    cancelValidation(projectId || 'default-project');
  };

  const handleExplain = (diag: ValidationDiagnostic) => {
    const targetFile = flatFiles.find(f => f.path === diag.filePath || f.path.endsWith('/' + diag.filePath));
    explainError({
      projectId: projectId || 'default-project',
      diagnostic: diag,
      targetFileContent: targetFile?.content
    });
  };

  const handleJumpToFile = (filePath?: string) => {
    if (!filePath) return;
    const file = flatFiles.find(f => f.path === filePath || f.path.endsWith('/' + filePath));
    if (file) {
      setActiveFile(file.id);
      openFile(file.id);
    }
  };

  // Structured diagnostic results filtered by severity
  const allDiagnostics = useMemo(() => {
    if (!currentRun) return [];
    const list: ValidationDiagnostic[] = [];
    for (const check of currentRun.checks) {
      for (const diag of check.diagnostics) {
        if (filterSeverity === 'all' || diag.severity === filterSeverity) {
          list.push(diag);
        }
      }
    }
    return list;
  }, [currentRun, filterSeverity]);

  // Current progress status indicator (Idle, Running, Passed, Failed)
  const statusDisplay = useMemo(() => {
    if (isRunning) {
      return {
        label: 'Running',
        icon: <Loader2 size={13} className="animate-spin text-blue-500" />,
        badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
      };
    }
    if (!currentRun) {
      return {
        label: 'Idle',
        icon: <Clock size={13} className="text-slate-400" />,
        badgeClass: 'bg-slate-200/60 dark:bg-[#1E1E1E] text-slate-600 dark:text-[#888] border-slate-300 dark:border-[#333]'
      };
    }
    if (currentRun.status === 'passed') {
      return {
        label: 'Passed',
        icon: <CheckCircle2 size={13} className="text-emerald-500" />,
        badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-[#7EE787] border-emerald-500/20'
      };
    }
    if (currentRun.status === 'cancelled') {
      return {
        label: 'Cancelled',
        icon: <AlertTriangle size={13} className="text-amber-500" />,
        badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
      };
    }
    if (currentRun.status === 'unsupported') {
      return {
        label: 'Incomplete',
        icon: <Info size={13} className="text-slate-500" />,
        badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20'
      };
    }
    return {
      label: 'Failed',
      icon: <XCircle size={13} className="text-rose-500" />,
      badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-[#F85149] border-rose-500/20'
    };
  }, [isRunning, currentRun]);

  return (
    <div className={cn("h-full flex flex-col bg-slate-50 dark:bg-[#0A0A0A] text-slate-800 dark:text-[#C9D1D9] font-sans overflow-hidden select-none", className)}>
      
      {/* Top Header & Action Bar */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#2A2A2A] bg-slate-100/70 dark:bg-[#121212] flex flex-wrap items-center justify-between gap-3 shrink-0">
        
        {/* Left: Run Validation & Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Target Selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 dark:text-[#8B949E] font-medium">Target:</span>
            <select
              value={selectedTarget === 'proposal' ? `proposal:${selectedProposalId || ''}` : 'current_project'}
              onChange={(e) => {
                const val = e.target.value;
                if (val.startsWith('proposal:')) {
                  setSelectedTarget('proposal', val.replace('proposal:', ''));
                } else {
                  setSelectedTarget('current_project', null);
                }
              }}
              disabled={isRunning}
              className="text-xs px-2.5 py-1 rounded-md border border-slate-300 dark:border-[#333] bg-white dark:bg-[#1C1C1C] text-slate-800 dark:text-[#E6EDF3] outline-none cursor-pointer focus:border-purple-500 font-medium"
            >
              <option value="current_project">Current Workspace (All Files)</option>
              {availableProposals.map((p, idx) => (
                <option key={p.id + idx} value={`proposal:${p.id}`}>
                  Proposal: {p.description.slice(0, 30)} ({p.status})
                </option>
              ))}
            </select>
          </div>

          <div className="w-px h-4 bg-slate-300 dark:bg-[#2A2A2A]" />

          {/* Run Validation Button */}
          <button
            type="button"
            onClick={handleStartValidation}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-black dark:hover:bg-slate-200 transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Running Validation...</span>
              </>
            ) : currentRun ? (
              <>
                <RotateCw size={13} />
                <span>Rerun Validation</span>
              </>
            ) : (
              <>
                <Play size={13} className="fill-current" />
                <span>Run Validation</span>
              </>
            )}
          </button>

          {/* Cancel Button */}
          {isRunning && (
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 transition-colors cursor-pointer"
            >
              <StopCircle size={13} />
              <span>Cancel</span>
            </button>
          )}

          {/* Severity Filter Toggle */}
          {currentRun && (
            <div className="flex items-center gap-1 ml-2 bg-slate-200/60 dark:bg-[#1C1C1C] p-0.5 rounded-lg text-[11px] border border-slate-300 dark:border-[#30363D]">
              <button
                type="button"
                onClick={() => setFilterSeverity('all')}
                className={cn(
                  "px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer",
                  filterSeverity === 'all' 
                    ? "bg-white dark:bg-[#2A2A2A] text-slate-900 dark:text-white shadow-2xs" 
                    : "text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white"
                )}
              >
                All ({currentRun.errorCount + currentRun.warningCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterSeverity('error')}
                className={cn(
                  "px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1",
                  filterSeverity === 'error' 
                    ? "bg-white dark:bg-[#2A2A2A] text-rose-600 dark:text-rose-400 shadow-2xs" 
                    : "text-slate-500 dark:text-[#8B949E] hover:text-rose-600 dark:hover:text-rose-400"
                )}
              >
                <span>Errors ({currentRun.errorCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterSeverity('warning')}
                className={cn(
                  "px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1",
                  filterSeverity === 'warning' 
                    ? "bg-white dark:bg-[#2A2A2A] text-amber-600 dark:text-amber-400 shadow-2xs" 
                    : "text-slate-500 dark:text-[#8B949E] hover:text-amber-600 dark:hover:text-amber-400"
                )}
              >
                <span>Warnings ({currentRun.warningCount})</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Progress Status Indicator */}
        <div className="flex items-center gap-2">
          <div className={cn("flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border shadow-2xs", statusDisplay.badgeClass)}>
            {statusDisplay.icon}
            <span>Status: {statusDisplay.label}</span>
            {currentRun && currentRun.durationMs !== undefined && (
              <span className="text-[10px] font-mono opacity-80">({currentRun.durationMs}ms)</span>
            )}
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded hover:bg-slate-200/50 dark:hover:bg-[#202020] cursor-pointer"
            >
              <X size={15} />
            </button>
          )}
        </div>

      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950/30 border-b border-rose-200 dark:border-rose-900/50 flex items-center justify-between text-xs text-rose-700 dark:text-rose-400 shrink-0">
          <div className="flex items-center gap-2 truncate">
            <XCircle size={14} className="shrink-0" />
            <span className="truncate">{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Main Body */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-[#2A2A2A]">
        
        {/* Left Subpanel: Validation Checks Breakdown */}
        <div className="w-full md:w-80 shrink-0 flex flex-col overflow-y-auto bg-slate-50/50 dark:bg-[#0D0D0D]">
          <div className="p-3 border-b border-slate-200 dark:border-[#2A2A2A] text-xs font-semibold text-slate-700 dark:text-[#C9D1D9]">
            Validation Checks ({currentRun ? currentRun.checks.length : 5})
          </div>

          <div className="divide-y divide-slate-200/60 dark:divide-[#202020] text-xs">
            {currentRun ? (
              currentRun.checks.map((check, idx) => {
                const isExpanded = expandedCheckIdx === idx;
                const errCount = check.diagnostics.filter(d => d.severity === 'error').length;
                const warnCount = check.diagnostics.filter(d => d.severity === 'warning').length;

                return (
                  <div key={idx} className="p-3 transition-colors hover:bg-slate-100/60 dark:hover:bg-[#161616]">
                    <div 
                      className="flex items-center justify-between cursor-pointer select-none"
                      onClick={() => setExpandedCheckIdx(isExpanded ? null : idx)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {check.status === 'passed' && <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />}
                        {check.status === 'failed' && <XCircle size={15} className="text-rose-500 shrink-0" />}
                        {check.status === 'cancelled' && <AlertTriangle size={15} className="text-amber-500 shrink-0" />}
                        {check.status === 'unsupported' && <Info size={15} className="text-slate-400 shrink-0" />}
                        <span className="font-medium text-slate-800 dark:text-white truncate">
                          {check.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {check.status === 'unsupported' ? (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-[#222] text-slate-500 dark:text-[#888]">
                            Not configured
                          </span>
                        ) : (
                          <>
                            {errCount > 0 && (
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-500">
                                {errCount}
                              </span>
                            )}
                            {warnCount > 0 && (
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500">
                                {warnCount}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 dark:text-[#666] font-mono">
                              {check.durationMs}ms
                            </span>
                          </>
                        )}
                        {isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-2.5 pt-2 border-t border-slate-200/50 dark:border-[#222] text-[11px] text-slate-500 dark:text-[#8B949E] space-y-1.5">
                        <p>{check.message || check.unsupportedReason}</p>
                        {check.unsupportedReason && (
                          <div className="p-2 rounded bg-slate-100 dark:bg-[#1A1A1A] border border-slate-200 dark:border-[#2A2A2A] text-[10px] text-slate-600 dark:text-[#999]">
                            {check.unsupportedReason}
                          </div>
                        )}
                        {check.output && (
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words p-2 rounded bg-slate-100 dark:bg-[#101010] border border-slate-200 dark:border-[#252525] font-mono text-[10px] text-slate-700 dark:text-[#C9D1D9]">{check.output}</pre>
                        )}
                        {check.exitCode !== undefined && <p className="font-mono">Exit code: {check.exitCode ?? 'unavailable'}</p>}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              [
                { name: 'TypeScript Compiler Check', desc: 'Type check project with tsc --noEmit' },
                { name: 'Syntax & Formatting Validation', desc: 'In-memory parse validation for TS/JS/JSON/Py' },
                { name: 'Production Build Verification', desc: 'Verify bundles compile with Vite' },
                { name: 'Unit Test Runner', desc: 'Automated test suite execution (Unsupported/Not Configured)' },
                { name: 'ESLint Code Quality', desc: 'Code quality and style rule verification (Not Configured)' }
              ].map((item, i) => (
                <div key={i} className="p-3">
                  <div className="flex items-center gap-2 text-slate-700 dark:text-[#C9D1D9] font-medium mb-1">
                    <Clock size={13} className="text-slate-400" />
                    <span>{item.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-[#666] ml-5">{item.desc}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Center / Main Scrollable Area: Structured Diagnostic Results */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#080808]">
          <div className="p-3 border-b border-slate-200 dark:border-[#2A2A2A] flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800 dark:text-[#C9D1D9]">
              Diagnostic Results ({allDiagnostics.length})
            </span>
            <span className="text-[11px] text-slate-400 dark:text-[#777]">
              {selectedTarget === 'proposal' ? 'Target: Proposal Preview' : 'Target: Workspace Code'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#1C1C1C]">
            {allDiagnostics.length > 0 ? (
              allDiagnostics.map((diag) => {
                const isSelected = selectedDiagnostic?.id === diag.id;

                return (
                  <div
                    key={diag.id}
                    className={cn(
                      "p-3.5 transition-colors cursor-pointer border-l-2 text-xs",
                      isSelected 
                        ? "bg-purple-50/70 dark:bg-[#1A1A24] border-l-purple-600 dark:border-l-purple-400" 
                        : "hover:bg-slate-50 dark:hover:bg-[#121212] border-l-transparent"
                    )}
                    onClick={() => setSelectedDiagnostic(diag)}
                  >
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {diag.severity === 'error' ? (
                          <XCircle size={15} className="text-rose-500 shrink-0" />
                        ) : (
                          <AlertTriangle size={15} className="text-amber-500 shrink-0" />
                        )}
                        <span className={cn(
                          "text-[10px] font-bold uppercase px-1.5 py-0.2 rounded font-mono shrink-0",
                          diag.severity === 'error' 
                            ? "bg-rose-500/10 text-rose-500" 
                            : "bg-amber-500/10 text-amber-500"
                        )}>
                          {diag.severity}
                        </span>
                        {diag.filePath && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJumpToFile(diag.filePath);
                            }}
                            className="text-xs font-mono font-medium text-blue-600 dark:text-[#79C0FF] hover:underline flex items-center gap-1 truncate cursor-pointer"
                            title="Open file in editor"
                          >
                            <FileCode size={13} className="shrink-0" />
                            <span className="truncate">{diag.filePath}</span>
                            {diag.line && <span className="text-slate-400">:{diag.line}:{diag.column || 1}</span>}
                          </button>
                        )}
                      </div>

                      {/* Explain with AI Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExplain(diag);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 rounded-md transition-colors cursor-pointer shrink-0"
                      >
                        <Sparkles size={12} />
                        <span>Explain with AI</span>
                      </button>
                    </div>

                    <div className="text-xs text-slate-800 dark:text-[#E6EDF3] leading-relaxed font-mono whitespace-pre-wrap pl-6">
                      {diag.message}
                    </div>

                    {diag.raw && diag.raw !== diag.message && (
                      <div className="mt-1.5 text-[11px] text-slate-400 dark:text-[#777] font-mono pl-6 truncate">
                        {diag.raw}
                      </div>
                    )}
                  </div>
                );
              })
            ) : currentRun ? (
              <div className="p-8 text-center text-slate-500 dark:text-[#8B949E] flex flex-col items-center justify-center h-full">
                <CheckCircle2 size={32} className="text-emerald-500 mb-2" />
                <p className="font-semibold text-sm text-slate-800 dark:text-white">Validation Clean</p>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  0 diagnostic errors or warnings found in this validation run.
                </p>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 dark:text-[#8B949E] flex flex-col items-center justify-center h-full">
                <FileCode size={32} className="text-slate-400 dark:text-[#444] mb-2" />
                <p className="font-semibold text-sm text-slate-700 dark:text-[#BBB]">Validation Ready</p>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  Click <strong>Run Validation</strong> above to perform static typechecking, syntax parsing, and build verification.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* AI Error Explanation Drawer (Right Column) */}
        {(isExplaining || explanation || explanationError) && (
          <div className="w-full md:w-96 shrink-0 border-t md:border-t-0 md:border-l border-slate-200 dark:border-[#2A2A2A] bg-purple-50/20 dark:bg-[#100F17] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-[#2A2A2A] flex items-center justify-between bg-slate-100/50 dark:bg-[#161520]">
              <div className="flex items-center gap-2 text-xs font-semibold text-purple-700 dark:text-purple-300">
                <Sparkles size={14} />
                <span>FLOAT AI Diagnostic Explanation</span>
              </div>
              <button
                type="button"
                onClick={clearExplanation}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded hover:bg-slate-200/50 dark:hover:bg-[#252535] cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {isExplaining ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500 dark:text-[#8B949E] space-y-3">
                  <Loader2 size={24} className="animate-spin text-purple-600 dark:text-purple-400" />
                  <p className="font-medium text-xs">Analyzing diagnostic with Gemini...</p>
                </div>
              ) : explanationError ? (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-lg text-rose-600 dark:text-rose-400">
                  <p className="font-semibold mb-1">Explanation Error</p>
                  <p>{explanationError}</p>
                </div>
              ) : explanation ? (
                <div className="space-y-4">
                  <div className="p-3.5 bg-white dark:bg-[#161622] rounded-xl border border-slate-200 dark:border-[#282638] shadow-2xs space-y-2">
                    <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>Explanation & Root Cause</span>
                    </h4>
                    <div className="text-slate-700 dark:text-[#C9D1D9] leading-relaxed whitespace-pre-wrap">
                      {explanation.explanation}
                    </div>
                  </div>

                  {explanation.suggestedSteps && explanation.suggestedSteps.length > 0 && (
                    <div className="p-3.5 bg-white dark:bg-[#161622] rounded-xl border border-slate-200 dark:border-[#282638] shadow-2xs space-y-2">
                      <h4 className="font-semibold text-slate-900 dark:text-white">
                        Recommended Steps
                      </h4>
                      <ul className="space-y-1.5 list-disc pl-4 text-slate-600 dark:text-[#A0AEC0]">
                        {explanation.suggestedSteps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
export default ValidationPanel;
