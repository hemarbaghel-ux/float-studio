import React, { useState, useMemo } from 'react';
import { 
  ScatterChart, 
  Scatter, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Cell, 
  Legend 
} from 'recharts';
import { 
  Scale, 
  Coins, 
  Layers, 
  BarChart2, 
  Table as TableIcon, 
  ExternalLink, 
  Info,
  Maximize2
} from 'lucide-react';
import { VERIFIED_MODELS, VerifiedModel } from '../../data/verifiedModels';
import { 
  VERIFIED_BENCHMARK_SCORES, 
  VERIFIED_BENCHMARK_DEFINITIONS,
  VerifiedBenchmarkScore 
} from '../../data/verifiedBenchmarks';

interface PerformanceChartProps {
  graphData?: any[];
  onPointClick?: (modelId: string) => void;
}

type ChartViewType = 
  | 'perf-vs-cost' 
  | 'swe-bench' 
  | 'humaneval' 
  | 'gpqa-diamond' 
  | 'context-window';

const PROVIDER_COLORS: Record<string, string> = {
  google: '#38BDF8',   // Sky blue
  openai: '#10B981',   // Emerald
  anthropic: '#F59E0B',// Amber
  xai: '#A855F7'       // Purple
};

export function PerformanceChart({ onPointClick }: PerformanceChartProps) {
  const [chartView, setChartView] = useState<ChartViewType>('perf-vs-cost');
  const [showTableView, setShowTableView] = useState(false);

  // Scatter plot data: Performance (SWE-bench Verified) vs Input Cost ($/1M tokens)
  const scatterData = useMemo(() => {
    const sweScores = VERIFIED_BENCHMARK_SCORES.filter(s => s.benchmarkId === 'swe-bench-verified');
    return sweScores.map(score => {
      const model = VERIFIED_MODELS.find(m => m.id === score.modelId);
      const inputCost = model?.pricing?.inputCostPer1M ?? 0;
      return {
        modelId: score.modelId,
        modelName: score.modelName,
        providerId: score.providerId,
        benchmarkName: score.benchmarkName,
        benchmarkVersion: score.benchmarkVersion,
        score: score.score,
        cost: inputCost,
        evalDate: score.evalDate,
        evaluatorName: score.evaluatorName,
        sourceUrl: score.sourceUrl,
        testConfig: score.testConfiguration
      };
    });
  }, []);

  // Bar chart data for SWE-bench
  const sweBarData = useMemo(() => {
    return VERIFIED_BENCHMARK_SCORES
      .filter(s => s.benchmarkId === 'swe-bench-verified')
      .map(s => ({
        modelId: s.modelId,
        name: s.modelName,
        score: s.score,
        providerId: s.providerId,
        source: s.evaluatorName,
        config: s.testConfiguration
      }))
      .sort((a, b) => b.score - a.score);
  }, []);

  // Bar chart data for HumanEval
  const humanEvalBarData = useMemo(() => {
    return VERIFIED_BENCHMARK_SCORES
      .filter(s => s.benchmarkId === 'humaneval')
      .map(s => ({
        modelId: s.modelId,
        name: s.modelName,
        score: s.score,
        providerId: s.providerId,
        source: s.evaluatorName,
        config: s.testConfiguration
      }))
      .sort((a, b) => b.score - a.score);
  }, []);

  // Bar chart data for GPQA Diamond
  const gpqaBarData = useMemo(() => {
    return VERIFIED_BENCHMARK_SCORES
      .filter(s => s.benchmarkId === 'gpqa-diamond')
      .map(s => ({
        modelId: s.modelId,
        name: s.modelName,
        score: s.score,
        providerId: s.providerId,
        source: s.evaluatorName,
        config: s.testConfiguration
      }))
      .sort((a, b) => b.score - a.score);
  }, []);

  // Context window comparison
  const contextData = useMemo(() => {
    return VERIFIED_MODELS.map(m => ({
      modelId: m.id,
      name: m.displayName,
      context: m.contextWindow / 1000, // in thousands
      providerId: m.providerId,
      maxOutput: m.maxOutputTokens
    })).sort((a, b) => b.context - a.context);
  }, []);

  // Custom Scatter Tooltip
  const CustomScatterTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="p-3 bg-[#0D1117] border border-[#30363D] rounded-xl shadow-xl text-xs max-w-xs z-50">
          <p className="font-bold text-white text-sm">{data.modelName}</p>
          <p className="text-[11px] text-[#8B949E] capitalize mb-2">Provider: {data.providerId}</p>
          
          <div className="space-y-1 py-1.5 border-y border-[#21262D]">
            <div className="flex justify-between">
              <span className="text-[#8B949E]">SWE-bench Verified:</span>
              <span className="font-mono font-bold text-emerald-400">{data.score.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8B949E]">Input Rate:</span>
              <span className="font-mono text-slate-200">${data.cost.toFixed(2)} / 1M</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8B949E]">Evaluation Date:</span>
              <span className="font-mono text-slate-300">{data.evalDate}</span>
            </div>
          </div>

          <p className="text-[10px] text-[#8B949E] mt-2 italic">
            Source: {data.evaluatorName}
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom Bar Tooltip
  const CustomBarTooltip = ({ active, payload, unit = '%' }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="p-3 bg-[#0D1117] border border-[#30363D] rounded-xl shadow-xl text-xs max-w-xs z-50">
          <p className="font-bold text-white text-sm">{data.name}</p>
          <div className="mt-1.5 flex justify-between py-1 border-t border-[#21262D]">
            <span className="text-[#8B949E]">Metric Value:</span>
            <span className="font-mono font-bold text-emerald-400">
              {data.score !== undefined ? `${data.score.toFixed(1)}${unit}` : `${data.context}k tokens`}
            </span>
          </div>
          {data.source && (
            <p className="text-[10px] text-[#8B949E] mt-1.5 italic">
              Source: {data.source}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full bg-[#12161F] border border-[#21262D] rounded-2xl p-6 sm:p-8 shadow-xl">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-[#21262D]">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart2 size={20} className="text-purple-400" />
            Interactive Performance & Cost Analytics
          </h3>
          <p className="text-xs text-[#8B949E] mt-1">
            Grounded data from verified benchmark runs. Hover points to inspect exact conditions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Chart View Selector */}
          <div className="flex p-1 bg-[#0D1117] border border-[#21262D] rounded-lg">
            <button
              onClick={() => setChartView('perf-vs-cost')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                chartView === 'perf-vs-cost'
                  ? 'bg-[#7C3AED] text-white shadow-sm'
                  : 'text-[#8B949E] hover:text-white'
              }`}
            >
              Performance vs Cost
            </button>
            <button
              onClick={() => setChartView('swe-bench')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                chartView === 'swe-bench'
                  ? 'bg-[#7C3AED] text-white shadow-sm'
                  : 'text-[#8B949E] hover:text-white'
              }`}
            >
              SWE-bench
            </button>
            <button
              onClick={() => setChartView('humaneval')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                chartView === 'humaneval'
                  ? 'bg-[#7C3AED] text-white shadow-sm'
                  : 'text-[#8B949E] hover:text-white'
              }`}
            >
              HumanEval
            </button>
            <button
              onClick={() => setChartView('gpqa-diamond')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                chartView === 'gpqa-diamond'
                  ? 'bg-[#7C3AED] text-white shadow-sm'
                  : 'text-[#8B949E] hover:text-white'
              }`}
            >
              GPQA Diamond
            </button>
            <button
              onClick={() => setChartView('context-window')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                chartView === 'context-window'
                  ? 'bg-[#7C3AED] text-white shadow-sm'
                  : 'text-[#8B949E] hover:text-white'
              }`}
            >
              Context Limits
            </button>
          </div>

          {/* Table Toggle Button */}
          <button
            onClick={() => setShowTableView(!showTableView)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#161B22] border border-[#30363D] hover:border-[#8B949E] rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Toggle accessible table representation"
          >
            <TableIcon size={14} />
            <span>{showTableView ? 'Show Chart' : 'Table View'}</span>
          </button>
        </div>
      </div>

      {/* Provider Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-6 text-xs text-[#8B949E]">
        <span className="font-semibold text-white">Providers:</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8]"></span>
          <span>Google Gemini</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]"></span>
          <span>OpenAI</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]"></span>
          <span>Anthropic</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#A855F7]"></span>
          <span>xAI</span>
        </div>
      </div>

      {/* Chart Visualization Area or Table Alternative */}
      {showTableView ? (
        <div className="overflow-x-auto rounded-xl border border-[#21262D]">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#0D1117] text-[#8B949E] uppercase font-semibold border-b border-[#21262D]">
              <tr>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3 text-right">SWE-bench (%)</th>
                <th className="px-4 py-3 text-right">Input Price ($/1M)</th>
                <th className="px-4 py-3 text-right">Context (k tokens)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#21262D]">
              {scatterData.map((d) => {
                const model = VERIFIED_MODELS.find(m => m.id === d.modelId);
                return (
                  <tr 
                    key={d.modelId} 
                    className="hover:bg-[#161B22] transition-colors cursor-pointer"
                    onClick={() => onPointClick && onPointClick(d.modelId)}
                  >
                    <td className="px-4 py-3 font-bold text-white">{d.modelName}</td>
                    <td className="px-4 py-3 text-[#8B949E] capitalize">{d.providerId}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">{d.score.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">${d.cost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      {model ? (model.contextWindow / 1000).toLocaleString() + 'k' : '--'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-[420px] w-full">
          {chartView === 'perf-vs-cost' && (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262D" />
                <XAxis
                  type="number"
                  dataKey="cost"
                  name="Input Cost"
                  unit="$"
                  stroke="#8B949E"
                  tick={{ fill: '#8B949E', fontSize: 11 }}
                  label={{ 
                    value: 'Official Input Token Cost ($ / 1M tokens)', 
                    position: 'insideBottom', 
                    offset: -15, 
                    fill: '#8B949E', 
                    fontSize: 12 
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="score"
                  name="SWE-bench Resolved %"
                  unit="%"
                  domain={[0, 80]}
                  stroke="#8B949E"
                  tick={{ fill: '#8B949E', fontSize: 11 }}
                  label={{ 
                    value: 'SWE-bench Verified (Resolved %)', 
                    angle: -90, 
                    position: 'insideLeft', 
                    fill: '#8B949E', 
                    fontSize: 12 
                  }}
                />
                <Tooltip content={<CustomScatterTooltip />} />
                <Scatter
                  name="Models"
                  data={scatterData}
                  onClick={(entry: any) => onPointClick && onPointClick(entry?.modelId || entry?.payload?.modelId)}
                  className="cursor-pointer"
                >
                  {scatterData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={PROVIDER_COLORS[entry.providerId] || '#7C3AED'} 
                      stroke="#FFFFFF" 
                      strokeWidth={1}
                      r={7}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          )}

          {chartView === 'swe-bench' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sweBarData} layout="vertical" margin={{ top: 10, right: 30, left: 120, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262D" horizontal={false} />
                <XAxis 
                  type="number" 
                  domain={[0, 80]} 
                  stroke="#8B949E" 
                  unit="%" 
                  tick={{ fill: '#8B949E', fontSize: 11 }} 
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  stroke="#8B949E" 
                  tick={{ fill: '#C9D1D9', fontSize: 11 }} 
                />
                <Tooltip content={<CustomBarTooltip unit="%" />} />
                <Bar 
                  dataKey="score" 
                  radius={[0, 4, 4, 0]} 
                  onClick={(entry: any) => onPointClick && onPointClick(entry?.modelId || entry?.payload?.modelId)}
                  className="cursor-pointer"
                >
                  {sweBarData.map((entry, index) => (
                    <Cell key={`swe-cell-${index}`} fill={PROVIDER_COLORS[entry.providerId] || '#7C3AED'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {chartView === 'humaneval' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={humanEvalBarData} layout="vertical" margin={{ top: 10, right: 30, left: 120, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262D" horizontal={false} />
                <XAxis 
                  type="number" 
                  domain={[60, 100]} 
                  stroke="#8B949E" 
                  unit="%" 
                  tick={{ fill: '#8B949E', fontSize: 11 }} 
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  stroke="#8B949E" 
                  tick={{ fill: '#C9D1D9', fontSize: 11 }} 
                />
                <Tooltip content={<CustomBarTooltip unit="%" />} />
                <Bar 
                  dataKey="score" 
                  radius={[0, 4, 4, 0]} 
                  onClick={(entry: any) => onPointClick && onPointClick(entry?.modelId || entry?.payload?.modelId)}
                  className="cursor-pointer"
                >
                  {humanEvalBarData.map((entry, index) => (
                    <Cell key={`he-cell-${index}`} fill={PROVIDER_COLORS[entry.providerId] || '#7C3AED'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {chartView === 'gpqa-diamond' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gpqaBarData} layout="vertical" margin={{ top: 10, right: 30, left: 120, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262D" horizontal={false} />
                <XAxis 
                  type="number" 
                  domain={[30, 90]} 
                  stroke="#8B949E" 
                  unit="%" 
                  tick={{ fill: '#8B949E', fontSize: 11 }} 
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  stroke="#8B949E" 
                  tick={{ fill: '#C9D1D9', fontSize: 11 }} 
                />
                <Tooltip content={<CustomBarTooltip unit="%" />} />
                <Bar 
                  dataKey="score" 
                  radius={[0, 4, 4, 0]} 
                  onClick={(entry: any) => onPointClick && onPointClick(entry?.modelId || entry?.payload?.modelId)}
                  className="cursor-pointer"
                >
                  {gpqaBarData.map((entry, index) => (
                    <Cell key={`gpqa-cell-${index}`} fill={PROVIDER_COLORS[entry.providerId] || '#7C3AED'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {chartView === 'context-window' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={contextData} layout="vertical" margin={{ top: 10, right: 30, left: 120, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262D" horizontal={false} />
                <XAxis 
                  type="number" 
                  domain={[0, 2200]} 
                  stroke="#8B949E" 
                  unit="k" 
                  tick={{ fill: '#8B949E', fontSize: 11 }} 
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  stroke="#8B949E" 
                  tick={{ fill: '#C9D1D9', fontSize: 11 }} 
                />
                <Tooltip content={<CustomBarTooltip unit="k tokens" />} />
                <Bar 
                  dataKey="context" 
                  radius={[0, 4, 4, 0]} 
                  onClick={(entry: any) => onPointClick && onPointClick(entry?.modelId || entry?.payload?.modelId)}
                  className="cursor-pointer"
                >
                  {contextData.map((entry, index) => (
                    <Cell key={`ctx-cell-${index}`} fill={PROVIDER_COLORS[entry.providerId] || '#7C3AED'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Chart Caveat Footer */}
      <div className="mt-4 pt-4 border-t border-[#21262D] flex items-center justify-between text-[11px] text-[#8B949E]">
        <div className="flex items-center gap-1.5">
          <Info size={13} className="text-purple-400" />
          <span>Scores reflect verified reports under standard or scaffolded test harnesses. Not an overall composite rating.</span>
        </div>
        <span className="font-mono">Updated: February 2025</span>
      </div>
    </div>
  );
}
