import React, { useState } from 'react';
import { useEvalStore } from '../../store/evalStore';
import { 
  Layers, 
  Play, 
  CheckCircle2, 
  Award, 
  Clock, 
  Coins, 
  FileCode, 
  CheckSquare, 
  Sparkles, 
  ArrowRight,
  ExternalLink,
  Scale,
  ShieldCheck,
  AlertTriangle,
  Info
} from 'lucide-react';
import { Benchmark } from '../../types/evals';
import { 
  VERIFIED_BENCHMARK_DEFINITIONS, 
  VERIFIED_BENCHMARK_SCORES 
} from '../../data/verifiedBenchmarks';

interface EvalsBenchmarksProps {
  onRunBenchmark?: (benchmarkId: string) => void;
}

export function EvalsBenchmarks({ onRunBenchmark }: EvalsBenchmarksProps) {
  const { benchmarks, tasks, runs, setSelectedRun } = useEvalStore();
  const [suiteCategory, setSuiteCategory] = useState<'industry' | 'float'>('industry');
  const [selectedIndustryBenchmark, setSelectedIndustryBenchmark] = useState<string>(VERIFIED_BENCHMARK_DEFINITIONS[0].id);

  const currentDef = VERIFIED_BENCHMARK_DEFINITIONS.find(b => b.id === selectedIndustryBenchmark) || VERIFIED_BENCHMARK_DEFINITIONS[0];
  const scoresForCurrent = VERIFIED_BENCHMARK_SCORES.filter(s => s.benchmarkId === currentDef.id);

  return (
    <div className="space-y-6">
      {/* Top Banner with Toggle */}
      <div className="p-6 rounded-xl bg-[#161B22] border border-[#30363D] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="text-purple-400" size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-300">
              Benchmark Intelligence & Evaluation Suites
            </span>
          </div>
          <h2 className="text-base font-semibold text-white mt-1">
            Industry Standards & First-Party FLOAT Evaluation Workflows
          </h2>
          <p className="text-xs text-[#8B949E] mt-1 max-w-2xl">
            Inspect verified external benchmark leaderboards and launch reproducible first-party evaluations in your workspace.
          </p>
        </div>

        {/* Segmented Control */}
        <div className="flex p-1 bg-[#0D1117] border border-[#30363D] rounded-lg shrink-0">
          <button
            onClick={() => setSuiteCategory('industry')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              suiteCategory === 'industry'
                ? 'bg-[#7C3AED] text-white shadow-sm'
                : 'text-[#8B949E] hover:text-white'
            }`}
          >
            Verified Industry Standards
          </button>
          <button
            onClick={() => setSuiteCategory('float')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              suiteCategory === 'float'
                ? 'bg-[#7C3AED] text-white shadow-sm'
                : 'text-[#8B949E] hover:text-white'
            }`}
          >
            FLOAT 1st-Party Suites ({benchmarks.length})
          </button>
        </div>
      </div>

      {suiteCategory === 'industry' ? (
        /* Industry Standard Benchmarks View */
        <div className="space-y-6">
          {/* Benchmark Selector Pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {VERIFIED_BENCHMARK_DEFINITIONS.map((bench) => (
              <button
                key={bench.id}
                onClick={() => setSelectedIndustryBenchmark(bench.id)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all border shrink-0 cursor-pointer ${
                  selectedIndustryBenchmark === bench.id
                    ? 'bg-[#1C2128] border-purple-500 text-white shadow-sm'
                    : 'bg-[#161B22] border-[#30363D] text-[#8B949E] hover:text-white'
                }`}
              >
                <span>{bench.name}</span>
                <span className="ml-1.5 text-[10px] font-mono text-purple-300">({bench.category})</span>
              </button>
            ))}
          </div>

          {/* Benchmark Detail Card */}
          <div className="border border-[#30363D] rounded-xl bg-[#161B22] p-6 shadow-md">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-[#30363D]">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="text-lg font-bold text-white tracking-tight">{currentDef.name}</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#21262D] border border-[#30363D] text-[#8B949E]">
                    {currentDef.version}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-950/60 text-purple-300 border border-purple-800">
                    Primary Metric: {currentDef.metricName}
                  </span>
                </div>
                <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                  {currentDef.description}
                </p>
              </div>

              <a
                href={currentDef.officialSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] rounded-lg text-xs font-medium text-white transition-colors shrink-0"
              >
                <span>Official Repository / Site</span>
                <ExternalLink size={12} />
              </a>
            </div>

            {/* Comparability Warning Box */}
            <div className="my-5 p-4 rounded-xl bg-purple-950/30 border border-purple-800/50 flex items-start gap-3 text-xs text-purple-200">
              <AlertTriangle size={16} className="text-purple-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-white">Comparability Rule: </span>
                {currentDef.comparabilityGuidelines}
              </div>
            </div>

            {/* Scores Table */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#8B949E] mb-3">
                Verified Scores for {currentDef.name}
              </h4>
              <div className="overflow-x-auto rounded-xl border border-[#30363D]">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#0D1117] text-[#8B949E] uppercase font-semibold border-b border-[#30363D]">
                    <tr>
                      <th className="px-4 py-3">Model</th>
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3 text-right">Score</th>
                      <th className="px-4 py-3">Test Configuration</th>
                      <th className="px-4 py-3">Source & Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#30363D] bg-[#161B22]">
                    {scoresForCurrent.map((score) => (
                      <tr key={score.id} className="hover:bg-[#21262D] transition-colors">
                        <td className="px-4 py-3.5 font-bold text-white whitespace-nowrap">
                          {score.modelName}
                        </td>
                        <td className="px-4 py-3.5 text-[#8B949E] capitalize whitespace-nowrap">
                          {score.providerId}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-400 text-sm whitespace-nowrap">
                          {score.score.toFixed(1)}{score.scoreUnit}
                        </td>
                        <td className="px-4 py-3.5 text-slate-300 text-[11px] leading-relaxed max-w-sm">
                          {score.testConfiguration}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <a
                            href={score.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 font-medium"
                          >
                            <span>{score.evaluatorName}</span>
                            <ExternalLink size={11} />
                          </a>
                          <span className="text-[10px] text-[#8B949E] block font-mono mt-0.5">{score.evalDate}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* FLOAT First-Party Suites View */
        <div className="space-y-6">
          {benchmarks.map(benchmark => {
            const benchmarkTasks = tasks.filter(t => benchmark.taskIds.includes(t.id));
            const benchmarkRuns = runs.filter(r => r.benchmarkId === benchmark.id);
            const completedRuns = benchmarkRuns.filter(r => r.status === 'completed' || r.status === 'Completed');

            return (
              <div 
                key={benchmark.id}
                className="border border-[#30363D] rounded-xl bg-[#161B22] overflow-hidden"
              >
                {/* Header */}
                <div className="p-6 border-b border-[#30363D] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="text-base font-bold text-white tracking-tight">{benchmark.name}</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#21262D] border border-[#30363D] text-[#8B949E]">
                        {benchmark.version}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-950/60 text-purple-300 border border-purple-800">
                        {benchmark.difficulty}
                      </span>
                    </div>
                    <p className="text-xs text-[#8B949E] max-w-2xl">
                      {benchmark.description}
                    </p>
                  </div>

                  <button
                    onClick={() => onRunBenchmark && onRunBenchmark(benchmark.id)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 shadow-sm"
                  >
                    <Play size={13} className="fill-current" />
                    <span>Run Suite</span>
                  </button>
                </div>

                {/* Body Details */}
                <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Task Composition */}
                  <div className="lg:col-span-2 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#8B949E]">
                      Included Evaluation Tasks ({benchmarkTasks.length})
                    </h4>
                    <div className="divide-y divide-[#30363D] border border-[#30363D] rounded-xl overflow-hidden bg-[#0D1117]">
                      {benchmarkTasks.map(task => (
                        <div key={task.id} className="p-3 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-white block">{task.name}</span>
                            <span className="text-[11px] text-[#8B949E]">{task.category} • {task.difficulty}</span>
                          </div>
                          <span className="text-[10px] font-mono text-purple-400 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-800/40">
                            {task.validationMethod || 'Tests'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Execution History */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#8B949E] mb-3">
                      Suite Runs ({completedRuns.length}/{benchmarkRuns.length})
                    </h4>
                    {benchmarkRuns.length === 0 ? (
                      <div className="p-4 rounded-xl bg-[#0D1117] border border-[#30363D] text-xs text-[#8B949E] text-center">
                        No executions recorded yet. Click "Run Suite" to launch.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {benchmarkRuns.slice(0, 3).map(r => (
                          <div 
                            key={r.id} 
                            onClick={() => setSelectedRun(r)}
                            className="flex items-center justify-between p-2.5 rounded-lg bg-[#0D1117] hover:bg-[#21262D] transition-colors cursor-pointer text-xs"
                          >
                            <span className="text-white font-medium">{r.modelId}</span>
                            <span className="font-mono text-purple-400 font-bold">{r.finalScore ?? r.score ?? '—'}/100</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
