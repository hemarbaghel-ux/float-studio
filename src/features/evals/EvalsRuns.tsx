import React, { useState, useMemo } from 'react';
import { useEvalStore } from '../../store/evalStore';
import { 
  Search, Filter, Play, RotateCcw, StopCircle, 
  Download, ArrowUpDown, CheckCircle2, AlertTriangle, 
  Clock, Coins, FileCode, CheckSquare
} from 'lucide-react';
import { INITIAL_MODELS } from '../ai/registry';
import { EvalRun } from '../../types/evals';

interface EvalsRunsProps {
  onNewEval?: () => void;
}

export function EvalsRuns({ onNewEval }: EvalsRunsProps) {
  const { runs, setSelectedRun, retryRun, cancelRun, exportRuns } = useEvalStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'startedAt' | 'score' | 'duration' | 'cost'>('startedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const filteredRuns = useMemo(() => {
    return runs.filter(run => {
      const matchSearch = 
        run.id.toLowerCase().includes(search.toLowerCase()) ||
        (run.taskName && run.taskName.toLowerCase().includes(search.toLowerCase())) ||
        run.modelId.toLowerCase().includes(search.toLowerCase());

      const matchStatus = statusFilter === 'all' || 
        run.status.toLowerCase() === statusFilter.toLowerCase();

      const matchModel = modelFilter === 'all' || run.modelId === modelFilter;

      return matchSearch && matchStatus && matchModel;
    }).sort((a, b) => {
      let valA: any = a[sortBy] ?? 0;
      let valB: any = b[sortBy] ?? 0;

      if (sortBy === 'cost') {
        valA = a.actualCost ?? a.estimatedCost ?? 0;
        valB = b.actualCost ?? b.estimatedCost ?? 0;
      }

      if (sortOrder === 'desc') {
        return valB > valA ? 1 : -1;
      }
      return valA > valB ? 1 : -1;
    });
  }, [runs, search, statusFilter, modelFilter, sortBy, sortOrder]);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#161B22] p-4 rounded-xl border border-[#30363D]">
        <div className="flex flex-1 items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 text-[#8B949E]" size={15} />
            <input
              type="text"
              placeholder="Search by task, model, or run ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-lg text-xs text-white placeholder-[#8B949E] focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="p-1.5 bg-[#0D1117] border border-[#30363D] rounded-lg text-xs text-[#C9D1D9] focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Model Filter */}
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="p-1.5 bg-[#0D1117] border border-[#30363D] rounded-lg text-xs text-[#C9D1D9] focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Models</option>
            {INITIAL_MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.displayName}</option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-[#30363D] rounded-lg overflow-hidden bg-[#0D1117]">
            <button
              onClick={() => exportRuns('json')}
              title="Export Runs as JSON"
              className="px-2.5 py-1.5 text-xs text-[#8B949E] hover:text-white transition-colors flex items-center gap-1"
            >
              <Download size={13} /> JSON
            </button>
            <span className="w-px h-4 bg-[#30363D]" />
            <button
              onClick={() => exportRuns('csv')}
              title="Export Runs as CSV"
              className="px-2.5 py-1.5 text-xs text-[#8B949E] hover:text-white transition-colors flex items-center gap-1"
            >
              <Download size={13} /> CSV
            </button>
          </div>

          <button
            onClick={() => onNewEval?.()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            <Play size={13} className="fill-current" />
            New Run
          </button>
        </div>
      </div>

      {/* Runs Table */}
      <div className="border border-[#30363D] rounded-xl bg-[#161B22] overflow-hidden">
        {filteredRuns.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 bg-[#0D1117] rounded-full flex items-center justify-center mb-3 border border-[#30363D]">
              <CheckSquare className="text-[#8B949E]" size={20} />
            </div>
            <h4 className="text-sm font-semibold text-white mb-1">No evaluation runs found</h4>
            <p className="text-xs text-[#8B949E] max-w-sm mb-4">
              {runs.length === 0 
                ? 'No evaluations have been run yet. Launch an evaluation to measure model capabilities.' 
                : 'No runs matched your current search filters.'}
            </p>
            {runs.length === 0 && (
              <button
                onClick={() => onNewEval?.()}
                className="px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                Launch Evaluation
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#30363D] bg-[#0D1117]/80 text-[#8B949E]">
                  <th className="py-3 px-4 font-medium">Task</th>
                  <th className="py-3 px-4 font-medium">Model</th>
                  <th className="py-3 px-4 font-medium">Agent</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th 
                    onClick={() => toggleSort('score')}
                    className="py-3 px-4 font-medium cursor-pointer hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      Score <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th className="py-3 px-4 font-medium">Tests</th>
                  <th className="py-3 px-4 font-medium">Patch</th>
                  <th 
                    onClick={() => toggleSort('duration')}
                    className="py-3 px-4 font-medium cursor-pointer hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      Duration <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th 
                    onClick={() => toggleSort('cost')}
                    className="py-3 px-4 font-medium cursor-pointer hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      Est. Cost <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th 
                    onClick={() => toggleSort('startedAt')}
                    className="py-3 px-4 font-medium cursor-pointer hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      Started <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363D]">
                {filteredRuns.map(run => {
                  const modelMeta = INITIAL_MODELS.find(m => m.id === run.modelId);
                  const isRunning = run.status === 'running' || run.status === 'queued' || run.status === 'Running';
                  const hasScore = typeof (run.finalScore ?? run.score) === 'number';
                  const isPassed = (run.status === 'completed' || run.status === 'Completed') && hasScore && (run.finalScore ?? run.score ?? 0) >= 70;

                  return (
                    <tr
                      key={run.id}
                      onClick={() => setSelectedRun(run)}
                      className="hover:bg-[#21262D]/50 transition-colors cursor-pointer text-[#C9D1D9]"
                    >
                      <td className="py-3 px-4 font-medium text-white max-w-[200px]">
                        <div className="truncate">{run.taskName || run.taskId}</div>
                        <div className="text-[10px] text-[#8B949E] font-mono">{run.id.slice(0, 8)}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-white text-[11px]">{modelMeta?.displayName || run.modelId}</span>
                        <div className="text-[10px] text-[#8B949E] capitalize">{run.providerId}</div>
                      </td>
                      <td className="py-3 px-4 text-[#8B949E] font-mono text-[11px]">
                        {run.agentId}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          isRunning ? 'bg-amber-950/60 text-amber-300 border border-amber-800' :
                          !hasScore ? 'bg-slate-800 text-slate-300 border border-slate-700' :
                          isPassed ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' :
                          'bg-red-950/60 text-red-300 border border-red-800'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            isRunning ? 'bg-amber-400 animate-pulse' :
                            !hasScore ? 'bg-slate-400' :
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
                      <td className="py-3 px-4">
                        {run.patchValid !== undefined ? (
                          <span className={run.patchValid ? 'text-emerald-400' : 'text-red-400'}>
                            {run.patchValid ? 'Valid' : 'Syntax Error'}
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
                      <td className="py-3 px-4 text-[#8B949E] text-[11px]">
                        {new Date(run.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {isRunning ? (
                            <button
                              onClick={() => cancelRun(run.id)}
                              title="Cancel Run"
                              className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/60 rounded transition-colors"
                            >
                              <StopCircle size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => retryRun(run.id)}
                              title="Retry Run"
                              className="p-1 text-[#8B949E] hover:text-white hover:bg-[#30363D] rounded transition-colors"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedRun(run)}
                            className="px-2 py-0.5 bg-[#21262D] hover:bg-[#30363D] text-white rounded text-[11px] font-medium transition-colors"
                          >
                            Inspect
                          </button>
                        </div>
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
