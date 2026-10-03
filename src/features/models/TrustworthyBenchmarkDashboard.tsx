import React, { useState, useMemo } from 'react';
import { 
  VERIFIED_MODELS, 
  VERIFIED_BENCHMARK_DEFINITIONS 
} from './verifiedModelCatalog';
import { 
  VerifiedBenchmarkResult, 
  BenchmarkDefinition, 
  SourceType 
} from '../../types/modelIntelligence';
import { 
  Search, 
  ExternalLink, 
  Filter, 
  CheckCircle2, 
  Info, 
  ShieldCheck, 
  ArrowUpDown, 
  AlertCircle,
  Sparkles,
  Layers,
  X
} from 'lucide-react';
import { useEvalStore } from '../../store/evalStore';

export function TrustworthyBenchmarkDashboard() {
  const [selectedBenchmark, setSelectedBenchmark] = useState<string>('all');
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [selectedSourceType, setSelectedSourceType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<'score' | 'modelName' | 'evaluationDate'>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [activeModalBenchmark, setActiveModalBenchmark] = useState<BenchmarkDefinition | null>(null);

  const { runs } = useEvalStore();

  // Combine verified external benchmark results + real completed FLOAT runs
  const allResults = useMemo(() => {
    const list: VerifiedBenchmarkResult[] = [];

    // 1. Ingest verified external benchmark results
    VERIFIED_MODELS.forEach(m => {
      m.benchmarks.forEach(b => {
        list.push(b);
      });
    });

    // 2. Ingest real completed FLOAT evaluations from evalEngine
    runs.filter(r => r.status === 'Completed' && typeof r.score === 'number').forEach(run => {
      const model = VERIFIED_MODELS.find(m => m.id === run.modelId);
      list.push({
        id: `float-run-${run.id}`,
        benchmarkId: run.benchmarkId || 'float-eval-suite',
        benchmarkName: run.taskName || 'FLOAT Core Eval',
        benchmarkVersion: 'v1.0 (FLOAT Engine)',
        modelId: run.modelId,
        modelName: model?.displayName || run.modelId,
        modelVersion: run.modelId,
        score: Number(run.score.toFixed(1)),
        unit: '%',
        evaluator: 'FLOAT Evaluation Harness',
        sourceType: 'float_evaluation',
        evaluationDate: new Date(run.startedAt || Date.now()).toISOString().split('T')[0],
        sourceUrl: `/models/evals`,
        testConditions: `Verified via Python unit tests, compilation, and AST validation. Run ID: ${run.id.slice(0, 8)}`,
        sampleSize: run.testCount || 1,
        notes: `Denominators: ${run.testsPassedCount || 0}/${run.testCount || 1} assertions passed.`
      });
    });

    return list;
  }, [runs]);

  // Filtering
  const filteredResults = useMemo(() => {
    return allResults.filter(item => {
      // Benchmark filter
      if (selectedBenchmark !== 'all' && item.benchmarkId !== selectedBenchmark) {
        return false;
      }

      // Provider filter
      if (selectedProvider !== 'all') {
        const model = VERIFIED_MODELS.find(m => m.id === item.modelId);
        if (model && model.providerId !== selectedProvider) {
          return false;
        }
      }

      // Source type filter
      if (selectedSourceType !== 'all' && item.sourceType !== selectedSourceType) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const text = `${item.modelName} ${item.benchmarkName} ${item.evaluator} ${item.modelVersion}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === 'score') {
        comparison = a.score - b.score;
      } else if (sortField === 'modelName') {
        comparison = a.modelName.localeCompare(b.modelName);
      } else if (sortField === 'evaluationDate') {
        comparison = a.evaluationDate.localeCompare(b.evaluationDate);
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [allResults, selectedBenchmark, selectedProvider, selectedSourceType, searchQuery, sortField, sortOrder]);

  const toggleSort = (field: 'score' | 'modelName' | 'evaluationDate') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getSourceBadge = (type: SourceType, evaluator: string) => {
    if (type === 'official_provider') {
      return (
        <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
          Official Provider Result
        </span>
      );
    }
    if (type === 'independent_benchmark') {
      return (
        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          Independent Leaderboard
        </span>
      );
    }
    return (
      <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">
        FLOAT Evaluation Run
      </span>
    );
  };

  return (
    <div className="w-full space-y-8">
      {/* Header & Principle Assurance */}
      <div className="p-6 rounded-2xl bg-white dark:bg-[#121210] border border-slate-200 dark:border-white/10 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-white/5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#FF5F56] uppercase tracking-wider mb-1">
              <ShieldCheck size={14} />
              <span>Verifiable Model Intelligence</span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Source-Attributed Model Benchmarks
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-[#A1A1AA] mt-1 max-w-2xl leading-relaxed">
              Every score displayed below is linked to an official provider publication, documented independent benchmark leaderboard, or traceable FLOAT evaluation run. No speculative scores or unverified extrapolations.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 shrink-0">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white text-base mr-1">{filteredResults.length}</span>
              <span>Verified Results</span>
            </div>
            <div className="h-4 w-px bg-slate-200 dark:bg-white/10" />
            <div>
              <span className="font-semibold text-slate-900 dark:text-white text-base mr-1">{VERIFIED_MODELS.length}</span>
              <span>Models Audited</span>
            </div>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="pt-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Benchmark tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
            <button
              onClick={() => setSelectedBenchmark('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                selectedBenchmark === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-black font-semibold'
                  : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              All Benchmarks
            </button>
            {VERIFIED_BENCHMARK_DEFINITIONS.map(def => (
              <button
                key={def.id}
                onClick={() => setSelectedBenchmark(def.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  selectedBenchmark === def.id
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-black font-semibold'
                    : 'text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <span>{def.name}</span>
                <span 
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveModalBenchmark(def);
                  }}
                  className="text-slate-400 hover:text-slate-200"
                  title="View benchmark methodology"
                >
                  <Info size={11} />
                </span>
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative w-full md:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search model or benchmark..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-[#181816] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>
        </div>

        {/* Secondary Filter: Source Type & Provider */}
        <div className="pt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-[#8B949E]">
          <div className="flex items-center gap-2">
            <span>Provider:</span>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="bg-transparent border border-slate-200 dark:border-white/10 rounded px-2 py-0.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">All Providers</option>
              <option value="google">Google</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="xai">xAI</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span>Source Type:</span>
            <select
              value={selectedSourceType}
              onChange={(e) => setSelectedSourceType(e.target.value)}
              className="bg-transparent border border-slate-200 dark:border-white/10 rounded px-2 py-0.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">All Sources</option>
              <option value="official_provider">Official Provider Results</option>
              <option value="independent_benchmark">Independent Leaderboards</option>
              <option value="float_evaluation">FLOAT Evaluation Harness</option>
            </select>
          </div>
        </div>
      </div>

      {/* Benchmark Results Table */}
      <div className="overflow-x-auto border border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-[#121210] shadow-xs">
        <table className="w-full text-xs text-left">
          <thead className="text-[11px] text-slate-500 dark:text-[#A1A1AA] uppercase bg-slate-50 dark:bg-black/40 border-b border-slate-200 dark:border-white/10">
            <tr>
              <th 
                className="px-6 py-3.5 font-semibold cursor-pointer hover:text-slate-900 dark:hover:text-white"
                onClick={() => toggleSort('modelName')}
              >
                <div className="flex items-center gap-1">
                  <span>Model</span>
                  <ArrowUpDown size={11} />
                </div>
              </th>
              <th className="px-6 py-3.5 font-semibold">Benchmark & Version</th>
              <th 
                className="px-6 py-3.5 font-semibold cursor-pointer hover:text-slate-900 dark:hover:text-white text-right"
                onClick={() => toggleSort('score')}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Score</span>
                  <ArrowUpDown size={11} />
                </div>
              </th>
              <th className="px-6 py-3.5 font-semibold">Evaluator & Provenance</th>
              <th 
                className="px-6 py-3.5 font-semibold cursor-pointer hover:text-slate-900 dark:hover:text-white"
                onClick={() => toggleSort('evaluationDate')}
              >
                <div className="flex items-center gap-1">
                  <span>Date</span>
                  <ArrowUpDown size={11} />
                </div>
              </th>
              <th className="px-6 py-3.5 font-semibold text-right">Attribution Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {filteredResults.map((row) => (
              <tr 
                key={row.id}
                className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
              >
                {/* Model */}
                <td className="px-6 py-4">
                  <div className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-[#FF5F56] transition-colors">
                    {row.modelName}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {row.modelVersion}
                  </div>
                </td>

                {/* Benchmark */}
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    {row.benchmarkName}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {row.benchmarkVersion}
                  </div>
                </td>

                {/* Score */}
                <td className="px-6 py-4 text-right">
                  <span className="font-mono text-base font-semibold text-slate-900 dark:text-white">
                    {row.score.toFixed(1)}{row.unit}
                  </span>
                </td>

                {/* Evaluator & Provenance */}
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    {row.evaluator}
                  </div>
                  {getSourceBadge(row.sourceType, row.evaluator)}
                </td>

                {/* Date */}
                <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-mono text-[11px] whitespace-nowrap">
                  {row.evaluationDate}
                </td>

                {/* Source Link */}
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  {row.sourceUrl.startsWith('http') ? (
                    <a
                      href={row.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium hover:underline text-xs"
                    >
                      <span>Verify source</span>
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    <a
                      href={row.sourceUrl}
                      className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:underline font-medium text-xs"
                    >
                      <span>View FLOAT Run</span>
                    </a>
                  )}
                </td>
              </tr>
            ))}

            {filteredResults.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                  No verified benchmark records matched the chosen filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Methodology Modal */}
      {activeModalBenchmark && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#141412] border border-slate-200 dark:border-white/10 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setActiveModalBenchmark(null)}
              className="absolute top-5 right-5 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              <span>{activeModalBenchmark.category} Benchmark</span>
              <span aria-hidden="true">·</span>
              <span>{activeModalBenchmark.maintainer}</span>
            </div>

            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              {activeModalBenchmark.name}
            </h3>

            <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed mb-4">
              {activeModalBenchmark.description}
            </p>

            <div className="space-y-3 mb-6">
              <div className="p-3 bg-slate-50 dark:bg-black/30 rounded-lg border border-slate-200 dark:border-white/5 text-xs">
                <span className="font-semibold text-slate-900 dark:text-white block mb-1">Evaluation Methodology:</span>
                <span className="text-slate-600 dark:text-[#A1A1AA] leading-relaxed">{activeModalBenchmark.methodology}</span>
              </div>

              <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800/40 text-xs">
                <span className="font-semibold text-amber-950 dark:text-amber-200 block mb-1 flex items-center gap-1.5">
                  <AlertCircle size={13} className="text-amber-600 dark:text-amber-400" />
                  <span>Important Comparability Caveats:</span>
                </span>
                <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                  {activeModalBenchmark.caveats.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-white/5 text-xs">
              <a
                href={activeModalBenchmark.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#FF5F56] hover:underline font-medium flex items-center gap-1"
              >
                <span>Visit official project / paper</span>
                <ExternalLink size={12} />
              </a>
              <button
                onClick={() => setActiveModalBenchmark(null)}
                className="px-4 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
