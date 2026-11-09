import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { loadProjectFileTree } from '../../services/projectCloudRepository';
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
import { StatusBar } from './StatusBar';


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
  const { setProject } = useIDEStore();


  useEffect(() => {
    let loadSequence = 0;
    const handleLocationOrLoad = () => {
      const requestSequence = ++loadSequence;
      const path = window.location.pathname;
      let id = '';
      if (path.startsWith('/chat/')) {
        id = path.replace('/chat/', '').trim();
      } else if (path.startsWith('/workspace/')) {
        id = path.replace('/workspace/', '').trim();
      } else if (path === '/workspace' || path === '/ide') {
        id = useIDEStore.getState().projectId || '';
      }
      const explicitProjectRoute = path.startsWith('/chat/') || path.startsWith('/workspace/');
      const workspaceState = useIDEStore.getState();
      if (id && !(workspaceState.projectId === id && workspaceState.projectLoadedFromCloud) &&
          (explicitProjectRoute || workspaceState.projectId !== id)) {
        getDoc(doc(db, 'projects', id))
          .then(async snap => {
            if (requestSequence !== loadSequence) return;
            if (snap.exists()) {
              const data = snap.data();
              const parsedFiles = await loadProjectFileTree(db, id, data);
              if (requestSequence === loadSequence) setProject(data.name || 'Untitled Project', parsedFiles, id, 'cloud');
            }
          })
          .catch(err => {
            console.error('Failed to load project from cloud:', err);
          });
      }
    };

    handleLocationOrLoad();
    window.addEventListener('popstate', handleLocationOrLoad);
    return () => {
      loadSequence += 1;
      window.removeEventListener('popstate', handleLocationOrLoad);
    };
  }, [setProject]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  // Global keyboard shortcuts (Ctrl+L / Cmd+L for AI Chat panel, Ctrl+I / Cmd+I for Composer)
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if ((e.key === 'l' || e.key === 'L') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        useIDEStore.getState().toggleRightSidebar();
        // Focus the chat input
        setTimeout(() => {
          const aiInput = document.querySelector('textarea[placeholder*="Ask"]') as HTMLTextAreaElement;
          aiInput?.focus();
        }, 80);
      } else if ((e.key === 'i' || e.key === 'I') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!useIDEStore.getState().rightSidebarOpen) {
          useIDEStore.getState().toggleRightSidebar();
        }
        setTimeout(() => {
          const aiInput = document.querySelector('textarea[placeholder*="Ask"]') as HTMLTextAreaElement;
          aiInput?.focus();
        }, 80);
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, []);

  // Expose function to open settings globally for now
  useEffect(() => {
    const handleOpenSettings = () => setSettingsOpen(true);
    document.addEventListener('open-settings', handleOpenSettings);
    
    // Auto save logic
    const saveTimeout = setTimeout(() => {
      saveProject();
    }, 2000);
    
    return () => {
      document.removeEventListener('open-settings', handleOpenSettings);
      clearTimeout(saveTimeout);
    };
  }, [files]); // Re-run effect when files change to debounce save

  return (
    <div data-testid="ide-workspace" className="float-ide-workspace h-screen w-full max-w-full overflow-hidden bg-slate-100 dark:bg-[#000000] text-slate-800 dark:text-[#C9D1D9] flex flex-col font-sans selection:bg-slate-300 dark:selection:bg-white/20 relative">
      <Header />
      
      <div className="flex-1 flex min-w-0 min-h-0 overflow-hidden relative">
        <ActivityBar />
        
        <div className="flex-1 flex min-w-0 h-full overflow-hidden relative">
        
        {leftSidebarOpen && (
          <div className="w-64 h-full min-h-0 bg-white dark:bg-[#0A0A0A] border-r border-slate-200 dark:border-[#2A2A2A] shrink-0 flex flex-col relative overflow-hidden">
            {activeSidebarView === 'explorer' ? <FileExplorer /> : activeSidebarView === 'search' ? <SearchPanel /> : <GitPanel />}
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 h-full min-h-0 overflow-hidden relative">
          <div className="flex-1 min-h-0 relative h-full w-full overflow-hidden">
            {activeWorkspace === 'code' && <EditorArea />}
          </div>
          
          {bottomPanelOpen && (
            <div className="h-48 border-t border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#080808] shrink-0 relative overflow-hidden">
              <BottomPanel />
            </div>
          )}
        </div>

        {rightSidebarOpen && (
          <div className="w-80 lg:w-96 max-w-[45vw] h-full min-h-0 border-l border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#0A0A0A] shrink-0 flex flex-col relative overflow-hidden">
            <AIPanel />
          </div>
        )}
        
        </div>
      </div>

      <StatusBar />
      <CommandPalette />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
