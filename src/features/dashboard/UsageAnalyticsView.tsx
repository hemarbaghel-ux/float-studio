import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import {
  Activity,
  BarChart3,
  Clock,
  Coins,
  Cpu,
  Layers,
  RefreshCw,
  Sparkles,
  Zap,
  TrendingDown,
  TrendingUp,
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { useUsageStore, ModelUsageRecord } from '../../store/usageStore';
import { generateSampleUsageData } from '../models/sampleUsageData';
import { apiFetch } from '../../services/api';

interface ProviderStatus {
  name: string;
  configured: boolean;
}

interface LeaderboardItem {
  modelId: string;
  modelName: string;
  providerId: string;
  overallScore: number;
  taskSuccessRate: number;
  avgLatencyMs: number;
  avgTokens: number;
  avgCost: number;
}

interface EvalRunSummary {
  id: string;
  modelId: string;
  providerId: string;
  durationMs?: number;
  duration?: number;
  totalTokens?: number;
  status: string;
  createdAt: number;
}

export const PROVIDER_PALETTE: Record<string, { name: string; color: string; border: string }> = {
  google: {
    name: 'Google',
    color: '#3B82F6', // Blue
    border: 'border-blue-500/20'
  },
  openai: {
    name: 'OpenAI',
    color: '#10B981', // Emerald
    border: 'border-emerald-500/20'
  },
  anthropic: {
    name: 'Anthropic',
    color: '#F59E0B', // Amber
    border: 'border-amber-500/20'
  },
  xai: {
    name: 'xAI',
    color: '#8B5CF6', // Purple
    border: 'border-purple-500/20'
  }
};

export function UsageAnalyticsView() {
  const { records, setRecords } = useUsageStore();

  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [providerFilter, setProviderFilter] = useState<'all' | 'google' | 'openai' | 'anthropic' | 'xai'>('all');
  const [tokenChartType, setTokenChartType] = useState<'stacked' | 'area'>('stacked');
  const [latencyChartType, setLatencyChartType] = useState<'model' | 'timeline'>('model');

  // External API data
  const [providers, setProviders] = useState<Record<string, ProviderStatus>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [evalRuns, setEvalRuns] = useState<EvalRunSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isSampleLoaded, setIsSampleLoaded] = useState(false);

  // Fetch Model Provider Status from /api/ai/models/status
  const fetchProviderStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/models/status');
      if (res.ok) {
        const data = await res.json();
        if (data?.providers) {
          setProviders(data.providers);
        }
      }
    } catch (err) {
      console.warn('[UsageAnalytics] Failed to fetch model status:', err);
    }
  }, []);

  // Fetch Evaluations from /api/evals/leaderboard & /api/evals/runs
  const fetchEvaluationData = useCallback(async () => {
    try {
      const [leaderboardRes, runsRes] = await Promise.allSettled([
        apiFetch('/api/evals/leaderboard'),
        apiFetch('/api/evals/runs')
      ]);

      if (leaderboardRes.status === 'fulfilled' && leaderboardRes.value.ok) {
        const boardData = await leaderboardRes.value.json();
        if (Array.isArray(boardData)) {
          setLeaderboard(boardData);
        }
      }

      if (runsRes.status === 'fulfilled' && runsRes.value.ok) {
        const runsData = await runsRes.value.json();
        if (Array.isArray(runsData)) {
          setEvalRuns(runsData);
        }
      }
    } catch (err) {
      console.warn('[UsageAnalytics] Evaluation telemetry note:', err);
    }
  }, []);

  // Refresh all telemetry
  const refreshTelemetry = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([fetchProviderStatus(), fetchEvaluationData()]);
    setLastUpdated(new Date());
    setIsRefreshing(false);
  }, [fetchProviderStatus, fetchEvaluationData]);

  useEffect(() => {
    setIsLoading(true);
    refreshTelemetry().finally(() => setIsLoading(false));
  }, [refreshTelemetry]);

  // Load realistic sample data if user wants to preview telemetry
  const handleLoadSampleData = () => {
    const sample = generateSampleUsageData();
    setRecords(sample);
    setIsSampleLoaded(true);
  };

  const handleClearData = () => {
    useUsageStore.getState().clearRecords();
    setIsSampleLoaded(false);
  };

  // Helper: map provider name to standard keys
  const normalizeProvider = (p: string = ''): string => {
    const s = p.toLowerCase();
    if (s.includes('google') || s.includes('gemini')) return 'google';
    if (s.includes('openai') || s.includes('gpt') || s.includes('o1') || s.includes('o3')) return 'openai';
    if (s.includes('anthropic') || s.includes('claude')) return 'anthropic';
    if (s.includes('xai') || s.includes('grok')) return 'xai';
    return 'google';
  };

  // Filter records by time and provider
  const filteredRecords = useMemo(() => {
    const now = Date.now();
    let cutoff = 0;
    if (timeRange === '24h') cutoff = now - 24 * 60 * 60 * 1000;
    else if (timeRange === '7d') cutoff = now - 7 * 24 * 60 * 60 * 1000;
    else if (timeRange === '30d') cutoff = now - 30 * 24 * 60 * 60 * 1000;

    return records.filter((rec) => {
      if (cutoff > 0 && rec.timestamp < cutoff) return false;
      if (providerFilter !== 'all') {
        const pKey = normalizeProvider(rec.provider);
        if (pKey !== providerFilter) return false;
      }
      return true;
    });
  }, [records, timeRange, providerFilter]);

  // Summary Metrics Calculation
  const summaryMetrics = useMemo(() => {
    const totalTokens = filteredRecords.reduce((sum, r) => sum + (r.totalTokens || 0), 0);
    const inputTokens = filteredRecords.reduce((sum, r) => sum + (r.inputTokens || 0), 0);
    const outputTokens = filteredRecords.reduce((sum, r) => sum + (r.outputTokens || 0), 0);
    const totalCost = filteredRecords.reduce((sum, r) => sum + (r.estimatedCost || 0), 0);

    const latencies = filteredRecords.map((r) => r.latency).filter((l) => typeof l === 'number' && l > 0);
    const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;
    const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;

    return {
      totalTokens,
      inputTokens,
      outputTokens,
      totalCost,
      avgLatency,
      minLatency,
      maxLatency,
      requestCount: filteredRecords.length
    };
  }, [filteredRecords]);

  // Time Series Data for Token Consumption Chart
  const timeSeriesData = useMemo(() => {
    const now = new Date();
    let slotsCount = 7;
    let slotDurationMs = 24 * 60 * 60 * 1000;

    if (timeRange === '24h') {
      slotsCount = 12; // 2-hour slots
      slotDurationMs = 2 * 60 * 60 * 1000;
    } else if (timeRange === '7d') {
      slotsCount = 7;
      slotDurationMs = 24 * 60 * 60 * 1000;
    } else if (timeRange === '30d') {
      slotsCount = 15; // 2-day slots
      slotDurationMs = 2 * 24 * 60 * 60 * 1000;
    } else {
      slotsCount = 14;
      slotDurationMs = 24 * 60 * 60 * 1000;
    }

    const slots: Array<{
      label: string;
      fullDate: string;
      startTime: number;
      endTime: number;
      google: number;
      openai: number;
      anthropic: number;
      xai: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      avgLatency: number;
      latencySum: number;
      requestCount: number;
    }> = [];

    for (let i = slotsCount - 1; i >= 0; i--) {
      const slotEnd = now.getTime() - i * slotDurationMs;
      const slotStart = slotEnd - slotDurationMs;
      const d = new Date(slotEnd);

      const label =
        timeRange === '24h'
          ? `${d.getHours().toString().padStart(2, '0')}:00`
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      slots.push({
        label,
        fullDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        startTime: slotStart,
        endTime: slotEnd,
        google: 0,
        openai: 0,
        anthropic: 0,
        xai: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        avgLatency: 0,
        latencySum: 0,
        requestCount: 0
      });
    }

    for (const rec of filteredRecords) {
      const slot = slots.find((s) => rec.timestamp >= s.startTime && rec.timestamp < s.endTime);
      if (slot) {
        const pKey = normalizeProvider(rec.provider);
        if (pKey === 'google') slot.google += rec.totalTokens || 0;
        else if (pKey === 'openai') slot.openai += rec.totalTokens || 0;
        else if (pKey === 'anthropic') slot.anthropic += rec.totalTokens || 0;
        else if (pKey === 'xai') slot.xai += rec.totalTokens || 0;

        slot.inputTokens += rec.inputTokens || 0;
        slot.outputTokens += rec.outputTokens || 0;
        slot.totalTokens += rec.totalTokens || 0;

        if (rec.latency && rec.latency > 0) {
          slot.latencySum += rec.latency;
          slot.requestCount += 1;
        }
      }
    }

    // Compute average latencies per slot
    for (const slot of slots) {
      slot.avgLatency = slot.requestCount > 0 ? Math.round(slot.latencySum / slot.requestCount) : 0;
    }

    return slots;
  }, [filteredRecords, timeRange]);

  // Model-by-Model Latency & Token Aggregation
  const modelMetricsData = useMemo(() => {
    const map = new Map<
      string,
      {
        modelId: string;
        provider: string;
        totalTokens: number;
        inputTokens: number;
        outputTokens: number;
        latencies: number[];
        requests: number;
        cost: number;
      }
    >();

    // 1. Ingest workspace chat usage records
    for (const rec of filteredRecords) {
      const key = rec.modelId || 'gemini-3.8-flash';
      const existing = map.get(key) || {
        modelId: key,
        provider: rec.provider || 'google',
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        latencies: [],
        requests: 0,
        cost: 0
      };

      existing.totalTokens += rec.totalTokens || 0;
      existing.inputTokens += rec.inputTokens || 0;
      existing.outputTokens += rec.outputTokens || 0;
      if (rec.latency && rec.latency > 0) existing.latencies.push(rec.latency);
      existing.requests += 1;
      existing.cost += rec.estimatedCost || 0;

      map.set(key, existing);
    }

    // 2. Ingest evaluation leaderboard data if available
    for (const entry of leaderboard) {
      if (!map.has(entry.modelId)) {
        map.set(entry.modelId, {
          modelId: entry.modelId,
          provider: entry.providerId || 'google',
          totalTokens: entry.avgTokens || 0,
          inputTokens: Math.round((entry.avgTokens || 0) * 0.7),
          outputTokens: Math.round((entry.avgTokens || 0) * 0.3),
          latencies: entry.avgLatencyMs ? [entry.avgLatencyMs] : [],
          requests: 1,
          cost: entry.avgCost || 0
        });
      }
    }

    return Array.from(map.values())
      .map((item) => {
        const avgLat = item.latencies.length > 0
          ? Math.round(item.latencies.reduce((a, b) => a + b, 0) / item.latencies.length)
          : 0;
        return {
          modelId: item.modelId,
          displayName: item.modelId.replace(/-(202\d{5})/g, ''),
          provider: normalizeProvider(item.provider),
          totalTokens: item.totalTokens,
          inputTokens: item.inputTokens,
          outputTokens: item.outputTokens,
          avgLatency: avgLat,
          requests: item.requests,
          cost: Number(item.cost.toFixed(4))
        };
      })
      .sort((a, b) => b.totalTokens - a.totalTokens);
  }, [filteredRecords, leaderboard]);

  // Provider Distribution
  const providerDistribution = useMemo(() => {
    const counts: Record<string, { tokens: number; latencySum: number; reqCount: number; cost: number }> = {
      google: { tokens: 0, latencySum: 0, reqCount: 0, cost: 0 },
      openai: { tokens: 0, latencySum: 0, reqCount: 0, cost: 0 },
      anthropic: { tokens: 0, latencySum: 0, reqCount: 0, cost: 0 },
      xai: { tokens: 0, latencySum: 0, reqCount: 0, cost: 0 }
    };

    for (const rec of filteredRecords) {
      const p = normalizeProvider(rec.provider);
      if (counts[p]) {
        counts[p].tokens += rec.totalTokens || 0;
        counts[p].cost += rec.estimatedCost || 0;
        if (rec.latency && rec.latency > 0) {
          counts[p].latencySum += rec.latency;
          counts[p].reqCount += 1;
        }
      }
    }

    return Object.entries(counts).map(([key, data]) => ({
      provider: key,
      name: PROVIDER_PALETTE[key]?.name || key,
      tokens: data.tokens,
      avgLatency: data.reqCount > 0 ? Math.round(data.latencySum / data.reqCount) : 0,
      cost: Number(data.cost.toFixed(4)),
      requests: data.reqCount,
      color: PROVIDER_PALETTE[key]?.color || '#94A3B8'
    }));
  }, [filteredRecords]);

  const hasData = filteredRecords.length > 0;

  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in duration-150">
      {/* ======================================================== */}
      {/* HEADER & CONTROLS                                        */}
      {/* ======================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-[#222222] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-slate-500 dark:text-[#8B949E] mb-1">
            <Activity size={14} className="text-blue-600 dark:text-blue-400" />
            <span>Workspace Telemetry</span>
            <span aria-hidden="true">·</span>
            <span>Performance & Consumption</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Usage & Latency Analytics
          </h1>
          <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-1">
            Visualizing real-time token consumption, LLM response latency, and evaluation benchmarks across workspace models.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time Range Selector */}
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-[#1A1A1A] rounded-lg border border-slate-200/80 dark:border-[#2A2A2A]">
            {(['24h', '7d', '30d', 'all'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  timeRange === range
                    ? 'bg-white dark:bg-[#2A2A2A] text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {range === 'all' ? 'All Time' : range.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Refresh Action */}
          <button
            onClick={refreshTelemetry}
            disabled={isRefreshing}
            title="Refresh metrics from backend"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-[#C9D1D9] transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          </button>

          {/* Sample Data Toggle for Preview */}
          {!hasData && (
            <button
              onClick={handleLoadSampleData}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles size={13} />
              <span>Load Preview Data</span>
            </button>
          )}

          {isSampleLoaded && (
            <button
              onClick={handleClearData}
              title="Clear preview sample records"
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-[#8B949E] hover:text-red-500 rounded-lg transition-colors cursor-pointer"
            >
              Clear Preview
            </button>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* PROVIDER STATUS STRIP (/api/ai/models/status)            */}
      {/* ======================================================== */}
      <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 text-xs">
          <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-[#C9D1D9]">
            <Cpu size={14} className="text-slate-500 dark:text-[#8B949E]" />
            <span>AI Provider Connectivity</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-neutral-700">·</span>
            <span className="text-slate-400 font-normal">Active Server Integrations</span>
          </div>
          {lastUpdated && (
            <div className="text-[11px] text-slate-400 dark:text-[#7D8590]">
              Synced {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries({
            google: providers.google || { name: 'Google Gemini', configured: true },
            openai: providers.openai || { name: 'OpenAI', configured: true },
            anthropic: providers.anthropic || { name: 'Anthropic', configured: true },
            xai: providers.xai || { name: 'xAI', configured: true }
          }).map(([key, info]) => {
            const isConfigured = info.configured;
            return (
              <div
                key={key}
                className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: isConfigured ? PROVIDER_PALETTE[key]?.color || '#10B981' : '#64748B' }}
                  />
                  <div className="truncate text-xs font-medium text-slate-800 dark:text-[#E6EDF3]">
                    {info.name}
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-[#8B949E]">
                  {isConfigured ? 'Operational' : 'Unconfigured'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* KEY METRICS SUMMARY STATS                                */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Tokens */}
        <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#8B949E]">
            <span>Total Token Volume</span>
            <Layers size={14} className="text-blue-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono">
              {summaryMetrics.totalTokens > 1_000_000
                ? `${(summaryMetrics.totalTokens / 1_000_000).toFixed(2)}M`
                : summaryMetrics.totalTokens > 1_000
                ? `${(summaryMetrics.totalTokens / 1_000).toFixed(1)}k`
                : summaryMetrics.totalTokens.toLocaleString()}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 dark:text-[#8B949E]">
              <span>In: {summaryMetrics.inputTokens.toLocaleString()}</span>
              <span aria-hidden="true">·</span>
              <span>Out: {summaryMetrics.outputTokens.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Average Latency */}
        <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#8B949E]">
            <span>Average Latency</span>
            <Clock size={14} className="text-purple-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono">
              {summaryMetrics.avgLatency > 0 ? `${summaryMetrics.avgLatency} ms` : '—'}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 dark:text-[#8B949E]">
              <span>Min: {summaryMetrics.minLatency} ms</span>
              <span aria-hidden="true">·</span>
              <span>Max: {summaryMetrics.maxLatency} ms</span>
            </div>
          </div>
        </div>

        {/* Metric 3: Total Requests */}
        <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#8B949E]">
            <span>Inference Operations</span>
            <Zap size={14} className="text-amber-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono">
              {summaryMetrics.requestCount.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-[#8B949E]">
              Active requests across all models
            </div>
          </div>
        </div>

        {/* Metric 4: Estimated Cost */}
        <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#8B949E]">
            <span>Estimated API Cost</span>
            <Coins size={14} className="text-emerald-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono">
              ${summaryMetrics.totalCost.toFixed(3)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-[#8B949E]">
              Estimated per published token pricing
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* FILTER BAR                                               */}
      {/* ======================================================== */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#141414] rounded-lg border border-slate-200/80 dark:border-[#222222]">
          <span className="text-[11px] text-slate-400 font-medium px-2">Provider:</span>
          {(['all', 'google', 'openai', 'anthropic', 'xai'] as const).map((prov) => (
            <button
              key={prov}
              onClick={() => setProviderFilter(prov)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                providerFilter === prov
                  ? 'bg-white dark:bg-[#252525] text-slate-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {prov === 'all' ? 'All Providers' : PROVIDER_PALETTE[prov]?.name || prov}
            </button>
          ))}
        </div>

        {isSampleLoaded && (
          <div className="text-xs text-slate-500 dark:text-[#8B949E] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>Viewing Preview Benchmark Data</span>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* CHART 1: TOKEN CONSUMPTION TELEMETRY                     */}
      {/* ======================================================== */}
      <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-xl p-5 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-800 dark:text-[#E6EDF3]">
              <BarChart3 size={15} className="text-blue-500" />
              <span>Token Consumption Timeline</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-[#8B949E] mt-0.5">
              Aggregated input (prompt) and output (completion) tokens processed over the selected timeframe.
            </p>
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-[#1A1A1A] rounded-lg border border-slate-200/80 dark:border-[#2A2A2A] self-start sm:self-auto">
            <button
              onClick={() => setTokenChartType('stacked')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                tokenChartType === 'stacked'
                  ? 'bg-white dark:bg-[#2A2A2A] text-slate-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Stacked Bars
            </button>
            <button
              onClick={() => setTokenChartType('area')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                tokenChartType === 'area'
                  ? 'bg-white dark:bg-[#2A2A2A] text-slate-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Area Trend
            </button>
          </div>
        </div>

        {/* Recharts Container */}
        <div className="w-full h-72 min-h-72">
          {!hasData ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-400 dark:text-[#6E7681] gap-2 border border-dashed border-slate-200 dark:border-[#222] rounded-lg">
              <BarChart3 size={24} className="text-slate-300 dark:text-[#333]" />
              <span>No token consumption telemetry recorded yet.</span>
              <button
                onClick={handleLoadSampleData}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Load Preview Benchmark Data
              </button>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {tokenChartType === 'stacked' ? (
                <BarChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#888888" opacity={0.15} vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#888888', opacity: 0.2 }}
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0]?.payload;
                      return (
                        <div className="bg-slate-950 text-white border border-slate-800 p-3 rounded-lg shadow-xl text-xs flex flex-col gap-1 min-w-44">
                          <div className="font-semibold text-slate-300 border-b border-white/10 pb-1 mb-1">
                            {data?.fullDate || label}
                          </div>
                          <div className="flex justify-between text-blue-400">
                            <span>Input Tokens:</span>
                            <span className="font-mono font-medium">{(data?.inputTokens || 0).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-emerald-400">
                            <span>Output Tokens:</span>
                            <span className="font-mono font-medium">{(data?.outputTokens || 0).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-white font-semibold border-t border-white/10 pt-1 mt-1">
                            <span>Total Tokens:</span>
                            <span className="font-mono">{(data?.totalTokens || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: 10, fontSize: 11 }}
                  />
                  <Bar dataKey="inputTokens" name="Prompt Tokens" stackId="a" fill="#3B82F6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="outputTokens" name="Completion Tokens" stackId="a" fill="#10B981" radius={[3, 3, 0, 0]} />
                </BarChart>
              ) : (
                <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#888888" opacity={0.15} vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#888888', opacity: 0.2 }}
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0]?.payload;
                      return (
                        <div className="bg-slate-950 text-white border border-slate-800 p-3 rounded-lg shadow-xl text-xs flex flex-col gap-1 min-w-44">
                          <div className="font-semibold text-slate-300 border-b border-white/10 pb-1 mb-1">
                            {data?.fullDate || label}
                          </div>
                          <div className="flex justify-between text-blue-400">
                            <span>Total Volume:</span>
                            <span className="font-mono font-medium">{(data?.totalTokens || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="totalTokens"
                    name="Total Tokens"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#tokenGradient)"
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* CHART 2: LATENCY TELEMETRY & MODEL COMPARISON            */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latency by Model Chart */}
        <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-800 dark:text-[#E6EDF3]">
                <Clock size={15} className="text-purple-500" />
                <span>Model Response Latency (ms)</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-[#8B949E] mt-0.5">
                Comparison of average roundtrip inference duration across deployed models.
              </p>
            </div>
          </div>

          <div className="w-full h-64 min-h-64">
            {!hasData && modelMetricsData.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-400 dark:text-[#6E7681] gap-1">
                <span>No latency benchmarks recorded.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={modelMetricsData.slice(0, 8)}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 45, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#888888" opacity={0.15} horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(val) => `${val}ms`}
                  />
                  <YAxis
                    type="category"
                    dataKey="displayName"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={90}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const item = payload[0]?.payload;
                      return (
                        <div className="bg-slate-950 text-white border border-slate-800 p-2.5 rounded-lg shadow-xl text-xs flex flex-col gap-1 min-w-36">
                          <div className="font-semibold text-slate-200">{item?.modelId}</div>
                          <div className="flex justify-between text-purple-400">
                            <span>Latency:</span>
                            <span className="font-mono font-medium">{item?.avgLatency} ms</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Provider:</span>
                            <span className="capitalize">{item?.provider}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="avgLatency" fill="#8B5CF6" radius={[0, 4, 4, 0]} name="Average Latency (ms)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Latency Over Time Trend */}
        <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-800 dark:text-[#E6EDF3]">
                <Activity size={15} className="text-amber-500" />
                <span>Latency Timeline & Jitter</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-[#8B949E] mt-0.5">
                Monitoring network latency stability and API response duration over time.
              </p>
            </div>
          </div>

          <div className="w-full h-64 min-h-64">
            {!hasData ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-400 dark:text-[#6E7681] gap-1">
                <span>No latency timeline points available.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#888888" opacity={0.15} vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#888888', opacity: 0.2 }}
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `${val}ms`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0]?.payload;
                      return (
                        <div className="bg-slate-950 text-white border border-slate-800 p-2.5 rounded-lg shadow-xl text-xs flex flex-col gap-1 min-w-36">
                          <div className="font-semibold text-slate-300 mb-0.5">{data?.fullDate || label}</div>
                          <div className="flex justify-between text-amber-400">
                            <span>Avg Latency:</span>
                            <span className="font-mono font-medium">{data?.avgLatency || 0} ms</span>
                          </div>
                          <div className="flex justify-between text-slate-400 text-[11px]">
                            <span>Requests:</span>
                            <span>{data?.requestCount || 0}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgLatency"
                    name="Avg Latency (ms)"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#F59E0B' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* DETAILED MODEL & EVALUATION TELEMETRY TABLE               */}
      {/* ======================================================== */}
      <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#222222] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Model Performance & Token Ledger
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">
              Granular breakdown of tokens, latency, cost, and query volume per AI model.
            </p>
          </div>
          <div className="text-xs text-slate-400 font-mono">
            {modelMetricsData.length} models tracked
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-[#161616] border-b border-slate-200/80 dark:border-[#222222] text-slate-500 dark:text-[#8B949E] select-none">
              <tr>
                <th className="py-2.5 px-4 font-medium">Model</th>
                <th className="py-2.5 px-4 font-medium">Provider</th>
                <th className="py-2.5 px-4 font-medium text-right">Avg Latency</th>
                <th className="py-2.5 px-4 font-medium text-right">Prompt Tokens</th>
                <th className="py-2.5 px-4 font-medium text-right">Completion Tokens</th>
                <th className="py-2.5 px-4 font-medium text-right">Total Tokens</th>
                <th className="py-2.5 px-4 font-medium text-right">Est. Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {modelMetricsData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 dark:text-[#6E7681]">
                    No model usage recorded. Start a chat or run an evaluation task to view telemetry.
                  </td>
                </tr>
              ) : (
                modelMetricsData.map((m) => (
                  <tr
                    key={m.modelId}
                    className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-[#E6EDF3]">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: PROVIDER_PALETTE[m.provider]?.color || '#94A3B8' }}
                        />
                        <span>{m.modelId}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-[#8B949E] capitalize">
                      {PROVIDER_PALETTE[m.provider]?.name || m.provider}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-purple-600 dark:text-purple-400 font-medium">
                      {m.avgLatency > 0 ? `${m.avgLatency} ms` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-[#8B949E]">
                      {m.inputTokens.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-[#8B949E]">
                      {m.outputTokens.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-900 dark:text-white font-semibold">
                      {m.totalTokens.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      ${m.cost.toFixed(4)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
