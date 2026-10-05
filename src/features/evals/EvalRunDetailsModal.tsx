import React, { useState } from 'react';
import { 
  X, RotateCcw, AlertTriangle, CheckCircle2, Clock, 
  Coins, Terminal, FileCode, CheckSquare, Shield, 
  Layers, UserCheck, Play, Download, StopCircle, ArrowUpRight
} from 'lucide-react';
import { DiffEditor } from '@monaco-editor/react';
import { EvalRun, TestResult, HumanReview } from '../../types/evals';
import { useEvalStore } from '../../store/evalStore';
import { auth } from '../../lib/firebase';

interface EvalRunDetailsModalProps {
  run: EvalRun;
  onClose: () => void;
}

export function EvalRunDetailsModal({ run, onClose }: EvalRunDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'task' | 'metrics' | 'changes' | 'validation' | 'trace' | 'review'>('overview');
  const [selectedChangeIdx, setSelectedChangeIdx] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Human Review Form State
  const [codeQuality, setCodeQuality] = useState(85);
  const [architecture, setArchitecture] = useState(85);
  const [maintainability, setMaintainability] = useState(85);
  const [instructionFollowing, setInstructionFollowing] = useState(90);
  const [correctness, setCorrectness] = useState(85);
  const [reviewComments, setReviewComments] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const { retryRun, cancelRun, submitReview, tasks } = useEvalStore();
  const task = tasks.find(t => t.id === run.taskId);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await retryRun(run.id);
    } catch (e) {
      console.error('Failed to retry run:', e);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await cancelRun(run.id);
    } catch (e) {
      console.error('Failed to cancel run:', e);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await submitReview({
        runId: run.id,
        ownerId: auth.currentUser?.uid || 'anonymous',
        reviewerId: auth.currentUser?.email || 'User Reviewer',
        codeQualityScore: Number(codeQuality),
        architectureScore: Number(architecture),
        maintainabilityScore: Number(maintainability),
        instructionFollowingScore: Number(instructionFollowing),
        correctnessScore: Number(correctness),
        comments: reviewComments
      });
      setReviewSubmitted(true);
    } catch (err) {
      console.error('Failed to submit review:', err);
    }
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eval-run-${run.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const changes = run.changeSet?.changes || [];
  const selectedChange = changes[selectedChangeIdx];
  const isRunning = run.status === 'running' || run.status === 'queued' || run.status === 'Running';
  const hasScore = typeof run.finalScore === 'number' || typeof run.score === 'number';
  const isSuccess = (run.status === 'completed' || run.status === 'Completed') && hasScore && (run.finalScore ?? run.score ?? 0) >= 70;
  const isUnscoredCompletion = (run.status === 'completed' || run.status === 'Completed') && !hasScore;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 sm:p-6 overflow-hidden">
      <div className="bg-[#0D1117] border border-[#30363D] rounded-xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl overflow-hidden text-[#C9D1D9]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#30363D] bg-[#161B22] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${
              isRunning ? 'bg-amber-400 animate-pulse' :
              isSuccess ? 'bg-emerald-400' : isUnscoredCompletion ? 'bg-slate-400' : 'bg-red-400'
            }`} />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-tight">
                  {run.taskName || task?.name || `Evaluation Run ${run.id.slice(0, 8)}`}
                </h2>
                <span className="text-xs px-2 py-0.5 rounded bg-[#21262D] border border-[#30363D] text-[#8B949E]">
                  {run.modelId}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-[#21262D] border border-[#30363D] text-[#8B949E]">
                  Agent: {run.agentId}
                </span>
              </div>
              <p className="text-xs text-[#8B949E] mt-0.5 font-mono">ID: {run.id}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRunning && (
              <button
                onClick={handleCancel}
                disabled={isCancelling}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-200 rounded-md transition-colors"
              >
                <StopCircle size={14} />
                {isCancelling ? 'Cancelling...' : 'Cancel Run'}
              </button>
            )}

            {!isRunning && (
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] text-white rounded-md transition-colors"
              >
                <RotateCcw size={14} className={isRetrying ? 'animate-spin' : ''} />
                {isRetrying ? 'Retrying...' : 'Retry Run'}
              </button>
            )}

            <button
              onClick={handleExportJson}
              title="Export Run as JSON"
              className="p-1.5 text-[#8B949E] hover:text-white hover:bg-[#21262D] rounded-md transition-colors"
            >
              <Download size={16} />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-[#8B949E] hover:text-white hover:bg-[#21262D] rounded-md transition-colors ml-2"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Top Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 px-6 py-3 bg-[#090D13] border-b border-[#21262D] text-xs">
          <div>
            <div className="text-[#8B949E]">Final Score</div>
            <div className="text-sm font-semibold text-white mt-0.5">
              {run.finalScore !== undefined ? `${run.finalScore}/100` : run.score !== undefined ? `${run.score}/100` : 'Evaluating...'}
            </div>
          </div>
          <div>
            <div className="text-[#8B949E]">Status</div>
            <div className="capitalize font-medium mt-0.5 text-white">
              {run.status}
            </div>
          </div>
          <div>
            <div className="text-[#8B949E]">Duration</div>
            <div className="font-medium mt-0.5 text-white">
              {run.duration !== undefined ? `${run.duration}s` : run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
            </div>
          </div>
          <div>
            <div className="text-[#8B949E]">Token Usage</div>
            <div className="font-medium mt-0.5 text-white">
              {run.totalTokens ? `${run.totalTokens.toLocaleString()} tokens` : '—'}
            </div>
          </div>
          <div>
            <div className="text-[#8B949E]">Estimated Cost</div>
            <div className="font-medium mt-0.5 text-white">
              {run.estimatedCost !== undefined ? `$${run.estimatedCost.toFixed(5)}` : '—'}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#30363D] bg-[#161B22] px-6 gap-1 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2.5 px-3 border-b-2 transition-colors ${
              activeTab === 'overview' ? 'border-[#7C3AED] text-white' : 'border-transparent text-[#8B949E] hover:text-white'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('task')}
            className={`py-2.5 px-3 border-b-2 transition-colors ${
              activeTab === 'task' ? 'border-[#7C3AED] text-white' : 'border-transparent text-[#8B949E] hover:text-white'
            }`}
          >
            Task & Prompt
          </button>
          <button
            onClick={() => setActiveTab('metrics')}
            className={`py-2.5 px-3 border-b-2 transition-colors ${
              activeTab === 'metrics' ? 'border-[#7C3AED] text-white' : 'border-transparent text-[#8B949E] hover:text-white'
            }`}
          >
            Score Breakdown
          </button>
          <button
            onClick={() => setActiveTab('changes')}
            className={`py-2.5 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'changes' ? 'border-[#7C3AED] text-white' : 'border-transparent text-[#8B949E] hover:text-white'
            }`}
          >
            Diff & Patch
            {changes.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#238636] text-white">
                {changes.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('validation')}
            className={`py-2.5 px-3 border-b-2 transition-colors ${
              activeTab === 'validation' ? 'border-[#7C3AED] text-white' : 'border-transparent text-[#8B949E] hover:text-white'
            }`}
          >
            Validation Pipeline
          </button>
          <button
            onClick={() => setActiveTab('trace')}
            className={`py-2.5 px-3 border-b-2 transition-colors ${
              activeTab === 'trace' ? 'border-[#7C3AED] text-white' : 'border-transparent text-[#8B949E] hover:text-white'
            }`}
          >
            Agent & Tool Trace
          </button>
          <button
            onClick={() => setActiveTab('review')}
            className={`py-2.5 px-3 border-b-2 transition-colors ${
              activeTab === 'review' ? 'border-[#7C3AED] text-white' : 'border-transparent text-[#8B949E] hover:text-white'
            }`}
          >
            Human Review
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="flex flex-col gap-6">
              {/* Error banner if failed */}
              {run.errorMessage && (
                <div className="p-4 rounded-lg bg-red-950/40 border border-red-800 text-red-200 text-xs flex items-start gap-3">
                  <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={16} />
                  <div>
                    <div className="font-semibold text-red-300">
                      {run.errorType || 'Evaluation Failure'}
                    </div>
                    <div className="mt-1">{run.errorMessage}</div>
                  </div>
                </div>
              )}

              {/* Status & Validation Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-[#161B22] border border-[#30363D] rounded-lg">
                  <div className="text-xs text-[#8B949E]">Test Assertions</div>
                  <div className="text-lg font-bold text-white mt-1 flex items-center gap-2">
                    {run.testsPassed === undefined ? (
                      <span className="text-slate-400">Not Run</span>
                    ) : run.testsPassed ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 size={18} /> Passed ({run.testsPassedCount ?? 'All'})
                      </span>
                    ) : (
                      <span className="text-red-400 flex items-center gap-1">
                        <AlertTriangle size={18} /> {run.testsFailedCount || 1} Failed
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#8B949E] mt-1">
                    {run.testCount ? `${run.testCount} total tests executed` : 'No project tests were executed'}
                  </div>
                </div>

                <div className="p-4 bg-[#161B22] border border-[#30363D] rounded-lg">
                  <div className="text-xs text-[#8B949E]">Code Compilation / Build</div>
                  <div className="text-lg font-bold text-white mt-1">
                    {run.buildPassed === undefined ? (
                      <span className="text-slate-400">Not Run</span>
                    ) : run.buildPassed ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 size={18} /> Build Passed
                      </span>
                    ) : (
                      <span className="text-red-400 flex items-center gap-1">
                        <AlertTriangle size={18} /> Build Failed
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#8B949E] mt-1">
                    {run.validationResults?.build?.errorSummary || 'No build command was executed'}
                  </div>
                </div>

                <div className="p-4 bg-[#161B22] border border-[#30363D] rounded-lg">
                <div className="text-xs text-[#8B949E]">Basic Patch Structure</div>
                  <div className="text-lg font-bold text-white mt-1">
                    {run.patchValid ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 size={18} /> Delimiters Balanced
                      </span>
                    ) : (
                      <span className="text-red-400 flex items-center gap-1">
                        <AlertTriangle size={18} /> Structure Check Failed
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#8B949E] mt-1">
                    {run.filesChanged || 0} files proposed · basic delimiter check only
                  </div>
                </div>
              </div>

              {/* Execution Activity Logs */}
              <div className="border border-[#30363D] rounded-lg bg-[#161B22] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#30363D] text-xs font-semibold text-white flex items-center gap-2">
                  <Terminal size={14} className="text-[#8B949E]" />
                  Execution Timeline & Evidence
                </div>
                <div className="p-4 space-y-2 text-xs font-mono">
                  {run.activity && run.activity.length > 0 ? (
                    run.activity.map((act, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-[#C9D1D9]">
                        <span className="text-[#8B949E] shrink-0 text-[10px]">
                          {act.timestamp ? new Date(act.timestamp).toLocaleTimeString() : `Step ${i + 1}`}
                        </span>
                        <span className={
                          act.type === 'error' ? 'text-red-400 font-medium' :
                          act.type === 'success' ? 'text-emerald-400 font-medium' :
                          act.type === 'warning' ? 'text-amber-400' : 'text-[#8B949E]'
                        }>
                          {act.message}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[#8B949E]">No activity logs captured.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'task' && (
            <div className="flex flex-col gap-6">
              <div className="p-4 bg-[#161B22] border border-[#30363D] rounded-lg">
                <h3 className="text-sm font-semibold text-white mb-2">Prompt Sent to Model</h3>
                <pre className="p-3 bg-[#090D13] border border-[#30363D] rounded text-xs font-mono text-[#C9D1D9] whitespace-pre-wrap">
                  {task?.prompt || 'Task prompt loaded dynamically.'}
                </pre>
              </div>

              <div className="p-4 bg-[#161B22] border border-[#30363D] rounded-lg">
                <h3 className="text-sm font-semibold text-white mb-2">Expected Behavior & Validation Rules</h3>
                <p className="text-xs text-[#8B949E] leading-relaxed">
                  {task?.expectedBehavior || 'Must satisfy unit tests, compile cleanly, and avoid forbidden imports.'}
                </p>
              </div>

              {task?.files && task.files.length > 0 && (
                <div className="p-4 bg-[#161B22] border border-[#30363D] rounded-lg">
                  <h3 className="text-sm font-semibold text-white mb-2">Initial Workspace Snapshot Files</h3>
                  <div className="flex flex-col gap-3">
                    {task.files.map((f, i) => (
                      <div key={i} className="border border-[#30363D] rounded overflow-hidden">
                        <div className="px-3 py-1.5 bg-[#21262D] text-xs font-mono text-white flex items-center gap-2">
                          <FileCode size={13} className="text-[#8B949E]" />
                          {f.path}
                        </div>
                        <pre className="p-3 bg-[#090D13] text-xs font-mono text-[#8B949E] overflow-x-auto max-h-48">
                          {f.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'metrics' && (
            <div className="flex flex-col gap-6">
              <div className="p-4 bg-[#161B22] border border-[#30363D] rounded-lg">
                <h3 className="text-sm font-semibold text-white mb-4">Evidence-based Scoring Breakdown (0 - 100)</h3>
                
                {run.scoreBreakdown ? (
                  <div className="space-y-4 text-xs">
                    <ScoreBar label="Task Completion" score={run.scoreBreakdown.taskCompletion} weight={25} />
                    <ScoreBar label="Test Success Rate" score={run.scoreBreakdown.testSuccess} weight={25} />
                    <ScoreBar label="Build & Compilation" score={run.scoreBreakdown.buildSuccess} weight={15} />
                    <ScoreBar label="Type Safety" score={run.scoreBreakdown.typeSafety} weight={10} />
                    <ScoreBar label="Patch Validity" score={run.scoreBreakdown.patchValidity} weight={10} />
                    <ScoreBar label="Code Quality & Style" score={run.scoreBreakdown.codeQuality} weight={5} />
                    <ScoreBar label="Regression Safety" score={run.scoreBreakdown.regressionSafety} weight={5} />
                    <ScoreBar label="Agent & Tool Efficiency" score={run.scoreBreakdown.agentEfficiency} weight={5} />

                    <div className="pt-4 border-t border-[#30363D] flex justify-between items-center text-sm font-semibold text-white">
                      <span>Normalized Weighted Score</span>
                      <span className="text-base text-purple-400">{run.scoreBreakdown.finalScore} / 100</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[#8B949E]">
                    No detailed breakdown recorded for this run. Overall score: {run.score || 0}/100.
                  </div>
                )}
              </div>

              {/* Latency Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-[#161B22] border border-[#30363D] rounded-lg text-xs">
                  <div className="text-[#8B949E]">Time to First Token (TTFT)</div>
                  <div className="text-lg font-semibold text-white mt-1">
                    {run.timeToFirstToken ? `${run.timeToFirstToken} ms` : '—'}
                  </div>
                  <div className="text-[#8B949E] mt-1">Network & prompt ingestion latency</div>
                </div>

                <div className="p-4 bg-[#161B22] border border-[#30363D] rounded-lg text-xs">
                  <div className="text-[#8B949E]">Generation Latency</div>
                  <div className="text-lg font-semibold text-white mt-1">
                    {run.generationLatency ? `${(run.generationLatency / 1000).toFixed(2)} s` : '—'}
                  </div>
                  <div className="text-[#8B949E] mt-1">Time spent producing tokens</div>
                </div>

                <div className="p-4 bg-[#161B22] border border-[#30363D] rounded-lg text-xs">
                  <div className="text-[#8B949E]">Cost Efficiency</div>
                  <div className="text-lg font-semibold text-white mt-1">
                    {run.estimatedCost !== undefined ? `$${run.estimatedCost.toFixed(5)}` : '—'}
                  </div>
                  <div className="text-[#8B949E] mt-1">Calculated via ModelPricingRegistry</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'changes' && (
            <div className="flex flex-col gap-4 h-full">
              {changes.length === 0 ? (
                <div className="p-12 text-center border border-[#30363D] rounded-lg bg-[#161B22] text-[#8B949E] text-sm">
                  No patch was generated in this evaluation run.
                </div>
              ) : (
                <div className="flex flex-col h-[520px] border border-[#30363D] rounded-lg overflow-hidden bg-[#0D1117]">
                  {/* File Selector Tabs */}
                  <div className="flex items-center gap-1 px-3 py-2 bg-[#161B22] border-b border-[#30363D] overflow-x-auto text-xs font-mono">
                    {changes.map((c, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedChangeIdx(idx)}
                        className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
                          selectedChangeIdx === idx 
                            ? 'bg-[#21262D] text-white border border-[#30363D]' 
                            : 'text-[#8B949E] hover:text-white'
                        }`}
                      >
                        <FileCode size={13} />
                        <span>{c.path}</span>
                        <span className="text-[10px] text-emerald-400">+{c.operation}</span>
                      </button>
                    ))}
                  </div>

                  {/* Monaco DiffEditor */}
                  <div className="flex-1 w-full h-full">
                    {selectedChange && (
                      <DiffEditor
                        height="100%"
                        language={selectedChange.path.endsWith('.py') ? 'python' : 'typescript'}
                        theme="vs-dark"
                        original={selectedChange.originalContent || ''}
                        modified={selectedChange.proposedContent || ''}
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 12,
                          renderSideBySide: true,
                          scrollBeyondLastLine: false
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'validation' && (
            <div className="flex flex-col gap-6">
              {/* Test Assertions */}
              <div className="border border-[#30363D] rounded-lg bg-[#161B22] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#30363D] text-xs font-semibold text-white flex items-center justify-between">
                  <span>Unit Test Results ({run.validationResults?.tests?.length || 0})</span>
                  <span className="text-[#8B949E] font-normal">{run.validationResults?.tests?.length ? 'Recorded test execution' : 'No project tests were run'}</span>
                </div>
                <div className="divide-y divide-[#30363D]">
                  {run.validationResults?.tests && run.validationResults.tests.length > 0 ? (
                    run.validationResults.tests.map((t, idx) => (
                      <div key={idx} className="p-3 text-xs flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {t.status === 'Passed' ? (
                              <CheckCircle2 size={15} className="text-emerald-400" />
                            ) : (
                              <AlertTriangle size={15} className="text-red-400" />
                            )}
                            <span className="font-mono text-white font-medium">{t.name}</span>
                          </div>
                          {t.failureReason && (
                            <div className="text-red-400 font-mono text-[11px] pl-6">
                              {t.failureReason}
                            </div>
                          )}
                        </div>
                        <span className="text-[#8B949E] font-mono text-[11px]">{t.durationMs}ms</span>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-xs text-[#8B949E]">No individual tests executed.</div>
                  )}
                </div>
              </div>

              {/* Build Command Output */}
              {run.validationResults?.build && (
                <div className="border border-[#30363D] rounded-lg bg-[#161B22] overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[#30363D] text-xs font-semibold text-white flex items-center justify-between">
                    <span className="font-mono">{run.validationResults.build.command}</span>
                    <span className={`text-[11px] font-bold ${
                      run.validationResults.build.status === 'Not Run' ? 'text-slate-400' : run.validationResults.build.exitCode === 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {run.validationResults.build.status === 'Not Run' ? 'Not Run' : `Exit Code: ${run.validationResults.build.exitCode} (${run.validationResults.build.status})`}
                    </span>
                  </div>
                  <pre className="p-3 bg-[#090D13] text-xs font-mono text-[#C9D1D9] whitespace-pre-wrap">
                    {run.validationResults.build.stdout || run.validationResults.build.stderr || 'No output.'}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeTab === 'trace' && (
            <div className="flex flex-col gap-6">
              {/* Agent Steps */}
              <div className="border border-[#30363D] rounded-lg bg-[#161B22] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#30363D] text-xs font-semibold text-white">
                  Agent Orchestration Steps ({run.agentTrace?.length || 0})
                </div>
                <div className="p-4 space-y-4 text-xs">
                  {run.agentTrace && run.agentTrace.length > 0 ? (
                    run.agentTrace.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-[#21262D] border border-[#30363D] flex items-center justify-center font-bold text-white text-[11px] shrink-0">
                          {step.stepNumber}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{step.phase}</span>
                            <span className="text-[10px] text-[#8B949E]">
                              {new Date(step.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-[#C9D1D9] mt-0.5">{step.message}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-[#8B949E]">No agent trace recorded.</div>
                  )}
                </div>
              </div>

              {/* Tool Invocations */}
              <div className="border border-[#30363D] rounded-lg bg-[#161B22] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#30363D] text-xs font-semibold text-white">
                  Tool Invocations & Execution Latency ({run.toolTrace?.length || 0})
                </div>
                <div className="divide-y divide-[#30363D] text-xs font-mono">
                  {run.toolTrace && run.toolTrace.length > 0 ? (
                    run.toolTrace.map((tool, idx) => (
                      <div key={idx} className="p-3 flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-purple-400 font-semibold">{tool.toolName}</span>
                            <span className="text-[#8B949E] text-[11px]">{tool.durationMs}ms</span>
                          </div>
                          <div className="text-[#8B949E] text-[11px]">
                            args: {JSON.stringify(tool.arguments)}
                          </div>
                        </div>
                        <span className={`text-[11px] font-bold ${tool.success ? 'text-emerald-400' : 'text-red-400'}`}>
                          {tool.success ? 'Success' : 'Error'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-[#8B949E] font-sans">No tools invoked directly.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'review' && (
            <div className="flex flex-col gap-6 max-w-xl mx-auto">
              <div className="p-4 bg-[#161B22] border border-[#30363D] rounded-lg">
                <h3 className="text-sm font-semibold text-white mb-1">Human Evaluation Review</h3>
                <p className="text-xs text-[#8B949E] mb-4">
                  Assess code quality, architecture, and maintainability to calibrate model performance alongside automated checks.
                </p>

                {reviewSubmitted ? (
                  <div className="p-4 rounded bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs">
                    Review submitted successfully! Automated score calibrated.
                  </div>
                ) : (
                  <form onSubmit={handleSubmitReview} className="space-y-4 text-xs">
                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="font-medium text-white">Code Quality ({codeQuality}/100)</label>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={codeQuality}
                        onChange={(e) => setCodeQuality(Number(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="font-medium text-white">Architecture & Design ({architecture}/100)</label>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={architecture}
                        onChange={(e) => setArchitecture(Number(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="font-medium text-white">Maintainability ({maintainability}/100)</label>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={maintainability}
                        onChange={(e) => setMaintainability(Number(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="font-medium text-white">Instruction Following ({instructionFollowing}/100)</label>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={instructionFollowing}
                        onChange={(e) => setInstructionFollowing(Number(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                    </div>

                    <div>
                      <label className="font-medium text-white block mb-1">Review Comments</label>
                      <textarea
                        value={reviewComments}
                        onChange={(e) => setReviewComments(e.target.value)}
                        placeholder="Notes on clean code, edge cases handled, or subtle flaws..."
                        rows={3}
                        className="w-full p-2.5 bg-[#090D13] border border-[#30363D] rounded text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded font-medium transition-colors"
                    >
                      Submit Human Evaluation
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, score, weight }: { label: string; score: number; weight: number }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[#C9D1D9] font-medium">{label} ({weight}%)</span>
        <span className={`font-mono font-bold ${
          score >= 80 ? 'text-emerald-400' :
          score >= 50 ? 'text-amber-400' : 'text-red-400'
        }`}>
          {score} / 100
        </span>
      </div>
      <div className="w-full h-1.5 bg-[#21262D] rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full ${
            score >= 80 ? 'bg-emerald-500' :
            score >= 50 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
