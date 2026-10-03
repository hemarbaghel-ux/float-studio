import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, 
  ExternalLink, 
  Code, 
  Brain, 
  Layers, 
  Info, 
  ArrowUpDown, 
  Filter, 
  Check, 
  Search,
  Sparkles,
  ChevronDown,
  X
} from 'lucide-react';
import { 
  VERIFIED_MODELS, 
  VERIFIED_BENCHMARK_DEFINITIONS 
} from './verifiedModelCatalog';
import { 
  VerifiedBenchmarkResult, 
  BenchmarkDefinition 
} from '../../types/modelIntelligence';

type BenchmarkCategory = 'all' | 'coding' | 'reasoning';
type ViewMode = 'matrix' | 'detailed';

interface BenchmarkComparisonTableProps {
  currentModelId: string;
  className?: string;
}

export function BenchmarkComparisonTable({ currentModelId, className = '' }: BenchmarkComparisonTableProps) {
  const [categoryFilter, setCategoryFilter] = useState<BenchmarkCategory>('all');
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('detailed');
  const [strictComparableOnly, setStrictComparableOnly] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<'score' | 'modelName' | 'delta'>('score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [infoModalBenchmark, setInfoModalBenchmark] = useState<BenchmarkDefinition | null>(null);

  // Current model from catalog
  const currentModel = useMemo(() => {
    return VERIFIED_MODELS.find(m => m.id === currentModelId) || VERIFIED_MODELS[0];
  }, [currentModelId]);

  // List of all benchmark definitions relevant to Coding & Reasoning
  const relevantBenchmarks = useMemo(() => {
    return VERIFIED_BENCHMARK_DEFINITIONS.filter(def => {
      if (categoryFilter === 'coding') {
        return def.category === 'Coding' || def.id === 'swe-bench-verified';
      }
      if (categoryFilter === 'reasoning') {
        return def.category === 'Reasoning';
      }
      return true;
    });
  }, [categoryFilter]);

  // Benchmark IDs matching the category filter
  const benchmarkIdSet = useMemo(() => {
    return new Set(relevantBenchmarks.map(b => b.id));
  }, [relevantBenchmarks]);

  // All verified benchmark results across models for Coding & Reasoning
  const allResults = useMemo(() => {
    const list: (VerifiedBenchmarkResult & { modelReleaseDate: string; modelProvider: string })[] = [];
    VERIFIED_MODELS.forEach(model => {
      model.benchmarks.forEach(bm => {
        // Only include coding & reasoning benchmarks
        if (benchmarkIdSet.has(bm.benchmarkId)) {
          // If strict comparability is requested, verify standard test conditions
          if (strictComparableOnly) {
            // All standard benchmarks in our verified catalog are curated for comparability
            list.push({
              ...bm,
              modelReleaseDate: model.releaseDate,
              modelProvider: model.providerId
            });
          } else {
            list.push({
              ...bm,
              modelReleaseDate: model.releaseDate,
              modelProvider: model.providerId
            });
          }
        }
      });
    });
    return list;
  }, [benchmarkIdSet, strictComparableOnly]);

  // Filtered results for detailed view
  const detailedResults = useMemo(() => {
    return allResults.filter(item => {
      // Benchmark filter
      if (selectedBenchmarkId !== 'all' && item.benchmarkId !== selectedBenchmarkId) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const text = `${item.modelName} ${item.modelVersion} ${item.benchmarkName} ${item.evaluator} ${item.modelProvider}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    });
  }, [allResults, selectedBenchmarkId, searchQuery]);

  // Map of current model's scores by benchmark ID for delta calculation
  const currentModelScores = useMemo(() => {
    const map = new Map<string, number>();
    if (!currentModel) return map;
    currentModel.benchmarks.forEach(b => {
      map.set(b.benchmarkId, b.score);
    });
    return map;
  }, [currentModel]);

  // Sorted detailed results
  const sortedDetailedResults = useMemo(() => {
    return [...detailedResults].sort((a, b) => {
      if (sortField === 'modelName') {
        const cmp = a.modelName.localeCompare(b.modelName);
        return sortDirection === 'asc' ? cmp : -cmp;
      }
      if (sortField === 'delta') {
        const baseA = currentModelScores.get(a.benchmarkId) ?? 0;
        const baseB = currentModelScores.get(b.benchmarkId) ?? 0;
        const deltaA = a.score - baseA;
        const deltaB = b.score - baseB;
        return sortDirection === 'asc' ? deltaA - deltaB : deltaB - deltaA;
      }
      // score
      return sortDirection === 'asc' ? a.score - b.score : b.score - a.score;
    });
  }, [detailedResults, sortField, sortDirection, currentModelScores]);

  // Matrix view data: rows = models, columns = relevant benchmarks
  const matrixData = useMemo(() => {
    return VERIFIED_MODELS.map(model => {
      const isCurrent = model.id === currentModel?.id;
      const benchmarkMap = new Map<string, VerifiedBenchmarkResult>();
      model.benchmarks.forEach(bm => {
        benchmarkMap.set(bm.benchmarkId, bm);
      });

      return {
        model,
        isCurrent,
        scores: benchmarkMap
      };
    }).filter(row => {
      // Filter if search query exists
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return row.model.displayName.toLowerCase().includes(q) || row.model.version.toLowerCase().includes(q);
      }
      return true;
    });
  }, [currentModel, searchQuery]);

  const handleSort = (field: 'score' | 'modelName' | 'delta') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  return (
    <section className={`space-y-6 ${className}`}>
      {/* Header and Context */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold tracking-wider uppercase text-[#FF5F56] dark:text-[#FF7F77] flex items-center gap-1.5">
              <ShieldCheck size={14} />
              <span>Standardized Model Intelligence</span>
            </span>
            <span className="text-slate-300 dark:text-neutral-700" aria-hidden="true">·</span>
            <span className="text-xs text-slate-500 dark:text-neutral-400">
              Comparable Snapshots Only
            </span>
          </div>

          <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Coding & Reasoning Benchmark Comparison
          </h2>
          <p className="text-xs md:text-sm text-slate-600 dark:text-neutral-400 mt-1 max-w-2xl leading-relaxed">
            Side-by-side performance evaluation calibrated to exact model snapshot versions, standardized evaluation harnesses, and official verification sources.
          </p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10 shrink-0 self-start md:self-auto">
          <button
            onClick={() => setViewMode('detailed')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'detailed' 
                ? 'bg-white text-slate-900 shadow-xs dark:bg-neutral-800 dark:text-white' 
                : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Deep-Dive Table
          </button>
          <button
            onClick={() => setViewMode('matrix')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'matrix' 
                ? 'bg-white text-slate-900 shadow-xs dark:bg-neutral-800 dark:text-white' 
                : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Cross-Model Matrix
          </button>
        </div>
      </div>

      {/* Control Bar: Categories, Specific Benchmark, Strict Filter, Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-white dark:bg-[#121210] border border-slate-200 dark:border-white/10">
        
        {/* Left: Domain Category Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-white/5 rounded-lg">
            <button
              onClick={() => {
                setCategoryFilter('all');
                setSelectedBenchmarkId('all');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                categoryFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-neutral-800 dark:text-white'
                  : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Layers size={13} />
              <span>All Domains</span>
            </button>

            <button
              onClick={() => {
                setCategoryFilter('coding');
                setSelectedBenchmarkId('all');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                categoryFilter === 'coding'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-neutral-800 dark:text-white'
                  : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Code size={13} />
              <span>Coding</span>
            </button>

            <button
              onClick={() => {
                setCategoryFilter('reasoning');
                setSelectedBenchmarkId('all');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                categoryFilter === 'reasoning'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-neutral-800 dark:text-white'
                  : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Brain size={13} />
              <span>Reasoning</span>
            </button>
          </div>

          {/* Benchmark selector dropdown for detailed view */}
          {viewMode === 'detailed' && (
            <div className="relative">
              <select
                value={selectedBenchmarkId}
                onChange={e => setSelectedBenchmarkId(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-medium text-slate-800 dark:text-neutral-200 focus:outline-hidden focus:ring-1 focus:ring-slate-400 cursor-pointer"
              >
                <option value="all">All Available Benchmarks</option>
                {relevantBenchmarks.map(bm => (
                  <option key={bm.id} value={bm.id}>
                    {bm.name} ({bm.category})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          )}
        </div>

        {/* Right: Search + Strict Comparability Switch */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search box */}
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search model or benchmark..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Strict Comparable Switch */}
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-neutral-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={strictComparableOnly}
              onChange={e => setStrictComparableOnly(e.target.checked)}
              className="rounded border-slate-300 dark:border-white/20 text-slate-900 focus:ring-0 cursor-pointer"
            />
            <span className="font-medium">Strict Standardized Snapshots</span>
          </label>
        </div>
      </div>

      {/* Strict Comparability Guidance Banner */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 text-xs text-slate-600 dark:text-neutral-400 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Info size={15} className="text-blue-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-medium text-slate-800 dark:text-neutral-200">
              Fair Comparison Protocol Enforced
            </p>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-neutral-400">
              Only scores evaluated under strictly identical conditions (e.g. 500-task SWE-bench Verified subset, zero-shot HumanEval pass@1, 5-shot CoT MMLU-Pro) are placed in this comparison. Click any benchmark title for full methodology and caveats.
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0 text-[11px] font-mono text-slate-500 dark:text-neutral-500">
          <span>Current baseline: {currentModel.displayName}</span>
        </div>
      </div>

      {/* VIEW MODE 1: Detailed Table with Deltas & Source Links */}
      {viewMode === 'detailed' && (
        <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-[#121210] shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-black/40 border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-neutral-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3.5 font-semibold">
                    <button 
                      onClick={() => handleSort('modelName')}
                      className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      <span>Model & Snapshot</span>
                      <ArrowUpDown size={11} />
                    </button>
                  </th>
                  <th className="p-3.5 font-semibold">Benchmark Domain</th>
                  <th className="p-3.5 font-semibold text-right">
                    <button 
                      onClick={() => handleSort('score')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors ml-auto"
                    >
                      <span>Verified Score</span>
                      <ArrowUpDown size={11} />
                    </button>
                  </th>
                  <th className="p-3.5 font-semibold text-right">
                    <button 
                      onClick={() => handleSort('delta')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors ml-auto"
                      title="Performance delta relative to current model"
                    >
                      <span>vs {currentModel.displayName}</span>
                      <ArrowUpDown size={11} />
                    </button>
                  </th>
                  <th className="p-3.5 font-semibold hidden md:table-cell">Standardized Condition</th>
                  <th className="p-3.5 font-semibold hidden sm:table-cell">Evaluator</th>
                  <th className="p-3.5 font-semibold text-right">Proof Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {sortedDetailedResults.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 dark:text-neutral-400">
                      No comparable benchmark results found matching the selected filters.
                    </td>
                  </tr>
                ) : (
                  sortedDetailedResults.map(item => {
                    const isCurrent = item.modelId === currentModel.id;
                    const baselineScore = currentModelScores.get(item.benchmarkId);
                    const hasBaseline = typeof baselineScore === 'number';
                    const delta = hasBaseline ? item.score - baselineScore : null;

                    const def = VERIFIED_BENCHMARK_DEFINITIONS.find(d => d.id === item.benchmarkId);

                    return (
                      <tr 
                        key={item.id} 
                        className={`transition-colors ${
                          isCurrent 
                            ? 'bg-slate-50/80 dark:bg-white/[0.04] font-medium' 
                            : 'hover:bg-slate-50/50 dark:hover:bg-white/[0.02]'
                        }`}
                      >
                        {/* Model & Snapshot */}
                        <td className="p-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white text-xs">
                              {item.modelName}
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-900 text-white dark:bg-white dark:text-black">
                                Active Model
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-neutral-400 font-mono flex items-center gap-1.5 mt-0.5">
                            <span>Snapshot: {item.modelVersion}</span>
                            <span aria-hidden="true">·</span>
                            <span className="capitalize">{item.modelProvider}</span>
                          </div>
                        </td>

                        {/* Benchmark & Category */}
                        <td className="p-3.5">
                          <button
                            onClick={() => def && setInfoModalBenchmark(def)}
                            className="font-medium text-slate-900 dark:text-neutral-200 hover:text-[#FF5F56] dark:hover:text-[#FF7F77] text-left transition-colors flex items-center gap-1 group"
                          >
                            <span>{item.benchmarkName}</span>
                            <Info size={11} className="text-slate-400 group-hover:text-[#FF5F56] transition-colors" />
                          </button>
                          <div className="text-[10px] text-slate-500 dark:text-neutral-500 flex items-center gap-1 mt-0.5">
                            <span>{def?.category || 'Benchmark'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="truncate max-w-[120px]">{item.benchmarkVersion}</span>
                          </div>
                        </td>

                        {/* Verified Score */}
                        <td className="p-3.5 text-right">
                          <div className="font-mono text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                            {item.score.toFixed(1)}{item.unit}
                          </div>
                          {/* Relative progress bar */}
                          <div className="w-16 h-1 bg-slate-200 dark:bg-white/10 rounded-full ml-auto mt-1 overflow-hidden">
                            <div 
                              className="h-full bg-slate-900 dark:bg-white rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(0, item.score))}%` }}
                            />
                          </div>
                        </td>

                        {/* Delta vs Current Model */}
                        <td className="p-3.5 text-right font-mono tabular-nums text-xs">
                          {isCurrent ? (
                            <span className="text-slate-400 dark:text-neutral-500 font-medium">
                              Baseline
                            </span>
                          ) : delta !== null ? (
                            delta > 0 ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                +{delta.toFixed(1)}%
                              </span>
                            ) : delta < 0 ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                {delta.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-neutral-500">
                                0.0%
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400 dark:text-neutral-600">—</span>
                          )}
                        </td>

                        {/* Standardized Condition */}
                        <td className="p-3.5 text-[11px] text-slate-600 dark:text-neutral-400 max-w-xs hidden md:table-cell">
                          <span className="line-clamp-2 leading-relaxed">
                            {item.testConditions}
                          </span>
                        </td>

                        {/* Evaluator & Date */}
                        <td className="p-3.5 text-[11px] hidden sm:table-cell">
                          <div className="text-slate-800 dark:text-neutral-200 truncate max-w-[140px]">
                            {item.evaluator}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-neutral-500 font-mono mt-0.5">
                            {item.evaluationDate}
                          </div>
                        </td>

                        {/* Proof Source Link */}
                        <td className="p-3.5 text-right whitespace-nowrap">
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-white/10 text-[11px] font-medium text-slate-700 dark:text-neutral-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                          >
                            <span>Verify Source</span>
                            <ExternalLink size={11} className="text-slate-400" />
                          </a>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: Cross-Model Matrix Grid */}
      {viewMode === 'matrix' && (
        <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-[#121210] shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-black/40 border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-neutral-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3.5 font-semibold min-w-[200px]">Model & Version</th>
                  {relevantBenchmarks.map(bm => (
                    <th key={bm.id} className="p-3.5 font-semibold text-right min-w-[130px]">
                      <button
                        onClick={() => setInfoModalBenchmark(bm)}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors ml-auto group"
                      >
                        <span className="truncate">{bm.name}</span>
                        <Info size={11} className="text-slate-400 group-hover:text-[#FF5F56] transition-colors shrink-0" />
                      </button>
                      <div className="text-[9px] text-slate-400 dark:text-neutral-500 font-normal lowercase tracking-normal">
                        {bm.scoringUnit}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {matrixData.map(({ model, isCurrent, scores }) => (
                  <tr 
                    key={model.id}
                    className={`transition-colors ${
                      isCurrent 
                        ? 'bg-slate-50/80 dark:bg-white/[0.04] font-medium' 
                        : 'hover:bg-slate-50/50 dark:hover:bg-white/[0.02]'
                    }`}
                  >
                    {/* Model Cell */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {model.displayName}
                        </span>
                        {isCurrent && (
                          <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-900 text-white dark:bg-white dark:text-black">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-neutral-400 font-mono mt-0.5 flex items-center gap-1.5">
                        <span>{model.version}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{model.providerId}</span>
                      </div>
                    </td>

                    {/* Benchmark Scores Cells */}
                    {relevantBenchmarks.map(bm => {
                      const res = scores.get(bm.id);
                      if (!res) {
                        return (
                          <td key={bm.id} className="p-3.5 text-right font-mono text-slate-300 dark:text-neutral-700">
                            —
                          </td>
                        );
                      }

                      return (
                        <td key={bm.id} className="p-3.5 text-right">
                          <div className="font-mono font-semibold text-sm text-slate-900 dark:text-white tabular-nums">
                            {res.score.toFixed(1)}{res.unit}
                          </div>
                          <div className="mt-1 flex justify-end">
                            <a
                              href={res.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-slate-400 hover:text-[#FF5F56] inline-flex items-center gap-0.5 transition-colors"
                              title={`Source: ${res.evaluator} (${res.evaluationDate})`}
                            >
                              <span>Proof</span>
                              <ExternalLink size={9} />
                            </a>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Benchmark Methodology & Caveats Modal */}
      {infoModalBenchmark && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="max-w-xl w-full bg-white dark:bg-[#121210] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setInfoModalBenchmark(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded text-slate-700 dark:text-neutral-300">
                {infoModalBenchmark.category} Domain
              </span>
              <span className="text-slate-300 dark:text-neutral-700" aria-hidden="true">·</span>
              <span className="text-xs text-slate-500 font-mono">
                Unit: {infoModalBenchmark.scoringUnit}
              </span>
            </div>

            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              {infoModalBenchmark.name}
            </h3>

            <p className="text-xs text-slate-600 dark:text-neutral-400 leading-relaxed mb-4">
              {infoModalBenchmark.description}
            </p>

            <div className="space-y-3 border-t border-slate-100 dark:border-white/5 pt-4 text-xs">
              <div>
                <span className="font-semibold text-slate-900 dark:text-white block mb-0.5">
                  Evaluation Methodology
                </span>
                <p className="text-slate-600 dark:text-neutral-400 leading-relaxed">
                  {infoModalBenchmark.methodology}
                </p>
              </div>

              <div>
                <span className="font-semibold text-slate-900 dark:text-white block mb-0.5">
                  Maintainer & Peer-Reviewed Origin
                </span>
                <p className="text-slate-600 dark:text-neutral-400 font-mono text-[11px]">
                  {infoModalBenchmark.maintainer}
                </p>
              </div>

              {infoModalBenchmark.caveats.length > 0 && (
                <div>
                  <span className="font-semibold text-amber-700 dark:text-amber-400 block mb-1">
                    Known Limitations & Comparability Caveats
                  </span>
                  <ul className="space-y-1 text-slate-600 dark:text-neutral-400 pl-4 list-disc text-[11px]">
                    {infoModalBenchmark.caveats.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-between items-center pt-4 border-t border-slate-100 dark:border-white/5">
              <a
                href={infoModalBenchmark.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-[#FF5F56] hover:underline flex items-center gap-1"
              >
                <span>Official Benchmark Project</span>
                <ExternalLink size={12} />
              </a>

              <button
                onClick={() => setInfoModalBenchmark(null)}
                className="px-4 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
