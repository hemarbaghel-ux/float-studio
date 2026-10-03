import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { ModelUsageRecord } from '../../store/usageStore';
import { BarChart3, TrendingUp, Sparkles, Layers, RefreshCw, Trash2, Cpu, ArrowUpRight } from 'lucide-react';

interface TokenUsageChartProps {
  records: ModelUsageRecord[];
  timeRange: '24h' | '7d' | '30d' | '90d' | 'all';
  providerFilter: 'all' | 'openai' | 'google' | 'anthropic' | 'xai';
  onLoadSampleData?: () => void;
  onClearData?: () => void;
  isSampleData?: boolean;
}

export const PROVIDER_CONFIG: Record<string, { name: string; color: string; fillGradient: string }> = {
  google: {
    name: 'Google',
    color: '#3B82F6', // Blue
    fillGradient: '#3B82F6'
  },
  openai: {
    name: 'OpenAI',
    color: '#10B981', // Emerald
    fillGradient: '#10B981'
  },
  anthropic: {
    name: 'Anthropic',
    color: '#F59E0B', // Amber
    fillGradient: '#F59E0B'
  },
  xai: {
    name: 'xAI',
    color: '#8B5CF6', // Purple
    fillGradient: '#8B5CF6'
  }
};

export function TokenUsageChart({
  records,
  timeRange,
  providerFilter,
  onLoadSampleData,
  onClearData,
  isSampleData = false
}: TokenUsageChartProps) {
  const [chartType, setChartType] = useState<'bar' | 'area'>('bar');
  const [metricType, setMetricType] = useState<'provider' | 'type'>('provider'); // 'provider' = by provider, 'type' = input vs output

  // Normalize provider string to standard keys
  const getProviderKey = (provider: string): string => {
    const p = (provider || '').toLowerCase();
    if (p.includes('google') || p.includes('gemini')) return 'google';
    if (p.includes('openai') || p.includes('gpt') || p.includes('o1') || p.includes('o3')) return 'openai';
    if (p.includes('anthropic') || p.includes('claude')) return 'anthropic';
    if (p.includes('xai') || p.includes('grok')) return 'xai';
    return 'google';
  };

  // Build daily aggregated time series
  const dailyData = useMemo(() => {
    const now = new Date();
    let numDays = 7;
    if (timeRange === '24h') numDays = 1;
    else if (timeRange === '7d') numDays = 7;
    else if (timeRange === '30d') numDays = 30;
    else if (timeRange === '90d') numDays = 90;
    else if (timeRange === 'all') numDays = 14;

    if (timeRange === '24h') {
      // 8 3-hour slots for 24h view
      const slots: {
        date: string;
        fullDate: string;
        timestamp: number;
        google: number;
        openai: number;
        anthropic: number;
        xai: number;
        inputTokens: number;
        outputTokens: number;
        total: number;
        cost: number;
        requests: number;
      }[] = [];

      for (let i = 7; i >= 0; i--) {
        const slotTime = new Date(now.getTime() - i * 3 * 60 * 60 * 1000);
        const hours = slotTime.getHours().toString().padStart(2, '0') + ':00';
        slots.push({
          date: hours,
          fullDate: slotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestamp: slotTime.getTime(),
          google: 0,
          openai: 0,
          anthropic: 0,
          xai: 0,
          inputTokens: 0,
          outputTokens: 0,
          total: 0,
          cost: 0,
          requests: 0
        });
      }

      records.forEach(r => {
        const slotIdx = slots.findIndex((s, idx) => {
          const nextSlot = slots[idx + 1];
          if (!nextSlot) return r.timestamp >= s.timestamp;
          return r.timestamp >= s.timestamp && r.timestamp < nextSlot.timestamp;
        });
        if (slotIdx >= 0) {
          const p = getProviderKey(r.provider);
          slots[slotIdx][p as 'google' | 'openai' | 'anthropic' | 'xai'] += r.totalTokens;
          slots[slotIdx].inputTokens += r.inputTokens;
          slots[slotIdx].outputTokens += r.outputTokens;
          slots[slotIdx].total += r.totalTokens;
          slots[slotIdx].cost += r.estimatedCost;
          slots[slotIdx].requests += 1;
        }
      });

      return slots;
    }

    // Days timeline
    const daysMap = new Map<string, {
      date: string;
      fullDate: string;
      timestamp: number;
      google: number;
      openai: number;
      anthropic: number;
      xai: number;
      inputTokens: number;
      outputTokens: number;
      total: number;
      cost: number;
      requests: number;
    }>();

    // Pre-populate continuous days
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const fullLabel = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      daysMap.set(key, {
        date: label,
        fullDate: fullLabel,
        timestamp: d.getTime(),
        google: 0,
        openai: 0,
        anthropic: 0,
        xai: 0,
        inputTokens: 0,
        outputTokens: 0,
        total: 0,
        cost: 0,
        requests: 0
      });
    }

    // Accumulate records into the continuous day buckets
    records.forEach(r => {
      const d = new Date(r.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const bucket = daysMap.get(key);
      if (bucket) {
        const p = getProviderKey(r.provider);
        bucket[p as 'google' | 'openai' | 'anthropic' | 'xai'] += r.totalTokens;
        bucket.inputTokens += r.inputTokens;
        bucket.outputTokens += r.outputTokens;
        bucket.total += r.totalTokens;
        bucket.cost += r.estimatedCost;
        bucket.requests += 1;
      }
    });

    return Array.from(daysMap.values());
  }, [records, timeRange]);

  // Aggregate KPI stats from dailyData
  const chartSummary = useMemo(() => {
    let totalTokens = 0;
    let peakDay = { date: '—', tokens: 0 };
    const providerTotals: Record<string, number> = { google: 0, openai: 0, anthropic: 0, xai: 0 };

    dailyData.forEach(d => {
      totalTokens += d.total;
      if (d.total > peakDay.tokens) {
        peakDay = { date: d.date, tokens: d.total };
      }
      providerTotals.google += d.google;
      providerTotals.openai += d.openai;
      providerTotals.anthropic += d.anthropic;
      providerTotals.xai += d.xai;
    });

    const activeDaysCount = dailyData.filter(d => d.total > 0).length || 1;
    const dailyAvg = Math.round(totalTokens / dailyData.length);

    let topProvider = { name: 'Google', share: 0 };
    if (totalTokens > 0) {
      let maxToks = 0;
      let topKey = 'google';
      Object.entries(providerTotals).forEach(([p, val]) => {
        if (val > maxToks) {
          maxToks = val;
          topKey = p;
        }
      });
      topProvider = {
        name: PROVIDER_CONFIG[topKey]?.name || topKey,
        share: Math.round((maxToks / totalTokens) * 100)
      };
    }

    return { totalTokens, peakDay, dailyAvg, topProvider, providerTotals };
  }, [dailyData]);

  // Number formatting helpers
  const formatTokens = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toLocaleString();
  };

  const formatYAxis = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}k`;
    return num.toString();
  };

  // Custom tooltips matching FLOAT dark/light workspace theme
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const dataPoint = payload[0]?.payload;
    if (!dataPoint) return null;

    return (
      <div className="bg-white dark:bg-[#181818] border border-slate-200 dark:border-white/10 rounded-xl p-3.5 shadow-xl shadow-black/10 dark:shadow-2xl dark:shadow-black/75 text-xs select-none min-w-[210px]">
        <div className="font-semibold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <span>{dataPoint.fullDate || label}</span>
          <span className="text-[11px] font-normal text-slate-400 dark:text-[#7D8590]">
            {dataPoint.requests} reqs
          </span>
        </div>

        {metricType === 'provider' ? (
          <div className="py-2.5 flex flex-col gap-1.5 border-b border-slate-100 dark:border-white/5">
            {Object.entries(PROVIDER_CONFIG).map(([key, config]) => {
              const val = dataPoint[key] || 0;
              if (providerFilter !== 'all' && providerFilter !== key) return null;
              const pct = dataPoint.total > 0 ? Math.round((val / dataPoint.total) * 100) : 0;

              return (
                <div key={key} className="flex items-center justify-between gap-3 text-slate-600 dark:text-[#C9D1D9]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                    <span className="font-medium text-slate-800 dark:text-white">{config.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-slate-900 dark:text-white">{formatTokens(val)}</span>
                    <span className="text-[10px] text-slate-400 dark:text-[#7D8590] w-7 text-right">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-2.5 flex flex-col gap-1.5 border-b border-slate-100 dark:border-white/5">
            <div className="flex items-center justify-between gap-3 text-slate-600 dark:text-[#C9D1D9]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="font-medium text-slate-800 dark:text-white">Input Tokens</span>
              </div>
              <span className="font-mono text-slate-900 dark:text-white">{formatTokens(dataPoint.inputTokens || 0)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-slate-600 dark:text-[#C9D1D9]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="font-medium text-slate-800 dark:text-white">Output Tokens</span>
              </div>
              <span className="font-mono text-slate-900 dark:text-white">{formatTokens(dataPoint.outputTokens || 0)}</span>
            </div>
          </div>
        )}

        <div className="pt-2 flex items-center justify-between text-slate-500 dark:text-[#8B949E]">
          <span className="font-medium">Total Tokens</span>
          <span className="font-semibold text-slate-900 dark:text-white font-mono">
            {formatTokens(dataPoint.total)}
          </span>
        </div>
        {dataPoint.cost > 0 && (
          <div className="pt-1 flex items-center justify-between text-slate-400 dark:text-[#7D8590] text-[11px]">
            <span>Est. Cost</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">
              ${dataPoint.cost.toFixed(4)}
            </span>
          </div>
        )}
      </div>
    );
  };

  const hasData = chartSummary.totalTokens > 0;

  return (
    <div className="bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden mb-12 p-6 flex flex-col gap-6">
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              Daily Token Consumption by Provider
            </h3>
            {isSampleData && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Sample Preview Data
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-[#8B949E]">
            Daily aggregated token volume across model providers (Google, OpenAI, Anthropic, xAI).
          </p>
        </div>

        {/* CONTROLS: METRIC & CHART TYPE */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Metric Selector: By Provider vs By Token Type */}
          <div className="flex p-0.5 bg-slate-100 dark:bg-[#202020] rounded-lg border border-slate-200/80 dark:border-white/5">
            <button
              type="button"
              onClick={() => setMetricType('provider')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                metricType === 'provider'
                  ? 'bg-white dark:bg-[#111] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              By Provider
            </button>
            <button
              type="button"
              onClick={() => setMetricType('type')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                metricType === 'type'
                  ? 'bg-white dark:bg-[#111] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              In vs Out
            </button>
          </div>

          {/* Chart Type Toggle: Stacked Bars vs Stacked Area */}
          <div className="flex p-0.5 bg-slate-100 dark:bg-[#202020] rounded-lg border border-slate-200/80 dark:border-white/5">
            <button
              type="button"
              onClick={() => setChartType('bar')}
              title="Stacked Bar Chart"
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                chartType === 'bar'
                  ? 'bg-white dark:bg-[#111] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 size={14} />
            </button>
            <button
              type="button"
              onClick={() => setChartType('area')}
              title="Stacked Area Chart"
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                chartType === 'area'
                  ? 'bg-white dark:bg-[#111] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <TrendingUp size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* KPI PILLS */}
      {hasData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 px-4 bg-slate-50/70 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-xl text-xs">
          <div>
            <span className="text-slate-400 dark:text-[#7D8590]">Total in Period</span>
            <div className="text-sm font-semibold text-slate-900 dark:text-white font-mono mt-0.5">
              {formatTokens(chartSummary.totalTokens)}
            </div>
          </div>
          <div>
            <span className="text-slate-400 dark:text-[#7D8590]">Daily Average</span>
            <div className="text-sm font-semibold text-slate-900 dark:text-white font-mono mt-0.5">
              {formatTokens(chartSummary.dailyAvg)}/day
            </div>
          </div>
          <div>
            <span className="text-slate-400 dark:text-[#7D8590]">Peak Day</span>
            <div className="text-sm font-semibold text-slate-900 dark:text-white font-mono mt-0.5 truncate">
              {formatTokens(chartSummary.peakDay.tokens)} ({chartSummary.peakDay.date})
            </div>
          </div>
          <div>
            <span className="text-slate-400 dark:text-[#7D8590]">Top Provider</span>
            <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 flex items-center gap-1.5">
              <span className="truncate">{chartSummary.topProvider.name}</span>
              <span className="text-[11px] font-normal text-purple-600 dark:text-purple-400 font-mono">
                {chartSummary.topProvider.share}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* CHART CANVAS */}
      <div className="w-full h-[320px] relative">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11, fill: '#888' }} 
                  axisLine={{ stroke: '#888', opacity: 0.2 }}
                  tickLine={false}
                />
                <YAxis 
                  tickFormatter={formatYAxis} 
                  tick={{ fontSize: 11, fill: '#888' }} 
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  wrapperStyle={{ paddingTop: 16, fontSize: 12 }} 
                  iconType="circle"
                  iconSize={8}
                />

                {metricType === 'provider' ? (
                  <>
                    {(providerFilter === 'all' || providerFilter === 'google') && (
                      <Bar dataKey="google" name="Google" stackId="a" fill={PROVIDER_CONFIG.google.color} radius={[0, 0, 0, 0]} />
                    )}
                    {(providerFilter === 'all' || providerFilter === 'openai') && (
                      <Bar dataKey="openai" name="OpenAI" stackId="a" fill={PROVIDER_CONFIG.openai.color} radius={[0, 0, 0, 0]} />
                    )}
                    {(providerFilter === 'all' || providerFilter === 'anthropic') && (
                      <Bar dataKey="anthropic" name="Anthropic" stackId="a" fill={PROVIDER_CONFIG.anthropic.color} radius={[0, 0, 0, 0]} />
                    )}
                    {(providerFilter === 'all' || providerFilter === 'xai') && (
                      <Bar dataKey="xai" name="xAI" stackId="a" fill={PROVIDER_CONFIG.xai.color} radius={[4, 4, 0, 0]} />
                    )}
                  </>
                ) : (
                  <>
                    <Bar dataKey="inputTokens" name="Input Tokens" stackId="a" fill="#3B82F6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="outputTokens" name="Output Tokens" stackId="a" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  </>
                )}
              </BarChart>
            ) : (
              <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradGoogle" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PROVIDER_CONFIG.google.color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={PROVIDER_CONFIG.google.color} stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="gradOpenAI" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PROVIDER_CONFIG.openai.color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={PROVIDER_CONFIG.openai.color} stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="gradAnthropic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PROVIDER_CONFIG.anthropic.color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={PROVIDER_CONFIG.anthropic.color} stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="gradXAI" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PROVIDER_CONFIG.xai.color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={PROVIDER_CONFIG.xai.color} stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="gradInput" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="gradOutput" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11, fill: '#888' }} 
                  axisLine={{ stroke: '#888', opacity: 0.2 }}
                  tickLine={false}
                />
                <YAxis 
                  tickFormatter={formatYAxis} 
                  tick={{ fontSize: 11, fill: '#888' }} 
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  wrapperStyle={{ paddingTop: 16, fontSize: 12 }} 
                  iconType="circle"
                  iconSize={8}
                />

                {metricType === 'provider' ? (
                  <>
                    {(providerFilter === 'all' || providerFilter === 'google') && (
                      <Area type="monotone" dataKey="google" name="Google" stackId="1" stroke={PROVIDER_CONFIG.google.color} fill="url(#gradGoogle)" />
                    )}
                    {(providerFilter === 'all' || providerFilter === 'openai') && (
                      <Area type="monotone" dataKey="openai" name="OpenAI" stackId="1" stroke={PROVIDER_CONFIG.openai.color} fill="url(#gradOpenAI)" />
                    )}
                    {(providerFilter === 'all' || providerFilter === 'anthropic') && (
                      <Area type="monotone" dataKey="anthropic" name="Anthropic" stackId="1" stroke={PROVIDER_CONFIG.anthropic.color} fill="url(#gradAnthropic)" />
                    )}
                    {(providerFilter === 'all' || providerFilter === 'xai') && (
                      <Area type="monotone" dataKey="xai" name="xAI" stackId="1" stroke={PROVIDER_CONFIG.xai.color} fill="url(#gradXAI)" />
                    )}
                  </>
                ) : (
                  <>
                    <Area type="monotone" dataKey="inputTokens" name="Input Tokens" stackId="1" stroke="#3B82F6" fill="url(#gradInput)" />
                    <Area type="monotone" dataKey="outputTokens" name="Output Tokens" stackId="1" stroke="#8B5CF6" fill="url(#gradOutput)" />
                  </>
                )}
              </AreaChart>
            )}
          </ResponsiveContainer>
        ) : (
          /* HONEST EMPTY STATE */
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-white/10 rounded-xl bg-slate-50/50 dark:bg-white/[0.01]">
            <div className="w-10 h-10 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3">
              <Cpu size={20} />
            </div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
              No Token Usage Recorded Yet
            </h4>
            <p className="text-xs text-slate-500 dark:text-[#8B949E] max-w-sm mb-4">
              Real-time API token consumption will automatically appear here as you prompt AI models in the editor or chat.
            </p>
            {onLoadSampleData && (
              <button
                type="button"
                onClick={onLoadSampleData}
                className="px-3.5 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Sparkles size={13} />
                <span>Load Sample Preview Data</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* SAMPLE DATA BANNER / CLEAR CONTROLS */}
      {isSampleData && (
        <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-xs">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <Sparkles size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Sample Preview Active:</strong> Demonstrating 14-day token consumption across Google, OpenAI, Anthropic, and xAI. Real requests in the editor will log authentic user data.
            </span>
          </div>
          {onClearData && (
            <button
              type="button"
              onClick={onClearData}
              className="px-2.5 py-1 text-[11px] font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-white bg-amber-100 dark:bg-amber-500/20 rounded-md hover:bg-amber-200 dark:hover:bg-amber-500/30 transition-colors flex items-center gap-1 shrink-0 ml-3 cursor-pointer"
            >
              <Trash2 size={12} />
              <span>Clear Sample Data</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
