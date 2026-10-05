import React, { useState, useEffect, useMemo } from 'react';
import { useAIStore } from '../../store/aiStore';
import { useIDEStore } from '../../store';
import { FloatLogo } from '../../components/FloatLogo';
import { 
  Sun, 
  Moon, 
  ArrowLeft, 
  Brain, 
  Cpu, 
  Zap, 
  Eye, 
  Wrench, 
  Shield, 
  Check, 
  Info, 
  Search, 
  Scale, 
  Coins, 
  Layers, 
  ExternalLink,
  CheckCircle2,
  Lock,
  Calculator,
  BarChart2,
  BookOpen,
  ArrowRight,
  Sparkles,
  Filter
} from 'lucide-react';
import { INITIAL_MODELS } from '../ai/registry';
import { PerformanceChart } from './PerformanceChart';
import { ModelPerformanceTable } from './ModelPerformanceTable';
import { ModelDetails } from './ModelDetails';
import { ModelCostCalculator } from './ModelCostCalculator';
import { CompareModelsModal } from './CompareModelsModal';
import { ModelsDropdown } from '../../components/ModelsDropdown';
import { LanguageDropdown } from '../../components/LanguageDropdown';
import { useTranslation } from '../../components/LanguageProvider';
import { 
  useModelIntelligenceStore, 
  WORKLOAD_PRESETS 
} from '../../store/modelIntelligenceStore';
import { VERIFIED_MODELS } from '../../data/verifiedModels';
import { 
  VERIFIED_BENCHMARK_DEFINITIONS, 
  VERIFIED_BENCHMARK_SCORES 
} from '../../data/verifiedBenchmarks';
import { AIModel } from '../../types/ai';

type ModelsTab = 'catalog' | 'benchmarks' | 'analytics' | 'calculator' | 'provenance';

export function ModelsPage() {
  const { setSelectedModel, models } = useAIStore();
  const { settings, updateSettings } = useIDEStore();
  const { t } = useTranslation();

  const { 
    fetchProviderStatus, 
    providerStatus, 
    comparisonModelIds, 
    toggleComparisonModel, 
    clearComparison 
  } = useModelIntelligenceStore();

  const [activeTab, setActiveTab] = useState<ModelsTab>('catalog');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [filterCapability, setFilterCapability] = useState('All');
  const [filterProvider, setFilterProvider] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);

  useEffect(() => {
    fetchProviderStatus();
  }, [fetchProviderStatus]);

  const toggleTheme = () => {
    updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };

  const activeModels: AIModel[] = models.length > 0 ? models : INITIAL_MODELS;

  // Filtered models for catalog view
  const filteredModels = useMemo(() => {
    return activeModels.filter(m => {
      // Exclude generic 'auto' from catalog cards
      if (m.id === 'auto') return false;

      // Provider filter
      if (filterProvider !== 'All') {
        const fp = filterProvider.toLowerCase();
        const matchesProvider = m.providerId === fp || (m.provider && m.provider.toLowerCase() === fp);
        if (!matchesProvider) return false;
      }

      // Capability filter
      if (filterCapability !== 'All') {
        if (filterCapability === 'Coding' && !m.capabilities.coding) return false;
        if (filterCapability === 'Reasoning' && !m.capabilities.reasoning) return false;
        if (filterCapability === 'Agentic' && !m.capabilities.tools) return false;
        if (filterCapability === 'Vision' && !m.capabilities.vision) return false;
        if (filterCapability === 'Fast' && m.speed !== 'fast') return false;
      }

      // Search query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const searchString = [
          m.displayName,
          m.providerId,
          m.family,
          m.id,
          m.description || '',
          m.exactModelId || ''
        ].join(' ').toLowerCase();
        if (!searchString.includes(query)) return false;
      }

      return true;
    });
  }, [activeModels, filterProvider, filterCapability, searchQuery]);

  const selectedModel = activeModels.find(m => m.id === selectedModelId);

  const comparedModelsList = useMemo(() => {
    return activeModels.filter(m => comparisonModelIds.includes(m.id));
  }, [activeModels, comparisonModelIds]);

  return (
    <div className="min-h-screen bg-[#090D13] text-[#C9D1D9] font-sans flex flex-col selection:bg-[#7C3AED]/30">
      {/* Platform Top Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 py-3.5 bg-[#0D1117]/90 backdrop-blur-md border-b border-[#30363D] transition-colors">
        <div className="flex items-center gap-8">
          <a 
            href="/" 
            className="flex items-center gap-2.5 cursor-pointer"
            onClick={(e) => {
              if (window.location.pathname !== '/') {
                e.preventDefault();
                window.history.pushState({}, '', '/');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }
            }}
          >
            <FloatLogo className="w-6 h-6" />
            <span className="font-bold text-lg tracking-tight uppercase text-white">FLOAT</span>
          </a>

          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-[#8B949E]">
            <ModelsDropdown currentPath={window.location.pathname} />
            <a 
              href="/models" 
              onClick={(e) => {
                e.preventDefault();
                setSelectedModelId(null);
                setActiveTab('catalog');
                window.history.pushState({}, '', '/models');
              }}
              className="text-white border-b-2 border-[#7C3AED] pb-1 transition-colors"
            >
              {t('nav.models', 'Models')}
            </a>
            <a 
              href="/evals" 
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/evals');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="hover:text-white transition-colors"
            >
              {t('nav.evals', 'Evals')}
            </a>
            <a 
              href="/models/usage" 
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/models/usage');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="hover:text-white transition-colors"
            >
              {t('nav.usage', 'Usage')}
            </a>
            <a 
              href="/pricing" 
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/pricing');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="hover:text-white transition-colors"
            >
              {t('nav.pricing', 'Pricing')}
            </a>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm font-medium">
          <LanguageDropdown />
          <button
            onClick={toggleTheme}
            aria-label={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
            className="p-2 rounded-full border border-[#30363D] text-[#8B949E] hover:text-white hover:bg-[#161B22] transition-colors cursor-pointer"
          >
            {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 pt-20 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        {selectedModel ? (
          /* Detailed Single Model Intelligence View */
          <div className="pt-6">
            <ModelDetails 
              model={selectedModel} 
              onBack={() => setSelectedModelId(null)}
              onSelect={() => {
                setSelectedModel(selectedModel.id);
                // Return to dashboard or IDE if initiated
                window.history.pushState({}, '', '/');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
            />
          </div>
        ) : (
          /* Main Intelligence Hub View */
          <div>
            {/* Page Header */}
            <div className="py-6 border-b border-[#30363D] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold tracking-tight text-white">
                    Model Intelligence & Benchmarks
                  </h1>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-950/70 border border-purple-800 text-purple-300 font-medium">
                    Source-Verified
                  </span>
                </div>
                <p className="text-sm text-[#8B949E] mt-1.5 max-w-3xl leading-relaxed">
                  Rigorous, data-driven intelligence on developer AI models. Transparent official pricing, 
                  traceable benchmark scores from original technical reports, and verifiable server availability.
                </p>
              </div>

              {/* Provenance Badge & Quick Compare Button */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden sm:flex flex-col text-right text-xs">
                  <span className="text-emerald-400 font-bold flex items-center justify-end gap-1">
                    <CheckCircle2 size={13} /> 100% Attributed
                  </span>
                  <span className="text-[#8B949E] text-[11px]">No synthetic benchmark scores</span>
                </div>

                {comparisonModelIds.length > 0 && (
                  <button
                    onClick={() => setIsCompareModalOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-sm"
                  >
                    <Scale size={14} />
                    <span>Compare ({comparisonModelIds.length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Metric Summary Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-6">
              <div className="p-4 rounded-xl bg-[#12161F] border border-[#21262D]">
                <span className="text-[11px] uppercase font-semibold text-[#8B949E] block">Frontier Models</span>
                <span className="text-2xl font-bold text-white mt-1 block">{VERIFIED_MODELS.length}</span>
                <span className="text-[11px] text-purple-300 mt-0.5 block">Google, OpenAI, Anthropic, xAI</span>
              </div>

              <div className="p-4 rounded-xl bg-[#12161F] border border-[#21262D]">
                <span className="text-[11px] uppercase font-semibold text-[#8B949E] block">Verified Benchmark Scores</span>
                <span className="text-2xl font-bold text-emerald-400 mt-1 block">{VERIFIED_BENCHMARK_SCORES.length}</span>
                <span className="text-[11px] text-[#8B949E] mt-0.5 block">Across 5 standardized suites</span>
              </div>

              <div className="p-4 rounded-xl bg-[#12161F] border border-[#21262D]">
                <span className="text-[11px] uppercase font-semibold text-[#8B949E] block">Standardized Suites</span>
                <span className="text-2xl font-bold text-white mt-1 block">{VERIFIED_BENCHMARK_DEFINITIONS.length}</span>
                <span className="text-[11px] text-[#8B949E] mt-0.5 block">SWE-bench, HumanEval, GPQA, MATH</span>
              </div>

              <div className="p-4 rounded-xl bg-[#12161F] border border-[#21262D]">
                <span className="text-[11px] uppercase font-semibold text-[#8B949E] block">Source Attribution</span>
                <span className="text-2xl font-bold text-purple-400 mt-1 block">Tier 1</span>
                <span className="text-[11px] text-[#8B949E] mt-0.5 block">Official provider documentation</span>
              </div>
            </div>

            {/* Top Level Navigation Tabs */}
            <div className="flex border-b border-[#30363D] mt-2 mb-8 gap-1 overflow-x-auto text-xs font-medium scrollbar-none">
              <button
                onClick={() => setActiveTab('catalog')}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'catalog'
                    ? 'border-[#7C3AED] text-white font-semibold'
                    : 'border-transparent text-[#8B949E] hover:text-white'
                }`}
              >
                <Cpu size={15} />
                <span>Model Catalog ({filteredModels.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('benchmarks')}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'benchmarks'
                    ? 'border-[#7C3AED] text-white font-semibold'
                    : 'border-transparent text-[#8B949E] hover:text-white'
                }`}
              >
                <Scale size={15} />
                <span>Verified Benchmarks Table</span>
              </button>

              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'analytics'
                    ? 'border-[#7C3AED] text-white font-semibold'
                    : 'border-transparent text-[#8B949E] hover:text-white'
                }`}
              >
                <BarChart2 size={15} />
                <span>Performance & Cost Charts</span>
              </button>

              <button
                onClick={() => setActiveTab('calculator')}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'calculator'
                    ? 'border-[#7C3AED] text-white font-semibold'
                    : 'border-transparent text-[#8B949E] hover:text-white'
                }`}
              >
                <Calculator size={15} />
                <span>Workload Cost Calculator</span>
              </button>

              <button
                onClick={() => setActiveTab('provenance')}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'provenance'
                    ? 'border-[#7C3AED] text-white font-semibold'
                    : 'border-transparent text-[#8B949E] hover:text-white'
                }`}
              >
                <BookOpen size={15} />
                <span>Source Provenance & Policy</span>
              </button>
            </div>

            {/* TAB CONTENT: Model Catalog Cards */}
            {activeTab === 'catalog' && (
              <div>
                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  {/* Search Input */}
                  <div className="relative w-full sm:w-80">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E]" />
                    <input
                      type="text"
                      placeholder="Search model name, provider, or ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#12161F] border border-[#21262D] focus:border-[#7C3AED] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-[#8B949E] outline-none"
                    />
                  </div>

                  {/* Provider & Capability Dropdowns */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[#8B949E]">Provider:</span>
                      <select
                        value={filterProvider}
                        onChange={(e) => setFilterProvider(e.target.value)}
                        className="bg-[#12161F] border border-[#21262D] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#7C3AED]"
                      >
                        <option value="All">All Providers</option>
                        <option value="FLOAT">FLOAT</option>
                        <option value="Google">Google</option>
                        <option value="OpenAI">OpenAI</option>
                        <option value="Anthropic">Anthropic</option>
                        <option value="xAI">xAI</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[#8B949E]">Capability:</span>
                      <select
                        value={filterCapability}
                        onChange={(e) => setFilterCapability(e.target.value)}
                        className="bg-[#12161F] border border-[#21262D] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#7C3AED]"
                      >
                        <option value="All">All Capabilities</option>
                        <option value="Coding">Coding</option>
                        <option value="Reasoning">Reasoning</option>
                        <option value="Agentic">Tool Calling</option>
                        <option value="Vision">Vision</option>
                        <option value="Fast">Fast Latency</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Model Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredModels.map((model) => {
                    const isSelectedForCompare = comparisonModelIds.includes(model.id);
                    const isModelAvailable = model.status === 'AVAILABLE';

                    return (
                      <div
                        key={model.id}
                        className="bg-[#12161F] border border-[#21262D] hover:border-[#30363D] rounded-2xl p-6 flex flex-col justify-between transition-all shadow-md group"
                      >
                        <div>
                          {/* Card Header: Model Name & Availability Badge */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <h3 
                                onClick={() => setSelectedModelId(model.id)}
                                className="text-base font-bold text-white group-hover:text-purple-300 transition-colors cursor-pointer"
                              >
                                {model.displayName}
                              </h3>
                              <span className="text-[11px] font-mono text-[#8B949E] capitalize">
                                {model.provider || model.providerId} • {model.snapshotVersion || model.family}
                              </span>
                            </div>

                            {/* Live verified status badge */}
                            {model.tier === 'Free' || model.id === 'float-basic' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 shrink-0">
                                <CheckCircle2 size={10} className="text-emerald-400" />
                                Free Tier
                              </span>
                            ) : isModelAvailable ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 shrink-0">
                                <CheckCircle2 size={10} className="text-emerald-400" />
                                Available
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/80 border border-amber-500/40 text-amber-300 shrink-0">
                                <Lock size={10} className="text-amber-400" />
                                Config Required
                              </span>
                            )}
                          </div>

                          {/* Description */}
                          <p className="text-xs text-[#8B949E] leading-relaxed line-clamp-3 mb-4">
                            {model.description || 'Frontier developer model for autonomous code editing and reasoning.'}
                          </p>

                          {/* Specifications Row */}
                          <div className="grid grid-cols-2 gap-2 mb-4 p-2.5 rounded-xl bg-[#0D1117] border border-[#21262D] text-xs">
                            <div>
                              <span className="text-[10px] text-[#8B949E] uppercase block">Context Window</span>
                              <span className="font-mono font-bold text-slate-200 mt-0.5 block">
                                {(model.contextWindow / 1000).toLocaleString()}k tokens
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-[#8B949E] uppercase block">Official Pricing</span>
                              <span className="font-mono font-bold text-slate-200 mt-0.5 block">
                                ${model.pricing?.inputCost?.toFixed(2) ?? '0.00'} / ${(model.pricing?.outputCost ?? 0).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {/* Capability Pills */}
                          <div className="flex flex-wrap gap-1.5 mb-6">
                            {model.capabilities.coding && (
                              <span className="px-2 py-0.5 rounded bg-[#161B22] border border-[#30363D] text-[10px] text-purple-300 font-medium">
                                Coding
                              </span>
                            )}
                            {model.capabilities.reasoning && (
                              <span className="px-2 py-0.5 rounded bg-[#161B22] border border-[#30363D] text-[10px] text-purple-300 font-medium">
                                Reasoning
                              </span>
                            )}
                            {model.capabilities.tools && (
                              <span className="px-2 py-0.5 rounded bg-[#161B22] border border-[#30363D] text-[10px] text-purple-300 font-medium">
                                Tools
                              </span>
                            )}
                            {model.capabilities.vision && (
                              <span className="px-2 py-0.5 rounded bg-[#161B22] border border-[#30363D] text-[10px] text-slate-400 font-medium">
                                Vision
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Card Bottom Actions */}
                        <div className="pt-4 border-t border-[#21262D] flex items-center justify-between">
                          <label className="flex items-center gap-1.5 text-xs text-[#8B949E] hover:text-white cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isSelectedForCompare}
                              onChange={() => toggleComparisonModel(model.id)}
                              className="rounded border-[#30363D] accent-[#7C3AED]"
                            />
                            <span>Compare</span>
                          </label>

                          <div className="flex items-center gap-2">
                            {model.docUrl && (
                              <a
                                href={model.docUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg text-[#8B949E] hover:text-white hover:bg-[#161B22] transition-colors"
                                title="Official provider documentation"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                            <button
                              onClick={() => {
                                setSelectedModel(model.id);
                                window.history.pushState({}, '', '/');
                                window.dispatchEvent(new PopStateEvent('popstate'));
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-white text-black text-xs font-semibold transition-colors cursor-pointer"
                              title="Select this model for FLOAT workspace"
                            >
                              <Check size={12} />
                              <span>Select</span>
                            </button>
                            <button
                              onClick={() => setSelectedModelId(model.id)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] text-xs font-medium text-white transition-colors cursor-pointer"
                            >
                              <span>Specs</span>
                              <ArrowRight size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB CONTENT: Verified Benchmarks */}
            {activeTab === 'benchmarks' && (
              <ModelPerformanceTable 
                onRowClick={(modelId) => setSelectedModelId(modelId)} 
              />
            )}

            {/* TAB CONTENT: Interactive Charts */}
            {activeTab === 'analytics' && (
              <PerformanceChart 
                onPointClick={(modelId) => setSelectedModelId(modelId)} 
              />
            )}

            {/* TAB CONTENT: Workload Cost Calculator */}
            {activeTab === 'calculator' && (
              <ModelCostCalculator />
            )}

            {/* TAB CONTENT: Source Provenance & Policy */}
            {activeTab === 'provenance' && (
              <div className="bg-[#12161F] border border-[#21262D] rounded-2xl p-6 sm:p-8 space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <BookOpen size={20} className="text-purple-400" />
                    FLOAT Source Hierarchy & Verification Constitution
                  </h2>
                  <p className="text-xs text-[#8B949E] mt-1 leading-relaxed">
                    Trustworthiness is prioritized over data density. The four-tier source hierarchy ensures every 
                    number, price, and capability on this page is authentic and traceable.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-[#0D1117] border border-[#21262D]">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-xs">1</span>
                      <span>Tier A: Official Provider Documentation</span>
                    </div>
                    <p className="text-xs text-[#8B949E] leading-relaxed">
                      Model identity, context windows, supported modalities, and official API pricing are derived 
                      strictly from Google AI, OpenAI, Anthropic, and xAI official developer documentation.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0D1117] border border-[#21262D]">
                    <div className="flex items-center gap-2 text-purple-400 font-bold text-sm mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-purple-950 border border-purple-500/40 flex items-center justify-center text-xs">2</span>
                      <span>Tier B: Original Benchmark Maintainers</span>
                    </div>
                    <p className="text-xs text-[#8B949E] leading-relaxed">
                      External benchmark scores come directly from original benchmark maintainer publications 
                      (SWE-bench Verified, HumanEval, GPQA Diamond, MATH-500) and verified technical reports.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0D1117] border border-[#21262D]">
                    <div className="flex items-center gap-2 text-sky-400 font-bold text-sm mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-sky-950 border border-sky-500/40 flex items-center justify-center text-xs">3</span>
                      <span>Tier C: FLOAT First-Party Evals</span>
                    </div>
                    <p className="text-xs text-[#8B949E] leading-relaxed">
                      FLOAT's internal evaluations are strictly isolated. Completed runs require active server provider 
                      connections and record exact task IDs, execution latencies, unit test outcomes, and calculated costs.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0D1117] border border-[#21262D]">
                    <div className="flex items-center gap-2 text-rose-400 font-bold text-sm mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-rose-950 border border-rose-500/40 flex items-center justify-center text-xs">4</span>
                      <span>Prohibited Sources & Shortcuts</span>
                    </div>
                    <p className="text-xs text-[#8B949E] leading-relaxed">
                      Social media claims, copied unattributed marketing tables, synthetic LLM answers, and fabricated composite 
                      rankings are strictly prohibited and never used as evidence.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#21262D] text-xs text-[#8B949E] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span>Audit Completed: February 2025</span>
                  <span>Contact security & intelligence review: dev@float.ai</span>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Comparison Drawer when items are selected */}
      {comparisonModelIds.length > 0 && !isCompareModalOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-[#12161F] border border-[#30363D] shadow-2xl rounded-2xl px-5 py-3 flex items-center gap-4 max-w-xl w-full">
          <div className="flex items-center gap-2 flex-1 overflow-x-auto">
            <span className="text-xs font-bold text-white shrink-0">Compare ({comparisonModelIds.length}):</span>
            {comparedModelsList.map(m => (
              <span 
                key={m.id} 
                className="px-2.5 py-1 rounded bg-[#0D1117] border border-[#21262D] text-xs text-slate-200 flex items-center gap-1.5 shrink-0"
              >
                <span>{m.displayName}</span>
                <button
                  onClick={() => toggleComparisonModel(m.id)}
                  className="text-[#8B949E] hover:text-white cursor-pointer"
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={clearComparison}
              className="px-2.5 py-1.5 text-xs text-[#8B949E] hover:text-white cursor-pointer"
            >
              Clear
            </button>
            <button
              onClick={() => setIsCompareModalOpen(true)}
              className="px-4 py-1.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold cursor-pointer shadow-md"
            >
              Open Comparison
            </button>
          </div>
        </div>
      )}

      {/* Compare Models Modal */}
      <CompareModelsModal
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        selectedModels={comparedModelsList}
        onRemoveModel={(id) => toggleComparisonModel(id)}
      />
    </div>
  );
}
