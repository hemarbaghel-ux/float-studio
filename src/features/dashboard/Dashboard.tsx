import { v4 as uuidv4 } from 'uuid';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Plus, Code2, Sparkles,
  ArrowUp, PanelLeftClose, PanelLeftOpen,
  Loader2, Check, ChevronDown, X,
  ArrowRight, Filter, SlidersHorizontal, MoreHorizontal,
  BarChart3, GitBranch, Terminal, Bug, FileSpreadsheet,
} from 'lucide-react';
import { useIDEStore } from '../../store';
import { DataAnalystWorkspace } from '../analyst/DataAnalystWorkspace';

const STARTER_PROMPTS = [
  { label: 'Build a React counter component', icon: Sparkles },
  { label: 'Create a REST API client with retries', icon: Terminal },
  { label: 'Debug memory leak in useEffect', icon: Bug },
  { label: 'Write TypeScript schema validator', icon: Code2 },
];
import { useAuthStore } from '../../store/authStore';
import { useAIStore } from '../../store/aiStore';
import { collection, query, where, getDocs, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { deleteProjectContent, loadProjectFileTree } from '../../services/projectCloudRepository';
import { FloatLogo } from '../../components/FloatLogo';
import { SettingsModal } from '../settings/SettingsModal';
import { IntegrationsPage } from '../integrations/IntegrationsPage';
import { UsageAnalyticsView } from './UsageAnalyticsView';
import { UsageSavingsCard } from './UsageSavingsCard';
import { GitSyncDashboard } from './GitSyncDashboard';
import { INITIAL_MODELS } from '../ai/registry';
import { DASHBOARD_MODELS } from './dashboardModels';
import { ModelSelector } from '../ai/ModelSelector';
import { ChatList } from '../float/ChatList';
import { ChatThread } from '../float/ChatThread';
import { AttachMenu, AttachmentChips, SlashMenu, SuggestionChips, slashMatches, type Attachments } from '../float/ComposerExtras';
import { exportZip, importFileList, importZip, mapToTree } from '../float/projectIO';
import { AccountMenu } from '../../components/AccountMenu';

interface ProjectItem {
  id: string;
  name: string;
  files?: string;
  createdAt?: any;
  updatedAt?: any;
}

const resolveTab = (pathname: string, defaultTab: string = 'new-chat'): string => {
  if (pathname === '/dashboard/analyst' || pathname === '/analyst' || pathname === '/data-analyst') return 'analyst';
  if (pathname === '/dashboard/usage' || pathname === '/usage' || pathname === '/analytics') return 'usage';
  if (pathname === '/git-sync' || pathname === '/dashboard/git-sync') return 'git-sync';
  if (pathname === '/integrations' || pathname === '/dashboard/integrations') return 'integrations';
  if (pathname === '/projects' || pathname === '/codebase' || pathname === '/dashboard/projects' || pathname === '/dashboard/codebase') return 'codebase';
  if (pathname === '/' || pathname === '/dashboard' || pathname === '/new-chat' || pathname === '/chat' || pathname === '/dashboard/new-chat') return 'new-chat';
  return defaultTab;
};

export function Dashboard({ initialTab = 'new-chat' }: { initialTab?: string }) {
  const [activeTab, setActiveTab] = useState(() => resolveTab(window.location.pathname, initialTab));
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/chat\/([^/]+)/);
    return match ? match[1] : null;
  });
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedDashboardModelId, setSelectedDashboardModelId] = useState<string>(() => useAIStore.getState().selectedModel || 'gpt-6-astra');
  const [attachments, setAttachments] = useState<Attachments>({});

  // Chats list & search
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const { setProject, settings, toggleTheme } = useIDEStore();
  const { user, logout } = useAuthStore();
  const {
    selectedModel, setSelectedModel,
    models, setModels,
  } = useAIStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const projectLoadSequenceRef = useRef(0);

  const handleOpenNewChat = () => {
    setActiveChatId(null);
    setActiveTab('new-chat');
    setPrompt('');
    if (window.location.pathname !== '/dashboard') {
      window.history.pushState({}, '', '/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 50);
  };

  useEffect(() => {
    const p = window.location.pathname;
    setActiveTab(resolveTab(p, initialTab));
    const match = p.match(/^\/chat\/([^/]+)/);
    setActiveChatId(match ? match[1] : null);

    const handlePopState = () => {
      const current = window.location.pathname;
      setActiveTab(resolveTab(current, initialTab));
      const chatMatch = current.match(/^\/chat\/([^/]+)/);
      setActiveChatId(chatMatch ? chatMatch[1] : null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [initialTab]);

  // Global shortcut: ⌘N / Ctrl+N opens New Chat
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'n' || e.key === 'N') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleOpenNewChat();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);


  useEffect(() => {
    if (models.length === 0) setModels(INITIAL_MODELS);
  }, [models, setModels]);

  // Sync selected model to AI store
  useEffect(() => {
    setSelectedModel(selectedDashboardModelId);
  }, [selectedDashboardModelId, setSelectedModel]);

  // Load user's conversations / projects
  const fetchProjects = async () => {
    if (!user) {
      setLoadingProjects(false);
      return;
    }
    try {
      const q = query(collection(db, 'projects'), where('ownerId', '==', user.uid));
      const snapshot = await getDocs(q);
      const data: ProjectItem[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectItem));
      data.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis?.() || (a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0);
        const timeB = b.updatedAt?.toMillis?.() || (b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0);
        return timeB - timeA;
      });
      setProjects(data);
    } catch (err) {
      console.error('Failed to load chats/projects:', err);
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [user]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 60), 220)}px`;
    }
  }, [prompt]);

  const handleResumeProject = async (project: ProjectItem) => {
    const requestSequence = ++projectLoadSequenceRef.current;
    try {
      const snapshot = await getDoc(doc(db, 'projects', project.id));
      if (requestSequence !== projectLoadSequenceRef.current) return;
      if (!snapshot.exists()) throw new Error('This workspace no longer exists in cloud storage.');
      const files = await loadProjectFileTree(db, project.id, snapshot.data());
      if (requestSequence !== projectLoadSequenceRef.current) return;
      setProject(project.name || 'Untitled Project', files, project.id, 'cloud');
      setActiveChatId(project.id);
      setActiveTab('new-chat');
      setPrompt('');
      window.history.pushState({}, '', '/chat/' + project.id);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (error: any) {
      if (requestSequence === projectLoadSequenceRef.current) {
        setSubmitError(error.message || 'Could not load this workspace from cloud storage.');
      }
    }
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteProjectContent(db, projectId);
      await deleteDoc(doc(db, 'projects', projectId));
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (projectToDelete === projectId) setProjectToDelete(null);
      if (activeChatId === projectId) {
        handleOpenNewChat();
      }
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  };

  const handleStart = async (customPrompt?: string) => {
    const textToSubmit = (customPrompt !== undefined ? customPrompt : prompt).trim();
    if (!textToSubmit || isSubmitting || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const newProjectId = uuidv4();
      const title = textToSubmit.length > 36 ? textToSubmit.slice(0, 36) + '...' : textToSubmit;

      useIDEStore.getState().setInitialPrompt(textToSubmit);
      const starterFiles = {
        'main.py': `# ${title}\n\ndef main():\n    print("Welcome to FLOAT AI workspace.")\n\nif __name__ == "__main__":\n    main()\n`,
        'README.md': `# ${title}\n\nTask: ${textToSubmit}\n`,
        ...attachments,
      };
      setProject(
        title || 'New Workspace',
        mapToTree(starterFiles),
        newProjectId
      );
      setAttachments({});

      const store = useIDEStore.getState();
      await store.saveProject();
      fetchProjects();
      setPrompt('');
      setActiveChatId(store.projectId);
      window.history.pushState({}, '', '/chat/' + store.projectId);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (err: any) {
      console.error('Failed to start chat session:', err);
      setSubmitError(err.message || 'Could not start new chat session. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStart();
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#F8F8F7] dark:bg-[#0A0A0A] text-slate-900 dark:text-[#E6EDF3] font-sans overflow-hidden select-none transition-colors">

      {/* ======================================================== */}
      {/* LEFT SIDEBAR                                             */}
      {/* ======================================================== */}
      <aside
        aria-label="Navigation Sidebar"
        className={`${
          sidebarCollapsed ? 'w-16' : 'w-64'
        } bg-white dark:bg-[#111111] border-r border-[#EBEBEA] dark:border-[#222222] flex flex-col shrink-0 transition-all duration-200 z-30 select-none`}
      >
        {/* Sidebar Header (Logo on left, Toggle and Search on right) */}
        <div className="h-12 flex items-center px-4 justify-between shrink-0">
          <div className="flex items-center gap-2">
            <a
              href="/dashboard"
              onClick={(e) => {
                e.preventDefault();
                handleOpenNewChat();
              }}
              className="flex items-center hover:opacity-85 transition-opacity"
              title="FLOAT Home"
            >
              <FloatLogo className="w-5 h-5 shrink-0 text-black dark:text-white" />
            </a>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400 dark:text-[#8B949E]">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hover:text-slate-700 dark:hover:text-white p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>

            {!sidebarCollapsed && (
              <button
                onClick={() => {
                  if (textareaRef.current) textareaRef.current.focus();
                }}
                aria-label="Search"
                title="Search"
                className="hover:text-slate-700 dark:hover:text-white p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Search size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Primary Navigation */}
        <div className="px-2 py-1 flex flex-col gap-0.5">
          {/* New Chat Button */}
          <button
            onClick={handleOpenNewChat}
            title="New Chat"
            className={`w-full flex items-center ${
              sidebarCollapsed ? 'justify-center px-0' : 'gap-2.5 px-3'
            } py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'new-chat' && !activeChatId
                ? 'bg-[#EAEAEA] dark:bg-white/10 text-slate-900 dark:text-white font-semibold'
                : 'text-slate-600 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Filter size={15} className="text-slate-700 dark:text-[#C9D1D9] shrink-0" />
            {!sidebarCollapsed && <span>New Chat</span>}
          </button>

          {/* Codebase Button with Early Beta Badge */}
          <button
            onClick={() => {
              setActiveChatId(null);
              setActiveTab('codebase');
              window.history.pushState({}, '', '/projects');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            title="Codebase"
            className={`w-full flex items-center ${
              sidebarCollapsed ? 'justify-center px-0' : 'justify-between px-3'
            } py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'codebase' || activeTab === 'projects'
                ? 'bg-[#EAEAEA] dark:bg-white/10 text-slate-900 dark:text-white font-semibold'
                : 'text-slate-600 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Code2 size={15} className="text-slate-600 dark:text-[#8B949E] shrink-0" />
              {!sidebarCollapsed && <span>Codebase</span>}
            </div>
            {!sidebarCollapsed && (
              <span className="text-[10px] text-slate-500 dark:text-[#8B949E] bg-[#EAEAEA] dark:bg-white/10 px-1.5 py-0.5 rounded font-normal leading-none">
                Early Beta
              </span>
            )}
          </button>

          {/* Usage Analytics Button */}
          <button
            onClick={() => {
              setActiveTab('usage');
              window.history.pushState({}, '', '/dashboard/usage');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            title="Usage Analytics"
            className={`w-full flex items-center ${
              sidebarCollapsed ? 'justify-center px-0' : 'gap-2.5 px-3'
            } py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'usage' || activeTab === 'analytics'
                ? 'bg-[#EAEAEA] dark:bg-white/10 text-slate-900 dark:text-white font-semibold'
                : 'text-slate-600 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BarChart3 size={15} className="text-slate-600 dark:text-[#8B949E] shrink-0" />
            {!sidebarCollapsed && <span>Usage Analytics</span>}
          </button>

          {/* Git Sync Button */}
          <button
            onClick={() => {
              setActiveTab('git-sync');
              window.history.pushState({}, '', '/git-sync');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            title="Git Sync"
            className={`w-full flex items-center ${
              sidebarCollapsed ? 'justify-center px-0' : 'gap-2.5 px-3'
            } py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'git-sync' || activeTab === 'git'
                ? 'bg-[#EAEAEA] dark:bg-white/10 text-slate-900 dark:text-white font-semibold'
                : 'text-slate-600 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <GitBranch size={15} className="text-slate-600 dark:text-[#8B949E] shrink-0" />
            {!sidebarCollapsed && <span>Git Sync</span>}
          </button>

          {/* End of primary navigation buttons */}
        </div>

        {/* Chats Section */}
        {!sidebarCollapsed && (
          <div className="mt-5 px-4 flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-400 dark:text-[#8B949E] mb-2 shrink-0">
              <span className="font-normal">Chats</span>
              <button
                onClick={() => fetchProjects()}
                title="Filter chats"
                className="hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                <SlidersHorizontal size={13} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1">
              {loadingProjects ? (
                <div className="flex items-center justify-center py-6 text-xs text-slate-400 dark:text-[#6E7681]">
                  <Loader2 size={13} className="animate-spin mr-1.5" /> Loading...
                </div>
              ) : projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-xs text-slate-400 dark:text-[#6E7681] font-normal py-8 text-center">
                  No chats yet
                </div>
              ) : (
                projects.map((p) => {
                  const isSelected = activeChatId === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleResumeProject(p)}
                      className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#EAEAEA] dark:bg-white/10 text-slate-900 dark:text-white font-medium'
                          : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9]'
                      }`}
                    >
                      <span className="truncate flex-1 font-normal text-left">{p.name}</span>
                      <button
                        onClick={(e) => handleDeleteProject(e, p.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity p-0.5"
                        title="Delete chat"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Flexible spacer if collapsed */}
        {sidebarCollapsed && <div className="flex-1" />}

        {/* Sidebar Footer Account & Actions */}
        <div className="p-2.5 border-t border-[#EBEBEA] dark:border-[#222222] flex flex-col gap-2 shrink-0 bg-white dark:bg-[#111111]">
          {/* Upgrade to Start Button */}
          {!sidebarCollapsed && (
            <button
              onClick={() => {
                window.history.pushState({}, '', '/pricing');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="w-full py-1.5 px-3 rounded-lg text-xs font-medium text-slate-700 dark:text-[#C9D1D9] bg-white dark:bg-[#181818] hover:bg-slate-50 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles size={13} className="text-slate-600 dark:text-[#8B949E]" />
              <span>Upgrade to Start</span>
            </button>
          )}

          {/* Interactive Account Menu triggered by user profile bar */}
          <AccountMenu direction="up" align="left" compact={sidebarCollapsed} className="w-full" />
        </div>
      </aside>

      {/* ======================================================== */}
      {/* MAIN CONTENT AREA                                        */}
      {/* ======================================================== */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto relative bg-[#F8F8F7] dark:bg-[#0A0A0A] transition-colors">
        {activeTab === 'analyst' || activeTab === 'data-analyst' ? (
          <DataAnalystWorkspace />
        ) : activeTab === 'git-sync' || activeTab === 'git' ? (
          <div className="w-full h-full p-6 md:p-8 max-w-6xl mx-auto flex flex-col gap-6">
            <GitSyncDashboard />
          </div>
        ) : activeTab === 'usage' || activeTab === 'analytics' ? (
          <div className="w-full h-full p-6 md:p-8 max-w-7xl mx-auto flex flex-col gap-6">
            <UsageAnalyticsView />
          </div>
        ) : activeTab === 'integrations' ? (
          <div className="w-full h-full p-6 md:p-8 max-w-6xl mx-auto">
            <IntegrationsPage />
          </div>
        ) : activeTab === 'codebase' || activeTab === 'projects' ? (
          <div className="w-full h-full p-6 md:p-8 max-w-5xl mx-auto flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Your Projects & Codebases
                </h2>
                <p className="text-sm text-slate-500 dark:text-[#8B949E] mt-1">
                  Manage your active workspaces and repositories.
                </p>
              </div>
              <button
                onClick={handleOpenNewChat}
                className="px-3.5 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>New Chat</span>
              </button>
            </div>

            {loadingProjects ? (
              <div className="flex items-center justify-center py-16 text-xs text-slate-400">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading projects...
              </div>
            ) : projects.length === 0 ? (
              <div className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] rounded-xl p-8 text-center flex flex-col items-center">
                <Code2 size={36} className="text-slate-300 dark:text-[#333] mb-3" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-1">No Projects Found</h3>
                <p className="text-xs text-slate-500 dark:text-[#8B949E] max-w-sm mb-4">
                  Start a new chat to have FLOAT create and maintain a project workspace for you.
                </p>
                <button
                  onClick={handleOpenNewChat}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-900 dark:text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
                >
                  Start New Chat
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleResumeProject(p)}
                    className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] hover:border-slate-400 dark:hover:border-[#444] rounded-xl p-5 shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                          {p.name}
                        </h3>
                        <button
                          onClick={(e) => handleDeleteProject(e, p.id)}
                          className="text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                          title="Delete project"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-1">
                        Active Workspace
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-white/5 text-[11px] text-slate-400">
                      <span>Click to open chat</span>
                      <ArrowRight size={13} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeChatId ? (
          <div className="flex-1 overflow-hidden flex flex-col h-full">
            <ChatThread chatId={activeChatId} />
          </div>
        ) : (
          /* ====================================================== */
          /* MAIN COMPOSER INTERFACE (Matching image.png)           */
          /* ====================================================== */
          <div className="flex-1 flex flex-col items-center justify-start px-4 pt-28 sm:pt-32 pb-8 w-full max-w-4xl mx-auto">

            {/* 2. Main Chat Composer Box */}
            <div className="w-full max-w-2xl bg-white dark:bg-[#141414] border border-slate-200/90 dark:border-[#2C2C2C] rounded-2xl shadow-sm p-4 relative flex flex-col transition-colors">
              {/* Textarea Input with FLOAT placeholder */}
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSubmitting}
                placeholder="Ask FLOAT to build, fix bugs, explore"
                rows={2}
                className="w-full bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#6E7681] text-sm focus:outline-none resize-none leading-relaxed min-h-[58px]"
              />

              {/* Error Banner if any */}
              {submitError && (
                <div className="mt-2 p-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-lg text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between">
                  <span>{submitError}</span>
                  <button onClick={() => setSubmitError(null)} className="hover:opacity-75">
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Bottom bar: project attachments, model selection, and send */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-white/5">
                    <div className="flex items-center gap-1.5">
                      <AttachMenu
                        dropDown
                        disabled={isSubmitting}
                        onAttach={(files) => setAttachments(prev => ({ ...prev, ...files }))}
                      />

                      <ModelSelector
                        activeModelId={selectedDashboardModelId}
                        onModelChange={(id) => {
                          setSelectedDashboardModelId(id);
                          setSelectedModel(id);
                        }}
                        placement="auto"
                        variant="composer"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStart()}
                      disabled={!prompt.trim() || isSubmitting}
                      aria-label="Send prompt"
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        prompt.trim() && !isSubmitting
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-black hover:opacity-90 shadow-md cursor-pointer scale-100'
                          : 'bg-slate-100 dark:bg-white/5 text-slate-300 dark:text-[#6E7681] cursor-not-allowed opacity-60'
                      }`}
                    >
                      {isSubmitting ? (
                        <Loader2 size={16} className="animate-spin text-current" />
                      ) : (
                        <ArrowUp size={16} strokeWidth={2.5} />
                      )}
                    </button>
                  </div>
              </div>

              {/* Starter Prompt Chips Bar */}
              <div className="hidden" style={{ display: 'none' }}>
                {STARTER_PROMPTS.map((item) => {
                  const isActive = prompt.trim() === item.label;
                  return (
                    <div
                      key={item.label}
                      className={`group inline-flex items-center rounded-lg border transition-all text-xs ${
                        isActive
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-black border-slate-900 dark:border-white shadow-xs'
                          : 'bg-white/80 dark:bg-[#141414] border-slate-200/90 dark:border-[#2C2C2C] text-slate-600 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-[#444]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setPrompt(item.label);
                          if (textareaRef.current) {
                            textareaRef.current.focus();
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer focus:outline-none"
                        title={`Load "${item.label}"`}
                      >
                        <item.icon size={12} className={isActive ? 'text-current' : 'text-slate-400 dark:text-[#6E7681]'} />
                        <span className="font-normal">{item.label}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStart(item.label);
                        }}
                        disabled={isSubmitting}
                        className={`px-1.5 py-1.5 border-l opacity-60 hover:opacity-100 transition-opacity cursor-pointer ${
                          isActive
                            ? 'border-white/20 dark:border-black/20 text-current'
                            : 'border-slate-200 dark:border-[#2C2C2C] text-slate-400 dark:text-[#6E7681] hover:text-slate-900 dark:hover:text-white'
                        }`}
                        title={`Run "${item.label}" immediately`}
                        aria-label={`Run "${item.label}" immediately`}
                      >
                        <ArrowRight size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* AI Token Usage & Cost Savings Overview */}
              <div className="hidden" style={{ display: 'none' }}>
                <UsageSavingsCard
                  onViewFullAnalytics={() => {
                    setActiveTab('usage');
                    window.history.pushState({}, '', '/dashboard/usage');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                />
              </div>
            </div>
        )}
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
