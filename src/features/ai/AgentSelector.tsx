import React, { useState } from 'react';
import { useAIStore } from '../../store/aiStore';
import { ChevronDown, Check, Search, Bot, Code, Map, Compass, Bug, Layout, Eye } from 'lucide-react';

export function AgentSelector({ activeAgentId, onAgentChange, onAgentManagerOpen }: { activeAgentId?: string, onAgentChange: (agentId: string) => void, onAgentManagerOpen?: () => void }) {
  const { agents } = useAIStore();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const currentAgent = agents.find(a => a.id === (activeAgentId || useAIStore.getState().selectedAgent)) || agents[0];

  const filteredAgents = agents.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Code': return <Code size={14} />;
      case 'Map': return <Map size={14} />;
      case 'Compass': return <Compass size={14} />;
      case 'Bug': return <Bug size={14} />;
      case 'Layout': return <Layout size={14} />;
      case 'Eye': return <Eye size={14} />;
      case 'Bot':
      default: return <Bot size={14} />;
    }
  };

  if (!currentAgent) return null;

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] rounded-md text-xs text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-[#1C1C1C] transition-colors w-full cursor-pointer"
      >
        <span className="text-slate-400 dark:text-[#A0A0A0]">{getIcon(currentAgent.icon)}</span>
        <span className="flex-1 text-left truncate">{currentAgent.name}</span>
        <ChevronDown size={14} className="text-slate-400 dark:text-[#A0A0A0]" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] rounded-lg shadow-2xl z-50 overflow-hidden flex flex-col max-h-[400px]">
          <div className="p-2 border-b border-slate-200 dark:border-[#2A2A2A]">
             <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#2A2A2A] rounded px-2 py-1.5">
                <Search size={14} className="text-slate-400 dark:text-[#A0A0A0]" />
                <input 
                  type="text" 
                  placeholder="Search agents..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-transparent text-slate-900 dark:text-white text-xs w-full focus:outline-none placeholder:text-slate-400 dark:placeholder:text-[#A0A0A0]"
                />
             </div>
          </div>
          
          <div className="overflow-y-auto flex-1 p-2 scrollbar-thin">
            {filteredAgents.map(agent => {
              const isComingSoon = agent.status === 'COMING_SOON';
              return (
                <div 
                  key={agent.id}
                  onClick={() => {
                    if (!isComingSoon) {
                      onAgentChange(agent.id);
                      setIsOpen(false);
                    }
                  }}
                  className={`flex flex-col gap-1 px-2 py-2 rounded-md transition-colors ${
                    isComingSoon ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-[#1C1C1C] cursor-pointer'
                  } ${currentAgent.id === agent.id ? 'bg-slate-100 dark:bg-[#1C1C1C]' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 dark:text-[#A0A0A0]">{getIcon(agent.icon)}</span>
                      <span className="text-xs text-slate-900 dark:text-white font-medium">{agent.name}</span>
                    </div>
                    {currentAgent.id === agent.id && <Check size={12} className="text-slate-900 dark:text-white" />}
                    {isComingSoon && (
                      <span className="text-[9px] bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-[#A0A0A0] px-1.5 py-0.5 rounded font-medium">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-[#A0A0A0] pl-6">
                    {agent.description}
                  </div>
                </div>
              );
            })}
          </div>

          {onAgentManagerOpen && (
            <div className="p-2 border-t border-slate-200 dark:border-[#2A2A2A] bg-slate-50 dark:bg-[#0A0A0A]">
              <button 
                onClick={() => {
                  setIsOpen(false);
                  onAgentManagerOpen();
                }}
                className="w-full flex items-center justify-center gap-2 px-2 py-1.5 text-xs text-slate-600 dark:text-[#A0A0A0] hover:text-slate-900 dark:hover:text-white transition-colors hover:bg-slate-100 dark:hover:bg-[#1C1C1C] rounded cursor-pointer"
              >
                Agent Manager
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
