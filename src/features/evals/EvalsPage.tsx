import React, { useState, useEffect } from 'react';
import { useEvalStore } from '../../store/evalStore';
import { useIDEStore } from '../../store';
import { FloatLogo } from '../../components/FloatLogo';
import { ModelsDropdown } from '../../components/ModelsDropdown';
import { LanguageDropdown } from '../../components/LanguageDropdown';
import { useTranslation } from '../../components/LanguageProvider';
import { 
  Play, Plus, Layers, Sun, Moon, LayoutDashboard, 
  CheckSquare, PlayCircle, Cpu, Bot, Trophy, TrendingUp, FileText
} from 'lucide-react';

import { EvalsOverview } from './EvalsOverview';
import { EvalsRuns } from './EvalsRuns';
import { EvalsTasks } from './EvalsTasks';
import { EvalsBenchmarks } from './EvalsBenchmarks';
import { EvalsModelComparison } from './EvalsModelComparison';
import { EvalsAgentComparison } from './EvalsAgentComparison';
import { EvalsLeaderboard } from './EvalsLeaderboard';
import { EvalsTrends } from './EvalsTrends';
import { EvalsReports } from './EvalsReports';

import { EvalRunDetailsModal } from './EvalRunDetailsModal';
import { CreateEvalDialog } from './CreateEvalDialog';
import { CreateTaskDialog } from './CreateTaskDialog';

type EvalsTab = 
  | 'overview' 
  | 'runs' 
  | 'tasks' 
  | 'benchmarks' 
  | 'models' 
  | 'agents' 
  | 'leaderboard' 
  | 'trends' 
  | 'reports';

export function EvalsPage() {
  const { settings, updateSettings } = useIDEStore();
  const { t } = useTranslation();
  const { 
    activeTab, 
    setActiveTab, 
    selectedRun, 
    setSelectedRun, 
    fetchAll,
    runs 
  } = useEvalStore();

  const [showCreateEval, setShowCreateEval] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [preselectedTaskId, setPreselectedTaskId] = useState<string | undefined>();
  const [preselectedBenchmarkId, setPreselectedBenchmarkId] = useState<string | undefined>();

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const toggleTheme = () => {
    updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };

  const handleLaunchEvalForTask = (taskId: string) => {
    setPreselectedTaskId(taskId);
    setPreselectedBenchmarkId(undefined);
    setShowCreateEval(true);
  };

  const handleLaunchEvalForBenchmark = (benchmarkId: string) => {
    setPreselectedBenchmarkId(benchmarkId);
    setPreselectedTaskId(undefined);
    setShowCreateEval(true);
  };

  return (
    <div className="min-h-screen bg-[#090D13] text-[#C9D1D9] font-sans selection:bg-[#7C3AED]/30 flex flex-col">
      {/* Platform Top Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 py-3.5 bg-[#0D1117]/90 backdrop-blur-md border-b border-[#2A2A2A] transition-colors">
        <div className="flex items-center gap-8">
          <a 
            href="/" 
            className="flex items-center gap-2.5 cursor-pointer" 
            onClick={(e) => {
              if (window.location.pathname !== '/') {
                e.preventDefault();
                window.history.pushState({}, '', '/');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }
            }}
          >
            <FloatLogo className="w-6 h-6" />
            <span className="font-bold text-lg tracking-tight uppercase text-white">FLOAT</span>
          </a>

          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-[#8B949E]">
            <ModelsDropdown currentPath={window.location.pathname} />
            <a 
              href="/models" 
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/models');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="hover:text-white transition-colors"
            >
              {t('nav.models', 'Models')}
            </a>
            <a 
              href="/evals" 
              className="text-white border-b-2 border-white pb-1 transition-colors"
            >
              {t('nav.evals', 'Evals')}
            </a>
            <a 
              href="/models/usage" 
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/models/usage');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="hover:text-white transition-colors"
            >
              {t('nav.usage', 'Usage')}
            </a>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm font-medium">
          <LanguageDropdown />
          <button
            onClick={toggleTheme}
            aria-label={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
            title={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`}
            className="p-2 rounded-full border border-[#2A2A2A] text-[#8B949E] hover:text-white hover:bg-[#161B22] transition-colors cursor-pointer"
          >
            {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <main className="flex-1 pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        {/* Page Header */}
        <div className="py-6 border-b border-[#2A2A2A] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              Evals
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 border border-[#2A2A2A] text-slate-300 font-normal">
                Platform Benchmark Engine
              </span>
            </h1>
            <p className="text-sm text-[#8B949E] mt-1.5 max-w-3xl leading-relaxed">
              Evaluate AI models and agents on real coding, reasoning, debugging, and software engineering tasks with reproducible benchmarks, validation pipelines, and execution metrics.
            </p>
          </div>

          {/* Top Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => {
                setPreselectedTaskId(undefined);
                setPreselectedBenchmarkId(undefined);
                setShowCreateEval(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-200 text-slate-900 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-sm"
            >
              <Play size={14} className="fill-current" />
              {t('evals.new_evaluation', 'New Evaluation')}
            </button>

            <button
              onClick={() => setShowCreateTask(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1C1C1C] hover:bg-[#2A2A2A] border border-[#2A2A2A] text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <Plus size={14} />
              {t('evals.new_task', 'New Task')}
            </button>

            <button
              onClick={() => {
                setPreselectedBenchmarkId('bench-python-core');
                setShowCreateEval(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1C1C1C] hover:bg-[#2A2A2A] border border-[#2A2A2A] text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <Layers size={14} />
              {t('evals.run_benchmark', 'Run Benchmark')}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#2A2A2A] mt-6 gap-1 overflow-x-auto text-xs font-medium scrollbar-none">
          <TabButton
            id="overview"
            label={t('evals.tab_overview', 'Overview')}
            icon={LayoutDashboard}
            isActive={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
          />
          <TabButton
            id="runs"
            label={t('evals.tab_runs', 'Evaluation Runs')}
            icon={PlayCircle}
            count={runs.length}
            isActive={activeTab === 'runs'}
            onClick={() => setActiveTab('runs')}
          />
          <TabButton
            id="tasks"
            label={t('evals.tab_tasks', 'Tasks')}
            icon={CheckSquare}
            isActive={activeTab === 'tasks'}
            onClick={() => setActiveTab('tasks')}
          />
          <TabButton
            id="benchmarks"
            label={t('evals.tab_benchmarks', 'Benchmarks')}
            icon={Layers}
            isActive={activeTab === 'benchmarks'}
            onClick={() => setActiveTab('benchmarks')}
          />
          <TabButton
            id="models"
            label={t('evals.tab_models', 'Model Comparison')}
            icon={Cpu}
            isActive={activeTab === 'models'}
            onClick={() => setActiveTab('models')}
          />
          <TabButton
            id="agents"
            label={t('evals.tab_agents', 'Agent Comparison')}
            icon={Bot}
            isActive={activeTab === 'agents'}
            onClick={() => setActiveTab('agents')}
          />
          <TabButton
            id="leaderboard"
            label={t('evals.tab_leaderboard', 'Leaderboards')}
            icon={Trophy}
            isActive={activeTab === 'leaderboard'}
            onClick={() => setActiveTab('leaderboard')}
          />
          <TabButton
            id="trends"
            label={t('evals.tab_trends', 'Trends')}
            icon={TrendingUp}
            isActive={activeTab === 'trends'}
            onClick={() => setActiveTab('trends')}
          />
          <TabButton
            id="reports"
            label={t('evals.tab_reports', 'Reports')}
            icon={FileText}
            isActive={activeTab === 'reports'}
            onClick={() => setActiveTab('reports')}
          />
        </div>

        {/* Tab View Container */}
        <div className="mt-6">
          {activeTab === 'overview' && (
            <EvalsOverview
              onNewEval={() => {
                setPreselectedTaskId(undefined);
                setPreselectedBenchmarkId(undefined);
                setShowCreateEval(true);
              }}
              onNewTask={() => setShowCreateTask(true)}
              onRunBenchmark={() => {
                setPreselectedBenchmarkId('bench-python-core');
                setShowCreateEval(true);
              }}
            />
          )}

          {activeTab === 'runs' && (
            <EvalsRuns
              onNewEval={() => {
                setPreselectedTaskId(undefined);
                setPreselectedBenchmarkId(undefined);
                setShowCreateEval(true);
              }}
            />
          )}

          {activeTab === 'tasks' && (
            <EvalsTasks
              onNewTask={() => setShowCreateTask(true)}
              onRunTask={handleLaunchEvalForTask}
            />
          )}

          {activeTab === 'benchmarks' && (
            <EvalsBenchmarks
              onRunBenchmark={handleLaunchEvalForBenchmark}
            />
          )}

          {activeTab === 'models' && <EvalsModelComparison />}

          {activeTab === 'agents' && <EvalsAgentComparison />}

          {activeTab === 'leaderboard' && <EvalsLeaderboard />}

          {activeTab === 'trends' && <EvalsTrends />}

          {activeTab === 'reports' && <EvalsReports />}
        </div>
      </main>

      {/* Evaluation Run Details Modal */}
      {selectedRun && (
        <EvalRunDetailsModal
          run={selectedRun}
          onClose={() => setSelectedRun(null)}
        />
      )}

      {/* Start New Evaluation Modal */}
      {showCreateEval && (
        <CreateEvalDialog
          onClose={() => setShowCreateEval(false)}
          preselectedTaskId={preselectedTaskId}
          preselectedBenchmarkId={preselectedBenchmarkId}
        />
      )}

      {/* Create Task Modal */}
      {showCreateTask && (
        <CreateTaskDialog
          onClose={() => setShowCreateTask(false)}
        />
      )}
    </div>
  );
}

function TabButton({
  id,
  label,
  icon: Icon,
  isActive,
  count,
  onClick
}: {
  id: string;
  label: string;
  icon: any;
  isActive: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      id={`tab-${id}`}
      onClick={onClick}
      className={`flex items-center gap-2 py-3 px-4 border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
        isActive
          ? 'border-white text-white font-semibold'
          : 'border-transparent text-[#8B949E] hover:text-[#C9D1D9] hover:border-[#2A2A2A]'
      }`}
    >
      <Icon size={15} />
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#21262D] text-[#8B949E]">
          {count}
        </span>
      )}
    </button>
  );
}
