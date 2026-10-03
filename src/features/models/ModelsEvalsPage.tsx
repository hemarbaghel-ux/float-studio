import React, { useEffect, useMemo } from 'react';
import { useAIStore } from '../../store/aiStore';
import { useIDEStore } from '../../store';
import { useEvalStore } from '../../store/evalStore';
import { FloatLogo } from '../../components/FloatLogo';
import { Sun, Moon } from 'lucide-react';
import { INITIAL_MODELS } from '../ai/registry';
import { PerformanceChart } from './PerformanceChart';
import { ModelPerformanceTable } from './ModelPerformanceTable';
import { TrustworthyBenchmarkDashboard } from './TrustworthyBenchmarkDashboard';
import { ModelsDropdown } from '../../components/ModelsDropdown';

export function ModelsEvalsPage() {
  const { models } = useAIStore();
  const { settings, updateSettings } = useIDEStore();
  const { runs, fetchRuns } = useEvalStore();
  
  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);
  
  const toggleTheme = () => {
    updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };
  
  const activeModels = models.length > 0 ? models : INITIAL_MODELS;

  const graphData = useMemo(() => {
    const dataByModel = new Map();
    runs.forEach(run => {
      if (run.status !== 'Completed') return;
      if (!dataByModel.has(run.modelId)) {
        dataByModel.set(run.modelId, { scoreSum: 0, costSum: 0, tokensSum: 0, stepsSum: 0, count: 0 });
      }
      const data = dataByModel.get(run.modelId);
      data.scoreSum += (run.score || 0);
      data.costSum += (run.metrics?.estimatedCost || 0);
      data.tokensSum += (run.metrics?.tokenUsage?.total || 0);
      data.stepsSum += (run.activity?.length || 0);
      data.count++;
    });

    return Array.from(dataByModel.entries()).map(([modelId, data]) => {
      const modelInfo = activeModels.find(m => m.id === modelId);
      return {
        modelId,
        name: modelInfo?.displayName || modelId,
        score: data.scoreSum / data.count,
        cost: data.costSum / data.count,
        tokens: data.tokensSum / data.count,
        steps: data.stepsSum / data.count,
        count: data.count
      };
    });
  }, [runs, activeModels]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F0F0B] text-slate-900 dark:text-[#EDEDED] font-sans selection:bg-[#7C3AED]/20 dark:selection:bg-[#EDEDED] dark:selection:text-[#0F0F0B] transition-colors flex flex-col">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-[#0F0F0B]/80 backdrop-blur-md border-b border-slate-200/80 dark:border-white/5 transition-colors">
        <div className="flex items-center gap-8">
          <a href="/" className="flex items-center gap-2.5 cursor-pointer" onClick={(e) => {
            if (window.location.pathname !== '/') {
              e.preventDefault();
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }}>
            <FloatLogo className="w-6 h-6" />
            <span className="font-bold text-lg tracking-tight uppercase text-slate-900 dark:text-white">FLOAT</span>
          </a>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-[#A1A1AA]">
            <ModelsDropdown currentPath={window.location.pathname} />
            <a href="#" className="hover:text-slate-900 dark:hover:text-white transition-colors pb-1">Product</a>
            <a href="#" className="hover:text-slate-900 dark:hover:text-white transition-colors pb-1">Pricing</a>
            <a href="#" className="hover:text-slate-900 dark:hover:text-white transition-colors pb-1">Resources</a>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm font-medium">
          <button
            onClick={toggleTheme}
            aria-label={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
            title={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
            className="p-2 rounded-full border border-slate-200 dark:border-white/15 text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 pt-24 pb-20 px-6 max-w-7xl mx-auto w-full">
        <div className="flex flex-col items-center justify-center text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-medium tracking-tight mb-4 leading-[1.1] max-w-2xl text-slate-900 dark:text-white">
            Model Evaluations
          </h1>
          <p className="text-lg text-slate-600 dark:text-[#A1A1AA] max-w-xl mx-auto">
            Analyze real-world performance, task success, and average costs derived directly from the FLOAT Benchmark Engine.
          </p>
        </div>
        
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-6">Compare Performance</h2>
          {graphData.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
              <div className="p-4 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-sm">
                <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-1">Best Eval Score</div>
                <div className="text-xl font-semibold">{Math.max(...graphData.map(d => d.score)).toFixed(1)}%</div>
              </div>
              <div className="p-4 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-sm">
                <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-1">Average Cost</div>
                <div className="text-xl font-semibold">${(graphData.reduce((acc, d) => acc + d.cost, 0) / graphData.length).toFixed(4)}</div>
              </div>
              <div className="p-4 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-sm">
                <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-1">Avg Tokens</div>
                <div className="text-xl font-semibold">{Math.round(graphData.reduce((acc, d) => acc + d.tokens, 0) / graphData.length).toLocaleString()}</div>
              </div>
              <div className="p-4 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-sm">
                <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-1">Avg Steps</div>
                <div className="text-xl font-semibold">{(graphData.reduce((acc, d) => acc + d.steps, 0) / graphData.length).toFixed(1)}</div>
              </div>
              <div className="p-4 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-sm">
                <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-1">Tasks Evaluated</div>
                <div className="text-xl font-semibold">{graphData.reduce((acc, d) => acc + d.count, 0)}</div>
              </div>
            </div>
          )}
          <PerformanceChart graphData={graphData} />
          
          <div className="mt-12">
            <TrustworthyBenchmarkDashboard />
          </div>
        </div>
      </main>
    </div>
  );
}
