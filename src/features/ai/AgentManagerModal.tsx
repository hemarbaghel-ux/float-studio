import React, { useState } from 'react';
import { useAIStore } from '../../store/aiStore';
import { useAuthStore } from '../../store/authStore';
import { agentAssignmentService } from '../../services/agentAssignmentService';
import { X, Bot, Plus, Trash, Edit2, Check, Search, Save, Shield } from 'lucide-react';
import { Agent } from '../../types/ai';
import { AgentMode } from '../../types/index';

export function AgentManagerModal({ onClose }: { onClose: () => void }) {
  const { agents, setAgents, models } = useAIStore();
  const { user } = useAuthStore();
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (editingAgent) {
      setSaving(true);
      try {
        setAgents(agents.map(a => a.id === editingAgent.id ? editingAgent : a));
        
        // Persist to Firebase if authenticated
        if (user) {
          await agentAssignmentService.saveAssignment(
            editingAgent.id,
            editingAgent.defaultModel,
            editingAgent.fallbackModel || ''
          );
        }
        setEditingAgent(null);
      } catch (err) {
        console.error('Failed to persist agent model assignment:', err);
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0D1117] border border-[#2A2A2A] w-full max-w-4xl h-[80vh] rounded-xl shadow-2xl flex overflow-hidden">
        
        {/* Left Side: Agent List */}
        <div className="w-1/3 border-r border-[#2A2A2A] bg-[#010409] flex flex-col">
          <div className="p-4 border-b border-[#2A2A2A] flex items-center justify-between">
            <h2 className="text-white font-medium flex items-center gap-2">
              <Bot size={16} /> Agent Manager
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
            {agents.map(agent => (
              <div 
                key={agent.id}
                onClick={() => setEditingAgent(agent)}
                className={`p-3 rounded-lg mb-2 cursor-pointer transition-colors border ${editingAgent?.id === agent.id ? 'bg-[#161B22] border-white/30' : 'bg-transparent border-transparent hover:bg-[#161B22]/50'}`}
              >
                <div className="font-medium text-sm text-[#C9D1D9]">{agent.name}</div>
                <div className="text-xs text-[#8B949E] mt-1 line-clamp-1">{agent.description}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Agent Editor */}
        <div className="w-2/3 flex flex-col bg-[#0D1117] relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-[#8B949E] hover:text-white rounded-md transition-colors"
          >
            <X size={16} />
          </button>
          
          {editingAgent ? (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-[#2A2A2A]">
                <h3 className="text-lg font-medium text-white mb-1">Edit Agent</h3>
                <p className="text-xs text-[#8B949E]">Configure agent behavior and model routing.</p>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                <div>
                  <label className="block text-xs font-medium text-[#C9D1D9] mb-2">Agent Name</label>
                  <input 
                    type="text" 
                    value={editingAgent.name}
                    onChange={e => setEditingAgent({...editingAgent, name: e.target.value})}
                    className="w-full bg-[#010409] border border-[#2A2A2A] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-[#C9D1D9] mb-2">Description</label>
                  <input 
                    type="text" 
                    value={editingAgent.description}
                    onChange={e => setEditingAgent({...editingAgent, description: e.target.value})}
                    className="w-full bg-[#010409] border border-[#2A2A2A] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-[#C9D1D9] mb-2">Mode</label>
                  <select 
                    value={editingAgent.mode}
                    onChange={e => setEditingAgent({...editingAgent, mode: e.target.value as AgentMode})}
                    className="w-full bg-[#010409] border border-[#2A2A2A] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  >
                    <option value="ask">Ask (Chat)</option>
                    <option value="edit">Edit (Code changes)</option>
                    <option value="agent">Agent (Autonomous)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#C9D1D9] mb-2">Primary Execution Model</label>
                  <select 
                    value={editingAgent.defaultModel}
                    onChange={e => setEditingAgent({...editingAgent, defaultModel: e.target.value})}
                    className="w-full bg-[#010409] border border-[#2A2A2A] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  >
                    {models.map(m => (
                      <option key={m.id} value={m.id}>{m.displayName} ({m.providerId})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#C9D1D9] mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Shield size={12} className="text-slate-400" />
                      Failover / Fallback Model
                    </span>
                    <span className="text-[10px] text-[#8B949E]">Used on timeout/rate-limits</span>
                  </label>
                  <select 
                    value={editingAgent.fallbackModel || ''}
                    onChange={e => setEditingAgent({...editingAgent, fallbackModel: e.target.value})}
                    className="w-full bg-[#010409] border border-[#2A2A2A] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                  >
                    <option value="">None (Fail on Error)</option>
                    {models.map(m => (
                      <option key={m.id} value={m.id}>{m.displayName} ({m.providerId})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#C9D1D9] mb-2">System Instructions</label>

                  <textarea 
                    value={editingAgent.systemInstructions}
                    onChange={e => setEditingAgent({...editingAgent, systemInstructions: e.target.value})}
                    className="w-full bg-[#010409] border border-[#2A2A2A] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40 h-32 resize-none"
                  />
                </div>
              </div>
              
              <div className="p-4 border-t border-[#2A2A2A] flex justify-end gap-3">
                <button 
                  onClick={() => setEditingAgent(null)}
                  className="px-4 py-2 text-sm text-[#C9D1D9] hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-slate-900 text-white dark:bg-white dark:text-black hover:opacity-90 text-sm font-medium rounded-md transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[#8B949E] text-sm">
              Select an agent to edit
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
