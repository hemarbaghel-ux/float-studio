import React, { useMemo, useState } from 'react';
import { ArrowLeft, Activity, DollarSign, Cpu, Clock, BarChart3, TrendingUp, Search, Sparkles } from 'lucide-react';
import { useUsageStore } from '../../store/usageStore';
import { INITIAL_MODELS } from '../ai/registry';
import { FloatLogo } from '../../components/FloatLogo';
import { TokenUsageChart } from './TokenUsageChart';
import { generateSampleUsageData } from './sampleUsageData';

export function UsageDashboard() {
  const { records, setRecords, clearRecords } = useUsageStore();
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | '90d' | 'all'>('7d');
  const [providerFilter, setProviderFilter] = useState<'all' | 'openai' | 'google' | 'anthropic' | 'xai'>('all');
  const [isSampleData, setIsSampleData] = useState(false);

  // Filter records based on timeRange and provider
  const filteredRecords = useMemo(() => {
    const now = Date.now();
    let cutoff = 0;
    if (timeRange === '24h') cutoff = now - 24 * 60 * 60 * 1000;
    if (timeRange === '7d') cutoff = now - 7 * 24 * 60 * 60 * 1000;
    if (timeRange === '30d') cutoff = now - 30 * 24 * 60 * 60 * 1000;
    if (timeRange === '90d') cutoff = now - 90 * 24 * 60 * 60 * 1000;

    return records.filter(r => {
      if (r.timestamp < cutoff) return false;
      if (providerFilter !== 'all') {
        const p = (r.provider || '').toLowerCase();
        if (providerFilter === 'google' && !p.includes('google') && !p.includes('gemini')) return false;
        if (providerFilter === 'openai' && !p.includes('openai') && !p.includes('gpt')) return false;
        if (providerFilter === 'anthropic' && !p.includes('anthropic') && !p.includes('claude')) return false;
        if (providerFilter === 'xai' && !p.includes('xai') && !p.includes('grok')) return false;
      }
      return true;
    });
  }, [records, timeRange, providerFilter]);

  const stats = useMemo(() => {
    const totalRequests = filteredRecords.length;
    const totalInput = filteredRecords.reduce((sum, r) => sum + r.inputTokens, 0);
    const totalOutput = filteredRecords.reduce((sum, r) => sum + r.outputTokens, 0);
    const totalCost = filteredRecords.reduce((sum, r) => sum + r.estimatedCost, 0);
    const successfulRequests = filteredRecords.filter(r => r.status === 'success').length;
    const avgLatency = totalRequests > 0 ? filteredRecords.reduce((sum, r) => sum + r.latency, 0) / totalRequests : 0;
    const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;

    return { totalRequests, totalInput, totalOutput, totalTokens: totalInput + totalOutput, totalCost, avgLatency, successRate };
  }, [filteredRecords]);

  // Aggregate by model
  const modelStats = useMemo(() => {
    const stats: Record<string, { requests: number; cost: number; tokens: number }> = {};
    filteredRecords.forEach(r => {
      if (!stats[r.modelId]) stats[r.modelId] = { requests: 0, cost: 0, tokens: 0 };
      stats[r.modelId].requests++;
      stats[r.modelId].cost += r.estimatedCost;
      stats[r.modelId].tokens += r.totalTokens;
    });
    return Object.entries(stats).sort((a, b) => b[1].cost - a[1].cost).map(([modelId, data]) => ({
      modelId,
      name: INITIAL_MODELS.find(m => m.id === modelId)?.displayName || modelId,
      ...data
    }));
  }, [filteredRecords]);

  const handleLoadSampleData = () => {
    const sample = generateSampleUsageData();
    setRecords(sample);
    setIsSampleData(true);
  };

  const handleClearData = () => {
    clearRecords();
    setIsSampleData(false);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#0A0A08] text-slate-900 dark:text-white flex flex-col font-sans">
      <header className="h-14 border-b border-slate-200 dark:border-white/10 flex items-center justify-between px-6 bg-white dark:bg-[#0A0A08] shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-6">
          <a href="/" className="flex items-center gap-2 text-slate-900 dark:text-white hover:opacity-80 transition-opacity">
            <FloatLogo className="w-5 h-5" />
            <span className="font-semibold text-sm tracking-wide">FLOAT</span>
          </a>
          <div className="w-px h-4 bg-slate-200 dark:bg-white/20"></div>
          <nav className="flex items-center gap-4">
            <a href="/models" className="text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-white transition-colors">Hub</a>
            <a href="/models/usage" className="text-sm font-medium text-slate-900 dark:text-white transition-colors">Usage</a>
            <a href="/models/evals" className="text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-white transition-colors">Evals</a>
          </nav>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-12">
          {/* TITLE & FILTERS */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white mb-2 flex items-center gap-3">
                <BarChart3 className="w-8 h-8 text-[#7C3AED]" />
                Usage Dashboard
              </h1>
              <p className="text-lg text-slate-600 dark:text-[#A1A1AA] max-w-xl">
                Track real-time token consumption, estimated costs, and API latency across all models.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Provider Filter */}
              <div className="flex p-1 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-lg overflow-x-auto">
                <button 
                  onClick={() => setProviderFilter('all')} 
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${providerFilter === 'all' ? 'bg-slate-100 dark:bg-[#202020] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'}`}
                >
                  All
                </button>
                <button 
                  onClick={() => setProviderFilter('google')} 
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${providerFilter === 'google' ? 'bg-slate-100 dark:bg-[#202020] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'}`}
                >
                  Google
                </button>
                <button 
                  onClick={() => setProviderFilter('openai')} 
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${providerFilter === 'openai' ? 'bg-slate-100 dark:bg-[#202020] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'}`}
                >
                  OpenAI
                </button>
                <button 
                  onClick={() => setProviderFilter('anthropic')} 
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${providerFilter === 'anthropic' ? 'bg-slate-100 dark:bg-[#202020] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'}`}
                >
                  Anthropic
                </button>
                <button 
                  onClick={() => setProviderFilter('xai')} 
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${providerFilter === 'xai' ? 'bg-slate-100 dark:bg-[#202020] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'}`}
                >
                  xAI
                </button>
              </div>

              {/* Time Range Filter */}
              <div className="flex p-1 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-lg">
                <button onClick={() => setTimeRange('24h')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${timeRange === '24h' ? 'bg-slate-100 dark:bg-[#202020] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'}`}>24h</button>
                <button onClick={() => setTimeRange('7d')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${timeRange === '7d' ? 'bg-slate-100 dark:bg-[#202020] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'}`}>7d</button>
                <button onClick={() => setTimeRange('30d')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${timeRange === '30d' ? 'bg-slate-100 dark:bg-[#202020] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'}`}>30d</button>
                <button onClick={() => setTimeRange('90d')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${timeRange === '90d' ? 'bg-slate-100 dark:bg-[#202020] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'}`}>90d</button>
                <button onClick={() => setTimeRange('all')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${timeRange === 'all' ? 'bg-slate-100 dark:bg-[#202020] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white'}`}>All Time</button>
              </div>
            </div>
          </div>

          {/* TOP KPI CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="p-6 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 dark:text-[#A1A1AA] mb-4">
                <DollarSign size={16} />
                <h3 className="text-sm font-medium">Estimated Cost</h3>
              </div>
              <div className="text-4xl font-semibold text-slate-900 dark:text-white">${stats.totalCost.toFixed(4)}</div>
            </div>
            
            <div className="p-6 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 dark:text-[#A1A1AA] mb-4">
                <Activity size={16} />
                <h3 className="text-sm font-medium">Total Requests</h3>
              </div>
              <div className="text-4xl font-semibold text-slate-900 dark:text-white">{stats.totalRequests.toLocaleString()}</div>
              <div className="mt-2 text-sm text-slate-500 dark:text-[#A1A1AA]">{stats.successRate.toFixed(1)}% success rate</div>
            </div>

            <div className="p-6 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 dark:text-[#A1A1AA] mb-4">
                <Cpu size={16} />
                <h3 className="text-sm font-medium">Total Tokens</h3>
              </div>
              <div className="text-4xl font-semibold text-slate-900 dark:text-white">{stats.totalTokens > 1000000 ? `${(stats.totalTokens/1000000).toFixed(1)}M` : stats.totalTokens > 1000 ? `${(stats.totalTokens/1000).toFixed(1)}k` : stats.totalTokens}</div>
              <div className="mt-2 flex gap-3 text-xs text-slate-500 dark:text-[#A1A1AA]">
                <span>In: {stats.totalInput.toLocaleString()}</span>
                <span>Out: {stats.totalOutput.toLocaleString()}</span>
              </div>
            </div>

            <div className="p-6 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 dark:text-[#A1A1AA] mb-4">
                <Clock size={16} />
                <h3 className="text-sm font-medium">Avg Latency</h3>
              </div>
              <div className="text-4xl font-semibold text-slate-900 dark:text-white">{(stats.avgLatency / 1000).toFixed(2)}s</div>
            </div>
          </div>

          {/* TOKEN USAGE RECHARTS COMPONENT */}
          <TokenUsageChart
            records={filteredRecords}
            timeRange={timeRange}
            providerFilter={providerFilter}
            onLoadSampleData={handleLoadSampleData}
            onClearData={handleClearData}
            isSampleData={isSampleData}
          />

          {/* COST BY MODEL TABLE */}
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white mb-6">Cost by Model</h2>
          {modelStats.length > 0 ? (
            <div className="bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden mb-12">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-[#111] text-slate-500 dark:text-[#A1A1AA] border-b border-slate-200 dark:border-white/10">
                    <tr>
                      <th className="px-6 py-4 font-medium">Model</th>
                      <th className="px-6 py-4 font-medium">Requests</th>
                      <th className="px-6 py-4 font-medium">Tokens</th>
                      <th className="px-6 py-4 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                    {modelStats.map(model => (
                      <tr key={model.modelId} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white capitalize">{model.name}</td>
                        <td className="px-6 py-4 text-slate-600 dark:text-[#A1A1AA]">{model.requests.toLocaleString()}</td>
                        <td className="px-6 py-4 text-slate-600 dark:text-[#A1A1AA]">{model.tokens.toLocaleString()}</td>
                        <td className="px-6 py-4 text-slate-900 dark:text-white font-medium">${model.cost.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="py-16 text-center flex flex-col items-center justify-center bg-white/50 dark:bg-[#111]/50 rounded-2xl border border-dashed border-slate-200 dark:border-white/10 mb-12">
              <Activity size={28} className="text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="text-base font-medium text-slate-900 dark:text-white mb-1">No usage data for this filter</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                Start making AI requests in the editor or load sample preview data above to see your model breakdown.
              </p>
            </div>
          )}

          {/* RECENT REQUESTS TABLE */}
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white mb-6">Recent Requests</h2>
          {filteredRecords.length > 0 ? (
            <div className="bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden mb-12">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-[#111] text-slate-500 dark:text-[#A1A1AA] border-b border-slate-200 dark:border-white/10">
                    <tr>
                      <th className="px-6 py-4 font-medium">Time</th>
                      <th className="px-6 py-4 font-medium">Model</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium">Tokens (In / Out)</th>
                      <th className="px-6 py-4 font-medium">Latency</th>
                      <th className="px-6 py-4 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                    {filteredRecords.slice().reverse().slice(0, 50).map(record => (
                      <tr key={record.requestId} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 text-slate-600 dark:text-[#A1A1AA]">{new Date(record.timestamp).toLocaleString()}</td>
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white capitalize">{INITIAL_MODELS.find(m => m.id === record.modelId)?.displayName || record.modelId}</td>
                        <td className="px-6 py-4">
                          {record.status === 'success' ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400">
                              <span className="w-1 h-1 rounded-full bg-green-500"></span> Success
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400">
                              <span className="w-1 h-1 rounded-full bg-red-500"></span> Error
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-[#A1A1AA]">
                          {record.inputTokens.toLocaleString()} / {record.outputTokens.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-[#A1A1AA]">{(record.latency / 1000).toFixed(2)}s</td>
                        <td className="px-6 py-4 text-slate-900 dark:text-white font-medium">${record.estimatedCost.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="py-16 text-center flex flex-col items-center justify-center bg-white/50 dark:bg-[#111]/50 rounded-2xl border border-dashed border-slate-200 dark:border-white/10 mb-12">
               <span className="text-xs text-slate-500 dark:text-[#A1A1AA]">No recent requests found for this filter.</span>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
