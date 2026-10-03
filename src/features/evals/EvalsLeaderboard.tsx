import React, { useState, useEffect } from 'react';
import { useEvalStore } from '../../store/evalStore';
import { 
  Award, 
  Filter, 
  ShieldCheck, 
  HelpCircle, 
  Trophy, 
  ExternalLink,
  Scale,
  Sparkles,
  Layers
} from 'lucide-react';
import { 
  VERIFIED_BENCHMARK_DEFINITIONS, 
  VERIFIED_BENCHMARK_SCORES, 
  VerifiedBenchmarkScore 
} from '../../data/verifiedBenchmarks';

export function EvalsLeaderboard() {
  const { leaderboard, benchmarks, fetchLeaderboard } = useEvalStore();
  const [boardType, setBoardType] = useState<'verified' | 'workspace'>('verified');
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<string>('swe-bench-verified');
  const [workspaceBenchmarkId, setWorkspaceBenchmarkId] = useState<string>('all');
  const [minEvaluations, setMinEvaluations] = useState<number>(1);

  useEffect(() => {
    fetchLeaderboard(workspaceBenchmarkId === 'all' ? undefined : workspaceBenchmarkId, minEvaluations);
  }, [workspaceBenchmarkId, minEvaluations, fetchLeaderboard]);

  const verifiedScoresForBenchmark = VERIFIED_BENCHMARK_SCORES
    .filter(s => s.benchmarkId === selectedBenchmarkId)
    .sort((a, b) => b.score - a.score);

  const currentBenchmarkDef = VERIFIED_BENCHMARK_DEFINITIONS.find(b => b.id === selectedBenchmarkId);

  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Switcher */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-[#161B22] p-4 rounded-xl border border-[#30363D]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <Trophy size={16} className="text-amber-400" />
            Empirical Model Leaderboard
          </div>

          <div className="flex p-0.5 bg-[#0D1117] border border-[#30363D] rounded-lg">
            <button
              onClick={() => setBoardType('verified')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                boardType === 'verified'
                  ? 'bg-[#7C3AED] text-white shadow-sm'
                  : 'text-[#8B949E] hover:text-white'
              }`}
            >
              Verified Industry Benchmarks
            </button>
            <button
              onClick={() => setBoardType('workspace')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                boardType === 'workspace'
                  ? 'bg-[#7C3AED] text-white shadow-sm'
                  : 'text-[#8B949E] hover:text-white'
              }`}
            >
              Workspace 1st-Party Leaderboard
            </button>
          </div>
        </div>

        {boardType === 'verified' ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8B949E]">Benchmark:</span>
            <select
              value={selectedBenchmarkId}
              onChange={(e) => setSelectedBenchmarkId(e.target.value)}
              className="p-1.5 bg-[#0D1117] border border-[#30363D] rounded-lg text-xs text-[#C9D1D9] focus:outline-none focus:border-purple-500"
            >
              {VERIFIED_BENCHMARK_DEFINITIONS.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={workspaceBenchmarkId}
              onChange={(e) => setWorkspaceBenchmarkId(e.target.value)}
              className="p-1.5 bg-[#0D1117] border border-[#30363D] rounded-lg text-xs text-[#C9D1D9] focus:outline-none focus:border-purple-500"
            >
              <option value="all">All Suites</option>
              {benchmarks.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {boardType === 'verified' ? (
        /* Verified Industry Leaderboard */
        <div className="space-y-4">
          {currentBenchmarkDef && (
            <div className="p-4 rounded-xl bg-[#0D1117] border border-[#30363D] flex items-center justify-between gap-4 text-xs">
              <div>
                <span className="font-bold text-white text-sm block">{currentBenchmarkDef.name} ({currentBenchmarkDef.version})</span>
                <span className="text-[#8B949E] text-xs mt-0.5 block">{currentBenchmarkDef.description}</span>
              </div>
              <a
                href={currentBenchmarkDef.officialSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-purple-400 hover:text-purple-300 font-medium shrink-0"
              >
                <span>Maintainer Site</span>
                <ExternalLink size={12} />
              </a>
            </div>
          )}

          <div className="border border-[#30363D] rounded-xl bg-[#161B22] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#30363D] bg-[#0D1117]/80 text-[#8B949E] uppercase font-semibold">
                    <th className="py-3.5 px-4 w-12 text-center">Rank</th>
                    <th className="py-3.5 px-4">Model</th>
                    <th className="py-3.5 px-4">Provider</th>
                    <th className="py-3.5 px-4 text-right">Score ({currentBenchmarkDef?.metricName})</th>
                    <th className="py-3.5 px-4">Test Configuration</th>
                    <th className="py-3.5 px-4">Source & Evaluator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363D] text-[#C9D1D9]">
                  {verifiedScoresForBenchmark.map((score, idx) => {
                    const isTop = idx === 0;
                    const isSecond = idx === 1;
                    const isThird = idx === 2;

                    return (
                      <tr key={score.id} className="hover:bg-[#21262D]/40 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-center">
                          {isTop ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-black text-xs font-black shadow-sm">
                              1
                            </span>
                          ) : isSecond ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 text-black text-xs font-black">
                              2
                            </span>
                          ) : isThird ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700 text-white text-xs font-black">
                              3
                            </span>
                          ) : (
                            <span className="text-[#8B949E]">{idx + 1}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">
                          {score.modelName}
                        </td>
                        <td className="py-3.5 px-4 text-[#8B949E] capitalize whitespace-nowrap">
                          {score.providerId}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400 text-sm whitespace-nowrap">
                          {score.score.toFixed(1)}{score.scoreUnit}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300 text-[11px] leading-relaxed max-w-sm">
                          {score.testConfiguration}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <a
                            href={score.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 font-medium"
                          >
                            <span>{score.evaluatorName}</span>
                            <ExternalLink size={11} />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Workspace 1st-Party Leaderboard */
        <div className="border border-[#30363D] rounded-xl bg-[#161B22] overflow-hidden">
          {leaderboard.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 bg-[#0D1117] rounded-full flex items-center justify-center mb-3 border border-[#30363D]">
                <Award className="text-[#8B949E]" size={20} />
              </div>
              <h4 className="text-sm font-semibold text-white mb-1">No completed workspace evaluation data</h4>
              <p className="text-xs text-[#8B949E] max-w-sm mb-4">
                First-party workspace rankings appear once models complete real evaluation runs in your workspace.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#30363D] bg-[#0D1117]/80 text-[#8B949E]">
                    <th className="py-3.5 px-4 font-medium w-12 text-center">Rank</th>
                    <th className="py-3.5 px-4 font-medium">Model</th>
                    <th className="py-3.5 px-4 font-medium">Provider</th>
                    <th className="py-3.5 px-4 font-medium">Overall Score</th>
                    <th className="py-3.5 px-4 font-medium">Task Pass</th>
                    <th className="py-3.5 px-4 font-medium">Tests Pass</th>
                    <th className="py-3.5 px-4 font-medium">Build Pass</th>
                    <th className="py-3.5 px-4 font-medium">Avg Latency</th>
                    <th className="py-3.5 px-4 font-medium">Avg Tokens</th>
                    <th className="py-3.5 px-4 font-medium">Avg Cost</th>
                    <th className="py-3.5 px-4 font-medium">Runs</th>
                    <th className="py-3.5 px-4 font-medium text-right">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363D] text-[#C9D1D9]">
                  {leaderboard.map((entry, idx) => {
                    const isTop = idx === 0;
                    const isSecond = idx === 1;
                    const isThird = idx === 2;

                    return (
                      <tr key={entry.modelId} className="hover:bg-[#21262D]/40 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-center">
                          {isTop ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-black text-xs font-black shadow-sm">
                              1
                            </span>
                          ) : isSecond ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 text-black text-xs font-black">
                              2
                            </span>
                          ) : isThird ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700 text-white text-xs font-black">
                              3
                            </span>
                          ) : (
                            <span className="text-[#8B949E]">{idx + 1}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-white">
                          {entry.modelName}
                        </td>
                        <td className="py-3.5 px-4 text-[#8B949E] capitalize font-mono text-[11px]">
                          {entry.providerId}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-sm text-purple-400">
                          {entry.overallScore} / 100
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          {entry.taskSuccessRate}%
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          {entry.testPassRate}%
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          {entry.buildSuccessRate}%
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#8B949E]">
                          {(entry.avgLatencyMs / 1000).toFixed(2)}s
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#8B949E]">
                          {entry.avgTokens.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#8B949E]">
                          ${entry.avgCost.toFixed(5)}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-white">
                          {entry.evaluationsCount}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                            entry.confidence === 'high' ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' :
                            entry.confidence === 'medium' ? 'bg-purple-950/60 text-purple-300 border border-purple-800' :
                            'bg-[#21262D] text-[#8B949E] border border-[#30363D]'
                          }`}>
                            {entry.confidence === 'high' ? 'High Confidence' :
                             entry.confidence === 'medium' ? 'Medium' : 'Limited Data'}
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
      )}
    </div>
  );
}
