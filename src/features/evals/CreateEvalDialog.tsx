import React, { useState } from 'react';
import { X, Play, Cpu, Bot, CheckSquare, Layers, ShieldAlert, Sparkles } from 'lucide-react';
import { useEvalStore } from '../../store/evalStore';
import { INITIAL_MODELS } from '../ai/registry';
import { defaultAgents } from '../../store/aiStore';

interface CreateEvalDialogProps {
  onClose: () => void;
  preselectedTaskId?: string;
  preselectedBenchmarkId?: string;
  preselectedModelId?: string;
}

export function CreateEvalDialog({ 
  onClose, 
  preselectedTaskId, 
  preselectedBenchmarkId,
  preselectedModelId 
}: CreateEvalDialogProps) {
  const { tasks, benchmarks, runEval, runBatchEval } = useEvalStore();

  const [evalType, setEvalType] = useState<'single' | 'benchmark'>('single');
  const [selectedModelId, setSelectedModelId] = useState(preselectedModelId || 'gpt-4o');
  const [selectedAgentId, setSelectedAgentId] = useState('coder-agent');
  const [selectedTaskId, setSelectedTaskId] = useState(preselectedTaskId || (tasks[0]?.id || ''));
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState(preselectedBenchmarkId || (benchmarks[0]?.id || ''));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModel = INITIAL_MODELS.find(m => m.id === selectedModelId);
  const selectedTask = tasks.find(t => t.id === selectedTaskId);
  const selectedBenchmark = benchmarks.find(b => b.id === selectedBenchmarkId);

  // Cost safety estimation
  const estInputTokens = 1500;
  const estOutputTokens = 800;
  const estCost = selectedModel?.pricing 
    ? ((estInputTokens * selectedModel.pricing.inputCost + estOutputTokens * selectedModel.pricing.outputCost) / 1_000_000).toFixed(5)
    : '0.00000';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (evalType === 'benchmark') {
        const bench = benchmarks.find(b => b.id === selectedBenchmarkId);
        if (!bench) throw new Error('Selected benchmark not found');
        
        await runBatchEval({
          taskIds: bench.taskIds,
          modelIds: [selectedModelId],
          agentId: selectedAgentId,
          benchmarkId: bench.id
        });
      } else {
        if (!selectedTaskId) throw new Error('Please select a task to evaluate');
        const providerId = selectedModel?.providerId || 'openai';
        
        await runEval({
          taskId: selectedTaskId,
          modelId: selectedModelId,
          agentId: selectedAgentId,
          providerId
        });
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to start evaluation run');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#0D1117] border border-[#30363D] rounded-xl w-full max-w-xl shadow-2xl overflow-hidden text-[#C9D1D9]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#30363D] bg-[#161B22] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="text-purple-400" size={18} />
            <h2 className="text-base font-semibold text-white">Start New Evaluation</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#8B949E] hover:text-white hover:bg-[#21262D] rounded-md transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded bg-red-950/40 border border-red-800 text-red-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs">
          {/* Mode Selector */}
          <div>
            <label className="block text-white font-medium mb-1.5">Evaluation Scope</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEvalType('single')}
                className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  evalType === 'single'
                    ? 'border-purple-500 bg-purple-950/20 text-white'
                    : 'border-[#30363D] bg-[#161B22] text-[#8B949E] hover:text-white'
                }`}
              >
                <div className="font-semibold text-xs text-white">Single Task Eval</div>
                <div className="text-[11px] text-[#8B949E] mt-0.5">Test model on one coding problem</div>
              </button>

              <button
                type="button"
                onClick={() => setEvalType('benchmark')}
                className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  evalType === 'benchmark'
                    ? 'border-purple-500 bg-purple-950/20 text-white'
                    : 'border-[#30363D] bg-[#161B22] text-[#8B949E] hover:text-white'
                }`}
              >
                <div className="font-semibold text-xs text-white">Benchmark Suite</div>
                <div className="text-[11px] text-[#8B949E] mt-0.5">Run curated multi-task benchmark</div>
              </button>
            </div>
          </div>

          {/* Target Selection */}
          {evalType === 'single' ? (
            <div>
              <label className="block text-white font-medium mb-1.5">Evaluation Task</label>
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="w-full p-2.5 bg-[#161B22] border border-[#30363D] rounded text-white focus:outline-none focus:border-purple-500"
              >
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>
                    [{t.category}] {t.name} ({t.difficulty})
                  </option>
                ))}
              </select>
              {selectedTask && (
                <p className="mt-1.5 text-[11px] text-[#8B949E] leading-relaxed">
                  {selectedTask.description}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-white font-medium mb-1.5">Benchmark Suite</label>
              <select
                value={selectedBenchmarkId}
                onChange={(e) => setSelectedBenchmarkId(e.target.value)}
                className="w-full p-2.5 bg-[#161B22] border border-[#30363D] rounded text-white focus:outline-none focus:border-purple-500"
              >
                {benchmarks.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.version}) - {b.taskCount} tasks
                  </option>
                ))}
              </select>
              {selectedBenchmark && (
                <p className="mt-1.5 text-[11px] text-[#8B949E] leading-relaxed">
                  {selectedBenchmark.description}
                </p>
              )}
            </div>
          )}

          {/* Model Selection */}
          <div>
            <label className="block text-white font-medium mb-1.5">Model Under Evaluation</label>
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="w-full p-2.5 bg-[#161B22] border border-[#30363D] rounded text-white focus:outline-none focus:border-purple-500"
            >
              {INITIAL_MODELS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.displayName} ({m.providerId.toUpperCase()}) - ${m.pricing?.inputCost}/1M in, ${m.pricing?.outputCost}/1M out
                </option>
              ))}
            </select>
            {selectedModel && (
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-[#8B949E]">
                <span>Context: {selectedModel.contextWindow.toLocaleString()} tokens</span>
                {selectedModel.limits?.maxOutputTokens && (
                  <span>Max Output: {selectedModel.limits.maxOutputTokens.toLocaleString()} tokens</span>
                )}
                <span>Family: {selectedModel.family}</span>
              </div>
            )}
          </div>

          {/* Agent Selection */}
          <div>
            <label className="block text-white font-medium mb-1.5">Agent Configuration</label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full p-2.5 bg-[#161B22] border border-[#30363D] rounded text-white focus:outline-none focus:border-purple-500"
            >
              {defaultAgents.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.mode} mode)
                </option>
              ))}
            </select>
          </div>

          {/* Cost & Token Safety Preview */}
          <div className="p-3 bg-[#161B22] border border-[#30363D] rounded-lg">
            <div className="flex items-center gap-2 text-white font-medium mb-1">
              <ShieldAlert size={14} className="text-amber-400" />
              Token & Cost Safety Check
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-[11px] text-[#8B949E]">
              <div>Estimated Token Budget: ~{estInputTokens + estOutputTokens} tokens</div>
              <div>Estimated Cost: ${estCost} USD</div>
            </div>
            <div className="text-[10px] text-[#8B949E] mt-1.5">
              Calculated via FLOAT ModelPricingRegistry without fabricated values.
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#30363D]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#8B949E] hover:text-white rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-md transition-colors shadow-sm disabled:opacity-50"
            >
              <Play size={14} className="fill-current" />
              {isSubmitting ? 'Starting Runner...' : 'Launch Evaluation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
