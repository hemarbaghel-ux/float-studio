import React, { useState, useEffect } from 'react';
import { useAgentOrchestratorStore } from '../../store/agentOrchestratorStore';
import { LayoutDashboard, CheckSquare, List, Users, Activity, ShieldCheck, Clock, Settings, Network, Cpu } from 'lucide-react';
import { AgentsOverview } from './AgentsOverview';
import { ActiveTasks } from './ActiveTasks';
import { AgentQueue } from './AgentQueue';
import { CustomAgents } from './CustomAgents';
import { AgentActivity } from './AgentActivity';
import { AgentModelAssignment } from './AgentModelAssignment';
import { AgentRegistryProvider } from './AgentRegistryContext';
import { FloatLogo } from '../../components/FloatLogo';

type AgentTab = 'overview' | 'assignments' | 'active' | 'queue' | 'custom' | 'activity';

export function AgentsWorkspace() {
  const [activeTab, setActiveTab] = useState<AgentTab>('overview');
  const { fetchTasks } = useAgentOrchestratorStore();

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AgentRegistryProvider>
      <div className="flex w-full h-full bg-slate-50 dark:bg-[#0D1117] text-slate-800 dark:text-[#C9D1D9]">
        {/* Sidebar for Agents Command Center */}
        <div className="w-56 border-r border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#0A0A0A] flex flex-col py-4 shrink-0">
          <div className="px-4 mb-4 flex items-center gap-2">
            <FloatLogo className="w-5 h-5" />
            <span className="text-xs font-semibold text-slate-500 dark:text-[#8B949E] uppercase tracking-wider">Command Center</span>
          </div>
          <div className="flex flex-col gap-1 px-2">
            <TabItem icon={LayoutDashboard} label="Overview" isActive={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
            <TabItem icon={Cpu} label="Model Assignments" isActive={activeTab === 'assignments'} onClick={() => setActiveTab('assignments')} />
            <TabItem icon={Network} label="Active Tasks" isActive={activeTab === 'active'} onClick={() => setActiveTab('active')} />
            <TabItem icon={List} label="Task Queue" isActive={activeTab === 'queue'} onClick={() => setActiveTab('queue')} />
            <TabItem icon={Users} label="Custom Agents" isActive={activeTab === 'custom'} onClick={() => setActiveTab('custom')} />
            <TabItem icon={Activity} label="Activity Log" isActive={activeTab === 'activity'} onClick={() => setActiveTab('activity')} />
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'overview' && <AgentsOverview />}
          {activeTab === 'assignments' && <AgentModelAssignment />}
          {activeTab === 'active' && <ActiveTasks />}
          {activeTab === 'queue' && <AgentQueue />}
          {activeTab === 'custom' && <CustomAgents />}
          {activeTab === 'activity' && <AgentActivity />}
        </div>
      </div>
    </AgentRegistryProvider>
  );
}

function TabItem({ icon: Icon, label, isActive, onClick }: { icon: any, label: string, isActive: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
        isActive 
          ? 'bg-slate-200/80 text-slate-900 dark:bg-[#242424] dark:text-white border border-slate-300 dark:border-[#2A2A2A] font-semibold' 
          : 'text-slate-600 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-[#C9D1D9] hover:bg-slate-100 dark:hover:bg-[#161B22]/50 border border-transparent'
      }`}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}
