import React from 'react';
import { Files, Search, Settings, MessageSquare, Terminal, Bot, BarChart2, ShieldAlert, Cpu, Sun, Moon, CheckCircle2 } from 'lucide-react';
import { useIDEStore } from '../../store';
import { cn } from '../../lib/utils';
import { FloatLogo } from '../../components/FloatLogo';

export function ActivityBar() {
  const { 
    activeWorkspace, setActiveWorkspace,
    leftSidebarOpen, toggleLeftSidebar,
    activeSidebarView, setActiveSidebarView,
    rightSidebarOpen, toggleRightSidebar,
    bottomPanelOpen, toggleBottomPanel,
    bottomPanelTab, setBottomPanelTab,
    settings, updateSettings
  } = useIDEStore();

  const toggleTheme = () => {
    updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };

  return (
    <div className="w-12 h-full bg-slate-50 dark:bg-[#0A0A0A] border-r border-slate-200 dark:border-[#2A2A2A] flex flex-col items-center py-2.5 select-none flex-shrink-0">
      <div className="mb-3 pb-2 border-b border-slate-200 dark:border-[#2A2A2A] flex items-center justify-center w-full">
        <FloatLogo className="w-6 h-6 hover:opacity-80 transition-opacity cursor-pointer" />
      </div>
      <div className="flex-1 flex flex-col gap-4">
        <ActivityIcon 
          icon={Files} 
          isActive={leftSidebarOpen && activeSidebarView === 'explorer'} 
          onClick={() => {
            if (activeWorkspace !== 'code') setActiveWorkspace('code');
            if (!leftSidebarOpen) toggleLeftSidebar();
            else if (activeSidebarView === 'explorer') toggleLeftSidebar();
            setActiveSidebarView('explorer');
          }} 
          title="Explorer" 
        />
        <ActivityIcon 
          icon={Search} 
          isActive={leftSidebarOpen && activeSidebarView === 'search'} 
          onClick={() => {
            if (!leftSidebarOpen) toggleLeftSidebar();
            else if (activeSidebarView === 'search') toggleLeftSidebar();
            setActiveSidebarView('search');
          }} 
          title="Search" 
        />
      </div>
      
      <div className="flex flex-col gap-4">
        <ActivityIcon 
          icon={CheckCircle2} 
          isActive={bottomPanelOpen && bottomPanelTab === 'validation'} 
          onClick={() => {
            if (!bottomPanelOpen) toggleBottomPanel();
            setBottomPanelTab('validation');
          }} 
          title="Testing & Validation" 
        />
        <ActivityIcon 
          icon={Terminal} 
          isActive={bottomPanelOpen && bottomPanelTab === 'terminal'} 
          onClick={() => {
            if (!bottomPanelOpen) toggleBottomPanel();
            setBottomPanelTab('terminal');
          }} 
          title="Terminal" 
        />
        <ActivityIcon 
          icon={MessageSquare} 
          isActive={rightSidebarOpen} 
          onClick={toggleRightSidebar} 
          title="AI Assistant" 
        />
        <ActivityIcon 
           icon={Cpu} 
           isActive={activeWorkspace === 'agents'} 
           onClick={() => setActiveWorkspace(activeWorkspace === 'agents' ? 'code' : 'agents')} 
           title="Agent Command Center" 
         />
        <ActivityIcon 
           icon={BarChart2} 
           isActive={activeWorkspace === 'evals'} 
           onClick={() => setActiveWorkspace(activeWorkspace === 'evals' ? 'code' : 'evals')} 
           title="Evals" 
         />
        <ActivityIcon 
           icon={Bot} 
          isActive={false} 
          onClick={() => document.dispatchEvent(new Event('open-agent-manager'))} 
          title="Agent Manager" 
        />
        <ActivityIcon 
          id="main-nav-theme-toggle"
          icon={settings.theme === 'dark' ? Sun : Moon} 
          isActive={false} 
          onClick={toggleTheme} 
          title={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} mode`} 
        />
        <ActivityIcon 
          id="main-nav-settings"
          icon={Settings} 
          isActive={false} 
          onClick={() => document.dispatchEvent(new Event('open-settings'))} 
          title="Settings" 
        />
      </div>
    </div>
  );
}

function ActivityIcon({ icon: Icon, isActive, onClick, title, id }: { icon: any, isActive: boolean, onClick: () => void, title: string, id?: string }) {
  return (
    <button
      id={id}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "p-2.5 rounded-xl transition-colors cursor-pointer group flex items-center justify-center",
        isActive 
          ? "text-slate-900 dark:text-white bg-slate-200/80 dark:bg-[#242424] opacity-100" 
          : "text-slate-500 dark:text-[#A0A0A0] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1C1C1C]"
      )}
    >
      <Icon size={22} strokeWidth={isActive ? 2 : 1.5} className={cn("transition-transform group-active:scale-95", isActive && "opacity-100")} />
    </button>
  );
}
