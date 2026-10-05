import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useIDEStore } from '../../store';
import { ActivityBar } from './ActivityBar';
import { Header } from './Header';
import { FileExplorer } from '../explorer/FileExplorer';
import { EditorArea } from '../editor/EditorArea';
import { AIPanel } from '../ai/AIPanel';
import { BottomPanel } from '../terminal/BottomPanel';
import { SearchPanel } from '../search/SearchPanel';
import { GitPanel } from '../git/GitPanel';
import { CommandPalette } from '../command-palette/CommandPalette';
import { SettingsModal } from '../settings/SettingsModal';

import { AgentManagerModal } from '../ai/AgentManagerModal';
import { EvalsWorkspace } from '../evals/EvalsWorkspace';
import { AgentsWorkspace } from '../agents/AgentsWorkspace';

export function IDEWorkspace() {
  const { saveProject, files, 
    activeWorkspace,
    leftSidebarOpen, 
    activeSidebarView,
    rightSidebarOpen, 
    bottomPanelOpen,
    settings 
  } = useIDEStore();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentManagerOpen, setAgentManagerOpen] = useState(false);
  const { setProject } = useIDEStore();

  useEffect(() => {
    const handleLocationOrLoad = () => {
      const path = window.location.pathname;
      if (path.startsWith('/chat/')) {
        const id = path.replace('/chat/', '').trim();
        if (id && useIDEStore.getState().projectId !== id) {
          getDoc(doc(db, 'projects', id))
            .then(snap => {
              if (snap.exists()) {
                const data = snap.data();
                let parsedFiles = [];
                try {
                  parsedFiles = typeof data.files === 'string' ? JSON.parse(data.files) : (data.files || []);
                } catch {
                  parsedFiles = [];
                }
                setProject(data.name || 'Untitled Project', parsedFiles, id);
              }
            })
            .catch(err => {
              console.error('Failed to load project from cloud:', err);
            });
        }
      }
    };

    handleLocationOrLoad();
    window.addEventListener('popstate', handleLocationOrLoad);
    return () => window.removeEventListener('popstate', handleLocationOrLoad);
  }, [setProject]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  // Expose function to open settings globally for now
  useEffect(() => {
    const handleOpenSettings = () => setSettingsOpen(true);
    const handleOpenAgentManager = () => setAgentManagerOpen(true);
    document.addEventListener('open-settings', handleOpenSettings);
    document.addEventListener('open-agent-manager', handleOpenAgentManager);
    
    // Auto save logic
    const saveTimeout = setTimeout(() => {
      saveProject();
    }, 2000);
    
    return () => {
      document.removeEventListener('open-settings', handleOpenSettings);
      document.removeEventListener('open-agent-manager', handleOpenAgentManager);
      clearTimeout(saveTimeout);
    };
  }, [files]); // Re-run effect when files change to debounce save

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-100 dark:bg-[#000000] text-slate-800 dark:text-[#C9D1D9] flex flex-col font-sans selection:bg-slate-300 dark:selection:bg-white/20">
      <Header />
      
      <div className="flex-1 flex min-w-0 overflow-hidden">
        <ActivityBar />
        
        <div className="flex-1 flex min-w-0">
        
        {leftSidebarOpen && (
          <div className="w-64 bg-white dark:bg-[#0A0A0A] border-r border-slate-200 dark:border-[#2A2A2A] shrink-0 flex flex-col">
            {activeSidebarView === 'explorer' ? <FileExplorer /> : activeSidebarView === 'search' ? <SearchPanel /> : <GitPanel />}
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0 relative">
            {activeWorkspace === 'code' && <EditorArea />}
            {activeWorkspace === 'evals' && <EvalsWorkspace />}
            {activeWorkspace === 'agents' && <AgentsWorkspace />}
          </div>
          
          {bottomPanelOpen && (
            <div className="h-48 border-t border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#080808] shrink-0">
              <BottomPanel />
            </div>
          )}
        </div>

        {rightSidebarOpen && (
          <div className="w-80 border-l border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#0A0A0A] shrink-0 flex flex-col">
            <AIPanel />
          </div>
        )}
        
        </div>
      </div>

      <CommandPalette />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {agentManagerOpen && <AgentManagerModal onClose={() => setAgentManagerOpen(false)} />}
    </div>
  );
}
