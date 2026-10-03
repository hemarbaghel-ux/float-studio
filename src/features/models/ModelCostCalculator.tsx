import React, { useState } from 'react';
import { 
  Calculator, 
  DollarSign, 
  Coins, 
  Layers, 
  Info, 
  RotateCcw, 
  ExternalLink,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import { VERIFIED_MODELS, VerifiedModel } from '../../data/verifiedModels';
import { WORKLOAD_PRESETS, WorkloadPreset, useModelIntelligenceStore } from '../../store/modelIntelligenceStore';

interface ModelCostCalculatorProps {
  initialModelId?: string;
}

export function ModelCostCalculator({ initialModelId }: ModelCostCalculatorProps) {
  const { models } = useModelIntelligenceStore();
  const [selectedModelId, setSelectedModelId] = useState<string>(initialModelId || 'gemini-3.1-flash-lite');
  const [activePreset, setActivePreset] = useState<WorkloadPreset>(WORKLOAD_PRESETS[1]);
  const [inputTokens, setInputTokens] = useState<number>(WORKLOAD_PRESETS[1].inputTokens);
  const [outputTokens, setOutputTokens] = useState<number>(WORKLOAD_PRESETS[1].outputTokens);
  const [cachedTokens, setCachedTokens] = useState<number>(WORKLOAD_PRESETS[1].cachedTokens);
  const [requestCount, setRequestCount] = useState<number>(1);

  const selectedModel = models.find(m => m.id === selectedModelId) || models[0];

  const handleApplyPreset = (preset: WorkloadPreset) => {
    setActivePreset(preset);
    setInputTokens(preset.inputTokens);
    setOutputTokens(preset.outputTokens);
    setCachedTokens(preset.cachedTokens);
  };

  const calculateForModel = (model: VerifiedModel) => {
    const effectiveCached = Math.min(cachedTokens, inputTokens);
    const uncachedInput = Math.max(0, inputTokens - effectiveCached);

    const inputCost = (uncachedInput / 1_000_000) * model.pricing.inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * model.pricing.outputCostPer1M;
    const cacheRate = model.pricing.cachedInputCostPer1M !== undefined 
      ? model.pricing.cachedInputCostPer1M 
      : model.pricing.inputCostPer1M * 0.5;
    const cachedCost = (effectiveCached / 1_000_000) * cacheRate;

    const perRequest = inputCost + outputCost + cachedCost;
    const total = perRequest * requestCount;

    return {
      uncachedInputCost: inputCost * requestCount,
      cachedCost: cachedCost * requestCount,
      outputCost: outputCost * requestCount,
      perRequest,
      total
    };
  };

  const currentCost = calculateForModel(selectedModel);

  return (
    <div className="w-full bg-[#12161F] border border-[#21262D] rounded-2xl p-6 sm:p-8 shadow-xl">
      {/* Title & Transparent Mathematical Formula */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-[#21262D]">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Calculator size={20} className="text-purple-400" />
            Transparent Workload Cost Calculator
          </h3>
          <p className="text-xs text-[#8B949E] mt-1">
            Reproducible token mathematics based on official published provider API pricing rates.
          </p>
        </div>

        {/* Formula Box */}
        <div className="p-2.5 rounded-lg bg-[#0D1117] border border-[#21262D] text-[11px] font-mono text-purple-300">
          <span>Cost = ((Input - Cached) × RateIn + Cached × RateCache + Output × RateOut) × Requests</span>
        </div>
      </div>

      {/* Preset Workload Buttons */}
      <div className="mb-6">
        <label className="text-xs font-semibold uppercase tracking-wider text-[#8B949E] block mb-2">
          Select Typical Workload Preset
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {WORKLOAD_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleApplyPreset(preset)}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                activePreset.id === preset.id
                  ? 'bg-purple-950/40 border-purple-500/60 shadow-md'
                  : 'bg-[#0D1117] border-[#21262D] hover:border-[#30363D]'
              }`}
            >
              <span className={`text-xs font-bold block ${activePreset.id === preset.id ? 'text-purple-300' : 'text-white'}`}>
                {preset.name}
              </span>
              <span className="text-[10px] text-[#8B949E] mt-1 block leading-relaxed">
                {preset.description}
              </span>
              <div className="mt-2 pt-2 border-t border-[#21262D] flex items-center justify-between text-[10px] font-mono text-[#8B949E]">
                <span>In: {(preset.inputTokens / 1000).toFixed(0)}k</span>
                <span>Out: {(preset.outputTokens / 1000).toFixed(1)}k</span>
                <span>Cache: {(preset.cachedTokens / 1000).toFixed(0)}k</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Token Sliders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-5 rounded-xl bg-[#0D1117] border border-[#21262D] mb-8">
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs font-semibold text-slate-300">Input Tokens</label>
            <span className="font-mono text-xs text-purple-400 font-bold">{inputTokens.toLocaleString()} tokens</span>
          </div>
          <input
            type="range"
            min={1000}
            max={500000}
            step={1000}
            value={inputTokens}
            onChange={(e) => setInputTokens(parseInt(e.target.value, 10))}
            className="w-full accent-[#7C3AED] bg-[#21262D] h-1.5 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-[#8B949E] mt-1 font-mono">
            <span>1k</span>
            <span>250k</span>
            <span>500k</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs font-semibold text-slate-300">Output Tokens</label>
            <span className="font-mono text-xs text-purple-400 font-bold">{outputTokens.toLocaleString()} tokens</span>
          </div>
          <input
            type="range"
            min={200}
            max={32000}
            step={200}
            value={outputTokens}
            onChange={(e) => setOutputTokens(parseInt(e.target.value, 10))}
            className="w-full accent-[#7C3AED] bg-[#21262D] h-1.5 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-[#8B949E] mt-1 font-mono">
            <span>200</span>
            <span>16k</span>
            <span>32k</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs font-semibold text-slate-300">Cached Input Tokens</label>
            <span className="font-mono text-xs text-purple-400 font-bold">
              {Math.min(cachedTokens, inputTokens).toLocaleString()} tokens
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={inputTokens}
            step={500}
            value={Math.min(cachedTokens, inputTokens)}
            onChange={(e) => setCachedTokens(parseInt(e.target.value, 10))}
            className="w-full accent-[#7C3AED] bg-[#21262D] h-1.5 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-[#8B949E] mt-1 font-mono">
            <span>0</span>
            <span>50%</span>
            <span>100% Cached</span>
          </div>
        </div>
      </div>

      {/* Primary Calculated Result for Selected Model */}
      <div className="p-6 rounded-xl bg-purple-950/20 border border-purple-800/40 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <span className="text-xs uppercase font-bold text-purple-300 tracking-wider">
              Selected Model Workload Calculation
            </span>
            <div className="flex items-center gap-2 mt-1">
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="bg-[#0D1117] border border-purple-800/60 rounded-lg px-3 py-1.5 text-sm font-bold text-white outline-none"
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.displayName} ({m.providerId})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-[#8B949E]">Estimated Total Workload Cost</span>
            <p className="text-3xl font-extrabold text-white font-mono mt-0.5">
              ${currentCost.total < 0.0001 ? '<$0.0001' : currentCost.total.toFixed(4)}
              <span className="text-xs text-[#8B949E] font-normal ml-1">USD</span>
            </p>
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-purple-900/40 text-xs">
          <div className="p-2.5 rounded-lg bg-[#0D1117]/60">
            <span className="text-[#8B949E]">Uncached Input ({Math.max(0, inputTokens - cachedTokens).toLocaleString()} tokens)</span>
            <p className="font-mono font-bold text-slate-200 mt-1">${currentCost.uncachedInputCost.toFixed(5)}</p>
            <span className="text-[10px] text-[#8B949E]">@ ${selectedModel.pricing.inputCostPer1M.toFixed(2)}/1M</span>
          </div>

          <div className="p-2.5 rounded-lg bg-[#0D1117]/60">
            <span className="text-[#8B949E]">Cached Input ({Math.min(cachedTokens, inputTokens).toLocaleString()} tokens)</span>
            <p className="font-mono font-bold text-slate-200 mt-1">${currentCost.cachedCost.toFixed(5)}</p>
            <span className="text-[10px] text-[#8B949E]">
              @ ${(selectedModel.pricing.cachedInputCostPer1M ?? selectedModel.pricing.inputCostPer1M * 0.5).toFixed(3)}/1M
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-[#0D1117]/60">
            <span className="text-[#8B949E]">Output Tokens ({outputTokens.toLocaleString()} tokens)</span>
            <p className="font-mono font-bold text-slate-200 mt-1">${currentCost.outputCost.toFixed(5)}</p>
            <span className="text-[10px] text-[#8B949E]">@ ${selectedModel.pricing.outputCostPer1M.toFixed(2)}/1M</span>
          </div>
        </div>
      </div>

      {/* Side-by-Side Model Comparison Table */}
      <div>
        <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-3">
          Cross-Model Cost Comparison for Current Workload
        </h4>
        <div className="overflow-x-auto rounded-xl border border-[#21262D]">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#0D1117] text-[#8B949E] uppercase font-semibold border-b border-[#21262D]">
              <tr>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3 text-right">Input Rate (/1M)</th>
                <th className="px-4 py-3 text-right">Output Rate (/1M)</th>
                <th className="px-4 py-3 text-right font-bold text-white">Estimated Workload Cost</th>
                <th className="px-4 py-3 text-right">Cost Relative to Gemini 3.1 Flash Lite</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#21262D] bg-[#12161F]">
              {models.map(m => {
                const cost = calculateForModel(m);
                const baseModel = models.find(x => x.id === 'gemini-3.1-flash-lite');
                const baseCost = baseModel ? calculateForModel(baseModel).total : cost.total;
                const ratio = baseCost > 0 ? (cost.total / baseCost) : 1;

                return (
                  <tr 
                    key={m.id} 
                    className={`hover:bg-[#161B22] transition-colors ${m.id === selectedModelId ? 'bg-purple-950/20' : ''}`}
                  >
                    <td className="px-4 py-3 font-bold text-white whitespace-nowrap">
                      {m.displayName}
                    </td>
                    <td className="px-4 py-3 text-[#8B949E] capitalize whitespace-nowrap">
                      {m.providerId}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      ${m.pricing.inputCostPer1M.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      ${m.pricing.outputCostPer1M.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                      ${cost.total < 0.0001 ? '<$0.0001' : cost.total.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400">
                      {ratio === 1 ? '1.0x (Baseline)' : `${ratio.toFixed(1)}x`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disclaimer on Estimations vs Observed Multi-Step Runtimes */}
      <div className="mt-6 p-4 rounded-xl bg-[#0D1117] border border-[#21262D] flex items-start gap-3 text-xs text-[#8B949E]">
        <Info size={16} className="text-purple-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold text-slate-200">Honest Evaluation Disclosure: </span>
          The token cost figures above represent official raw API token consumption calculations for single requests. In autonomous multi-step agent loops (such as SWE-bench workflows), total task cost depends on the number of tool iterations, file reads, and search cycles executed by the agent scaffolding.
        </div>
      </div>
    </div>
  );
}
