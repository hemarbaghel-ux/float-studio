import React, { useState } from 'react';
import { EvalTaskForm } from './EvalTaskForm';
import { EvalHistoryList } from './EvalHistoryList';
import { EvalTaskCharts } from './EvalTaskCharts';
import { ClipboardList, History, Plus } from 'lucide-react';

export function EvalsDashboard() {
  const [activeTab, setActiveTab] = useState<'manage' | 'history'>('manage');
  const [isCreating, setIsCreating] = useState(false);

  return (
    <div className="p-8 max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Evaluations Dashboard</h1>
        {activeTab === 'manage' && !isCreating && (
          <button 
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-md text-sm font-medium transition-colors"
          >
            <Plus size={16} /> New Eval Task
          </button>
        )}
      </div>

      <div className="flex gap-4 border-b border-[#30363D] mb-4">
        <button
          onClick={() => { setActiveTab('manage'); setIsCreating(false); }}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'manage' 
              ? 'border-[#7C3AED] text-white' 
              : 'border-transparent text-[#8B949E] hover:text-[#C9D1D9]'
          }`}
        >
          <ClipboardList size={16} />
          Manage Tasks
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'history' 
              ? 'border-[#7C3AED] text-white' 
              : 'border-transparent text-[#8B949E] hover:text-[#C9D1D9]'
          }`}
        >
          <History size={16} />
          Results History
        </button>
      </div>

      <div className="flex flex-col gap-6">
        {activeTab === 'manage' && (
          <div>
            <EvalTaskCharts />
            {isCreating ? (
              <div className="w-full flex justify-center">
                <EvalTaskForm 
                  onSuccess={() => setIsCreating(false)} 
                  onCancel={() => setIsCreating(false)} 
                />
              </div>
            ) : (
              <div className="bg-[#0D1117] border border-[#30363D] rounded-xl p-8 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 bg-[#161B22] rounded-full flex items-center justify-center mb-4 border border-[#30363D]">
                  <ClipboardList className="text-[#8B949E]" size={24} />
                </div>
                <h3 className="text-white font-medium mb-2">No active task creation</h3>
                <p className="text-[#8B949E] text-sm mb-6 max-w-sm">
                  Click the button above to define a new evaluation task for your models.
                </p>
                <button 
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-md text-sm font-medium transition-colors"
                >
                  <Plus size={16} /> Create Task
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="w-full">
            <EvalHistoryList />
          </div>
        )}
      </div>
    </div>
  );
}
