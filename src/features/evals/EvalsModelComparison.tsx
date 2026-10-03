import React, { useState, useMemo } from 'react';
import { useEvalStore } from '../../store/evalStore';
import { INITIAL_MODELS } from '../ai/registry';
import { Check, Plus, X, BarChart2, ShieldAlert, Cpu } from 'lucide-react';

export function EvalsModelComparison() {
  const { runs } = useEvalStore();
  const [selectedModels, setSelectedModels] = useState<string[]>(['gpt-4o', 'gemini-3.1-flash-lite']);

  const completedRuns = useMemo(() => {
    return runs.filter(r => r.status === 'completed' || r.status === 'Completed');
  }, [runs]);

  // Aggregate stats per model strictly from completed runs
  const modelStats = useMemo(() => {
    const stats: Record<string, any> = {};

    for (const modelId of selectedModels) {
      const modelRuns = completedRuns.filter(r => r.modelId === modelId);
      const count = modelRuns.length;

      if (count === 0) {
        stats[modelId] = null;
        continue;
      }

      const totalScore = modelRuns.reduce((acc, r) => acc + (r.finalScore ?? r.score ?? 0), 0);
      const avgScore = Math.round(totalScore / count);

      const passedTasks = modelRuns.filter(r => (r.finalScore ?? r.score ?? 0) >= 70).length;
      const taskSuccessRate = Math.round((passedTasks / count) * 100);

      const passedTests = modelRuns.filter(r => r.testsPassed).length;
      const testPassRate = Math.round((passedTests / count) * 100);

      const buildPassed = modelRuns.filter(r => r.buildPassed).length;
      const buildSuccessRate = Math.round((buildPassed / count) * 100);

      const patchValid = modelRuns.filter(r => r.patchValid).length;
      const patchValidityRate = Math.round((patchValid / count) * 100);

      const totalDuration = modelRuns.reduce((acc, r) => acc + (r.duration ?? (r.durationMs ? r.durationMs / 1000 : 0)), 0);
      const avgLatency = Number((totalDuration / count).toFixed(2));

      const totalTokens = modelRuns.reduce((acc, r) => acc + (r.totalTokens ?? 0), 0);
      const avgTokens = Math.round(totalTokens / count);

      const totalCost = modelRuns.reduce((acc, r) => acc + (r.actualCost ?? r.estimatedCost ?? 0), 0);
      const avgCost = Number((totalCost / count).toFixed(5));

      stats[modelId] = {
        count,
        avgScore,
        taskSuccessRate,
        testPassRate,
        buildSuccessRate,
        patchValidityRate,
        avgLatency,
        avgTokens,
        avgCost
      };
    }

    return stats;
  }, [selectedModels, completedRuns]);

  const toggleModel = (modelId: string) => {
    if (selectedModels.includes(modelId)) {
      if (selectedModels.length > 1) {
        setSelectedModels(selectedModels.filter(m => m !== modelId));
      }
    } else {
      if (selectedModels.length < 4) {
        setSelectedModels([...selectedModels, modelId]);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Model Selector Bar */}
      <div className="p-4 bg-[#161B22] border border-[#30363D] rounded-xl flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-white mr-2 flex items-center gap-1.5">
          <Cpu size={14} className="text-purple-400" />
          Select Models to Compare (max 4):
        </span>
        {INITIAL_MODELS.map(model => {
          const isSelected = selectedModels.includes(model.id);
          return (
            <button
              key={model.id}
              onClick={() => toggleModel(model.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                isSelected
                  ? 'bg-purple-900/60 border border-purple-600 text-white'
                  : 'bg-[#0D1117] border border-[#30363D] text-[#8B949E] hover:text-white'
              }`}
            >
              {isSelected && <Check size={13} className="text-purple-300" />}
              {model.displayName}
            </button>
          );
        })}
      </div>

      {/* Side-by-Side Comparison Table */}
      <div className="border border-[#30363D] rounded-xl bg-[#161B22] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#30363D] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Direct Model Comparison Matrix</h3>
            <p className="text-xs text-[#8B949E] mt-0.5">
              Empirical metrics evaluated across identical coding and debugging benchmarks
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#30363D] bg-[#0D1117]/80 text-[#8B949E]">
                <th className="py-3.5 px-6 font-semibold w-1/4">Evaluation Metric</th>
                {selectedModels.map(modelId => {
                  const model = INITIAL_MODELS.find(m => m.id === modelId);
                  return (
                    <th key={modelId} className="py-3.5 px-6 font-semibold text-white">
                      <div className="font-bold">{model?.displayName || modelId}</div>
                      <div className="text-[10px] text-[#8B949E] font-normal capitalize">
                        {model?.providerId} &bull; {model?.contextWindow.toLocaleString()} ctx
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363D] text-[#C9D1D9]">
              <MetricRow 
                label="Evaluations Recorded" 
                selectedModels={selectedModels} 
                getValue={(m) => modelStats[m] ? `${modelStats[m].count} runs` : '—'} 
              />
              <MetricRow 
                label="Overall Benchmark Score" 
                selectedModels={selectedModels} 
                highlight
                getValue={(m) => modelStats[m] ? `${modelStats[m].avgScore} / 100` : '—'} 
              />
              <MetricRow 
                label="Task Completion Rate" 
                selectedModels={selectedModels} 
                getValue={(m) => modelStats[m] ? `${modelStats[m].taskSuccessRate}%` : '—'} 
              />
              <MetricRow 
                label="Unit Test Pass Rate" 
                selectedModels={selectedModels} 
                getValue={(m) => modelStats[m] ? `${modelStats[m].testPassRate}%` : '—'} 
              />
              <MetricRow 
                label="Build / Compilation Rate" 
                selectedModels={selectedModels} 
                getValue={(m) => modelStats[m] ? `${modelStats[m].buildSuccessRate}%` : '—'} 
              />
              <MetricRow 
                label="Patch Validity Rate" 
                selectedModels={selectedModels} 
                getValue={(m) => modelStats[m] ? `${modelStats[m].patchValidityRate}%` : '—'} 
              />
              <MetricRow 
                label="Average Latency" 
                selectedModels={selectedModels} 
                getValue={(m) => modelStats[m] ? `${modelStats[m].avgLatency}s` : '—'} 
              />
              <MetricRow 
                label="Average Total Tokens" 
                selectedModels={selectedModels} 
                getValue={(m) => modelStats[m] ? `${modelStats[m].avgTokens.toLocaleString()}` : '—'} 
              />
              <MetricRow 
                label="Average Cost per Task" 
                selectedModels={selectedModels} 
                getValue={(m) => modelStats[m] ? `$${modelStats[m].avgCost}` : '—'} 
              />
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-4 rounded-lg bg-[#090D13] border border-[#30363D] text-xs text-[#8B949E] flex items-center gap-2">
        <ShieldAlert size={15} className="text-amber-400 shrink-0" />
        <span>
          Note: Values of <strong>&ldquo;—&rdquo;</strong> signify that no completed evaluation runs exist for that model yet. FLOAT Evals strictly displays real empirical results and never invents benchmark values.
        </span>
      </div>
    </div>
  );
}

function MetricRow({ 
  label, 
  selectedModels, 
  getValue, 
  highlight 
}: { 
  label: string; 
  selectedModels: string[]; 
  getValue: (modelId: string) => string;
  highlight?: boolean;
}) {
  return (
    <tr className="hover:bg-[#21262D]/30 transition-colors">
      <td className="py-3 px-6 font-medium text-white">{label}</td>
      {selectedModels.map(modelId => (
        <td key={modelId} className={`py-3 px-6 font-mono ${highlight ? 'font-bold text-purple-300 text-sm' : ''}`}>
          {getValue(modelId)}
        </td>
      ))}
    </tr>
  );
}
