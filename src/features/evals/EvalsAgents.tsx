import React from 'react';
import { useEvalStore } from '../../store/evalStore';
import { useAIStore } from '../../store/aiStore';

export function EvalsAgents() {
  const { runs } = useEvalStore();
  const { agents } = useAIStore();

  return (
    <div className="p-8 max-w-6xl mx-auto flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-white">Agent Comparison</h1>
      
      <div className="border border-[#30363D] rounded-md overflow-hidden bg-[#0D1117]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#161B22] text-[#8B949E] border-b border-[#30363D]">
            <tr>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Mode</th>
              <th className="px-4 py-3 font-medium">Success Rate</th>
              <th className="px-4 py-3 font-medium">Avg Score</th>
              <th className="px-4 py-3 font-medium">Avg Latency</th>
              <th className="px-4 py-3 font-medium">Total Runs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#30363D]">
            {agents.map(agent => {
              const agentRuns = runs.filter(r => r.agentId === agent.id && r.status === 'Completed');
              const totalRuns = agentRuns.length;
              
              if (totalRuns === 0) {
                return (
                  <tr key={agent.id} className="hover:bg-[#161B22] transition-colors">
                    <td className="px-4 py-3 text-[#C9D1D9] font-medium">{agent.name}</td>
                    <td className="px-4 py-3 text-[#8B949E]">{agent.mode}</td>
                    <td colSpan={4} className="px-4 py-3 text-[#8B949E] text-center">Insufficient data</td>
                  </tr>
                );
              }
              
              const successRuns = agentRuns.filter(r => (r.score || 0) >= 80).length;
              const avgScore = Math.round(agentRuns.reduce((acc, r) => acc + (r.score || 0), 0) / totalRuns);
              const avgLatency = Math.round(agentRuns.reduce((acc, r) => acc + (r.duration || 0), 0) / totalRuns);
              
              return (
                <tr key={agent.id} className="hover:bg-[#161B22] transition-colors">
                  <td className="px-4 py-3 text-[#C9D1D9] font-medium">{agent.name}</td>
                  <td className="px-4 py-3 text-[#8B949E]">{agent.mode}</td>
                  <td className="px-4 py-3 text-[#C9D1D9]">{Math.round((successRuns / totalRuns) * 100)}%</td>
                  <td className="px-4 py-3 text-[#C9D1D9]">{avgScore}</td>
                  <td className="px-4 py-3 text-[#8B949E]">{avgLatency}s</td>
                  <td className="px-4 py-3 text-[#8B949E]">{totalRuns}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
