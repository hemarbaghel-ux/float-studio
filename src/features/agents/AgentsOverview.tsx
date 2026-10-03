import React from 'react';
import { useAgentOrchestratorStore } from '../../store/agentOrchestratorStore';
import { Activity, Network, CheckCircle, Clock } from 'lucide-react';

export function AgentsOverview() {
  const { tasks } = useAgentOrchestratorStore();
  
  const activeTasks = tasks.filter(t => ['PLANNING', 'INSPECTING', 'EXECUTING', 'WAITING_FOR_TOOL', 'VALIDATING'].includes(t.status));
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED');
  const queuedTasks = tasks.filter(t => t.status === 'QUEUED');

  return (
    <div className="p-8 max-w-6xl mx-auto flex flex-col gap-8">
      <h1 className="text-2xl font-semibold text-white">Agent Command Center</h1>
      
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Network} label="Active Agents" value={activeTasks.length} color="text-blue-400" />
        <StatCard icon={Clock} label="Queued Tasks" value={queuedTasks.length} color="text-yellow-400" />
        <StatCard icon={CheckCircle} label="Completed Today" value={completedTasks.length} color="text-green-400" />
        <StatCard icon={Activity} label="Pending Approvals" value={0} color="text-orange-400" />
      </div>

      <div className="bg-[#161B22] border border-[#30363D] p-6 rounded-lg">
        <h2 className="text-lg font-medium text-white mb-4">Orchestration System Active</h2>
        <p className="text-sm text-[#8B949E] leading-relaxed">
          The multi-agent orchestration system is running. Sub-agents (Planner, Coder, Explorer, Reviewer) can be dispatched to perform complex engineering tasks in parallel.
        </p>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any, label: string, value: number | string, color: string }) {
  return (
    <div className="bg-[#010409] border border-[#30363D] p-5 rounded-lg flex items-center gap-4">
      <div className={`p-3 bg-[#161B22] rounded-md border border-[#30363D] ${color}`}>
        <Icon size={24} />
      </div>
      <div>
        <div className="text-2xl font-semibold text-white">{value}</div>
        <div className="text-xs font-medium text-[#8B949E]">{label}</div>
      </div>
    </div>
  );
}
