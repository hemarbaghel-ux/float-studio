import { v4 as uuidv4 } from 'uuid';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, Plus, BookOpen, Bot, Code, Code2, Sparkles, MessageSquare, 
  ArrowUp, LogOut, Settings, Sun, Moon, Plug, FolderGit2, FolderCode, Bug, 
  ChevronRight, ChevronLeft, PanelLeftClose, 
  PanelLeftOpen, Trash2, Loader2, Check, Zap, ChevronDown, X,
  Layers, Workflow, MessageSquarePlus, Clock, ArrowRight
} from 'lucide-react';
import { useIDEStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import { useAIStore } from '../../store/aiStore';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { FloatLogo, FloatWordmark } from '../../components/FloatLogo';
import { AccountMenu } from '../../components/AccountMenu';
import { SettingsModal } from '../settings/SettingsModal';
import { IntegrationsPage } from '../integrations/IntegrationsPage';
import { INITIAL_MODELS, INITIAL_AGENTS } from '../ai/registry';
import { ModelSelector } from '../ai/ModelSelector';

interface ProjectItem {
  id: string;
  name: string;
  files?: string;
  createdAt?: any;
  updatedAt?: any;
}

export function Dashboard({ initialTab = 'new-chat' }: { initialTab?: string }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Chats list & search
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const { setProject, settings, toggleTheme } = useIDEStore();
  const { user, logout } = useAuthStore();
  const { 
    selectedModel, setSelectedModel, 
    selectedAgent, setSelectedAgent,
    models, setModels,
    agents, setAgents
  } = useAIStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (models.length === 0) setModels(INITIAL_MODELS);
    if (agents.length === 0) setAgents(INITIAL_AGENTS);
  }, [models, agents, setModels, setAgents]);

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
      // In-memory sort by updatedAt descending
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
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 72), 240)}px`;
    }
  }, [prompt]);

  const handleResumeProject = (project: ProjectItem) => {
    let files = [];
    try {
      files = project.files ? JSON.parse(project.files) : [];
    } catch {
      files = [];
    }
    setProject(project.name || 'Untitled Project', files, project.id);
    window.history.pushState({}, '', '/chat/' + project.id);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'projects', projectId));
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (projectToDelete === projectId) setProjectToDelete(null);
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  };

  const handleStart = async (customPrompt?: string) => {
    const textToSubmit = (customPrompt !== undefined ? customPrompt : prompt).trim();
    if (!textToSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const newProjectId = uuidv4();
      const title = textToSubmit.length > 36 ? textToSubmit.slice(0, 36) + '...' : textToSubmit;
      
      useIDEStore.getState().setInitialPrompt(textToSubmit);
      setProject(
        title || 'New Workspace',
        [
          {
            id: uuidv4(),
            name: 'main.py',
            type: 'file',
            content: `# ${title}\n\ndef main():\n    print("Welcome to FLOAT AI workspace.")\n\nif __name__ == "__main__":\n    main()\n`
          },
          {
            id: uuidv4(),
            name: 'README.md',
            type: 'file',
            content: `# ${title}\n\nTask: ${textToSubmit}\n`
          }
        ],
        newProjectId
      );

      const store = useIDEStore.getState();
      await store.saveProject();
      window.history.pushState({}, '', '/chat/' + store.projectId);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (err: any) {
      console.error('Failed to start chat session:', err);
      setSubmitError(err.message || 'Could not start new chat session. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStart();
    }
  };

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-50 dark:bg-[#0A0A0A] text-slate-900 dark:text-[#E6EDF3] font-sans overflow-hidden transition-colors selection:bg-slate-300 dark:selection:bg-white/20">
      
      {/* LEFT SIDEBAR */}
      <aside 
        aria-label="Navigation Sidebar"
        className={`${
          sidebarCollapsed ? 'w-16' : 'w-64'
        } bg-white dark:bg-[#0A0A0A] border-r border-slate-200 dark:border-[#2A2A2A] flex flex-col shrink-0 transition-all duration-200 z-30 select-none`}
      >
        {/* Sidebar Header */}
        <div className="h-14 flex items-center px-3 justify-between border-b border-slate-200 dark:border-[#2A2A2A] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <a 
              href="/"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('new-chat');
                setPrompt('');
                window.history.pushState({}, '', '/');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="flex items-center gap-2.5 hover:opacity-85 transition-opacity"
              title="FLOAT Home"
            >
              <FloatLogo className="w-5 h-5 shrink-0" />
              {!sidebarCollapsed && (
                <FloatWordmark className="h-3.5 text-slate-900 dark:text-white shrink-0" />
              )}
            </a>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="text-slate-400 hover:text-slate-700 dark:text-[#A0A0A0] dark:hover:text-white p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#1C1C1C] transition-colors cursor-pointer"
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
        </div>

        {/* Primary Navigation */}
        <div className="p-2 flex flex-col gap-1">
          <SidebarNavButton
            icon={MessageSquarePlus}
            label="New Chat"
            collapsed={sidebarCollapsed}
            isActive={activeTab === 'new-chat'}
            shortcut="⌘N"
            onClick={() => {
              setActiveTab('new-chat');
              setPrompt('');
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
              if (textareaRef.current) textareaRef.current.focus();
            }}
          />

          <SidebarNavButton
            icon={FolderCode}
            label="Codebase"
            collapsed={sidebarCollapsed}
            isActive={activeTab === 'codebase' || activeTab === 'projects'}
            shortcut="⌘B"
            onClick={() => {
              setActiveTab('codebase');
              window.history.pushState({}, '', '/codebase');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
          />

          <SidebarNavButton
            icon={Workflow}
            label="Automations"
            collapsed={sidebarCollapsed}
            isActive={activeTab === 'automations'}
            onClick={() => {
              setActiveTab('automations');
              window.history.pushState({}, '', '/automations');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
          />

          <SidebarNavButton
            icon={Plug}
            label="Integrations"
            collapsed={sidebarCollapsed}
            isActive={activeTab === 'integrations'}
            onClick={() => {
              setActiveTab('integrations');
              window.history.pushState({}, '', '/integrations');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
          />
        </div>

        {/* Flexible spacer between navigation and footer */}
        <div className="flex-1" />

        {/* Sidebar Footer Account & Actions */}
        <div className="p-2 border-t border-slate-200 dark:border-[#2A2A2A] flex flex-col gap-1.5 shrink-0 bg-slate-50/50 dark:bg-[#0A0A0A]">
          {/* Upgrade Banner */}
          {!sidebarCollapsed && (
            <button
              onClick={() => {
                window.history.pushState({}, '', '/pricing');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="w-full py-1.5 px-2.5 rounded-lg text-xs flex items-center justify-between transition-colors bg-slate-100 hover:bg-slate-200 dark:bg-[#141414] dark:hover:bg-[#1C1C1C] border border-slate-200 dark:border-[#2A2A2A] text-slate-800 dark:text-white font-medium cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={13} className="text-slate-600 dark:text-[#C5C5C5]" />
                <span>Upgrade to Pro</span>
              </div>
              <ChevronRight size={13} className="text-slate-400 dark:text-[#666666]" />
            </button>
          )}

          {/* User profile and account menu */}
          <div className="pt-1">
            <AccountMenu 
              direction="up" 
              align="left" 
              compact={sidebarCollapsed} 
            />
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto relative">
        {activeTab === 'integrations' ? (
          <div className="w-full h-full p-6 md:p-8 max-w-6xl mx-auto">
            <IntegrationsPage />
          </div>
        ) : activeTab === 'automations' ? (
          <div className="w-full h-full p-6 md:p-8 max-w-4xl mx-auto flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-blue-600 dark:text-blue-400 mb-1">
                <Workflow size={14} />
                <span>Automations Engine</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Developer Automations
              </h2>
              <p className="text-sm text-slate-500 dark:text-[#8B949E] mt-1">
                Configure background triggers, webhook listeners, automated code reviews, and CI/CD validation.
              </p>
            </div>

            {/* Status notification banner */}
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
              <Sparkles size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 dark:text-amber-200 flex flex-col gap-1">
                <span className="font-semibold">Autonomous background triggers are currently in preview</span>
                <span>Connect your GitHub repository and developer integrations below to enable automated diff review upon commit.</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 rounded-xl p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                      <Code2 size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">PR Code Reviewer</h3>
                      <p className="text-xs text-slate-400 dark:text-[#8B949E]">Triggered on pull requests</p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded-full text-slate-500 dark:text-[#8B949E]">Configured</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-[#C9D1D9]">
                  Analyzes PR diffs against codebase conventions and reports potential bugs, security issues, and test coverage gaps.
                </p>
              </div>

              <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 rounded-xl p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                      <Bug size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Continuous Fix Agent</h3>
                      <p className="text-xs text-slate-400 dark:text-[#8B949E]">Triggered on build failures</p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded-full text-slate-500 dark:text-[#8B949E]">Coming Soon</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-[#C9D1D9]">
                  Automatically ingests CI stack traces, reproduces errors in sandboxed containers, and generates proposed fixes.
                </p>
              </div>
            </div>
          </div>
        ) : (activeTab === 'projects' || activeTab === 'codebase') ? (
          <div className="w-full h-full p-6 md:p-8 max-w-5xl mx-auto flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Codebase & Projects
                </h2>
                <p className="text-sm text-slate-500 dark:text-[#8B949E] mt-1">
                  Manage your codebase workspaces, saved files, and AI conversations.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    window.history.pushState({}, '', '/workspace');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                  className="px-3.5 py-2 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-800 dark:text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer"
                  title="Open full IDE workspace"
                >
                  <Code2 size={14} />
                  <span>Open IDE</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('new-chat');
                    setPrompt('');
                  }}
                  className="px-3.5 py-2 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>New Workspace</span>
                </button>
              </div>
            </div>

            {loadingProjects ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-[#8B949E]">
                <Loader2 size={20} className="animate-spin text-blue-500" />
                <span className="text-xs">Loading projects...</span>
              </div>
            ) : projects.length === 0 ? (
              <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-[#8B949E]">
                  <FolderGit2 size={24} />
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">No projects yet</h3>
                <p className="text-xs text-slate-500 dark:text-[#8B949E] max-w-sm">
                  Create your first workspace by typing a prompt in New Chat or opening the Python IDE.
                </p>
                <button
                  onClick={() => {
                    setActiveTab('new-chat');
                  }}
                  className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  Start New Chat
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleResumeProject(p)}
                    className="group bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 rounded-xl p-5 hover:border-blue-500/50 dark:hover:border-blue-500/40 hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between gap-4"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start justify-between">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                          <Code2 size={16} />
                        </div>
                        <button
                          onClick={(e) => handleDeleteProject(e, p.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-500/20 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-all"
                          title="Delete project"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-500 transition-colors line-clamp-2">
                        {p.name}
                      </h3>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-[#8B949E] pt-2 border-t border-slate-100 dark:border-white/5">
                      <span>Updated {formatTimeAgo(p.updatedAt)}</span>
                      <span className="flex items-center gap-1 text-blue-500 font-medium group-hover:translate-x-0.5 transition-transform">
                        <span>Open</span>
                        <ArrowRight size={12} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* MAIN EMPTY-CHAT / HOME WORKSPACE */
          <div className="flex-1 flex flex-col items-center justify-between px-4 sm:px-6 pt-8 sm:pt-12 pb-6 max-w-4xl w-full mx-auto min-h-full">
            {/* Top Middle Section */}
            <div className="w-full max-w-2xl flex flex-col items-center">
              {/* Cloud Agents / Engine Banner Tab */}
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="w-full py-2.5 px-4 bg-white/70 dark:bg-[#141414] border border-b-0 border-slate-200 dark:border-white/10 rounded-t-2xl text-xs text-slate-600 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Cloud Agents require a Start account</span>
                <ArrowRight size={13} />
              </button>

              {/* Premium Chat Composer */}
              <div className="w-full bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 rounded-b-2xl rounded-t-none shadow-xl shadow-black/5 dark:shadow-2xl dark:shadow-black/50 focus-within:border-slate-400 dark:focus-within:border-white/30 transition-all flex flex-col">
                {/* Textarea Input */}
                <div className="p-3.5 relative flex flex-col">
                  <textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSubmitting}
                    placeholder="Ask FLOAT to build, fix bugs, explore..."
                    rows={2}
                    className="w-full bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#6E7681] text-sm sm:text-base focus:outline-none resize-none leading-relaxed min-h-[64px] max-h-[220px]"
                  />

                  {/* Error Banner if any */}
                  {submitError && (
                    <div className="mt-2 p-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between">
                      <span>{submitError}</span>
                      <button onClick={() => setSubmitError(null)} className="hover:opacity-75">
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  {/* Bottom Bar: Action buttons on left (+ and ModelSelector), Send on right */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-white/5">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (textareaRef.current) {
                            textareaRef.current.focus();
                          }
                        }}
                        title="Attach context or files"
                        className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 flex items-center justify-center text-slate-500 dark:text-[#8B949E] hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                      >
                        <Plus size={14} />
                      </button>

                      <ModelSelector 
                        activeModelId={selectedModel} 
                        onModelChange={setSelectedModel} 
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
              </div>
            </div>

            {/* Desktop App Card at Bottom Center */}
            <div className="mt-auto pt-8 pb-2 flex justify-center w-full">
              <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 shadow-xs text-left max-w-md">
                <div className="w-9 h-9 rounded-xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center shrink-0">
                  <FloatLogo className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">Download the Desktop App</div>
                  <div className="text-[11px] text-slate-500 dark:text-[#8B949E]">Open your code and keep building locally.</div>
                </div>
              </div>
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

function SidebarNavButton({
  icon: Icon,
  label,
  badge,
  shortcut,
  isActive,
  collapsed,
  onClick
}: {
  icon: any;
  label: string;
  badge?: string;
  shortcut?: string;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`w-full flex items-center ${
        collapsed ? 'justify-center px-0' : 'justify-between px-2.5'
      } py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
        isActive
          ? 'bg-slate-200/80 text-slate-900 dark:bg-[#242424] dark:text-[#FFFFFF] font-semibold'
          : 'text-slate-600 dark:text-[#A0A0A0] hover:bg-slate-100 dark:hover:bg-[#1C1C1C] hover:text-slate-900 dark:hover:text-[#FFFFFF]'
      }`}
    >
      <div className="flex items-center gap-2.5 truncate">
        <Icon size={16} className={isActive ? 'text-slate-900 dark:text-[#FFFFFF]' : 'text-slate-400 dark:text-[#A0A0A0]'} />
        {!collapsed && <span className="truncate">{label}</span>}
      </div>

      {!collapsed && (
        <div className="flex items-center gap-1 shrink-0">
          {badge && (
            <span className="text-[10px] bg-slate-100 dark:bg-[#1C1C1C] px-1.5 py-0.5 rounded text-slate-500 dark:text-[#A0A0A0] border border-slate-200 dark:border-[#2A2A2A]">
              {badge}
            </span>
          )}
          {shortcut && (
            <kbd className="hidden group-hover:inline-block text-[10px] font-mono text-slate-400 dark:text-[#666666]">
              {shortcut}
            </kbd>
          )}
        </div>
      )}
    </button>
  );
}

