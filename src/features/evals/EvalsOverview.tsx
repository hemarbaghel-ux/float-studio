import React from 'react';
import { useEvalStore } from '../../store/evalStore';
import { 
  Play, CheckSquare, Layers, Clock, AlertTriangle, 
  CheckCircle2, Coins, BarChart3, ArrowRight, ShieldCheck, 
  Activity, Sparkles 
} from 'lucide-react';
import { INITIAL_MODELS } from '../ai/registry';

interface EvalsOverviewProps {
  onNewEval: () => void;
  onNewTask: () => void;
  onRunBenchmark: () => void;
}

export function EvalsOverview({ onNewEval, onNewTask, onRunBenchmark }: EvalsOverviewProps) {
  const { runs, tasks, benchmarks, setSelectedRun, setActiveTab } = useEvalStore();

  const completedRuns = runs.filter(r => r.status === 'completed' || r.status === 'Completed');
  const failedRuns = runs.filter(r => r.status === 'failed' || r.status === 'Failed');
  const runningRuns = runs.filter(r => r.status === 'running' || r.status === 'queued' || r.status === 'Running');

  const hasData = completedRuns.length > 0;

  // Real aggregations strictly from completed runs (no fake numbers)
  const avgScore = hasData 
    ? Math.round(completedRuns.reduce((acc, r) => acc + (r.finalScore ?? r.score ?? 0), 0) / completedRuns.length)
    : null;

  const passedTestsRuns = completedRuns.filter(r => r.testsPassed).length;
  const avgTestPassRate = hasData
    ? Math.round((passedTestsRuns / completedRuns.length) * 100)
    : null;

  const avgDuration = hasData
    ? Number((completedRuns.reduce((acc, r) => acc + (r.duration ?? (r.durationMs ? r.durationMs / 1000 : 0)), 0) / completedRuns.length).toFixed(1))
    : null;

  const avgTokens = hasData
    ? Math.round(completedRuns.reduce((acc, r) => acc + (r.totalTokens ?? 0), 0) / completedRuns.length)
    : null;

  const avgCost = hasData
    ? Number((completedRuns.reduce((acc, r) => acc + (r.actualCost ?? r.estimatedCost ?? 0), 0) / completedRuns.length).toFixed(5))
    : null;

  const confidenceScore = completedRuns.length >= 10 ? 'High' : completedRuns.length >= 3 ? 'Medium' : 'Limited evaluation data';

  return (
    <div className="space-y-8">
      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <StatCard
          label="Total Evaluations"
          value={runs.length.toString()}
          subtext={`${completedRuns.length} completed, ${runningRuns.length} active`}
          icon={Activity}
        />
        <StatCard
          label="Avg Score"
          value={avgScore !== null ? `${avgScore}/100` : 'No data yet'}
          subtext={hasData ? `${completedRuns.filter(r => (r.finalScore ?? r.score ?? 0) >= 70).length} passed benchmark` : 'Awaiting completed runs'}
          icon={ShieldCheck}
          highlight={avgScore !== null ? (avgScore >= 70 ? 'text-emerald-400' : 'text-amber-400') : undefined}
        />
        <StatCard
          label="Test Pass Rate"
          value={avgTestPassRate !== null ? `${avgTestPassRate}%` : 'No data yet'}
          subtext={hasData ? `${passedTestsRuns} of ${completedRuns.length} suites` : 'Unit tests verified'}
          icon={CheckCircle2}
        />
        <StatCard
          label="Avg Latency"
          value={avgDuration !== null ? `${avgDuration}s` : 'No data yet'}
          subtext={hasData ? `Generation & execution` : 'Measured execution time'}
          icon={Clock}
        />
        <StatCard
          label="Avg Est. Cost"
          value={avgCost !== null ? `$${avgCost}` : 'No data yet'}
          subtext={confidenceScore}
          icon={Coins}
        />
      </div>

      {/* Quick Launch & Guidance Banner */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-purple-950/40 via-[#161B22] to-[#0D1117] border border-purple-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-900/60 border border-purple-600 text-purple-200">
              Evidence-Based Evals
            </span>
            <span className="text-xs text-[#8B949E]">
              {tasks.length} standard coding tasks available &bull; {benchmarks.length} curated suites
            </span>
          </div>
          <h2 className="text-base font-semibold text-white mt-1.5">
            Test models against real test assertions, syntax parsers, and typecheckers
          </h2>
          <p className="text-xs text-[#8B949E] mt-1 max-w-2xl">
            FLOAT Evals executes tasks in isolated sandboxes. Scores, diffs, tool traces, and costs are derived directly from actual execution without fabricated benchmarks.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={onNewEval}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-sm"
          >
            <Play size={14} className="fill-current" />
            Launch Evaluation
          </button>
          <button
            onClick={onRunBenchmark}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            <Layers size={14} />
            Run Suite
          </button>
        </div>
      </div>

      {/* Recent Evaluations Table */}
      <div className="border border-[#30363D] rounded-xl bg-[#161B22] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#30363D] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Recent Evaluation Runs</h3>
            <p className="text-xs text-[#8B949E] mt-0.5">
              Live and historical execution records with score breakdowns and captured diffs
            </p>
          </div>
          {runs.length > 0 && (
            <button
              onClick={() => setActiveTab('runs')}
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium transition-colors cursor-pointer"
            >
              View All Runs <ArrowRight size={14} />
            </button>
          )}
        </div>

        {runs.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 bg-[#0D1117] rounded-full flex items-center justify-center mb-3 border border-[#30363D]">
              <BarChart3 className="text-[#8B949E]" size={22} />
            </div>
            <h4 className="text-sm font-semibold text-white mb-1">No evaluation data yet</h4>
            <p className="text-xs text-[#8B949E] max-w-md mb-4">
              Start an evaluation to test GPT-4o, Claude 3.5 Sonnet, Gemini 2.0, or your custom agents on real Python coding and debugging tasks.
            </p>
            <button
              onClick={onNewEval}
              className="px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              Start First Evaluation
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#30363D] bg-[#0D1117]/60 text-[#8B949E]">
                  <th className="py-3 px-4 font-medium">Task</th>
                  <th className="py-3 px-4 font-medium">Model</th>
                  <th className="py-3 px-4 font-medium">Agent</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Score</th>
                  <th className="py-3 px-4 font-medium">Tests</th>
                  <th className="py-3 px-4 font-medium">Duration</th>
                  <th className="py-3 px-4 font-medium">Cost</th>
                  <th className="py-3 px-4 font-medium text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363D]">
                {runs.slice(0, 6).map(run => {
                  const modelMeta = INITIAL_MODELS.find(m => m.id === run.modelId);
                  const isRunning = run.status === 'running' || run.status === 'queued' || run.status === 'Running';
                  const isPassed = (run.status === 'completed' || run.status === 'Completed') && (run.finalScore ?? run.score ?? 0) >= 70;

                  return (
                    <tr 
                      key={run.id}
                      onClick={() => setSelectedRun(run)}
                      className="hover:bg-[#21262D]/50 transition-colors cursor-pointer text-[#C9D1D9]"
                    >
                      <td className="py-3 px-4 font-medium text-white max-w-[200px] truncate">
                        {run.taskName || run.taskId}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[#8B949E]">{modelMeta?.displayName || run.modelId}</span>
                      </td>
                      <td className="py-3 px-4 text-[#8B949E]">
                        {run.agentId}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          isRunning ? 'bg-amber-950/60 text-amber-300 border border-amber-800' :
                          isPassed ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' :
                          'bg-red-950/60 text-red-300 border border-red-800'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            isRunning ? 'bg-amber-400 animate-pulse' :
                            isPassed ? 'bg-emerald-400' : 'bg-red-400'
                          }`} />
                          <span className="capitalize">{run.status}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold">
                        {run.finalScore !== undefined ? (
                          <span className={run.finalScore >= 70 ? 'text-emerald-400' : 'text-red-400'}>
                            {run.finalScore}/100
                          </span>
                        ) : run.score !== undefined ? (
                          <span className={run.score >= 70 ? 'text-emerald-400' : 'text-red-400'}>
                            {run.score}/100
                          </span>
                        ) : (
                          <span className="text-[#8B949E]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {run.testsPassed !== undefined ? (
                          <span className={run.testsPassed ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                            {run.testsPassedCount !== undefined ? `${run.testsPassedCount}/${run.testCount || 1}` : (run.testsPassed ? 'Passed' : 'Failed')}
                          </span>
                        ) : (
                          <span className="text-[#8B949E]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#8B949E] font-mono">
                        {run.duration !== undefined ? `${run.duration}s` : run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
                      </td>
                      <td className="py-3 px-4 text-[#8B949E] font-mono">
                        {run.estimatedCost !== undefined ? `$${run.estimatedCost.toFixed(5)}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-purple-400 hover:text-purple-300 font-medium">
                          Inspect &rarr;
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  subtext, 
  icon: Icon,
  highlight 
}: { 
  label: string; 
  value: string; 
  subtext: string; 
  icon: any;
  highlight?: string;
}) {
  return (
    <div className="border border-[#30363D] bg-[#161B22] rounded-xl p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between text-[#8B949E] mb-2">
        <span className="text-xs font-medium">{label}</span>
        <Icon size={16} className="text-[#8B949E]" />
      </div>
      <div>
        <div className={`text-xl font-bold tracking-tight text-white ${highlight || ''}`}>
          {value}
        </div>
        <div className="text-[11px] text-[#8B949E] mt-1 truncate">
          {subtext}
        </div>
      </div>
    </div>
  );
}
