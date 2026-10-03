import { useEvalStore } from '../../store/evalStore';
import { useEffect } from 'react';
import React, { useState } from 'react';
import { LayoutDashboard, CheckSquare, PlayCircle, Cpu, Bot, BarChart, Settings } from 'lucide-react';
import { EvalsOverview } from './EvalsOverview';
import { EvalsDashboard } from './EvalsDashboard';
import { EvalsTasks } from './EvalsTasks';
import { EvalsRuns } from './EvalsRuns';
import { EvalsModels } from './EvalsModels';
import { EvalsAgents } from './EvalsAgents';
import { EvalsBenchmarks } from './EvalsBenchmarks';
import { EvalsSettings } from './EvalsSettings';
import { FloatLogo } from '../../components/FloatLogo';

type EvalTab = 'overview' | 'tasks' | 'runs' | 'models' | 'agents' | 'benchmarks' | 'settings';

export function EvalsWorkspace() {
  const [activeTab, setActiveTab] = useState<EvalTab>('overview');
  const { fetchTasks, fetchRuns } = useEvalStore();

  useEffect(() => {
    fetchTasks();
    fetchRuns();
    
    // Simple polling for running evals
    const interval = setInterval(() => {
      fetchRuns();
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex w-full h-full bg-slate-50 dark:bg-[#0D1117] text-slate-800 dark:text-[#C9D1D9]">
      {/* Sidebar for Evals */}
      <div className="w-56 border-r border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#0A0A0A] flex flex-col py-4 shrink-0">
        <div className="px-4 mb-4 flex items-center gap-2">
          <FloatLogo className="w-5 h-5" />
          <span className="text-xs font-semibold text-slate-500 dark:text-[#8B949E] uppercase tracking-wider">Evaluation System</span>
        </div>
        <div className="flex flex-col gap-1 px-2">
          <TabItem icon={LayoutDashboard} label="Overview" isActive={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <TabItem icon={CheckSquare} label="Tasks" isActive={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} />
          <TabItem icon={PlayCircle} label="Runs" isActive={activeTab === 'runs'} onClick={() => setActiveTab('runs')} />
          <TabItem icon={Cpu} label="Models" isActive={activeTab === 'models'} onClick={() => setActiveTab('models')} />
          <TabItem icon={Bot} label="Agents" isActive={activeTab === 'agents'} onClick={() => setActiveTab('agents')} />
          <TabItem icon={BarChart} label="Benchmarks" isActive={activeTab === 'benchmarks'} onClick={() => setActiveTab('benchmarks')} />
          <TabItem icon={Settings} label="Settings" isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && <EvalsDashboard />}
        {activeTab === 'tasks' && <EvalsTasks />}
        {activeTab === 'runs' && <EvalsRuns />}
        {activeTab === 'models' && <EvalsModels />}
        {activeTab === 'agents' && <EvalsAgents />}
        {activeTab === 'benchmarks' && <EvalsBenchmarks />}
        {activeTab === 'settings' && <EvalsSettings />}
      </div>
    </div>
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
