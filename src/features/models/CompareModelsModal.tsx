import React from 'react';
import { 
  X, 
  Check, 
  Minus, 
  Cpu, 
  Brain, 
  Wrench, 
  Eye, 
  Scale, 
  Coins, 
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import { AIModel } from '../../types/ai';
import { getVerifiedModel } from '../../data/verifiedModels';
import { getScoresForModel } from '../../data/verifiedBenchmarks';
import { motion, AnimatePresence } from 'motion/react';

interface CompareModelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModels: AIModel[];
  onRemoveModel: (id: string) => void;
}

export function CompareModelsModal({ 
  isOpen, 
  onClose, 
  selectedModels, 
  onRemoveModel 
}: CompareModelsModalProps) {
  if (!isOpen) return null;

  const renderCapability = (hasCapability?: boolean) => {
    return hasCapability ? (
      <Check size={16} className="text-emerald-400 mx-auto" />
    ) : (
      <Minus size={16} className="text-[#30363D] mx-auto" />
    );
  };

  const getBenchmarkScore = (modelId: string, benchmarkId: string) => {
    const scores = getScoresForModel(modelId);
    const item = scores.find(s => s.benchmarkId === benchmarkId);
    if (!item) return <span className="text-[#8B949E]">N/A</span>;
    return (
      <div className="flex flex-col items-center">
        <span className="font-mono font-bold text-emerald-400">{item.score.toFixed(1)}%</span>
        <span className="text-[9px] text-[#8B949E] text-center max-w-[120px] truncate" title={item.evaluatorName}>
          {item.evaluatorName}
        </span>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-6xl max-h-[90vh] bg-[#12161F] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[#21262D]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262D] shrink-0 bg-[#0D1117]">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Scale size={18} className="text-purple-400" />
                Cross-Model Architectural Comparison
              </h2>
              <p className="text-xs text-[#8B949E]">
                Comparing verified specifications, benchmark results, and official pricing.
              </p>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[#21262D] text-[#8B949E] hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content Body */}
          <div className="overflow-y-auto p-6 space-y-6">
            {selectedModels.length === 0 ? (
              <div className="p-12 text-center text-xs text-[#8B949E]">
                No models currently selected for comparison. Return to the catalog and check up to 4 models.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#21262D]">
                      <th className="p-3 text-[#8B949E] font-semibold uppercase tracking-wider w-44">
                        Attribute
                      </th>
                      {selectedModels.map((m) => (
                        <th key={m.id} className="p-3 text-center min-w-[180px]">
                          <div className="flex flex-col items-center">
                            <span className="font-bold text-white text-sm">{m.displayName}</span>
                            <span className="text-[10px] text-[#8B949E] capitalize">{m.providerId}</span>
                            <button
                              onClick={() => onRemoveModel(m.id)}
                              className="text-[10px] text-red-400 hover:text-red-300 mt-1 cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262D]">
                    {/* Status */}
                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">FLOAT Availability</td>
                      {selectedModels.map(m => (
                        <td key={m.id} className="p-3 text-center font-mono text-[11px]">
                          {m.status === 'AVAILABLE' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px]">
                              Available
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[10px]">
                              Config Required
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>

                    {/* Context Window */}
                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">Context Window</td>
                      {selectedModels.map(m => (
                        <td key={m.id} className="p-3 text-center font-mono font-bold text-white">
                          {(m.contextWindow || 0).toLocaleString()} tokens
                        </td>
                      ))}
                    </tr>

                    {/* Max Output Tokens */}
                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">Max Output Tokens</td>
                      {selectedModels.map(m => {
                        const verified = getVerifiedModel(m.id);
                        return (
                          <td key={m.id} className="p-3 text-center font-mono text-slate-300">
                            {(verified?.maxOutputTokens || m.limits?.maxOutputTokens || 8192).toLocaleString()} tokens
                          </td>
                        );
                      })}
                    </tr>

                    {/* Pricing Input */}
                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">Input Token Price</td>
                      {selectedModels.map(m => (
                        <td key={m.id} className="p-3 text-center font-mono text-slate-200">
                          ${(m.pricing?.inputCost || 0).toFixed(2)} / 1M
                        </td>
                      ))}
                    </tr>

                    {/* Pricing Output */}
                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">Output Token Price</td>
                      {selectedModels.map(m => (
                        <td key={m.id} className="p-3 text-center font-mono text-slate-200">
                          ${(m.pricing?.outputCost || 0).toFixed(2)} / 1M
                        </td>
                      ))}
                    </tr>

                    {/* Pricing Cached */}
                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">Cached Input Price</td>
                      {selectedModels.map(m => {
                        const verified = getVerifiedModel(m.id);
                        return (
                          <td key={m.id} className="p-3 text-center font-mono text-slate-300">
                            {verified?.pricing?.cachedInputCostPer1M !== undefined 
                              ? `$${verified.pricing.cachedInputCostPer1M.toFixed(3)} / 1M`
                              : 'Standard'}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Section Header: Benchmarks */}
                    <tr className="bg-[#0D1117]">
                      <td colSpan={selectedModels.length + 1} className="p-2.5 text-xs font-bold text-purple-300 uppercase tracking-wider">
                        Verified Benchmark Results
                      </td>
                    </tr>

                    {/* SWE-bench Verified */}
                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">SWE-bench Verified</td>
                      {selectedModels.map(m => (
                        <td key={m.id} className="p-3 text-center">
                          {getBenchmarkScore(m.id, 'swe-bench-verified')}
                        </td>
                      ))}
                    </tr>

                    {/* HumanEval */}
                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">HumanEval (0-shot)</td>
                      {selectedModels.map(m => (
                        <td key={m.id} className="p-3 text-center">
                          {getBenchmarkScore(m.id, 'humaneval')}
                        </td>
                      ))}
                    </tr>

                    {/* GPQA Diamond */}
                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">GPQA Diamond</td>
                      {selectedModels.map(m => (
                        <td key={m.id} className="p-3 text-center">
                          {getBenchmarkScore(m.id, 'gpqa-diamond')}
                        </td>
                      ))}
                    </tr>

                    {/* MATH-500 */}
                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">MATH-500</td>
                      {selectedModels.map(m => (
                        <td key={m.id} className="p-3 text-center">
                          {getBenchmarkScore(m.id, 'math-500')}
                        </td>
                      ))}
                    </tr>

                    {/* Section Header: Capabilities */}
                    <tr className="bg-[#0D1117]">
                      <td colSpan={selectedModels.length + 1} className="p-2.5 text-xs font-bold text-purple-300 uppercase tracking-wider">
                        Capabilities & Features
                      </td>
                    </tr>

                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">Code Generation</td>
                      {selectedModels.map(m => (
                        <td key={m.id} className="p-3 text-center">{renderCapability(m.capabilities?.coding)}</td>
                      ))}
                    </tr>

                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">Complex Reasoning</td>
                      {selectedModels.map(m => (
                        <td key={m.id} className="p-3 text-center">{renderCapability(m.capabilities?.reasoning)}</td>
                      ))}
                    </tr>

                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">Tool & Function Calling</td>
                      {selectedModels.map(m => (
                        <td key={m.id} className="p-3 text-center">{renderCapability(m.capabilities?.tools)}</td>
                      ))}
                    </tr>

                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">Vision Input</td>
                      {selectedModels.map(m => (
                        <td key={m.id} className="p-3 text-center">{renderCapability(m.capabilities?.vision)}</td>
                      ))}
                    </tr>

                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">Structured Output</td>
                      {selectedModels.map(m => (
                        <td key={m.id} className="p-3 text-center">{renderCapability(m.capabilities?.structuredOutput)}</td>
                      ))}
                    </tr>

                    <tr className="hover:bg-[#161B22]/50">
                      <td className="p-3 text-[#8B949E] font-semibold">Long Context (&gt;100k)</td>
                      {selectedModels.map(m => (
                        <td key={m.id} className="p-3 text-center">{renderCapability((m.contextWindow || 0) > 100000)}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
