import React, { useState } from 'react';
import { useAIStore } from '../../store/aiStore';
import { Agent } from '../../types/ai';

export function CustomAgents() {
  const { agents } = useAIStore();
  const customAgents = agents.filter(a => a.id.startsWith('custom-'));

  return (
    <div className="p-8 max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Custom Agents</h1>
        <button className="px-3 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-[#C9D1D9] border border-[#30363D] rounded-md text-sm transition-colors">
          + Create Agent
        </button>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {customAgents.length === 0 ? (
          <div className="col-span-2 border border-[#30363D] rounded-md p-8 text-center text-[#8B949E] bg-[#0D1117]">
            No custom agents created yet.
          </div>
        ) : (
          customAgents.map(agent => (
            <div key={agent.id} className="bg-[#0D1117] border border-[#30363D] rounded-lg p-5">
              <h3 className="text-lg font-medium text-white mb-2">{agent.name}</h3>
              <p className="text-sm text-[#8B949E] mb-4">{agent.description}</p>
              
              <div className="text-xs text-[#C9D1D9] mb-2 font-semibold uppercase">Capabilities</div>
              <div className="flex flex-wrap gap-2 mb-4">
                {agent.tools.map(tool => (
                  <span key={tool} className="px-2 py-0.5 rounded text-xs bg-[#161B22] border border-[#30363D] text-[#8B949E]">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
