import React from 'react';
import { 
  ArrowLeft, 
  Brain, 
  Cpu, 
  Zap, 
  Eye, 
  Wrench, 
  Shield, 
  Check, 
  Info, 
  ExternalLink, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Layers, 
  Coins, 
  Scale,
  Sparkles,
  Lock
} from 'lucide-react';
import { AIModel } from '../../types/ai';
import { getVerifiedModel } from '../../data/verifiedModels';
import { getScoresForModel } from '../../data/verifiedBenchmarks';
import { useModelIntelligenceStore } from '../../store/modelIntelligenceStore';

interface ModelDetailsProps {
  model: AIModel;
  onBack: () => void;
  onSelect: () => void;
}

export function ModelDetails({ model, onBack, onSelect }: ModelDetailsProps) {
  const verified = getVerifiedModel(model.id);
  const benchmarkScores = getScoresForModel(model.id);
  const { providerStatus } = useModelIntelligenceStore();

  const providerInfo = providerStatus[model.providerId];
  const isAvailable = model.status === 'AVAILABLE' || (providerInfo && providerInfo.configured);

  const getStatusBadge = () => {
    if (isAvailable) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
          <CheckCircle2 size={13} className="text-emerald-400" />
          Available in FLOAT
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/80 border border-amber-500/40 text-amber-300">
        <Lock size={13} className="text-amber-400" />
        Configuration Required
      </span>
    );
  };

  return (
    <div className="max-w-5xl mx-auto w-full pb-16">
      {/* Navigation Breadcrumb */}
      <button 
        onClick={onBack} 
        className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white mb-6 transition-colors group cursor-pointer"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" /> 
        Back to Model Intelligence
      </button>

      {/* Main Model Header Card */}
      <div className="bg-[#12161F] border border-[#21262D] rounded-2xl p-6 sm:p-8 mb-8 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 pb-6 border-b border-[#21262D]">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {model.displayName}
              </h1>
              {getStatusBadge()}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-[#8B949E] mt-2">
              <span className="font-mono text-slate-300 px-2 py-0.5 rounded bg-[#1C2128] border border-[#30363D]">
                ID: {verified?.exactModelId || model.id}
              </span>
              <span>•</span>
              <span className="capitalize text-slate-300">Provider: {model.providerId}</span>
              <span>•</span>
              <span>Context: {(verified?.contextWindow || model.contextWindow).toLocaleString()} tokens</span>
              <span>•</span>
              <span>Max Output: {(verified?.maxOutputTokens || model.limits?.maxOutputTokens || 8192).toLocaleString()} tokens</span>
              {verified?.releaseDate && (
                <>
                  <span>•</span>
                  <span>Released: {verified.releaseDate}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {verified?.docUrl && (
              <a
                href={verified.docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-[#30363D] hover:border-[#8B949E] text-xs font-medium text-slate-300 hover:text-white bg-[#161B22] transition-colors"
              >
                <span>Official Docs</span>
                <ExternalLink size={13} />
              </a>
            )}

            {isAvailable ? (
              <button 
                onClick={onSelect}
                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-white hover:bg-slate-100 text-black rounded-lg text-xs font-semibold transition-all shadow-md cursor-pointer"
              >
                <Check size={14} />
                Select for Workspace
              </button>
            ) : (
              <button 
                onClick={onSelect}
                title="Select model for workspace (server-side API key required for execution)"
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#21262D] hover:bg-[#2A313C] text-slate-300 rounded-lg text-xs font-medium border border-[#30363D] transition-colors cursor-pointer"
              >
                <Lock size={13} className="text-amber-400" />
                Select Model (Key Required)
              </button>
            )}
          </div>
        </div>

        {/* Status disclosure note */}
        <div className="mt-4 p-3.5 rounded-xl bg-[#0D1117] border border-[#21262D] flex items-start gap-3 text-xs">
          <Info size={16} className="text-purple-400 shrink-0 mt-0.5" />
          <div className="text-[#8B949E] leading-relaxed">
            <span className="text-slate-200 font-semibold">FLOAT Availability Verification: </span>
            {verified?.availabilityDetails || (isAvailable 
              ? 'Active and connected in FLOAT server runtime.' 
              : `To activate, configure ${model.providerId.toUpperCase()}_API_KEY on the server.`
            )}
          </div>
        </div>

        {/* Overview */}
        <div className="mt-6">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Neutral Overview</h2>
          <p className="text-sm text-slate-300 leading-relaxed max-w-4xl">
            {verified?.description || model.description || "Provider-documented model for autonomous development and reasoning."}
          </p>
        </div>
      </div>

      {/* Grid of Specifications & Verified Pricing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Transparent Pricing Card */}
        <div className="bg-[#12161F] border border-[#21262D] rounded-2xl p-6 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Coins size={16} className="text-purple-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Official API Pricing</h2>
            </div>
            {verified?.pricing?.sourceUrl && (
              <a 
                href={verified.pricing.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium"
              >
                <span>Pricing Page</span>
                <ExternalLink size={11} />
              </a>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#0D1117] border border-[#21262D]">
              <div>
                <span className="text-xs text-[#8B949E]">Input Tokens</span>
                <p className="text-base font-bold text-white mt-0.5">
                  ${(verified?.pricing?.inputCostPer1M ?? model.pricing?.inputCost ?? 0).toFixed(2)}
                  <span className="text-xs font-normal text-[#8B949E] ml-1">/ 1M tokens</span>
                </p>
              </div>
              <span className="text-[11px] text-[#8B949E] font-mono">Standard prompt rate</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-[#0D1117] border border-[#21262D]">
              <div>
                <span className="text-xs text-[#8B949E]">Output Tokens</span>
                <p className="text-base font-bold text-white mt-0.5">
                  ${(verified?.pricing?.outputCostPer1M ?? model.pricing?.outputCost ?? 0).toFixed(2)}
                  <span className="text-xs font-normal text-[#8B949E] ml-1">/ 1M tokens</span>
                </p>
              </div>
              <span className="text-[11px] text-[#8B949E] font-mono">Completion rate</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-[#0D1117] border border-[#21262D]">
              <div>
                <span className="text-xs text-[#8B949E]">Cached Input</span>
                <p className="text-base font-bold text-white mt-0.5">
                  {verified?.pricing?.cachedInputCostPer1M !== undefined 
                    ? `$${verified.pricing.cachedInputCostPer1M.toFixed(3)}`
                    : 'Not supported'}
                  {verified?.pricing?.cachedInputCostPer1M !== undefined && (
                    <span className="text-xs font-normal text-[#8B949E] ml-1">/ 1M tokens</span>
                  )}
                </p>
              </div>
              <span className="text-[11px] text-[#8B949E] font-mono">Prompt cache rate</span>
            </div>

            <div className="pt-2 text-[11px] text-[#8B949E] flex items-center justify-between">
              <span>Verified as of: {verified?.pricing?.effectiveDate || model.pricing?.effectiveDate || '2025'}</span>
              <span>Currency: USD</span>
            </div>
          </div>
        </div>

        {/* Technical Capabilities & Architecture */}
        <div className="bg-[#12161F] border border-[#21262D] rounded-2xl p-6 shadow-md">
          <div className="flex items-center gap-2 mb-4">
            <Cpu size={16} className="text-purple-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Verified Capabilities</h2>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${model.capabilities.coding ? 'bg-[#0D1117] border-purple-800/40 text-slate-200' : 'bg-[#0D1117]/50 border-[#21262D] text-slate-500'}`}>
              <Check size={14} className={model.capabilities.coding ? 'text-purple-400' : 'text-slate-600'} />
              <span>Code Generation</span>
            </div>

            <div className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${model.capabilities.reasoning ? 'bg-[#0D1117] border-purple-800/40 text-slate-200' : 'bg-[#0D1117]/50 border-[#21262D] text-slate-500'}`}>
              <Check size={14} className={model.capabilities.reasoning ? 'text-purple-400' : 'text-slate-600'} />
              <span>Multi-step Reasoning</span>
            </div>

            <div className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${model.capabilities.tools ? 'bg-[#0D1117] border-purple-800/40 text-slate-200' : 'bg-[#0D1117]/50 border-[#21262D] text-slate-500'}`}>
              <Check size={14} className={model.capabilities.tools ? 'text-purple-400' : 'text-slate-600'} />
              <span>Tool / Function Calling</span>
            </div>

            <div className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${model.capabilities.vision ? 'bg-[#0D1117] border-purple-800/40 text-slate-200' : 'bg-[#0D1117]/50 border-[#21262D] text-slate-500'}`}>
              <Check size={14} className={model.capabilities.vision ? 'text-purple-400' : 'text-slate-600'} />
              <span>Vision & Multimodal</span>
            </div>

            <div className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${model.capabilities.structuredOutput ? 'bg-[#0D1117] border-purple-800/40 text-slate-200' : 'bg-[#0D1117]/50 border-[#21262D] text-slate-500'}`}>
              <Check size={14} className={model.capabilities.structuredOutput ? 'text-purple-400' : 'text-slate-600'} />
              <span>Structured Outputs (JSON)</span>
            </div>

            <div className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${model.capabilities.streaming ? 'bg-[#0D1117] border-purple-800/40 text-slate-200' : 'bg-[#0D1117]/50 border-[#21262D] text-slate-500'}`}>
              <Check size={14} className={model.capabilities.streaming ? 'text-purple-400' : 'text-slate-600'} />
              <span>Server-Sent Streaming</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-[#21262D]">
            <span className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">Supported Modalities:</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(verified?.modalities || model.modalities || ['text']).map(mod => (
                <span key={mod} className="px-2.5 py-1 rounded bg-[#0D1117] border border-[#30363D] text-[11px] font-mono capitalize text-slate-300">
                  {mod}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Verified Benchmark Performance Table */}
      <div className="bg-[#12161F] border border-[#21262D] rounded-2xl p-6 sm:p-8 mb-8 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Scale size={18} className="text-purple-400" />
              <h2 className="text-lg font-bold text-white">Source-Attributed Benchmark Scores</h2>
            </div>
            <p className="text-xs text-[#8B949E] mt-1">
              Exact scores from official technical reports and published maintainer evaluations. No synthetic or extrapolated values.
            </p>
          </div>
          <span className="text-xs font-mono text-purple-300 bg-purple-950/60 border border-purple-800 px-2.5 py-1 rounded-full shrink-0">
            {benchmarkScores.length} Verified Results
          </span>
        </div>

        {benchmarkScores.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-[#21262D]">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#0D1117] text-[#8B949E] uppercase font-semibold border-b border-[#21262D]">
                <tr>
                  <th className="px-4 py-3">Benchmark</th>
                  <th className="px-4 py-3">Version</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3">Evaluator / Source Type</th>
                  <th className="px-4 py-3">Test Configuration</th>
                  <th className="px-4 py-3">Attribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262D] bg-[#12161F]">
                {benchmarkScores.map((score) => (
                  <tr key={score.id} className="hover:bg-[#161B22] transition-colors">
                    <td className="px-4 py-3.5 font-bold text-white whitespace-nowrap">
                      {score.benchmarkName}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[#8B949E]">
                      {score.benchmarkVersion}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-400 text-sm whitespace-nowrap">
                      {score.score.toFixed(1)}{score.scoreUnit}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-950/50 border border-purple-800/60 text-purple-300">
                        {score.evaluatorType}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-300 max-w-xs text-[11px] leading-relaxed">
                      {score.testConfiguration}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <a
                        href={score.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 font-medium"
                      >
                        <span>{score.evaluatorName}</span>
                        <ExternalLink size={11} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-[#8B949E] border border-dashed border-[#21262D] rounded-xl">
            No external benchmark records currently registered for this model snapshot.
          </div>
        )}
      </div>

      {/* Limitations & Caveats */}
      {verified?.limitations && verified.limitations.length > 0 && (
        <div className="bg-[#12161F] border border-[#21262D] rounded-2xl p-6 shadow-md mb-8">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={16} className="text-amber-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Documented Limitations & Caveats</h2>
          </div>
          <ul className="space-y-2 text-xs text-slate-300">
            {verified.limitations.map((lim, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span className="leading-relaxed">{lim}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
