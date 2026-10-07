import { v4 as uuidv4 } from 'uuid';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Plus, Bot, Code2, Sparkles,
  ArrowUp, PanelLeftClose, PanelLeftOpen,
  Loader2, Check, ChevronDown, X,
  ArrowRight, Filter, SlidersHorizontal, MoreHorizontal,
  BarChart3, Globe, FileCode2, Binary, BookOpen, GitPullRequest
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
import { DASHBOARD_MODELS } from './dashboardModels';
import { ModelSelector } from '../ai/ModelSelector';
import { AgentSelector } from '../ai/AgentSelector';
import { AgentManagerModal } from '../ai/AgentManagerModal';
import { ChatList } from '../float/ChatList';
import { ChatThread } from '../float/ChatThread';
import { AutomationsPanel } from '../float/AutomationsPanel';
import { useAutomationScheduler } from '../float/automationEngine';
import { CloudSessionBanner, CloudSessionModal } from '../float/CloudSession';
import { AttachMenu, AttachmentChips, SlashMenu, SuggestionChips, slashMatches, type Attachments } from '../float/ComposerExtras';
import { exportZip, importFileList, importZip, mapToTree, parseStoredFiles } from '../float/projectIO';
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
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAgentManager, setShowAgentManager] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [attachments, setAttachments] = useState<Attachments>({});

  // Session layout state machine: 'initial' | 'submitted'
  const [sessionState, setSessionState] = useState<'initial' | 'submitted'>('initial');
  const [feedMessages, setFeedMessages] = useState<FeedMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamAbortRef = useRef<boolean>(false);
  const [composerModel, setComposerModel] = useState<ModelTier>('float-pro');
  const [composerAgentMode, setComposerAgentMode] = useState<AgentMode>('composer');
  const [draftPrompt, setDraftPrompt] = useState<string>('');
  const [diffToast, setDiffToast] = useState<{ filename: string } | null>(null);

  // Navigation Modals
  const [showCodebaseModal, setShowCodebaseModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Dedicated 10-model selection matching Cursor-style screenshot
  const [selectedDashboardModelId, setSelectedDashboardModelId] = useState<string>(DASHBOARD_MODELS[0]?.id || 'grok-4.7');

  // Chats list & search
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const { setProject, settings, toggleTheme } = useIDEStore();
  const { user, logout } = useAuthStore();
  const {
    selectedModel, setSelectedModel, selectedAgent, setSelectedAgent,
    models, setModels,
    agents, setAgents
  } = useAIStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const openAgentManager = () => setShowAgentManager(true);
    document.addEventListener('open-agent-manager', openAgentManager);
    return () => document.removeEventListener('open-agent-manager', openAgentManager);
  }, []);

  useEffect(() => {
    if (models.length === 0) setModels(INITIAL_MODELS);
    if (agents.length === 0) setAgents(INITIAL_AGENTS);
  }, [models, agents, setModels, setAgents]);

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

  const handleResumeProject = (project: ProjectItem) => {
    let files = [];
    try {
      files = project.files ? JSON.parse(project.files) : [];
    } catch {
      files = [];
    }
    setProject(project.name || 'Untitled Project', files, project.id);
    setActiveTab('new-chat');
    setPrompt('');
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

  const PLACEHOLDER_SUGGESTIONS = [
    {
      id: 'whiteboard',
      title: 'Real-Time Whiteboard',
      description: 'Build a collaborative canvas with multiplayer cursor sync and undo/redo',
      icon: Sparkles,
      prompt: 'Build a real-time collaborative canvas with multiplayer cursor tracking, freehand drawing, and state sync using WebSockets.',
      pill: {
        id: 'pill_whiteboard',
        type: 'codebase' as const,
        label: '@Codebase',
        metadata: { path: 'src/components/Canvas.tsx' }
      }
    },
    {
      id: 'race-condition',
      title: 'Fix Async Race Condition',
      description: 'Audit token refresh hooks and debounce rapid concurrent requests',
      icon: Code2,
      prompt: 'Identify and fix potential race conditions in our Firebase token refresh middleware and prevent duplicate concurrent API calls.',
      pill: {
        id: 'pill_auth',
        type: 'files' as const,
        label: '@Files',
        metadata: { path: 'src/lib/firebase.ts' }
      }
    },
    {
      id: 'vitest',
      title: 'Generate Test Suite',
      description: 'Create end-to-end mock Stripe checkout test scenarios for subscription flow',
      icon: Bot,
      prompt: 'Write a comprehensive test suite for the Stripe subscription checkout flow verifying success, cancellation, and error states.',
      pill: {
        id: 'pill_test',
        type: 'docs' as const,
        label: '@Docs',
        metadata: { path: 'docs/testing-guidelines.md' }
      }
    },
    {
      id: 'architecture',
      title: 'Explore Architecture',
      description: 'Map component hierarchy, state stores, and external service routers',
      icon: Search,
      prompt: 'Explain the FLOAT AI architecture: detail how zustand stores, Express endpoints, and the IDE editor coordinate.',
      pill: {
        id: 'pill_web',
        type: 'web' as const,
        label: '@Web',
        metadata: { source: 'float-docs' }
      }
    }
  ];

  const handleStopStream = () => {
    streamAbortRef.current = true;
    setIsStreaming(false);
    setFeedMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
  };

  const handleResetNewChat = () => {
    handleStopStream();
    setActiveTab('new-chat');
    setSessionState('initial');
    setFeedMessages([]);
    setPrompt('');
    setDraftPrompt('');
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleApplyDiff = (code: string, filename?: string) => {
    const targetFile = filename || 'main.py';
    try {
      useIDEStore.getState().applyExecutionChanges([{ path: targetFile, content: code }], []);
      setDiffToast({ filename: targetFile });
      setTimeout(() => setDiffToast(null), 3000);
    } catch (e) {
      console.warn('Failed to apply diff to workspace:', e);
    }
  };

  const generateAssistantResponse = (
    userText: string,
    pills: ContextPill[],
    assistantId: string,
    initialReasoning: ReasoningBlock[]
  ) => {
    const pillContext = pills.length > 0 
      ? `Referenced Context: ${pills.map(p => `${p.label} (${p.type})`).join(', ')}\n\n`
      : '';

    let responseText = '';
    const lower = userText.toLowerCase();

    if (lower.includes('whiteboard') || lower.includes('canvas') || lower.includes('real-time')) {
      responseText = `I've architected a real-time collaborative canvas module for FLOAT. It features cursor broadcast sync, optimistic local rendering, and WebSocket delta reconciliation.

### Architecture Overview
1. **Canvas Component**: Pointer event capture with sub-pixel rendering.
2. **WebSocket Client**: Reconnecting socket connection with debounced presence pings.
3. **Undo/Redo Stack**: Deterministic action replay.

\`\`\`typescript
// src/components/CollaborativeCanvas.tsx
import React, { useEffect, useRef, useState } from 'react';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
}

export function CollaborativeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const currentStrokeRef = useRef<Point[]>([]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const startPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setIsDrawing(true);
    currentStrokeRef.current = [startPoint];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const newPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    currentStrokeRef.current.push(newPoint);
    drawRealtime(currentStrokeRef.current);
  };

  const drawRealtime = (points: Point[]) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || points.length < 2) return;
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(points[points.length - 2].x, points[points.length - 2].y);
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.stroke();
  };

  return (
    <div className="relative w-full h-[480px] bg-white dark:bg-[#121212] rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-inner">
      <canvas
        ref={canvasRef}
        width={800}
        height={480}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setIsDrawing(false)}
        className="w-full h-full cursor-crosshair touch-none"
      />
    </div>
  );
}
\`\`\`

You can use the **Apply Diff** button above to integrate this directly into your workspace.`;
    } else if (lower.includes('race') || lower.includes('auth') || lower.includes('token') || lower.includes('async')) {
      responseText = `I've analyzed the asynchronous state handling and identified potential race conditions in authentication token refreshing.

### Issue Diagnosis
When multiple API requests trigger concurrent 401 retries, each request issues a separate \`getIdToken(true)\` call without a singleton lock, causing invalidated refresh tokens.

### Solution
Wrap token refresh in an in-flight Promise mutex so concurrent requests await the identical resolved token.

\`\`\`typescript
// src/lib/authTokenManager.ts
import { auth } from './firebase';

let pendingTokenPromise: Promise<string | null> | null = null;

export async function getValidAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;

  // Re-use active in-flight refresh if already in progress
  if (pendingTokenPromise) {
    return pendingTokenPromise;
  }

  pendingTokenPromise = user.getIdToken(false)
    .catch(async (error) => {
      console.warn('Silent token read failed, forcing refresh:', error);
      return user.getIdToken(true);
    })
    .finally(() => {
      pendingTokenPromise = null;
    });

  return pendingTokenPromise;
}
\`\`\`

Click **Apply Diff** to patch this into your project.`;
    } else if (lower.includes('test') || lower.includes('stripe') || lower.includes('checkout') || lower.includes('subscri')) {
      responseText = `Here is the comprehensive test suite verifying the Stripe subscription checkout flow, including success, cancellation, and error handling scenarios.

\`\`\`typescript
// src/test/mockStripeScenarios.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCheckoutResult } from '../features/checkout/checkoutUtils';

describe('Stripe Checkout Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles successful subscription session completion', async () => {
    const session = {
      id: 'cs_test_success_123',
      status: 'complete',
      customer_email: 'developer@float.dev',
      subscription: 'sub_12345'
    };

    const result = await handleCheckoutResult(session);
    expect(result.success).toBe(true);
    expect(result.planTier).toBe('pro');
  });

  it('handles customer cancellation gracefully', async () => {
    const cancelPayload = {
      cancelled: true,
      returnUrl: '/pricing'
    };

    const result = await handleCheckoutResult(cancelPayload);
    expect(result.cancelled).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects expired or fraudulent session tokens', async () => {
    const invalidPayload = { id: 'invalid_token' };
    await expect(handleCheckoutResult(invalidPayload)).rejects.toThrow('Invalid checkout session');
  });
});
\`\`\`

Review the test assertions and click **Apply Diff** to save to your test suite.`;
    } else {
      responseText = `I have analyzed your request: "${userText}".

${pillContext}Here is the proposed implementation with type safety and error boundaries:

\`\`\`typescript
// src/features/float/implementation.ts
export interface TaskResult {
  success: boolean;
  timestamp: number;
  payload: Record<string, unknown>;
}

export async function executeDeveloperTask(input: string): Promise<TaskResult> {
  // Validate input parameters
  if (!input.trim()) {
    throw new Error('Input parameter must not be empty');
  }

  // Execute task with contextual telemetry
  return {
    success: true,
    timestamp: Date.now(),
    payload: {
      action: 'completed',
      processedLength: input.length
    }
  };
}
\`\`\`

You can copy the code snippet or click **Apply Diff** to review and integrate it into your project workspace.`;
    }

    const words = responseText.split(' ');
    let currentWordIndex = 0;
    const streamInterval = 25;

    setTimeout(() => {
      if (streamAbortRef.current) return;
      setFeedMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === assistantId && msg.reasoningBlocks) {
            return {
              ...msg,
              reasoningBlocks: msg.reasoningBlocks.map((b, idx) => ({
                ...b,
                status: 'done',
                durationSeconds: idx === 0 ? 0.7 : 1.1
              }))
            };
          }
          return msg;
        })
      );
    }, 600);

    const timer = setInterval(() => {
      if (streamAbortRef.current) {
        clearInterval(timer);
        setIsStreaming(false);
        setFeedMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
        );
        return;
      }

      currentWordIndex += 2;
      const partialText = words.slice(0, currentWordIndex).join(' ');

      setFeedMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === assistantId) {
            return {
              ...msg,
              content: partialText,
              isStreaming: currentWordIndex < words.length
            };
          }
          return msg;
        })
      );

      if (currentWordIndex >= words.length) {
        clearInterval(timer);
        setIsStreaming(false);
        setFeedMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId ? { ...msg, isStreaming: false } : msg
          )
        );
      }
    }, streamInterval);
  };

  const handleComposerSubmit = (text: string, pills: ContextPill[]) => {
    if (!text.trim() && pills.length === 0) return;
    if (isStreaming) return;

    setSessionState('submitted');

    const userMessage: FeedMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      pills: pills,
      timestamp: Date.now()
    };

    const assistantId = `assistant_${Date.now()}`;
    streamAbortRef.current = false;
    setIsStreaming(true);

    const initialReasoning: ReasoningBlock[] = [
      {
        id: `reason_thinking_${Date.now()}`,
        type: 'thinking',
        title: 'Thinking...',
        content: `Analyzing prompt instructions: "${text.slice(0, 100)}"\nIdentified execution mode: ${composerAgentMode === 'composer' ? 'Composer / Agent (ChangeSets enabled)' : composerAgentMode === 'cloud' ? 'Cloud Agent (Sandbox VM)' : 'Normal Chat'}.\nProcessing context references: ${pills.map(p => p.label).join(', ') || 'Global workspace context'}.\nSynthesizing implementation plan with TypeScript typing.`,
        status: 'active'
      },
      {
        id: `reason_reading_${Date.now()}`,
        type: 'reading_file',
        title: 'Reading file context...',
        content: 'Inspecting workspace file trees, AST declarations, and dependencies.',
        status: 'active'
      }
    ];

    const assistantPlaceholder: FeedMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      reasoningBlocks: initialReasoning,
      timestamp: Date.now()
    };

    setFeedMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    generateAssistantResponse(text, pills, assistantId, initialReasoning);
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
              href="/"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('new-chat');
                setPrompt('');
                window.history.pushState({}, '', '/');
                window.dispatchEvent(new PopStateEvent('popstate'));
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
        <div className="px-2 py-1 flex flex-col gap-1">
          {/* Functional + New Chat Button that resets session state */}
          <button
            onClick={handleResetNewChat}
            title="+ New Chat"
            className={`w-full flex items-center ${
              sidebarCollapsed ? 'justify-center px-0' : 'gap-2 px-3'
            } py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer bg-slate-900 text-white dark:bg-white dark:text-black hover:opacity-90 shadow-2xs`}
          >
            <Plus size={15} strokeWidth={2.5} className="shrink-0" />
            {!sidebarCollapsed && <span>New Chat</span>}
          </button>

          {/* Automations Button */}
          <button
            onClick={() => {
              setActiveTab('automations');
              window.history.pushState({}, '', '/automations');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            title="Automations"
            className={`w-full flex items-center ${
              sidebarCollapsed ? 'justify-center px-0' : 'gap-2.5 px-3'
            } py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'automations'
                ? 'bg-[#EAEAEA] dark:bg-white/10 text-slate-900 dark:text-white font-semibold'
                : 'text-slate-600 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Bot size={15} className="text-slate-600 dark:text-[#8B949E] shrink-0" />
            {!sidebarCollapsed && <span>Automations</span>}
          </button>

          {/* Codebase Indexing Modal Trigger Button */}
          <button
            onClick={() => setShowCodebaseModal(true)}
            title="Codebase Indexing"
            className={`w-full flex items-center ${
              sidebarCollapsed ? 'justify-center px-0' : 'justify-between px-3'
            } py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer text-slate-600 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white`}
          >
            <div className="flex items-center gap-2.5">
              <Code2 size={15} className="text-slate-600 dark:text-[#8B949E] shrink-0" />
              {!sidebarCollapsed && <span>Codebase</span>}
            </div>
            {!sidebarCollapsed && (
              <span className="text-[10px] text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded font-medium leading-none">
                Indexing
              </span>
            )}
          </button>

          {/* Usage Analytics Modal Trigger Button */}
          <button
            onClick={() => setShowUsageModal(true)}
            title="Usage Analytics"
            className={`w-full flex items-center ${
              sidebarCollapsed ? 'justify-center px-0' : 'gap-2.5 px-3'
            } py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer text-slate-600 dark:text-[#8B949E] hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white`}
          >
            <BarChart3 size={15} className="text-slate-600 dark:text-[#8B949E] shrink-0" />
            {!sidebarCollapsed && <span>Usage Analytics</span>}
          </button>
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
                projects.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleResumeProject(p)}
                    className="group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-700 dark:text-[#C9D1D9] transition-colors"
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
                ))
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
              onClick={() => setShowUpgradeModal(true)}
              className="w-full py-1.5 px-3 rounded-lg text-xs font-medium text-slate-700 dark:text-[#C9D1D9] bg-white dark:bg-[#181818] hover:bg-slate-50 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles size={13} className="text-blue-500" />
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
        {activeTab === 'usage' || activeTab === 'analytics' ? (
          <div className="w-full h-full p-6 md:p-8 max-w-7xl mx-auto flex flex-col gap-6">
            <UsageAnalyticsView />
          </div>
        ) : activeTab === 'integrations' ? (
          <div className="w-full h-full p-6 md:p-8 max-w-6xl mx-auto">
            <IntegrationsPage />
          </div>
        ) : activeTab === 'automations' ? (
          <div className="w-full h-full p-6 md:p-8 max-w-4xl mx-auto flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-blue-600 dark:text-blue-400 mb-1">
                <Bot size={14} />
                <span>Automations Engine</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Developer Automations
              </h2>
              <p className="text-sm text-slate-500 dark:text-[#8B949E] mt-1">
                Configure background triggers, webhook listeners, automated code reviews, and CI/CD validation.
              </p>
            </div>
            <div className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] rounded-xl p-6 text-center text-slate-500 dark:text-[#8B949E] text-xs">
              No active automation workers yet. Start a new chat to configure tasks.
            </div>
          </div>
        ) : activeTab === 'codebase' || activeTab === 'projects' ? (
          <div className="w-full h-full p-6 md:p-8 max-w-5xl mx-auto flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Your Projects & Codebases
                </h2>
                <p className="text-sm text-slate-500 dark:text-[#8B949E] mt-1">
                  Manage your active workspaces, agent configurations, and repositories.
                </p>
              </div>
              <button
                onClick={() => {
                  setActiveTab('new-chat');
                  setPrompt('');
                  window.history.pushState({}, '', '/');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
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
                  onClick={() => {
                    setActiveTab('new-chat');
                    setPrompt('');
                    window.history.pushState({}, '', '/');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
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
        ) : (
          /* ====================================================== */
          /* MAIN COMPOSER & CHAT INTERFACE (State Machine)         */
          /* ====================================================== */
          <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
            {/* Diff Applied Toast Notification */}
            {diffToast && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-medium shadow-lg flex items-center gap-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                <Check size={13} strokeWidth={3} />
                <span>Applied diff to workspace ({diffToast.filename})</span>
              </div>
            )}

            {sessionState === 'initial' ? (
              /* ================================================== */
              /* INITIAL STATE: Centered Prompt Box & Suggestions   */
              /* ================================================== */
              <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 w-full max-w-4xl mx-auto min-h-full transition-all duration-300 ease-in-out">
                {/* 1. Top Capsule Banner Tab */}
                <button
                  type="button"
                  onClick={() => setShowUpgradeModal(true)}
                  className="w-full max-w-2xl py-2.5 px-4 bg-white dark:bg-[#141414] border border-b-0 border-slate-200/90 dark:border-[#2C2C2C] rounded-t-2xl text-xs text-slate-600 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs group"
                >
                  <Sparkles size={13} className="text-blue-500 group-hover:scale-110 transition-transform" />
                  <span>Cloud Agents require a Start account</span>
                  <ArrowRight size={13} className="text-slate-500 dark:text-[#8B949E] group-hover:translate-x-0.5 transition-transform" />
                </button>

                {/* 2. Main Prompt Composer Box */}
                <PromptComposer
                  onSubmit={handleComposerSubmit}
                  isSubmitting={isSubmitting}
                  isStreaming={isStreaming}
                  onStop={handleStopStream}
                  selectedModel={composerModel}
                  onModelChange={setComposerModel}
                  agentMode={composerAgentMode}
                  onAgentModeChange={setComposerAgentMode}
                  initialPrompt={draftPrompt}
                  placeholder="Ask FLOAT to build, fix bugs, explore (@ for context)..."
                  className="max-w-2xl rounded-t-none"
                />

                {/* 3. Placeholder Suggestions Cards */}
                <div className="w-full max-w-2xl mt-6">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2.5 px-1">
                    Suggested prompts & workflows
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {PLACEHOLDER_SUGGESTIONS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setDraftPrompt(item.prompt);
                        }}
                        className="p-3 text-left rounded-xl bg-white dark:bg-[#131313] border border-slate-200/80 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20 transition-all hover:shadow-xs group cursor-pointer flex flex-col justify-between"
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-700 dark:text-slate-300 group-hover:text-blue-500 transition-colors shrink-0">
                            <item.icon size={13} />
                          </div>
                          <span className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
                            {item.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-[#8B949E] leading-relaxed line-clamp-2">
                          {item.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* ================================================== */
              /* SUBMITTED STATE: Active Chat Feed + Fixed Dock     */
              /* ================================================== */
              <div className="flex-1 flex flex-col min-w-0 h-full relative transition-all duration-300 ease-in-out">
                {/* Active Chat Feed */}
                <div className="flex-1 overflow-y-auto">
                  <ChatFeed
                    messages={feedMessages}
                    onApplyDiff={handleApplyDiff}
                    className="pb-6"
                  />
                </div>

                {/* Fixed Bottom Composer Dock */}
                <div className="shrink-0 w-full border-t border-slate-200/80 dark:border-white/10 bg-[#F8F8F7]/95 dark:bg-[#0A0A0A]/95 backdrop-blur-md px-4 py-3 z-20">
                  <div className="max-w-3xl mx-auto">
                    <PromptComposer
                      onSubmit={handleComposerSubmit}
                      isSubmitting={isSubmitting}
                      isStreaming={isStreaming}
                      onStop={handleStopStream}
                      selectedModel={composerModel}
                      onModelChange={setComposerModel}
                      agentMode={composerAgentMode}
                      onAgentModeChange={setComposerAgentMode}
                      placeholder="Reply or ask FLOAT to make edits (@ for context)..."
                      className="shadow-md"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
      {showAgentManager && (
        <AgentManagerModal onClose={() => setShowAgentManager(false)} />
      )}

      {/* Codebase Indexing Modal */}
      {showCodebaseModal && (
        <CodebaseIndexingModal onClose={() => setShowCodebaseModal(false)} />
      )}

      {/* Usage Analytics Modal */}
      {showUsageModal && (
        <UsageAnalyticsModal 
          onClose={() => setShowUsageModal(false)} 
          onUpgradeClick={() => {
            setShowUsageModal(false);
            setShowUpgradeModal(true);
          }}
        />
      )}

      {/* Upgrade to Start Modal */}
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
