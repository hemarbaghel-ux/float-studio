import React, { useState } from 'react';
import { useAgentOrchestratorStore } from '../../store/agentOrchestratorStore';
import { Play, Pause, XCircle } from 'lucide-react';

export function ActiveTasks() {
  const { tasks, fetchTasks } = useAgentOrchestratorStore();
  
  const handlePause = async (id: string) => {
    await fetch(`/api/agents/tasks/${id}/pause`, { method: 'POST' });
    fetchTasks();
  };
  const handleResume = async (id: string) => {
    await fetch(`/api/agents/tasks/${id}/resume`, { method: 'POST' });
    fetchTasks();
  };
  const handleCancel = async (id: string) => {
    await fetch(`/api/agents/tasks/${id}/cancel`, { method: 'POST' });
    fetchTasks();
  };
  const activeTasks = tasks.filter(t => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(t.status));

  return (
    <div className="p-8 max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Active Tasks</h1>
      </div>
      
      <div className="flex flex-col gap-4">
        {activeTasks.length === 0 ? (
          <div className="border border-[#30363D] rounded-md p-8 text-center text-[#8B949E] bg-[#0D1117]">
            No active tasks. Start a new agent task from the IDE.
          </div>
        ) : (
          activeTasks.map(task => (
            <div key={task.id} className="bg-[#0D1117] border border-[#30363D] rounded-lg p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-medium text-white">{task.name}</h3>
                  <p className="text-sm text-[#8B949E] mt-1">{task.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {task.status === 'PAUSED' ? (
                    <button onClick={() => handleResume(task.id)} className="p-1.5 text-[#8B949E] hover:text-white bg-[#21262D] rounded-md" title="Resume">
                      <Play size={16} />
                    </button>
                  ) : (
                    <button onClick={() => handlePause(task.id)} className="p-1.5 text-[#8B949E] hover:text-white bg-[#21262D] rounded-md" title="Pause">
                      <Pause size={16} />
                    </button>
                  )}
                  <button onClick={() => handleCancel(task.id)} className="p-1.5 text-red-400 hover:text-red-300 bg-[#21262D] rounded-md" title="Cancel">
                    <XCircle size={16} />
                  </button>
                </div>
              </div>
              
              <div>
                <div className="flex items-center justify-between text-xs text-[#8B949E] mb-1.5">
                  <span className="font-medium px-2 py-0.5 rounded-sm bg-[#161B22] border border-[#30363D]">{task.status}</span>
                  <span>{task.progress}%</span>
                </div>
                <div className="w-full h-2 bg-[#010409] rounded-full overflow-hidden border border-[#30363D]">
                  <div 
                    className={`h-full transition-all duration-300 ${task.status === 'PAUSED' ? 'bg-yellow-500' : 'bg-[#58A6FF]'}`}
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
