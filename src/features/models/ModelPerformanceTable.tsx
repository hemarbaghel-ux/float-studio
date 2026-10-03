import React, { useState, useMemo } from 'react';
import { 
  Search, 
  ArrowDown, 
  ArrowUp, 
  ExternalLink, 
  Filter, 
  Scale, 
  Sparkles, 
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { 
  VERIFIED_BENCHMARK_SCORES, 
  VERIFIED_BENCHMARK_DEFINITIONS,
  VerifiedBenchmarkScore 
} from '../../data/verifiedBenchmarks';

interface ModelPerformanceTableProps {
  graphData?: any[];
  onRowClick?: (modelId: string) => void;
  selectedBenchmark?: string;
}

export function ModelPerformanceTable({ onRowClick, selectedBenchmark: initialBenchmark }: ModelPerformanceTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [benchmarkFilter, setBenchmarkFilter] = useState(initialBenchmark || 'all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [evaluatorFilter, setEvaluatorFilter] = useState('all');
  const [sortField, setSortField] = useState<'score' | 'modelName' | 'evalDate' | 'benchmarkName'>('score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const filteredData = useMemo(() => {
    return VERIFIED_BENCHMARK_SCORES.filter((item) => {
      // Benchmark filter
      if (benchmarkFilter !== 'all' && item.benchmarkId !== benchmarkFilter) {
        return false;
      }
      // Provider filter
      if (providerFilter !== 'all' && item.providerId !== providerFilter) {
        return false;
      }
      // Evaluator filter
      if (evaluatorFilter !== 'all' && item.evaluatorType !== evaluatorFilter) {
        return false;
      }
      // Search term
      if (searchTerm.trim() !== '') {
        const query = searchTerm.toLowerCase();
        const matches = 
          item.modelName.toLowerCase().includes(query) ||
          item.benchmarkName.toLowerCase().includes(query) ||
          item.evaluatorName.toLowerCase().includes(query) ||
          item.testConfiguration.toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    }).sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (typeof valA === 'string') {
        const comp = valA.localeCompare(valB);
        return sortDirection === 'asc' ? comp : -comp;
      }
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });
  }, [benchmarkFilter, providerFilter, evaluatorFilter, searchTerm, sortField, sortDirection]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'score' ? 'desc' : 'asc');
    }
  };

  const currentBenchmarkDef = VERIFIED_BENCHMARK_DEFINITIONS.find(b => b.id === benchmarkFilter);

  return (
    <div className="w-full">
      {/* Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Scale size={20} className="text-purple-400" />
            Verified Benchmark Intelligence Table
          </h3>
          <p className="text-xs text-[#8B949E] mt-1">
            Data sourced directly from provider technical reports and verified benchmark maintainers.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E]" />
          <input
            type="text"
            placeholder="Search model, benchmark, or config..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#12161F] border border-[#21262D] focus:border-[#7C3AED] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-[#8B949E] outline-none transition-colors"
          />
        </div>
      </div>

      {/* Filter Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 p-4 rounded-xl bg-[#12161F] border border-[#21262D]">
        {/* Benchmark Selector */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8B949E] block mb-1.5">
            Benchmark
          </label>
          <select
            value={benchmarkFilter}
            onChange={(e) => setBenchmarkFilter(e.target.value)}
            aria-label="Filter by benchmark"
            className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-[#7C3AED]"
          >
            <option value="all">All Benchmarks ({VERIFIED_BENCHMARK_DEFINITIONS.length})</option>
            {VERIFIED_BENCHMARK_DEFINITIONS.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Provider Selector */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8B949E] block mb-1.5">
            Provider
          </label>
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            aria-label="Filter by provider"
            className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-[#7C3AED]"
          >
            <option value="all">All Providers</option>
            <option value="google">Google Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="xai">xAI</option>
          </select>
        </div>

        {/* Evaluator Type */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8B949E] block mb-1.5">
            Source Type
          </label>
          <select
            value={evaluatorFilter}
            onChange={(e) => setEvaluatorFilter(e.target.value)}
            aria-label="Filter by source type"
            className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-[#7C3AED]"
          >
            <option value="all">All Source Types</option>
            <option value="Official provider report">Official Provider Report</option>
            <option value="Independent evaluation">Independent Evaluation</option>
            <option value="FLOAT evaluation">FLOAT Evaluation</option>
          </select>
        </div>
      </div>

      {/* Benchmark comparability notice if benchmark selected */}
      {currentBenchmarkDef && (
        <div className="mb-6 p-4 rounded-xl bg-purple-950/30 border border-purple-800/50 flex items-start gap-3 text-xs text-purple-200">
          <AlertTriangle size={16} className="text-purple-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-white">Comparability Rule for {currentBenchmarkDef.name}: </span>
            {currentBenchmarkDef.comparabilityGuidelines}
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-x-auto rounded-xl border border-[#21262D] bg-[#12161F] shadow-lg">
        <table className="w-full text-xs text-left">
          <thead className="bg-[#0D1117] text-[#8B949E] uppercase font-semibold border-b border-[#21262D] select-none">
            <tr>
              <th 
                className="px-4 py-3.5 cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('modelName')}
              >
                <div className="flex items-center gap-1">
                  <span>Model</span>
                  {sortField === 'modelName' && (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                </div>
              </th>
              <th 
                className="px-4 py-3.5 cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('benchmarkName')}
              >
                <div className="flex items-center gap-1">
                  <span>Benchmark</span>
                  {sortField === 'benchmarkName' && (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                </div>
              </th>
              <th 
                className="px-4 py-3.5 text-right cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('score')}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Score</span>
                  {sortField === 'score' && (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                </div>
              </th>
              <th className="px-4 py-3.5">Source Type</th>
              <th className="px-4 py-3.5">Test Conditions</th>
              <th 
                className="px-4 py-3.5 cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('evalDate')}
              >
                <div className="flex items-center gap-1">
                  <span>Eval Date</span>
                  {sortField === 'evalDate' && (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                </div>
              </th>
              <th className="px-4 py-3.5">Attribution</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#21262D]">
            {filteredData.length > 0 ? (
              filteredData.map((item) => (
                <tr 
                  key={item.id}
                  onClick={() => onRowClick && onRowClick(item.modelId)}
                  className={`transition-colors ${onRowClick ? 'cursor-pointer hover:bg-[#161B22]' : 'hover:bg-[#161B22]'}`}
                >
                  <td className="px-4 py-3.5 font-bold text-white whitespace-nowrap">
                    <div className="flex flex-col">
                      <span>{item.modelName}</span>
                      <span className="text-[10px] font-mono text-[#8B949E] capitalize">{item.providerId}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-slate-200 font-medium">{item.benchmarkName}</span>
                      <span className="text-[10px] font-mono text-[#8B949E]">{item.benchmarkVersion}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-400 text-sm whitespace-nowrap">
                    {item.score.toFixed(1)}{item.scoreUnit}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-950/60 border border-purple-800/60 text-purple-300">
                      {item.evaluatorType}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-[11px] text-slate-300 max-w-xs leading-relaxed">
                    {item.testConfiguration}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[#8B949E] whitespace-nowrap">
                    {item.evalDate}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 font-medium transition-colors"
                    >
                      <span>{item.evaluatorName}</span>
                      <ExternalLink size={11} />
                    </a>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-xs text-[#8B949E]">
                  No benchmark records match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-[#8B949E]">
        <span>Showing {filteredData.length} of {VERIFIED_BENCHMARK_SCORES.length} verified results</span>
        <span>All scores linked to source publications</span>
      </div>
    </div>
  );
}
