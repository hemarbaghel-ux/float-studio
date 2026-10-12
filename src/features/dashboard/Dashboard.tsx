import React, { useState, useEffect } from 'react';
import {
  Search, Plus, Bot, Code2, Sparkles,
  PanelLeftClose, PanelLeftOpen,
  Loader2, X, ArrowRight, SlidersHorizontal,
  BarChart3, GitBranch
} from 'lucide-react';
import { useIDEStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import { useAIStore } from '../../store/aiStore';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { FloatLogo } from '../../components/FloatLogo';
import { SettingsModal } from '../settings/SettingsModal';
import { IntegrationsPage } from '../integrations/IntegrationsPage';
import { UsageAnalyticsView } from './UsageAnalyticsView';
import { INITIAL_MODELS, INITIAL_AGENTS } from '../ai/registry';
import { AgentManagerModal } from '../ai/AgentManagerModal';
import { AccountMenu } from '../../components/AccountMenu';
import { PromptComposer } from './composer/PromptComposer';
import { ChatFeed } from './composer/ChatFeed';
import { FeedMessage, ContextPill, ModelTier, AgentMode, ReasoningBlock } from './composer/types';
import { CodebaseIndexingModal } from './modals/CodebaseIndexingModal';
import { UsageAnalyticsModal } from './modals/UsageAnalyticsModal';
import { UpgradeToStartModal } from './modals/UpgradeToStartModal';

interface ProjectItem {
  id: string;
  name: string;
  files?: string;
  createdAt?: any;
  updatedAt?: any;
}

export function Dashboard({ initialTab = 'new-chat' }: { initialTab?: string }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessionState, setSessionState] = useState<'initial' | 'submitted'>('initial');
  const [feedMessages, setFeedMessages] = useState<FeedMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [composerModel, setComposerModel] = useState<ModelTier>('gpt-4o-balanced');
  const [composerAgentMode, setComposerAgentMode] = useState<AgentMode>('main');
  const [draftPrompt, setDraftPrompt] = useState('');
  const [showCodebaseModal, setShowCodebaseModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAgentManager, setShowAgentManager] = useState(false);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const { user } = useAuthStore();
  const { models, setModels, agents, setAgents } = useAIStore();

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (models.length === 0) setModels(INITIAL_MODELS);
    if (agents.length === 0) setAgents(INITIAL_AGENTS);
  }, [models, agents, setModels, setAgents]);

  useEffect(() => {
    const fetchProjects = async () => {
      if (!user) {
        setLoadingProjects(false);
        return;
      }
      try {
        const q = query(collection(db, 'projects'), where('ownerId', '==', user.uid));
        const snapshot = await getDocs(q);
        const data: ProjectItem[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectItem));
        setProjects(data);
      } catch (err) {
        console.error('Failed to load chats:', err);
      } finally {
        setLoadingProjects(false);
      }
    };
    fetchProjects();
  }, [user]);

  const handleResetNewChat = () => {
    setActiveTab('new-chat');
    setSessionState('initial');
    setFeedMessages([]);
    setDraftPrompt('');
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleComposerSubmit = (text: string, pills: ContextPill[]) => {
    if (!text.trim()) return;
    if (isStreaming) return;
    setSessionState('submitted');
    const userMessage: FeedMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      pills,
      timestamp: Date.now()
    };
    const assistantId = `assistant_${Date.now()}`;
    setIsStreaming(true);
    const assistantPlaceholder: FeedMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      reasoningBlocks: [
        {
          id: `r1_${Date.now()}`,
          type: 'thinking',
          title: 'Thinking...',
          content: `Working on: "${text.slice(0, 80)}"`,
          status: 'active'
        }
      ],
      timestamp: Date.now()
    };
    setFeedMessages((prev) => [...prev, userMessage, assistantPlaceholder]);

    const response = `I received your request: **${text}**\n\nHere is a starting point. Use **Apply Diff** on code blocks to add them to your workspace.\n\n\`\`\`typescript\n// src/features/float/implementation.ts\nexport async function runTask(input: string) {\n  if (!input.trim()) throw new Error('Empty input');\n  return { success: true, input, at: Date.now() };\n}\n\`\`\`\n\nTell me what to build, fix, or explore next.`;

    const words = response.split(' ');
    let i = 0;
    const timer = setInterval(() => {
      i += 3;
      const partial = words.slice(0, i).join(' ');
      setFeedMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: partial,
                isStreaming: i < words.length,
                reasoningBlocks: m.reasoningBlocks?.map((b) => ({
                  ...b,
                  status: 'done' as const,
                  durationSeconds: 0.8
                }))
              }
            : m
        )
      );
      if (i >= words.length) {
        clearInterval(timer);
        setIsStreaming(false);
      }
    }, 30);
  };

  const handleStopStream = () => setIsStreaming(false);

  const handleApplyDiff = (code: string, filename?: string) => {
    try {
      useIDEStore.getState().applyExecutionChanges(
        [{ path: filename || 'main.py', content: code }],
        []
      );
    } catch (e) {
      console.warn('Apply diff failed', e);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#F8F8F7] dark:bg-[#0A0A0A] text-slate-900 dark:text-[#E6EDF3] font-sans overflow-hidden">
      <aside
        className={`${sidebarCollapsed ? 'w-16' : 'w-64'} bg-white dark:bg-[#111111] border-r border-[#EBEBEA] dark:border-[#222222] flex flex-col shrink-0 transition-all duration-200 z-30`}
      >
        <div className="h-12 flex items-center px-4 justify-between shrink-0">
          <button type="button" onClick={handleResetNewChat} className="flex items-center hover:opacity-85 cursor-pointer">
            <FloatLogo className="w-5 h-5 shrink-0 text-black dark:text-white" />
          </button>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <div className="px-2 py-1 flex flex-col gap-1">
          <button
            type="button"
            onClick={handleResetNewChat}
            className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2 px-3'} py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-black hover:opacity-90 cursor-pointer`}
          >
            <Plus size={15} strokeWidth={2.5} />
            {!sidebarCollapsed && <span>New Chat</span>}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('automations');
              window.history.pushState({}, '', '/automations');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2.5 px-3'} py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer`}
          >
            <Bot size={15} />
            {!sidebarCollapsed && <span>Automations</span>}
          </button>
          <button
            type="button"
            onClick={() => setShowCodebaseModal(true)}
            className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between px-3'} py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer`}
          >
            <div className="flex items-center gap-2.5">
              <Code2 size={15} />
              {!sidebarCollapsed && <span>Codebase</span>}
            </div>
            {!sidebarCollapsed && (
              <span className="text-[10px] text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded font-medium">
                Early Beta
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowUsageModal(true)}
            className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2.5 px-3'} py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer`}
          >
            <BarChart3 size={15} />
            {!sidebarCollapsed && <span>Usage Analytics</span>}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('integrations');
              window.history.pushState({}, '', '/integrations');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2.5 px-3'} py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer`}
          >
            <GitBranch size={15} />
            {!sidebarCollapsed && <span>Git Sync</span>}
          </button>
        </div>

        {!sidebarCollapsed && (
          <div className="mt-5 px-4 flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-400 dark:text-[#8B949E] mb-2">
              <span>Chats</span>
              <SlidersHorizontal size={13} />
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingProjects ? (
                <div className="flex items-center justify-center py-6 text-xs text-slate-400">
                  <Loader2 size={13} className="animate-spin mr-1.5" /> Loading...
                </div>
              ) : projects.length === 0 ? (
                <div className="text-xs text-slate-400 text-center py-8">No chats yet</div>
              ) : (
                projects.map((p) => (
                  <div
                    key={p.id}
                    className="px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-700 dark:text-[#C9D1D9] truncate"
                  >
                    {p.name}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {sidebarCollapsed && <div className="flex-1" />}

        <div className="p-2.5 border-t border-[#EBEBEA] dark:border-[#222222] flex flex-col gap-2 shrink-0">
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className="w-full py-1.5 px-3 rounded-lg text-xs font-medium text-slate-700 dark:text-[#C9D1D9] border border-slate-200 dark:border-white/10 flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/10"
            >
              <Sparkles size={13} className="text-blue-500" />
              <span>Upgrade to Start</span>
            </button>
          )}
          <AccountMenu direction="up" align="left" compact={sidebarCollapsed} className="w-full" />
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#F8F8F7] dark:bg-[#0A0A0A]">
        {activeTab === 'usage' || activeTab === 'analytics' ? (
          <div className="w-full h-full p-6 md:p-8 max-w-7xl mx-auto">
            <UsageAnalyticsView />
          </div>
        ) : activeTab === 'integrations' ? (
          <div className="w-full h-full p-6 md:p-8 max-w-6xl mx-auto">
            <IntegrationsPage />
          </div>
        ) : activeTab === 'automations' ? (
          <div className="w-full h-full p-6 md:p-8 max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Developer Automations</h2>
            <p className="text-sm text-slate-500 dark:text-[#8B949E]">Configure background triggers and automated workflows.</p>
            <div className="mt-6 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] rounded-xl p-6 text-center text-slate-500 text-xs">
              No active automation workers yet. Start a new chat to configure tasks.
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
            {sessionState === 'initial' ? (
              <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 w-full max-w-4xl mx-auto">
                <button
                  type="button"
                  onClick={() => setShowUpgradeModal(true)}
                  className="w-full max-w-2xl py-2.5 px-4 bg-white dark:bg-[#141414] border border-b-0 border-slate-200/90 dark:border-[#2C2C2C] rounded-t-2xl text-xs text-slate-600 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles size={13} className="text-blue-500" />
                  <span>Cloud Agents require a Start account</span>
                  <ArrowRight size={13} />
                </button>
                <PromptComposer
                  onSubmit={handleComposerSubmit}
                  isStreaming={isStreaming}
                  onStop={handleStopStream}
                  selectedModel={composerModel}
                  onModelChange={setComposerModel}
                  agentMode={composerAgentMode}
                  onAgentModeChange={setComposerAgentMode}
                  initialPrompt={draftPrompt}
                  placeholder="Ask FLOAT to build, fix bugs, explore"
                  className="max-w-2xl rounded-t-none"
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-w-0 h-full">
                <div className="flex-1 overflow-y-auto">
                  <ChatFeed messages={feedMessages} onApplyDiff={handleApplyDiff} className="pb-6" />
                </div>
                <div className="shrink-0 w-full border-t border-slate-200/80 dark:border-white/10 bg-[#F8F8F7]/95 dark:bg-[#0A0A0A]/95 backdrop-blur-md px-4 py-3">
                  <div className="max-w-3xl mx-auto">
                    <PromptComposer
                      onSubmit={handleComposerSubmit}
                      isStreaming={isStreaming}
                      onStop={handleStopStream}
                      selectedModel={composerModel}
                      onModelChange={setComposerModel}
                      agentMode={composerAgentMode}
                      onAgentModeChange={setComposerAgentMode}
                      placeholder="Reply or ask FLOAT to make edits..."
                      className="shadow-md"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showAgentManager && <AgentManagerModal onClose={() => setShowAgentManager(false)} />}
      {showCodebaseModal && <CodebaseIndexingModal onClose={() => setShowCodebaseModal(false)} />}
      {showUsageModal && (
        <UsageAnalyticsModal
          onClose={() => setShowUsageModal(false)}
          onUpgradeClick={() => {
            setShowUsageModal(false);
            setShowUpgradeModal(true);
          }}
        />
      )}
      {showUpgradeModal && (
        <UpgradeToStartModal
          onClose={() => setShowUpgradeModal(false)}
          onProceedToCheckout={() => {
            setShowUpgradeModal(false);
            window.history.pushState({}, '', '/checkout?plan=pro');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
        />
      )}
    </div>
  );
}
