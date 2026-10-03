import React, { useState, useMemo } from 'react';
import { useEvalStore } from '../../store/evalStore';
import { defaultAgents } from '../../store/aiStore';
import { Bot, Check, ShieldAlert } from 'lucide-react';

export function EvalsAgentComparison() {
  const { runs } = useEvalStore();
  const [selectedAgents, setSelectedAgents] = useState<string[]>(['main-agent', 'coder-agent', 'debugger-agent']);

  const completedRuns = useMemo(() => {
    return runs.filter(r => r.status === 'completed' || r.status === 'Completed');
  }, [runs]);

  const agentStats = useMemo(() => {
    const stats: Record<string, any> = {};

    for (const agentId of selectedAgents) {
      const agentRuns = completedRuns.filter(r => r.agentId === agentId);
      const count = agentRuns.length;

      if (count === 0) {
        stats[agentId] = null;
        continue;
      }

      const totalScore = agentRuns.reduce((acc, r) => acc + (r.finalScore ?? r.score ?? 0), 0);
      const avgScore = Math.round(totalScore / count);

      const passedTasks = agentRuns.filter(r => (r.finalScore ?? r.score ?? 0) >= 70).length;
      const taskSuccessRate = Math.round((passedTasks / count) * 100);

      const passedTests = agentRuns.filter(r => r.testsPassed).length;
      const testPassRate = Math.round((passedTests / count) * 100);

      const totalToolCalls = agentRuns.reduce((acc, r) => acc + (r.toolCalls ?? r.toolTrace?.length ?? 0), 0);
      const avgToolCalls = Number((totalToolCalls / count).toFixed(1));

      const totalSteps = agentRuns.reduce((acc, r) => acc + (r.agentSteps ?? r.agentTrace?.length ?? 0), 0);
      const avgSteps = Number((totalSteps / count).toFixed(1));

      const totalDuration = agentRuns.reduce((acc, r) => acc + (r.duration ?? (r.durationMs ? r.durationMs / 1000 : 0)), 0);
      const avgLatency = Number((totalDuration / count).toFixed(2));

      const totalCost = agentRuns.reduce((acc, r) => acc + (r.actualCost ?? r.estimatedCost ?? 0), 0);
      const avgCost = Number((totalCost / count).toFixed(5));

      stats[agentId] = {
        count,
        avgScore,
        taskSuccessRate,
        testPassRate,
        avgToolCalls,
        avgSteps,
        avgLatency,
        avgCost
      };
    }

    return stats;
  }, [selectedAgents, completedRuns]);

  const toggleAgent = (agentId: string) => {
    if (selectedAgents.includes(agentId)) {
      if (selectedAgents.length > 1) {
        setSelectedAgents(selectedAgents.filter(a => a !== agentId));
      }
    } else {
      if (selectedAgents.length < 4) {
        setSelectedAgents([...selectedAgents, agentId]);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Agent Selector Bar */}
      <div className="p-4 bg-[#161B22] border border-[#30363D] rounded-xl flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-white mr-2 flex items-center gap-1.5">
          <Bot size={14} className="text-purple-400" />
          Select Agents to Compare (max 4):
        </span>
        {defaultAgents.map(agent => {
          const isSelected = selectedAgents.includes(agent.id);
          return (
            <button
              key={agent.id}
              onClick={() => toggleAgent(agent.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                isSelected
                  ? 'bg-purple-900/60 border border-purple-600 text-white'
                  : 'bg-[#0D1117] border border-[#30363D] text-[#8B949E] hover:text-white'
              }`}
            >
              {isSelected && <Check size={13} className="text-purple-300" />}
              {agent.name}
            </button>
          );
        })}
      </div>

      {/* Side-by-Side Agent Comparison Table */}
      <div className="border border-[#30363D] rounded-xl bg-[#161B22] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#30363D]">
          <h3 className="text-sm font-semibold text-white">Agent Efficiency & Autonomy Comparison</h3>
          <p className="text-xs text-[#8B949E] mt-0.5">
            Evaluate tool orchestration, reasoning steps, latency, and success rates across different agent personalities
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#30363D] bg-[#0D1117]/80 text-[#8B949E]">
                <th className="py-3.5 px-6 font-semibold w-1/4">Agent Metric</th>
                {selectedAgents.map(agentId => {
                  const agent = defaultAgents.find(a => a.id === agentId);
                  return (
                    <th key={agentId} className="py-3.5 px-6 font-semibold text-white">
                      <div className="font-bold">{agent?.name || agentId}</div>
                      <div className="text-[10px] text-[#8B949E] font-normal capitalize">
                        {agent?.mode} mode &bull; {agent?.defaultModel}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363D] text-[#C9D1D9]">
              <AgentMetricRow 
                label="Evaluations Recorded" 
                selectedAgents={selectedAgents} 
                getValue={(a) => agentStats[a] ? `${agentStats[a].count} runs` : '—'} 
              />
              <AgentMetricRow 
                label="Overall Success Score" 
                selectedAgents={selectedAgents} 
                highlight
                getValue={(a) => agentStats[a] ? `${agentStats[a].avgScore} / 100` : '—'} 
              />
              <AgentMetricRow 
                label="Task Completion Rate" 
                selectedAgents={selectedAgents} 
                getValue={(a) => agentStats[a] ? `${agentStats[a].taskSuccessRate}%` : '—'} 
              />
              <AgentMetricRow 
                label="Unit Test Pass Rate" 
                selectedAgents={selectedAgents} 
                getValue={(a) => agentStats[a] ? `${agentStats[a].testPassRate}%` : '—'} 
              />
              <AgentMetricRow 
                label="Avg Tool Calls per Task" 
                selectedAgents={selectedAgents} 
                getValue={(a) => agentStats[a] ? `${agentStats[a].avgToolCalls} calls` : '—'} 
              />
              <AgentMetricRow 
                label="Avg Agent Steps" 
                selectedAgents={selectedAgents} 
                getValue={(a) => agentStats[a] ? `${agentStats[a].avgSteps} steps` : '—'} 
              />
              <AgentMetricRow 
                label="Avg Latency" 
                selectedAgents={selectedAgents} 
                getValue={(a) => agentStats[a] ? `${agentStats[a].avgLatency}s` : '—'} 
              />
              <AgentMetricRow 
                label="Avg Cost per Task" 
                selectedAgents={selectedAgents} 
                getValue={(a) => agentStats[a] ? `$${agentStats[a].avgCost}` : '—'} 
              />
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-4 rounded-lg bg-[#090D13] border border-[#30363D] text-xs text-[#8B949E] flex items-center gap-2">
        <ShieldAlert size={15} className="text-amber-400 shrink-0" />
        <span>
          Note: Values of <strong>&ldquo;—&rdquo;</strong> signify that no evaluations have been executed with that agent yet. Run an evaluation with the selected agent to populate empirical metrics.
        </span>
      </div>
    </div>
  );
}

function AgentMetricRow({ 
  label, 
  selectedAgents, 
  getValue, 
  highlight 
}: { 
  label: string; 
  selectedAgents: string[]; 
  getValue: (agentId: string) => string;
  highlight?: boolean;
}) {
  return (
    <tr className="hover:bg-[#21262D]/30 transition-colors">
      <td className="py-3 px-6 font-medium text-white">{label}</td>
      {selectedAgents.map(agentId => (
        <td key={agentId} className={`py-3 px-6 font-mono ${highlight ? 'font-bold text-purple-300 text-sm' : ''}`}>
          {getValue(agentId)}
        </td>
      ))}
    </tr>
  );
}
