import React from 'react';
import { useAgentOrchestratorStore } from '../../store/agentOrchestratorStore';

export function AgentQueue() {
  const { tasks } = useAgentOrchestratorStore();
  const queuedTasks = tasks.filter(t => t.status === 'QUEUED');

  return (
    <div className="p-8 max-w-6xl mx-auto flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-white">Task Queue</h1>
      
      <div className="border border-[#30363D] rounded-md overflow-hidden bg-[#0D1117]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#161B22] text-[#8B949E] border-b border-[#30363D]">
            <tr>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Task</th>
              <th className="px-4 py-3 font-medium">Assigned Agent</th>
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#30363D]">
            {queuedTasks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#8B949E]">
                  Queue is empty.
                </td>
              </tr>
            ) : (
              queuedTasks.map(task => (
                <tr key={task.id} className="hover:bg-[#161B22] transition-colors cursor-pointer">
                  <td className="px-4 py-3 text-[#8B949E]">Normal</td>
                  <td className="px-4 py-3 text-[#C9D1D9] font-medium">{task.name}</td>
                  <td className="px-4 py-3 text-[#8B949E]">{task.assignedAgentId}</td>
                  <td className="px-4 py-3 text-[#8B949E]">{task.modelId}</td>
                  <td className="px-4 py-3 text-[#8B949E]">{new Date(task.createdAt).toLocaleTimeString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
