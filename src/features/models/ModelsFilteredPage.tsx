import React, { useState, useMemo, useEffect } from 'react';
import { useAIStore } from '../../store/aiStore';
import { useIDEStore } from '../../store';
import { useEvalStore } from '../../store/evalStore';
import { FloatLogo } from '../../components/FloatLogo';
import { Sun, Moon, Brain, Cpu, Wrench, Search, Eye, ArrowLeft, ArrowRight } from 'lucide-react';
import { INITIAL_MODELS } from '../ai/registry';
import { PerformanceChart } from './PerformanceChart';
import { ModelPerformanceTable } from './ModelPerformanceTable';
import { ModelsDropdown } from '../../components/ModelsDropdown';
import { motion, AnimatePresence } from 'motion/react';

interface ModelsFilteredPageProps {
  providerId: string;
  title: string;
  description: string;
}

export function ModelsFilteredPage({ providerId, title, description }: ModelsFilteredPageProps) {
  const { setSelectedModel, models } = useAIStore();
  const { settings, updateSettings } = useIDEStore();
  const { runs, tasks, fetchRuns, fetchTasks } = useEvalStore();
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [comparedModels, setComparedModels] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    fetchRuns();
    fetchTasks();
  }, [fetchRuns, fetchTasks]);
  
  const toggleTheme = () => {
    updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };
  
  const activeModels = models.length > 0 ? models : INITIAL_MODELS;

  const filteredModels = useMemo(() => {
    return activeModels.filter(m => m.providerId === providerId);
  }, [activeModels, providerId]);

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    runs.forEach(run => {
      if (run.status === 'Completed') {
        const task = tasks.find(t => t.id === run.taskId);
        if (task && task.category) {
          cats.add(task.category);
        }
      }
    });
    const sortedCats = Array.from(cats).sort();
    return ['All', ...sortedCats];
  }, [runs, tasks]);

  const rawGraphData = useMemo(() => {
    const dataByModel = new Map();
    runs.forEach(run => {
      if (run.status !== 'Completed') return;
      
      const task = tasks.find(t => t.id === run.taskId);
      if (selectedCategory !== 'All' && task?.category !== selectedCategory) {
        return;
      }

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

    return Array.from(dataByModel.entries())
      .filter(([modelId]) => activeModels.find(m => m.id === modelId)?.providerId === providerId)
      .map(([modelId, data]) => {
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
  }, [runs, tasks, activeModels, providerId, selectedCategory]);

  const graphData = useMemo(() => {
    if (comparedModels.size === 0) return rawGraphData;
    return rawGraphData.filter(d => comparedModels.has(d.modelId));
  }, [rawGraphData, comparedModels]);

  const toggleCompare = (modelId: string) => {
    setComparedModels(prev => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    window.location.href = '/'; 
  };

  const selectedModelInfo = selectedModelId ? activeModels.find(m => m.id === selectedModelId) || null : null;
  const selectedModelGraphData = selectedModelId ? graphData.find(d => d.modelId === selectedModelId) : undefined;

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
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <a href="/models" className="text-slate-900 dark:text-white">Hub</a>
            <a href="/models/usage" className="text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-white transition-colors">Usage</a>
            <a href="/models/evals" className="text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-white transition-colors">Evals</a>
          </nav>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-[#A1A1AA]">
            <ModelsDropdown currentPath={window.location.pathname} />
            <a href="/features" className="hover:text-slate-900 dark:hover:text-white transition-colors pb-1">Product</a>
            <a href="/pricing" className="hover:text-slate-900 dark:hover:text-white transition-colors pb-1">Pricing</a>
            <a href="/resources" className="hover:text-slate-900 dark:hover:text-white transition-colors pb-1">Resources</a>
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
        <div>
          <div className="mb-6 max-w-7xl mx-auto flex items-center">
            <a href="/models" className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-white transition-colors">
              <ArrowLeft size={16} />
              Back to Models
            </a>
          </div>

          <div className="flex flex-col mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-sm font-medium text-slate-600 dark:text-slate-300 mb-6 w-fit">
              <span className={`w-2 h-2 rounded-full ${providerId === 'openai' ? 'bg-[#10a37f]' : providerId === 'google' ? 'bg-[#4285f4]' : 'bg-[#7C3AED]'}`}></span>
              {providerId === 'openai' ? 'OpenAI' : providerId === 'google' ? 'Google' : providerId}
            </div>
            <h1 className="text-4xl md:text-5xl font-medium tracking-tight mb-4 leading-[1.1] max-w-2xl text-slate-900 dark:text-white">
              {title}
            </h1>
            <p className="text-lg text-slate-600 dark:text-[#A1A1AA] max-w-xl">
              {description}
            </p>
          </div>
          
          <div className="mb-20">
            <h2 className="text-xs font-semibold text-slate-500 dark:text-[#A1A1AA] uppercase tracking-wider mb-6">Available Models</h2>
            
            {filteredModels.length === 0 ? (
              <div className="py-20 text-center flex flex-col items-center justify-center bg-white/50 dark:bg-[#111]/50 rounded-3xl border border-dashed border-slate-200 dark:border-white/10">
                <Search size={32} className="text-slate-300 dark:text-slate-600 mb-4" />
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">No models found</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No models are currently configured for this provider.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredModels.map(model => (
                  <div key={model.id} className="p-6 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161616] hover:border-slate-300 dark:hover:border-white/20 transition-all group flex flex-col h-full shadow-sm">
                    <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-2 group-hover:text-[#7C3AED] dark:group-hover:text-white transition-colors capitalize">{model.displayName}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-8 flex-1 leading-relaxed">
                      {model.description || "Advanced AI model for natural language processing and coding tasks."}
                    </p>
                    
                    <div className="grid grid-cols-3 gap-3 mb-8">
                      <div>
                        <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-1.5">Context</div>
                        <div className="text-sm font-medium text-slate-900 dark:text-white">{model.contextWindow >= 1000 ? `${model.contextWindow / 1000}k` : model.contextWindow}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-1.5">Coding</div>
                        <div className="text-sm font-medium text-slate-900 dark:text-white">{model.capabilities.coding ? 'Strong' : 'Basic'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-1.5">Reasoning</div>
                        <div className="text-sm font-medium text-slate-900 dark:text-white">{model.capabilities.reasoning ? 'Strong' : 'Basic'}</div>
                      </div>
                    </div>
                    
                    <a href={`/models/${providerId === 'openai' ? 'gpt' : providerId === 'google' ? 'gemini' : providerId}/${model.id}`} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10">View details</a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {filteredModels.length > 0 && (
            <div className="mb-8">
              {availableCategories.length > 1 && (
                <div className="mb-8">
                  <h2 className="text-xs font-semibold text-slate-500 dark:text-[#A1A1AA] uppercase tracking-wider mb-3">Filter by Category</h2>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                    {availableCategories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
                          selectedCategory === cat 
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-black' 
                            : 'bg-white dark:bg-[#161616] text-slate-600 dark:text-[#A1A1AA] border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {rawGraphData.length > 0 ? (
                <>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                    <h2 className="text-xs font-semibold text-slate-500 dark:text-[#A1A1AA] uppercase tracking-wider">Performance Summary</h2>
                    
                    {rawGraphData.length > 1 && (
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Compare:</span>
                        <div className="flex items-center gap-2 flex-wrap">
                          {rawGraphData.map(d => (
                            <label key={d.modelId} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161616] cursor-pointer hover:border-slate-300 dark:hover:border-white/20 transition-colors">
                              <input 
                                type="checkbox" 
                                checked={comparedModels.size === 0 || comparedModels.has(d.modelId)}
                                onChange={() => toggleCompare(d.modelId)}
                                className="w-4 h-4 rounded text-[#7C3AED] focus:ring-[#7C3AED] border-slate-300"
                              />
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{d.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-16">
                    <div className="p-5 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-sm">
                      <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-1">Best Eval Score</div>
                      <div className="text-2xl font-semibold text-slate-900 dark:text-white">{graphData.length > 0 ? `${Math.max(...graphData.map(d => d.score)).toFixed(1)}%` : '--'}</div>
                    </div>
                    <div className="p-5 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-sm">
                      <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-1">Average Cost</div>
                      <div className="text-2xl font-semibold text-slate-900 dark:text-white">{graphData.length > 0 ? `$${(graphData.reduce((acc, d) => acc + d.cost, 0) / graphData.length).toFixed(4)}` : '--'}</div>
                    </div>
                    <div className="p-5 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-sm">
                      <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-1">Avg Tokens</div>
                      <div className="text-2xl font-semibold text-slate-900 dark:text-white">{graphData.length > 0 ? Math.round(graphData.reduce((acc, d) => acc + d.tokens, 0) / graphData.length).toLocaleString() : '--'}</div>
                    </div>
                    <div className="p-5 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-sm">
                      <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-1">Avg Steps</div>
                      <div className="text-2xl font-semibold text-slate-900 dark:text-white">{graphData.length > 0 ? (graphData.reduce((acc, d) => acc + d.steps, 0) / graphData.length).toFixed(1) : '--'}</div>
                    </div>
                    <div className="p-5 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-sm">
                      <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-1">Tasks Evaluated</div>
                      <div className="text-2xl font-semibold text-slate-900 dark:text-white">{graphData.length > 0 ? graphData.reduce((acc, d) => acc + d.count, 0) : '--'}</div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xs font-semibold text-slate-500 dark:text-[#A1A1AA] uppercase tracking-wider mb-6">Performance Summary</h2>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-16">
                    {['Best Eval Score', 'Average Cost', 'Avg Tokens', 'Avg Steps', 'Tasks Evaluated'].map(title => (
                      <div key={title} className="p-5 bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 rounded-xl shadow-sm opacity-60">
                        <div className="text-xs text-slate-500 dark:text-[#A1A1AA] mb-1">{title}</div>
                        <div className="text-2xl font-semibold text-slate-900 dark:text-white">--</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white mb-6">Model performance</h2>
              <PerformanceChart graphData={graphData} onPointClick={setSelectedModelId} />
              
              <div className="mt-16">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white mb-6">Model evaluations</h2>
                <ModelPerformanceTable graphData={graphData} onRowClick={setSelectedModelId} />
              </div>
            </div>
          )}
        </div>
      </main>

      
    </div>
  );
}
