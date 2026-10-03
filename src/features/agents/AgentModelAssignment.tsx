import React, { useState, useMemo } from 'react';
import { 
  Bot, 
  Cpu, 
  Sparkles, 
  Check, 
  AlertCircle, 
  RotateCcw, 
  Save, 
  Search, 
  Shield, 
  Cloud, 
  CloudOff, 
  RefreshCw, 
  ArrowRight, 
  ExternalLink,
  Zap,
  Info,
  Layers,
  Code2,
  Bug,
  Compass,
  Layout,
  CheckCircle2,
  ListOrdered
} from 'lucide-react';
import { useAgentRegistry } from './AgentRegistryContext';
import { useAuthStore } from '../../store/authStore';
import { Agent } from '../../types/ai';
import { useModelPricing } from '../models/pricingSync';

// Helper for dynamic agent icon rendering
function getAgentIcon(iconName: string) {
  switch (iconName?.toLowerCase()) {
    case 'sparkles': return Sparkles;
    case 'listordered': return ListOrdered;
    case 'code2': case 'code': return Code2;
    case 'checkcircle2': case 'check': return CheckCircle2;
    case 'compass': return Compass;
    case 'bug': return Bug;
    case 'layout': return Layout;
    default: return Bot;
  }
}

export function AgentModelAssignment() {
  const { 
    agents, 
    models, 
    assignments, 
    getAssignment, 
    setAssignment, 
    batchSaveAssignments,
    resetToDefaults, 
    loading, 
    saving, 
    error, 
    syncStatus, 
    refresh 
  } = useAgentRegistry();

  const { user } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMode, setSelectedMode] = useState<'all' | 'ask' | 'edit' | 'agent'>('all');
  const [localDrafts, setLocalDrafts] = useState<Record<string, { primaryModel: string; fallbackModel: string }>>({});
  const [saveSuccessMap, setSaveSuccessMap] = useState<Record<string, boolean>>({});
  const [batchSavedBanner, setBatchSavedBanner] = useState(false);

  // Filter agents
  const filteredAgents = useMemo(() => {
    return agents.filter(agent => {
      const matchesSearch = 
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.tools.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesMode = selectedMode === 'all' || agent.mode === selectedMode;
      return matchesSearch && matchesMode;
    });
  }, [agents, searchQuery, selectedMode]);

  // Current values accounting for local draft edits
  const getCurrentValues = (agentId: string) => {
    if (localDrafts[agentId]) {
      return localDrafts[agentId];
    }
    const current = getAssignment(agentId);
    return {
      primaryModel: current.primaryModel,
      fallbackModel: current.fallbackModel
    };
  };

  const handlePrimaryChange = (agentId: string, modelId: string) => {
    const current = getCurrentValues(agentId);
    setLocalDrafts(prev => ({
      ...prev,
      [agentId]: {
        ...current,
        primaryModel: modelId
      }
    }));
  };

  const handleFallbackChange = (agentId: string, modelId: string) => {
    const current = getCurrentValues(agentId);
    setLocalDrafts(prev => ({
      ...prev,
      [agentId]: {
        ...current,
        fallbackModel: modelId
      }
    }));
  };

  const hasUnsavedChanges = (agentId: string) => {
    if (!localDrafts[agentId]) return false;
    const current = getAssignment(agentId);
    return (
      localDrafts[agentId].primaryModel !== current.primaryModel ||
      localDrafts[agentId].fallbackModel !== current.fallbackModel
    );
  };

  const totalUnsavedCount = useMemo(() => {
    return Object.keys(localDrafts).filter(id => hasUnsavedChanges(id)).length;
  }, [localDrafts, assignments]);

  const handleSaveAgent = async (agentId: string) => {
    const current = getCurrentValues(agentId);
    const success = await setAssignment(agentId, current.primaryModel, current.fallbackModel);
    if (success) {
      setLocalDrafts(prev => {
        const next = { ...prev };
        delete next[agentId];
        return next;
      });
      setSaveSuccessMap(prev => ({ ...prev, [agentId]: true }));
      setTimeout(() => {
        setSaveSuccessMap(prev => ({ ...prev, [agentId]: false }));
      }, 2500);
    }
  };

  const handleSaveAll = async () => {
    const changes: Array<{ agentId: string; primaryModel: string; fallbackModel: string }> = [];
    for (const agentId of Object.keys(localDrafts)) {
      if (hasUnsavedChanges(agentId)) {
        changes.push({
          agentId,
          primaryModel: localDrafts[agentId].primaryModel,
          fallbackModel: localDrafts[agentId].fallbackModel
        });
      }
    }
    if (changes.length > 0) {
      const success = await batchSaveAssignments(changes);
      if (success) {
        setLocalDrafts({});
        setBatchSavedBanner(true);
        setTimeout(() => setBatchSavedBanner(false), 3000);
      }
    }
  };

  const handleDiscardChanges = () => {
    setLocalDrafts({});
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto flex flex-col gap-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-[#30363D] pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-xl border border-purple-500/30">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                Agent Model Assignment
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50">
                  AgentRegistry
                </span>
              </h1>
              <p className="text-sm text-slate-500 dark:text-[#8B949E] mt-0.5">
                Configure primary reasoning models and automated fallback routing per agent. Persisted to Firebase Firestore.
              </p>
            </div>
          </div>
        </div>

        {/* Sync & Auth Status Bar */}
        <div className="flex items-center gap-3 flex-wrap">
          {user ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 text-xs">
              <Cloud className="w-4 h-4" />
              <span>Firebase Synced ({user.email})</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 text-xs">
              <CloudOff className="w-4 h-4" />
              <span>Local Session (Sign in to persist in Cloud)</span>
            </div>
          )}

          <button
            onClick={() => refresh()}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-200 dark:border-[#30363D] hover:bg-slate-100 dark:hover:bg-[#161B22] text-slate-600 dark:text-[#C9D1D9] transition-colors disabled:opacity-50"
            title="Refresh from Firebase"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-500' : ''}`} />
          </button>

          <button
            onClick={() => resetToDefaults()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#30363D] hover:bg-slate-100 dark:hover:bg-[#161B22] text-slate-600 dark:text-[#C9D1D9] text-xs font-medium transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset All
          </button>
        </div>
      </div>

      {/* Status or Error Notifications */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {batchSavedBanner && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-sm">
          <Check className="w-5 h-5 flex-shrink-0" />
          <span>All agent model assignments have been saved and applied successfully.</span>
        </div>
      )}

      {/* Floating Unsaved Changes Notification */}
      {totalUnsavedCount > 0 && (
        <div className="sticky top-4 z-20 flex items-center justify-between p-4 rounded-xl bg-purple-600 text-white shadow-xl">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            <span>You have {totalUnsavedCount} agent{totalUnsavedCount > 1 ? 's' : ''} with unsaved model assignments</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDiscardChanges}
              className="px-3 py-1 text-xs text-purple-100 hover:text-white hover:bg-purple-700 rounded-lg transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-purple-900 hover:bg-purple-50 text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-75"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save All Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search agents or capabilities..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#161B22] border border-slate-200 dark:border-[#30363D] rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#161B22] border border-slate-200 dark:border-[#30363D] rounded-xl text-xs w-full sm:w-auto overflow-x-auto">
          {(['all', 'agent', 'edit', 'ask'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setSelectedMode(mode)}
              className={`px-3 py-1.5 rounded-lg capitalize font-medium transition-colors ${
                selectedMode === mode
                  ? 'bg-white dark:bg-[#0D1117] text-purple-600 dark:text-purple-400 shadow-sm border border-slate-200 dark:border-[#30363D]'
                  : 'text-slate-600 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-[#C9D1D9]'
              }`}
            >
              {mode === 'all' ? 'All Roles' : `${mode} Mode`}
            </button>
          ))}
        </div>
      </div>

      {/* Agents Assignment Grid */}
      <div className="grid grid-cols-1 gap-4">
        {filteredAgents.map(agent => {
          const IconComponent = getAgentIcon(agent.icon);
          const { primaryModel, fallbackModel } = getCurrentValues(agent.id);
          const isDirty = hasUnsavedChanges(agent.id);
          const isSavedSuccess = saveSuccessMap[agent.id];
          const isRedundant = fallbackModel && primaryModel === fallbackModel;

          return (
            <div
              key={agent.id}
              className={`bg-white dark:bg-[#161B22] border rounded-2xl p-5 transition-all shadow-sm ${
                isDirty 
                  ? 'border-purple-400 dark:border-purple-500/60 ring-1 ring-purple-400/20' 
                  : 'border-slate-200 dark:border-[#30363D] hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                
                {/* Agent Information Header */}
                <div className="flex items-start gap-4 lg:w-1/3">
                  <div className="p-3 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl border border-purple-200 dark:border-purple-800/40 flex-shrink-0">
                    <IconComponent className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                        {agent.name}
                      </h3>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        agent.mode === 'agent'
                          ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50'
                          : agent.mode === 'edit'
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}>
                        {agent.mode}
                      </span>
                      {assignments[agent.id]?.isCustom && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-1 line-clamp-2">
                      {agent.description}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {agent.tools.slice(0, 3).map(tool => (
                        <span key={tool} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#0D1117] text-slate-600 dark:text-[#8B949E] border border-slate-200 dark:border-[#30363D]">
                          {tool}
                        </span>
                      ))}
                      {agent.tools.length > 3 && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 self-center">
                          +{agent.tools.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Model Assignment Selectors */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Primary Model */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-[#C9D1D9] flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        Primary Execution Model
                      </span>
                    </label>
                    <select
                      value={primaryModel}
                      onChange={e => handlePrimaryChange(agent.id, e.target.value)}
                      className="w-full bg-slate-50 dark:bg-[#0D1117] border border-slate-300 dark:border-[#30363D] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
                    >
                      {models.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.displayName} ({m.providerId})
                        </option>
                      ))}
                    </select>
                    <ModelPricingBadge modelId={primaryModel} />
                  </div>

                  {/* Fallback Model */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-[#C9D1D9] flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-purple-500" />
                        Failover / Fallback Model
                      </span>
                    </label>
                    <select
                      value={fallbackModel}
                      onChange={e => handleFallbackChange(agent.id, e.target.value)}
                      className="w-full bg-slate-50 dark:bg-[#0D1117] border border-slate-300 dark:border-[#30363D] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
                    >
                      <option value="">None (Fail on Error)</option>
                      {models.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.displayName} ({m.providerId})
                        </option>
                      ))}
                    </select>
                    {fallbackModel ? (
                      <ModelPricingBadge modelId={fallbackModel} isFallback />
                    ) : (
                      <span className="text-[11px] text-slate-400">No secondary fallback assigned</span>
                    )}
                  </div>
                </div>

                {/* Actions & Routing Status */}
                <div className="flex lg:flex-col items-center justify-between lg:justify-center gap-2 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-[#30363D] pt-3 lg:pt-0 lg:pl-6">
                  {isRedundant && (
                    <div className="flex items-center gap-1 text-[11px] text-amber-500">
                      <Info className="w-3 h-3" />
                      <span>Identical models</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {isDirty && (
                      <button
                        onClick={() => {
                          setLocalDrafts(prev => {
                            const next = { ...prev };
                            delete next[agent.id];
                            return next;
                          });
                        }}
                        className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                    )}

                    <button
                      onClick={() => handleSaveAgent(agent.id)}
                      disabled={saving || (!isDirty && !isSavedSuccess)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        isSavedSuccess
                          ? 'bg-emerald-500 text-white'
                          : isDirty
                          ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-[#0D1117] text-slate-400 dark:text-[#8B949E] border border-slate-200 dark:border-[#30363D]'
                      }`}
                    >
                      {isSavedSuccess ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Saved
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          {isDirty ? 'Save' : 'Assigned'}
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModelPricingBadge({ modelId, isFallback }: { modelId: string; isFallback?: boolean }) {
  const { pricing, hasPricing } = useModelPricing(modelId);

  if (!hasPricing || !pricing) {
    return (
      <span className="text-[11px] text-slate-400 dark:text-[#8B949E]">
        {isFallback ? 'Fallback model ready' : 'Standard token rates apply'}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-[#8B949E]">
      <span className="font-mono text-purple-600 dark:text-purple-400 font-medium">
        ${pricing.inputCost.toFixed(2)} in / ${pricing.outputCost.toFixed(2)} out
      </span>
      <span>• 1M tokens</span>
    </div>
  );
}
