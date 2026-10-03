import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useIDEStore } from '../../store';
import { useAIStore } from '../../store/aiStore';
import { auth } from '../../lib/firebase';
import { 
  Send, Plus, Code, Paperclip, Square, Loader2, X, 
  File as FileIcon, RotateCcw, AlertCircle, ChevronDown, 
  Trash2, MessageSquare, Check, Sparkles, Upload, Search,
  FileCode, Layers, ChevronUp, Copy, Edit2, Link, ArrowRight,
  PanelRightClose
} from 'lucide-react';
import { cn, flattenFileTree } from '../../lib/utils';
import ReactMarkdown from 'react-markdown';
import { AgentMode, ChangeSet, AIMessage, AIContextItem } from '../../types';
import { DiffReviewModal } from '../agent/DiffReviewModal';
import { ModelSelector } from './ModelSelector';
import { AgentSelector } from './AgentSelector';
import { AgentManagerModal } from './AgentManagerModal';
import { ProjectFilePickerModal } from './ProjectFilePickerModal';
import { CodebaseSearchModal } from './CodebaseSearchModal';
import { SearchMatch } from '../../services/codebaseSearch';
import { INITIAL_MODELS, INITIAL_AGENTS } from './registry';
import { ConsentService } from '../../services/consentService';
import { TelemetryService } from '../../services/telemetryService';
import { useUsageStore } from '../../store/usageStore';
import { ConversationService, ConversationMeta } from '../../services/conversationService';
import { v4 as uuidv4 } from 'uuid';

function CodeBlock({ node, inline, className, children, ...props }: any) {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const text = String(children).replace(/\n$/, '');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!inline && (match || text.includes('\n'))) {
    return (
      <div className="my-2 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-950 text-slate-100 dark:bg-[#121212] dark:text-[#E6EDF3] text-xs shadow-xs">
        <div className="flex items-center justify-between px-3 py-1 bg-slate-900/90 dark:bg-white/5 border-b border-slate-800 dark:border-white/5 text-[10px] text-slate-400">
          <span className="font-mono lowercase tracking-wide">{lang || 'code'}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer text-[10px] py-0.5 px-1.5 rounded hover:bg-white/10"
            title="Copy code block"
          >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <pre className="p-3 overflow-x-auto scrollbar-thin text-xs font-mono leading-relaxed">
          <code>{text}</code>
        </pre>
      </div>
    );
  }

  return (
    <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-[#E6EDF3] font-mono text-[11px]" {...props}>
      {children}
    </code>
  );
}

function AgentEventsTimeline({ events, isLoading }: { events: any[]; isLoading: boolean }) {
  const [isExpanded, setIsExpanded] = useState(true);
  if (!events || events.length === 0) return null;

  const latestEvent = events[events.length - 1];

  return (
    <div className="mb-2 w-full max-w-[92%]">
      <div className="bg-slate-100/90 dark:bg-[#141414] border border-slate-200 dark:border-[#2A2A2A] rounded-xl overflow-hidden shadow-2xs">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-3 py-2 flex items-center justify-between text-xs text-slate-700 dark:text-[#C9D1D9] hover:bg-slate-200/50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            {isLoading ? (
              <Loader2 size={13} className="animate-spin text-purple-600 dark:text-purple-400 shrink-0" />
            ) : (
              <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            )}
            <span className="font-semibold text-[11px] text-slate-900 dark:text-white">
              Agent Execution
            </span>
            <span className="text-[10px] text-slate-400 dark:text-[#7D8590]">
              ({events.length} step{events.length > 1 ? 's' : ''})
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-[#7D8590]">
            {latestEvent?.action && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/15 text-purple-700 dark:text-purple-300">
                {latestEvent.action}
              </span>
            )}
            <span className="truncate max-w-[140px] text-right">{latestEvent?.message}</span>
            <ChevronDown size={12} className={cn("transition-transform duration-150", isExpanded ? "rotate-180" : "")} />
          </div>
        </button>

        {isExpanded && (
          <div className="px-3 pb-2.5 pt-1 border-t border-slate-200/60 dark:border-white/5 flex flex-col gap-2 text-xs text-slate-600 dark:text-[#8B949E]">
            {events.map((ev, i) => {
              const isCurrent = i === events.length - 1 && isLoading;
              const isFailed = ev.type === 'tool_failed' || ev.type === 'failed';
              const isDone = ev.type === 'tool_completed' || ev.type === 'completed';

              return (
                <div key={i} className="flex items-start gap-2 py-0.5">
                  <div className="mt-0.5 shrink-0">
                    {isCurrent ? (
                      <Loader2 size={12} className="animate-spin text-purple-600 dark:text-purple-400" />
                    ) : isFailed ? (
                      <AlertCircle size={12} className="text-red-500" />
                    ) : isDone ? (
                      <Check size={12} className="text-emerald-500" />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {ev.action && (
                        <span className={cn(
                          "px-1.5 py-0.2 rounded text-[9px] font-semibold tracking-wide uppercase",
                          ev.action === 'Searching' ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" :
                          ev.action === 'Reading' ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                          ev.action === 'Generating proposal' ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                          ev.action === 'Exploring' ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400" :
                          ev.action === 'Inspecting' ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" :
                          ev.action === 'Synthesizing' ? "bg-purple-500/15 text-purple-600 dark:text-purple-400" :
                          "bg-slate-500/15 text-slate-600 dark:text-slate-400"
                        )}>
                          {ev.action}
                        </span>
                      )}
                      <span className={cn(
                        "text-[11px] leading-snug", 
                        isFailed ? "text-red-600 dark:text-red-400" : 
                        isCurrent ? "text-purple-600 dark:text-purple-300 font-medium" : 
                        "text-slate-700 dark:text-[#C9D1D9]"
                      )}>
                        {ev.message}
                      </span>
                    </div>
                    {ev.args && Object.keys(ev.args).length > 0 && (
                      <span className="text-[10px] text-slate-400 dark:text-[#6E7681] font-mono truncate mt-0.5">
                        {JSON.stringify(ev.args)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function AIPanel() {
  const { 
    projectId,
    projectName,
    activeConversationId, setActiveConversationId,
    aiMessages, setAiMessages, addAiMessage, updateAiMessage, clearAiMessages, 
    aiContext, addAiContext, removeAiContext, clearAiContext,
    activeSelection, activeFileId, files,
    initialPrompt, setInitialPrompt,
    toggleRightSidebar
  } = useIDEStore();

  const { 
    selectedModel, setSelectedModel, 
    selectedAgent, setSelectedAgent,
    models, setModels, agents, setAgents
  } = useAIStore();
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [reviewingChangeSet, setReviewingChangeSet] = useState<ChangeSet | null>(null);
  const [isAgentManagerOpen, setIsAgentManagerOpen] = useState(false);
  const [conversationList, setConversationList] = useState<ConversationMeta[]>([]);
  const [isConvDropdownOpen, setIsConvDropdownOpen] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null);
  const [editingTitleConvId, setEditingTitleConvId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState('');

  // Phase 3 Context Modals & Menu State
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);
  const [isCodebaseSearchOpen, setIsCodebaseSearchOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const activeConvIdRef = useRef<string | null>(null);

  const currentProjectId = projectId || 'default-workspace';

  useEffect(() => {
    activeConvIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (models.length === 0) setModels(INITIAL_MODELS);
    if (agents.length === 0) setAgents(INITIAL_AGENTS);
  }, [models, agents, setModels, setAgents]);

  const activeAgent = agents.find(a => a.id === selectedAgent) || agents[0];
  const mode = activeAgent?.mode || 'ask';

  const refreshConversations = async () => {
    const list = await ConversationService.fetchCloudList(currentProjectId);
    setConversationList(list);
    return list;
  };

  useEffect(() => {
    let isMounted = true;

    async function initConversation() {
      const list = await refreshConversations();
      if (!isMounted) return;

      if (!activeConversationId) {
        if (list.length > 0) {
          const first = list[0];
          setActiveConversationId(first.id);
          const msgs = await ConversationService.fetchCloudConversation(first.id);
          if (isMounted && msgs) {
            setAiMessages(msgs);
          }
        } else {
          const newId = uuidv4();
          setActiveConversationId(newId);
          setAiMessages([]);
        }
      } else {
        const msgs = await ConversationService.fetchCloudConversation(activeConversationId);
        if (isMounted && msgs) {
          setAiMessages(msgs);
        }
      }
    }

    initConversation();

    return () => {
      isMounted = false;
    };
  }, [currentProjectId]);

  useEffect(() => {
    if (initialPrompt && !isLoading) {
      setInput(initialPrompt);
      setInitialPrompt(null);
      setTimeout(() => {
        handleSubmit(initialPrompt);
      }, 60);
    }
  }, [initialPrompt]);

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 120;
  };

  const scrollToBottom = (force = false) => {
    if (force || isNearBottomRef.current) {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: force ? 'auto' : 'smooth'
        });
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [aiMessages]);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    isSubmittingRef.current = false;

    const current = useIDEStore.getState().aiMessages;
    const lastMsg = current[current.length - 1];
    if (lastMsg && (lastMsg.status === 'streaming' || lastMsg.status === 'sending')) {
      updateAiMessage(lastMsg.id, {
        status: 'cancelled',
        content: lastMsg.content ? `${lastMsg.content} *(cancelled)*` : '*(Generation stopped)*'
      });
    }
  };

  const handleNewChat = () => {
    handleStop();
    const newId = uuidv4();
    setActiveConversationId(newId);
    setAiMessages([]);
    clearAiContext();
    setIsConvDropdownOpen(false);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  const handleSwitchConversation = async (conv: ConversationMeta) => {
    if (conv.id === activeConversationId) {
      setIsConvDropdownOpen(false);
      return;
    }

    handleStop();
    setActiveConversationId(conv.id);
    setIsConvDropdownOpen(false);

    const msgs = await ConversationService.fetchCloudConversation(conv.id);
    setAiMessages(msgs || []);
    scrollToBottom(true);
  };

  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    await ConversationService.deleteConversation(convId, currentProjectId);
    const updatedList = await refreshConversations();

    if (convId === activeConversationId) {
      if (updatedList.length > 0) {
        handleSwitchConversation(updatedList[0]);
      } else {
        handleNewChat();
      }
    }
  };

  // Phase 3 Context Actions
  const attachActiveFile = () => {
    if (!activeFileId) return;
    const virtualFiles = flattenFileTree(files);
    const activeFile = virtualFiles.find(f => f.id === activeFileId);
    
    if (activeFile && !aiContext.find(c => c.path === activeFile.path || c.name === activeFile.path)) {
      addAiContext({
        type: 'file',
        name: activeFile.path,
        path: activeFile.path,
        content: activeFile.content || '',
        sizeBytes: (activeFile.content || '').length
      });
    }
    setIsContextMenuOpen(false);
  };

  const attachEditorSelection = () => {
    if (!activeSelection || !activeSelection.text.trim()) return;

    const selName = `${activeSelection.filePath} (L${activeSelection.startLine}-${activeSelection.endLine})`;
    addAiContext({
      type: 'selection',
      name: selName,
      path: activeSelection.filePath,
      startLine: activeSelection.startLine,
      endLine: activeSelection.endLine,
      content: activeSelection.text,
      sizeBytes: activeSelection.text.length
    });
    setIsContextMenuOpen(false);
  };

  const handleSelectProjectFile = (file: { id: string; path: string; name: string; content?: string }) => {
    const existing = aiContext.find(c => c.path === file.path);
    if (existing) {
      removeAiContext(existing.id);
    } else {
      addAiContext({
        type: 'file',
        name: file.path,
        path: file.path,
        content: file.content || '',
        sizeBytes: (file.content || '').length
      });
    }
  };

  const handleSelectSearchMatch = (match: SearchMatch) => {
    const matchKey = `${match.filePath}:${match.startLine}-${match.endLine}`;
    const existing = aiContext.find(c => c.path === match.filePath && c.startLine === match.startLine);
    if (existing) {
      removeAiContext(existing.id);
    } else {
      addAiContext({
        type: 'search_match',
        name: `${match.filePath} (L${match.startLine}-${match.endLine})`,
        path: match.filePath,
        startLine: match.startLine,
        endLine: match.endLine,
        content: match.contentExcerpt,
        sizeBytes: match.contentExcerpt.length
      });
    }
  };

  // Local File Upload Handling
  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;

    const file = filesList[0];
    const MAX_SIZE = 120 * 1024; // 120 KB

    if (file.size > MAX_SIZE) {
      setUploadError(`File "${file.name}" exceeds the 120KB attachment limit.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (typeof text === 'string') {
        // Simple null-byte binary check
        if (text.includes('\0')) {
          setUploadError(`"${file.name}" appears to be a binary file. Only plain-text source files are supported.`);
          return;
        }

        addAiContext({
          type: 'attachment',
          name: file.name,
          path: file.name,
          content: text,
          sizeBytes: file.size
        });
        setIsContextMenuOpen(false);
      }
    };
    reader.onerror = () => {
      setUploadError(`Failed to read file "${file.name}".`);
    };
    reader.readAsText(file);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Submit message and start streaming
  const handleSubmit = async (overrideInput?: string, isRetry = false) => {
    const rawText = (overrideInput !== undefined ? overrideInput : input).trim();
    if (!rawText || isLoading || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsLoading(true);

    const targetConvId = activeConversationId || uuidv4();
    if (!activeConversationId) {
      setActiveConversationId(targetConvId);
    }

    const draftText = rawText;
    if (overrideInput === undefined) {
      setInput('');
    }

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Capture current context items and clear for subsequent prompt turns
    const currentContext = [...aiContext];
    if (!isRetry) {
      clearAiContext();
    }

    // Append user message only if this is NOT a retry/regeneration of an existing turn
    let userMsgId = '';
    if (!isRetry) {
      userMsgId = uuidv4();
      addAiMessage({
        id: userMsgId,
        role: 'user',
        content: draftText,
        status: 'completed',
        conversationId: targetConvId
      });
    }

    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      if (overrideInput === undefined) {
        setInput(draftText); // Preserve user draft on auth failure
      }
      addAiMessage({
        id: uuidv4(),
        role: 'model',
        content: '**Authentication Required**: Please sign in to communicate with FLOAT AI models.',
        status: 'error',
        error: 'Missing authentication token',
        modelId: selectedModel,
        agentId: selectedAgent,
        conversationId: targetConvId
      });
      setIsLoading(false);
      isSubmittingRef.current = false;
      return;
    }

    if (mode === 'agent') {
      await handleAgentSubmit(draftText, token, targetConvId, currentContext);
      isSubmittingRef.current = false;
      return;
    }

    // Standard Chat with progressive streaming
    const modelMsgId = uuidv4();
    addAiMessage({
      id: modelMsgId,
      role: 'model',
      content: '',
      status: 'streaming',
      modelId: selectedModel,
      agentId: selectedAgent,
      conversationId: targetConvId
    });

    abortControllerRef.current = new AbortController();
    const startTime = Date.now();
    let accumulatedText = '';

    try {
      const existingMessages = useIDEStore.getState().aiMessages;
      const priorTurns = existingMessages
        .filter(m => m.id !== userMsgId && m.id !== modelMsgId && m.content && !m.error && (m.role === 'user' || m.role === 'model'))
        .slice(-20)
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }));

      const requestMessages = isRetry
        ? priorTurns
        : [
            ...priorTurns,
            { role: 'user', parts: [{ text: draftText }] }
          ];

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Float-Data-Sharing': ConsentService.isSharingAllowed() ? 'true' : 'false'
        },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          messages: requestMessages,
          model: selectedModel,
          reasoningEffort: useAIStore.getState().selectedEffort,
          agentId: selectedAgent,
          systemInstruction: activeAgent?.systemInstructions || "You are an AI coding assistant. Answer questions concisely.",
          contextItems: currentContext,
          projectName: projectName || 'Project Workspace',
          projectId: currentProjectId,
          stream: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to reach model provider.`);
      }

      if (!response.body) {
        throw new Error('No streaming response body received from server.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      accumulatedText = '';
      let finalUsage: { inputTokens: number; outputTokens: number } | undefined = undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        if (activeConvIdRef.current !== targetConvId) {
          reader.cancel();
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'delta') {
                accumulatedText += data.text;
                updateAiMessage(modelMsgId, {
                  content: accumulatedText,
                  status: 'streaming'
                });
              } else if (data.type === 'done') {
                accumulatedText = data.text || accumulatedText;
                finalUsage = data.usage;
                updateAiMessage(modelMsgId, {
                  content: accumulatedText,
                  status: 'completed',
                  latency: Date.now() - startTime
                });
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (e: any) {
              if (e.message && !e.message.includes('JSON')) {
                throw e;
              }
            }
          }
        }
      }

      const latency = Date.now() - startTime;
      updateAiMessage(modelMsgId, {
        content: accumulatedText,
        status: 'completed',
        latency
      });

      // Record token analytics
      try {
        const activeModelObj = INITIAL_MODELS.find(m => m.id === selectedModel);
        const inToks = finalUsage?.inputTokens || Math.max(1, Math.round(draftText.length / 4));
        const outToks = finalUsage?.outputTokens || Math.max(1, Math.round(accumulatedText.length / 4));
        const inCost = ((activeModelObj?.pricing?.inputCost || 0.1) / 1000000) * inToks;
        const outCost = ((activeModelObj?.pricing?.outputCost || 0.4) / 1000000) * outToks;

        useUsageStore.getState().addRecord({
          userId: auth.currentUser?.uid || 'user',
          provider: activeModelObj?.providerId || 'google',
          modelId: selectedModel,
          agentId: selectedAgent,
          inputTokens: inToks,
          outputTokens: outToks,
          cachedTokens: 0,
          totalTokens: inToks + outToks,
          latency,
          estimatedCost: inCost + outCost,
          status: 'success'
        });
      } catch (err) {
        console.warn('Failed to record token analytics:', err);
      }

      // Persist conversation state
      const latestMessages = useIDEStore.getState().aiMessages;
      const title = latestMessages.find(m => m.role === 'user')?.content?.slice(0, 36) || 'New Conversation';
      await ConversationService.syncToCloud({
        id: targetConvId,
        projectId: currentProjectId,
        title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: latestMessages
      });
      refreshConversations();

    } catch (error: any) {
      const isCancellation = 
        error?.name === 'AbortError' || 
        error?.type === 'cancelation' || 
        error?.type === 'cancelled' || 
        /cancel/i.test(error?.message || error?.msg || '');

      if (isCancellation) {
        updateAiMessage(modelMsgId, {
          status: 'cancelled',
          content: accumulatedText ? `${accumulatedText} *(cancelled)*` : '*(Generation stopped)*'
        });
      } else {
        let errMsg = error.message || 'Could not connect to model provider.';
        if (/resource_exhausted|quota|429|rate[- ]?limit/i.test(errMsg)) {
          errMsg = "Provider quota or rate limit exceeded. Please wait a moment before trying again, or select another available model in the model selector.";
        }
        updateAiMessage(modelMsgId, {
          status: 'error',
          error: errMsg,
          content: `**Rate Limit / Provider Error**\n\n${errMsg}`
        });
      }
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
      abortControllerRef.current = null;
    }
  };

  // Agent submit handler
  const handleAgentSubmit = async (
    userMessage: string, 
    token: string, 
    targetConvId: string, 
    contextItems: AIContextItem[] = []
  ) => {
    const { files, openTabs, activeFileId, terminalEntries } = useIDEStore.getState();
    const virtualFiles = flattenFileTree(files);
    
    const activeFile = virtualFiles.find(f => f.id === activeFileId)?.path;
    const openFilePaths = openTabs.map(t => virtualFiles.find(f => f.id === t.fileId)?.path).filter(Boolean);
    const recentErrors = terminalEntries.filter(t => t.type === 'error').slice(-3).map(t => t.content);

    let contextHeader = `
[Context]
Active File: ${activeFile || 'None'}
Open Tabs: ${openFilePaths.join(', ') || 'None'}
Recent Terminal Errors: ${recentErrors.join(' | ') || 'None'}
`;
    if (contextItems.length > 0) {
      contextHeader += `\n[Attached Files & Code Excerpts]\n` + contextItems.map(c => `--- ${c.name} ---\n${c.content}`).join('\n\n');
    }

    const fullPrompt = `${contextHeader}\n\n[User Request]\n${userMessage}`;

    const tempId = uuidv4();
    addAiMessage({ 
      id: tempId, 
      role: 'model', 
      content: '', 
      status: 'streaming',
      events: [], 
      conversationId: targetConvId 
    });
    
    abortControllerRef.current = new AbortController();
    let finalContent = '';
    
    try {
      const response = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Float-Data-Sharing': ConsentService.isSharingAllowed() ? 'true' : 'false'
        },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          prompt: fullPrompt,
          virtualFiles,
          model: selectedModel,
          agentId: selectedAgent,
          projectName: projectName || 'Workspace',
          projectId: currentProjectId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: Agent service error`);
      }

      if (!response.body) throw new Error('No response body received from agent stream');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let events: any[] = [];
      finalContent = '';
      let finalChangeSet = undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'event') {
                events = [...events, data.data];
                updateAiMessage(tempId, { events });
                if (data.data?.type === 'failed') {
                  const errorMsg = data.data.message || 'Agent task failed.';
                  finalContent = finalContent 
                    ? `${finalContent}\n\n**Agent Execution Failed**: ${errorMsg}` 
                    : `**Agent Execution Failed**\n\n${errorMsg}`;
                  updateAiMessage(tempId, {
                    content: finalContent,
                    status: 'error',
                    error: errorMsg
                  });
                }
              } else if (data.type === 'delta') {
                const deltaText = data.data?.text || data.text || '';
                finalContent += deltaText;
                updateAiMessage(tempId, { content: finalContent, status: 'streaming' });
              } else if (data.type === 'result') {
                finalContent = data.data.text || finalContent || 'Task completed.';
                finalChangeSet = data.data.changeSet;
                updateAiMessage(tempId, { 
                  content: finalContent, 
                  changeSet: finalChangeSet, 
                  status: 'completed' 
                });
              }
            } catch (e) {
              // Ignore boundary parse
            }
          }
        }
      }

      const latestMessages = useIDEStore.getState().aiMessages;
      const title = latestMessages.find(m => m.role === 'user')?.content?.slice(0, 36) || 'Agent Task';
      await ConversationService.syncToCloud({
        id: targetConvId,
        projectId: currentProjectId,
        title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: latestMessages
      });
      refreshConversations();

    } catch (error: any) {
      const isCancellation = 
        error?.name === 'AbortError' || 
        error?.type === 'cancelation' || 
        error?.type === 'cancelled' || 
        /cancel/i.test(error?.message || error?.msg || '');

      if (isCancellation) {
        updateAiMessage(tempId, {
          status: 'cancelled',
          content: finalContent ? `${finalContent} *(cancelled)*` : '*(Agent task stopped)*'
        });
      } else {
        let errMsg = error.message || 'Agent task failed.';
        if (/resource_exhausted|quota|429|rate[- ]?limit/i.test(errMsg)) {
          errMsg = "Provider quota or rate limit exceeded. Please wait a moment before trying again, or select another available model in the model selector.";
        }
        updateAiMessage(tempId, { 
          status: 'error',
          error: errMsg,
          content: `**Rate Limit / Provider Error**\n\n${errMsg}` 
        });
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleRetry = (errorMsgId: string) => {
    const messages = useIDEStore.getState().aiMessages;
    const errorIdx = messages.findIndex(m => m.id === errorMsgId);
    if (errorIdx < 0) return;

    let precedingUserPrompt = '';
    for (let i = errorIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        precedingUserPrompt = messages[i].content;
        break;
      }
    }

    setAiMessages(messages.filter((_, idx) => idx !== errorIdx));

    if (precedingUserPrompt) {
      handleSubmit(precedingUserPrompt, true);
    }
  };

  const handleRegenerate = () => {
    const messages = useIDEStore.getState().aiMessages;
    if (messages.length === 0 || isLoading) return;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'model') return;

    let precedingUserPrompt = '';
    for (let i = messages.length - 2; i >= 0; i--) {
      if (messages[i].role === 'user') {
        precedingUserPrompt = messages[i].content;
        break;
      }
    }

    if (precedingUserPrompt) {
      setAiMessages(messages.slice(0, -1));
      handleSubmit(precedingUserPrompt, true);
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId(null), 2000);
    }
  };

  const handleCopyChatLink = () => {
    if (navigator?.clipboard?.writeText) {
      const url = `${window.location.origin}/chat/${currentProjectId}`;
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleSaveTitle = async (convId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    setEditingTitleConvId(null);
    if (!trimmed) return;

    const conv = await ConversationService.fetchCloudConversation(convId);
    if (conv) {
      await ConversationService.syncToCloud({
        id: convId,
        projectId: currentProjectId,
        title: trimmed,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: conv
      });
      await refreshConversations();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const activeConversationMeta = conversationList.find(c => c.id === activeConversationId);
  const displayTitle = activeConversationMeta?.title || (aiMessages.length > 0 ? aiMessages[0].content?.slice(0, 28) : 'New Chat');

  const virtualFiles = flattenFileTree(files);
  const activeFileObj = virtualFiles.find(f => f.id === activeFileId);
  const isCurrentFileAttached = activeFileObj ? aiContext.some(c => c.path === activeFileObj.path) : false;
  const isSelectionAvailable = !!(activeSelection && activeSelection.text.trim());

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-[#0A0A0A]">
      {/* Hidden File Input for local source upload */}
      <input 
        ref={fileInputRef}
        type="file"
        accept=".py,.ts,.tsx,.js,.jsx,.json,.md,.html,.css,.txt,.yaml,.yml,.toml,.sql,.sh,.env.example"
        onChange={handleLocalFileUpload}
        className="hidden"
      />

      {/* HEADER & CONVERSATION SWITCHER */}
      <div className="flex flex-col gap-2 p-3 border-b border-slate-200 dark:border-[#2A2A2A] select-none shrink-0 bg-white dark:bg-[#0A0A0A] relative z-20">
        <div className="flex items-center justify-between">
          {/* Conversation Switcher Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsConvDropdownOpen(!isConvDropdownOpen)}
              className="flex items-center gap-1.5 py-1 px-2 -ml-2 rounded-lg text-xs font-semibold text-slate-800 dark:text-[#E6EDF3] hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer max-w-[200px]"
              title="Switch conversation"
            >
              <MessageSquare size={13} className="text-purple-600 dark:text-purple-400 shrink-0" />
              <span className="truncate">{displayTitle}</span>
              <ChevronDown size={12} className="text-slate-400 dark:text-[#7D8590] shrink-0" />
            </button>

            {isConvDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => {
                    setIsConvDropdownOpen(false);
                    setDeletingConvId(null);
                    setEditingTitleConvId(null);
                  }} 
                />
                <div className="absolute left-0 top-full mt-1.5 w-72 bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#2C2C2C] rounded-xl shadow-2xl p-1.5 z-40 flex flex-col gap-0.5 animate-in fade-in duration-100">
                  <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 dark:text-[#7D8590] border-b border-slate-100 dark:border-white/5">
                    <span>Conversations</span>
                    <button
                      type="button"
                      onClick={handleNewChat}
                      className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={11} />
                      <span>New</span>
                    </button>
                  </div>

                  <div className="max-h-56 overflow-y-auto flex flex-col gap-0.5 py-1 scrollbar-thin">
                    {conversationList.length === 0 ? (
                      <div className="py-4 text-center text-xs text-slate-400 dark:text-[#7D8590]">
                        No saved chats yet
                      </div>
                    ) : (
                      conversationList.map(conv => {
                        const isCurrent = conv.id === activeConversationId;
                        const isDeleting = deletingConvId === conv.id;
                        const isEditing = editingTitleConvId === conv.id;

                        return (
                          <div
                            key={conv.id}
                            onClick={() => !isDeleting && !isEditing && handleSwitchConversation(conv)}
                            className={cn(
                              "px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer group transition-colors",
                              isCurrent 
                                ? "bg-slate-100 dark:bg-white/[0.08] text-slate-900 dark:text-white font-medium" 
                                : "text-slate-600 dark:text-[#A1A1AA] hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                            )}
                          >
                            <div className="flex items-center gap-2 truncate mr-2 flex-1">
                              {isCurrent && <Check size={12} className="text-purple-600 dark:text-purple-400 shrink-0" />}
                              
                              {isEditing ? (
                                <input
                                  type="text"
                                  autoFocus
                                  value={editingTitleText}
                                  onChange={(e) => setEditingTitleText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleSaveTitle(conv.id, editingTitleText);
                                    } else if (e.key === 'Escape') {
                                      setEditingTitleConvId(null);
                                    }
                                  }}
                                  onBlur={() => handleSaveTitle(conv.id, editingTitleText)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full bg-slate-200 dark:bg-white/10 px-1.5 py-0.5 rounded text-xs text-slate-900 dark:text-white outline-none"
                                />
                              ) : (
                                <span className="truncate">{conv.title}</span>
                              )}
                            </div>

                            {isDeleting ? (
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    handleDeleteConversation(e, conv.id);
                                    setDeletingConvId(null);
                                  }}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-600 text-white hover:bg-rose-700"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingConvId(null)}
                                  className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-white"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTitleConvId(conv.id);
                                    setEditingTitleText(conv.title);
                                  }}
                                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded"
                                  title="Rename conversation"
                                >
                                  <Edit2 size={11} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingConvId(conv.id);
                                  }}
                                  className="p-1 text-slate-400 hover:text-rose-500 rounded"
                                  title="Delete conversation"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button 
              type="button"
              onClick={handleCopyChatLink} 
              className="p-1.5 text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-md transition-colors cursor-pointer" 
              title={copiedLink ? "Link copied!" : "Copy conversation link"}
            >
              {copiedLink ? <Check size={14} className="text-emerald-500" /> : <Link size={14} />}
            </button>
            <button 
              type="button"
              onClick={handleNewChat} 
              className="p-1.5 text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-md transition-colors cursor-pointer" 
              title="Start a new chat"
            >
              <Plus size={15} />
            </button>
            <button 
              type="button"
              onClick={toggleRightSidebar} 
              className="p-1.5 text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-md transition-colors cursor-pointer md:hidden" 
              title="Close AI Panel"
            >
              <PanelRightClose size={15} />
            </button>
          </div>
        </div>

        {/* Agent & Model Selectors */}
        <div className="flex gap-2">
          <div className="flex-1">
             <AgentSelector 
                activeAgentId={selectedAgent} 
                onAgentChange={(agentId) => {
                  setSelectedAgent(agentId);
                  const agent = agents.find(a => a.id === agentId);
                  if (agent && agent.defaultModel) {
                    setSelectedModel(agent.defaultModel);
                  }
                }} 
                onAgentManagerOpen={() => document.dispatchEvent(new Event('open-agent-manager'))}
             />
          </div>
          <div className="flex-1">
             <ModelSelector 
                activeModelId={selectedModel} 
                onModelChange={setSelectedModel} 
                agentId={selectedAgent} 
             />
          </div>
        </div>
      </div>

      {/* MESSAGE STREAMING & HISTORY AREA */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 scrollbar-thin"
      >
        {aiMessages.length === 0 ? (
          <div className="text-center my-auto py-8 text-sm text-slate-500 dark:text-[#8B949E] flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center mx-auto mb-3 shadow-xs">
              <Sparkles size={22} />
            </div>
            <h4 className="font-semibold text-slate-900 dark:text-white mb-1 text-sm">
              FLOAT AI Workspace
            </h4>
            <p className="text-xs text-slate-500 dark:text-[#8B949E] max-w-xs leading-relaxed mb-6">
              Ask questions, generate solutions, attach files or selections, and collaborate with coding models.
            </p>

            {/* Quick Developer Starter Prompts */}
            <div className="w-full max-w-sm flex flex-col gap-1.5 px-2 text-left">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#6E7681] px-1">
                Suggested Starters
              </span>
              {[
                { title: 'Explain this codebase', desc: 'Overview of structure and main entry points' },
                { title: 'Help me debug an error', desc: 'Diagnose stack trace or logic issue' },
                { title: 'Write a unit test', desc: 'Create test cases for current module' },
                { title: 'Review open file', desc: 'Scan for bugs, edge cases, and performance' }
              ].map((item, sIdx) => (
                <button
                  key={sIdx}
                  type="button"
                  onClick={() => handleSubmit(item.title)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:border-purple-500/40 bg-white dark:bg-[#121212] hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all text-left flex items-center justify-between group cursor-pointer shadow-2xs"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="text-xs font-medium text-slate-800 dark:text-[#C9D1D9] group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                      {item.title}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-[#6E7681] truncate">
                      {item.desc}
                    </span>
                  </div>
                  <ArrowRight size={13} className="text-slate-300 dark:text-slate-600 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          aiMessages.map((msg, idx) => {
            const msgModel = models.find(m => m.id === msg.modelId);
            const msgAgent = agents.find(a => a.id === msg.agentId);
            const isUser = msg.role === 'user';
            const isStreaming = msg.status === 'streaming';
            const isError = msg.status === 'error' || (msg.content && msg.content.startsWith('**Error**:'));

            return (
              <div 
                key={msg.id} 
                className={cn("text-sm flex flex-col group", isUser ? "items-end" : "items-start")}
              >
                {!isUser && (msgModel || msgAgent || msg.latency) && (
                  <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-slate-400 dark:text-[#7D8590]">
                    {msgAgent && <span className="font-medium text-slate-600 dark:text-[#C9D1D9]">{msgAgent.name}</span>}
                    {msgAgent && msgModel && <span>·</span>}
                    {msgModel && <span>{msgModel.displayName}</span>}
                    {msg.latency && (
                      <>
                        <span>·</span>
                        <span>{(msg.latency / 1000).toFixed(1)}s</span>
                      </>
                    )}
                    {isStreaming && (
                      <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 text-[10px] font-medium animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> streaming
                      </span>
                    )}
                  </div>
                )}

                {/* Event logs for autonomous agents */}
                {msg.events && msg.events.length > 0 && (
                  <AgentEventsTimeline events={msg.events} isLoading={isLoading && msg.id === aiMessages[aiMessages.length - 1]?.id} />
                )}
                
                {/* Message Bubble */}
                <div className={cn(
                  "max-w-[92%] p-3.5 rounded-2xl select-text transition-all",
                  isUser 
                    ? "bg-slate-900 text-white dark:bg-white dark:text-black rounded-tr-sm shadow-xs" 
                    : isError
                    ? "bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 rounded-tl-sm w-full"
                    : "bg-white dark:bg-[#111111] border border-slate-200/90 dark:border-[#2A2A2A] rounded-tl-sm text-slate-800 dark:text-[#C9D1D9] shadow-xs"
                )}>
                  {isUser ? (
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                  ) : isError ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 font-semibold text-xs">
                        <AlertCircle size={14} className="shrink-0" />
                        <span>Request Failed</span>
                      </div>
                      <p className="text-xs leading-relaxed opacity-90">
                        {msg.error || msg.content.replace('**Error**:', '').trim()}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => handleRetry(msg.id)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <RotateCcw size={12} />
                          <span>Retry</span>
                        </button>

                        {/(retired|no longer available|high demand|quota|rate limit|not[- ]?found|spikes in demand)/i.test(msg.error || msg.content) && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedModel('gemini-3.1-flash-lite');
                              handleRetry(msg.id);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-purple-600 text-white hover:bg-purple-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <Sparkles size={12} />
                            <span>Switch to Gemini 3.1 Flash Lite & Retry</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="markdown-body prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed">
                      <ReactMarkdown components={{ code: CodeBlock }}>{msg.content}</ReactMarkdown>
                      {isStreaming && (
                        <span className="inline-block w-1.5 h-3.5 bg-purple-600 dark:bg-purple-400 ml-1 translate-y-0.5 animate-pulse" />
                      )}
                    </div>
                  )}
                </div>

                {/* Message action buttons on hover */}
                {!isError && (
                  <div className={cn(
                    "flex items-center gap-1.5 mt-1 px-1 text-[11px] text-slate-400 dark:text-[#7D8590] opacity-0 group-hover:opacity-100 transition-opacity",
                    isUser ? "flex-row-reverse" : "flex-row"
                  )}>
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      className="p-1 hover:text-slate-700 dark:hover:text-[#C9D1D9] rounded flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer text-[10px]"
                      title="Copy message content"
                    >
                      {copiedMsgId === msg.id ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                      <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                    </button>

                    {!isUser && idx === aiMessages.length - 1 && !isLoading && (
                      <button
                        type="button"
                        onClick={handleRegenerate}
                        className="p-1 hover:text-slate-700 dark:hover:text-[#C9D1D9] rounded flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer text-[10px]"
                        title="Regenerate response"
                      >
                        <RotateCcw size={11} />
                        <span>Regenerate</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Proposed Changes Banner */}
                {msg.changeSet && (
                  <div className="mt-2 w-full max-w-[92%]">
                    <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#2A2A2A] rounded-xl overflow-hidden shadow-sm">
                      <div className="bg-slate-50 dark:bg-[#141414] border-b border-slate-200 dark:border-[#2A2A2A] px-3.5 py-2 text-xs font-semibold flex justify-between items-center text-slate-800 dark:text-[#C9D1D9]">
                        <span>Proposed Changes</span>
                        <span className="text-slate-400 dark:text-[#8B949E] font-normal">{msg.changeSet.changes.length} files</span>
                      </div>
                      <div className="p-3 text-xs">
                        {msg.changeSet.changes.map((c: any, i: number) => (
                          <div key={i} className="flex items-center justify-between py-1">
                            <span className="text-slate-800 dark:text-[#C9D1D9] font-mono truncate mr-2">{c.path}</span>
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] uppercase font-bold",
                              c.operation === 'create' ? 'bg-emerald-500/20 text-emerald-600 dark:text-[#7EE787]' :
                              c.operation === 'delete' ? 'bg-red-500/20 text-red-500' :
                              'bg-amber-500/20 text-amber-600 dark:text-[#FFA657]'
                            )}>
                              {c.operation}
                            </span>
                          </div>
                        ))}
                        <div className="mt-3 flex gap-2">
                          {msg.changeSet.status === 'pending' || msg.changeSet.status === 'pending_review' || msg.changeSet.status === 'stale' ? (
                            <button 
                              type="button"
                              className="flex-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-black dark:hover:bg-slate-200 rounded-md transition-colors font-medium cursor-pointer shadow-xs flex items-center justify-center gap-1.5 text-xs"
                              onClick={() => setReviewingChangeSet(msg.changeSet!)}
                            >
                              <span>Review Diffs ({msg.changeSet.changes.length})</span>
                            </button>
                          ) : (
                            <div className={cn(
                              "flex-1 py-1.5 text-center rounded-md font-medium text-xs capitalize",
                              msg.changeSet.status === 'applied' ? "bg-emerald-500/20 text-emerald-600 dark:text-[#7EE787]" : 
                              msg.changeSet.status === 'partially_applied' ? "bg-purple-500/20 text-purple-600 dark:text-purple-400" :
                              "bg-red-500/20 text-red-500"
                            )}>
                              Changes {msg.changeSet.status.replace('_', ' ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* CHAT COMPOSER WITH CODEBASE CONTEXT INTEGRATION */}
      <div className="p-3.5 border-t border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#0A0A0A] shrink-0">
        <div className="relative bg-slate-50 dark:bg-[#111111] rounded-2xl border border-slate-200/90 dark:border-[#2A2A2A] focus-within:border-slate-400 dark:focus-within:border-white/30 shadow-xs flex flex-col">
          
          {/* Upload error banner */}
          {uploadError && (
            <div className="mx-3 mt-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
              <span>{uploadError}</span>
              <button onClick={() => setUploadError(null)} className="p-0.5 hover:opacity-80">
                <X size={12} />
              </button>
            </div>
          )}

          {/* Obsolete model warning banner */}
          {['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.5-flash', 'gemini-2.5-pro'].includes(selectedModel) && (
            <div className="mx-3 mt-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <AlertCircle size={14} className="shrink-0 text-amber-500" />
                <span className="truncate">
                  Model <strong>{selectedModel}</strong> has been retired by Google.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedModel('gemini-3.1-flash-lite')}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-[11px] font-semibold transition-colors cursor-pointer shrink-0 shadow-xs flex items-center gap-1"
              >
                <Sparkles size={11} />
                <span>Switch to 3.1 Flash Lite</span>
              </button>
            </div>
          )}

          {/* Attached Context Badge Chips */}
          {aiContext.length > 0 && (
            <div className="p-2.5 pb-0 flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-[#7D8590] mr-1 flex items-center gap-1">
                <Layers size={11} />
                <span>Context:</span>
              </span>

              {aiContext.map(ctx => {
                const sizeKB = ctx.sizeBytes ? `${(ctx.sizeBytes / 1024).toFixed(1)}k` : '';
                return (
                  <div 
                    key={ctx.id} 
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-[#C9D1D9] shadow-2xs group"
                  >
                    {ctx.type === 'selection' ? (
                      <Code size={12} className="text-amber-500 shrink-0" />
                    ) : ctx.type === 'attachment' ? (
                      <Upload size={12} className="text-emerald-500 shrink-0" />
                    ) : ctx.type === 'search_match' ? (
                      <Search size={12} className="text-blue-500 shrink-0" />
                    ) : (
                      <FileIcon size={12} className="text-purple-500 shrink-0" />
                    )}

                    <span className="truncate max-w-[150px] font-mono text-[11px] font-medium">
                      {ctx.name.split('/').pop()}
                    </span>

                    {sizeKB && (
                      <span className="text-[9px] text-slate-400 dark:text-[#6E7681] font-mono">
                        {sizeKB}
                      </span>
                    )}

                    <button 
                      type="button"
                      onClick={() => removeAiContext(ctx.id)} 
                      className="text-slate-400 hover:text-red-500 cursor-pointer p-0.5 rounded transition-colors"
                      title="Remove context"
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={clearAiContext}
                className="text-[10px] text-slate-400 hover:text-red-500 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                title="Clear all attached context"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Multiline auto-resizing textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={
              mode === 'ask' 
                ? "Ask about your code (Enter to send, Shift+Enter for newline)..." 
                : "Describe changes to make..."
            }
            className="w-full bg-transparent p-3 text-xs leading-relaxed text-slate-900 dark:text-[#E6EDF3] placeholder:text-slate-400 dark:placeholder:text-[#6E7681] outline-none resize-none min-h-[44px] max-h-[180px]"
          />

          {/* Composer Controls Bar */}
          <div className="flex items-center justify-between p-2 pt-0">
            <div className="flex items-center gap-1.5 relative">
              
              {/* Context Attachment Menu Button */}
              <div className="relative">
                <button 
                  type="button"
                  onClick={() => setIsContextMenuOpen(!isContextMenuOpen)}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs cursor-pointer",
                    isSelectionAvailable
                      ? "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-medium"
                      : aiContext.length > 0
                      ? "text-purple-600 dark:text-purple-400 hover:bg-slate-200/60 dark:hover:bg-white/5"
                      : "text-slate-500 dark:text-[#8B949E] hover:text-slate-800 dark:hover:text-[#C9D1D9] hover:bg-slate-100 dark:hover:bg-white/5"
                  )}
                  title="Attach codebase context, open file, selection, or upload"
                >
                  <Paperclip size={13} />
                  <span className="hidden sm:inline text-[11px]">
                    {isSelectionAvailable ? "Attach Selection" : "Attach Context"}
                  </span>
                  <ChevronUp size={11} className={cn("transition-transform", isContextMenuOpen ? "rotate-180" : "")} />
                </button>

                {/* Context Dropdown Popover */}
                {isContextMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-30" 
                      onClick={() => setIsContextMenuOpen(false)} 
                    />
                    <div className="absolute left-0 bottom-full mb-2 w-56 bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#2C2C2C] rounded-xl shadow-2xl p-1.5 z-40 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100 text-xs">
                      
                      {/* 1. Attach Active File */}
                      <button
                        type="button"
                        onClick={attachActiveFile}
                        disabled={!activeFileId || isCurrentFileAttached}
                        className={cn(
                          "w-full px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                          "hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9]"
                        )}
                      >
                        <FileIcon size={13} className="text-purple-500 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">Attach Open File</span>
                          <span className="text-[10px] text-slate-400 dark:text-[#7D8590] truncate">
                            {activeFileObj?.name || 'No file open'}
                          </span>
                        </div>
                      </button>

                      {/* 2. Attach Editor Selection */}
                      <button
                        type="button"
                        onClick={attachEditorSelection}
                        disabled={!isSelectionAvailable}
                        className={cn(
                          "w-full px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                          isSelectionAvailable 
                            ? "hover:bg-purple-50 dark:hover:bg-purple-500/10 text-purple-700 dark:text-purple-300 font-medium"
                            : "hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9]"
                        )}
                      >
                        <Code size={13} className="text-amber-500 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">Attach Editor Selection</span>
                          <span className="text-[10px] text-slate-400 dark:text-[#7D8590] truncate">
                            {isSelectionAvailable ? `Lines ${activeSelection.startLine}-${activeSelection.endLine}` : 'No active selection in editor'}
                          </span>
                        </div>
                      </button>

                      <div className="h-px bg-slate-100 dark:bg-white/5 my-1" />

                      {/* 3. Browse Project Files */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsContextMenuOpen(false);
                          setIsProjectPickerOpen(true);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-left hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] transition-colors cursor-pointer"
                      >
                        <FileCode size={13} className="text-blue-500 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium">Browse Project Files...</span>
                          <span className="text-[10px] text-slate-400 dark:text-[#7D8590]">Select any project file</span>
                        </div>
                      </button>

                      {/* 4. Search Code Excerpts */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsContextMenuOpen(false);
                          setIsCodebaseSearchOpen(true);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-left hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] transition-colors cursor-pointer"
                      >
                        <Search size={13} className="text-purple-500 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium">Search Code Excerpts...</span>
                          <span className="text-[10px] text-slate-400 dark:text-[#7D8590]">Find by keyword or symbol</span>
                        </div>
                      </button>

                      <div className="h-px bg-slate-100 dark:bg-white/5 my-1" />

                      {/* 5. Upload Local Text File */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsContextMenuOpen(false);
                          fileInputRef.current?.click();
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-left hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-[#C9D1D9] transition-colors cursor-pointer"
                      >
                        <Upload size={13} className="text-emerald-500 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium">Upload Local File...</span>
                          <span className="text-[10px] text-slate-400 dark:text-[#7D8590]">Source code, JSON, Markdown (≤120KB)</span>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Model Selector Dropdown */}
              <ModelSelector 
                activeModelId={selectedModel} 
                onModelChange={setSelectedModel} 
                agentId={selectedAgent}
                placement="top"
                variant="composer"
              />
            </div>

            {/* Send / Stop Button */}
            {isLoading ? (
              <button 
                type="button"
                onClick={handleStop}
                className="px-2.5 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-600 dark:text-red-400 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer border border-red-500/20"
                title="Stop generation (Esc)"
              >
                <Square size={12} fill="currentColor" />
                <span>Stop</span>
              </button>
            ) : (
              <button 
                id="ai-panel-submit-btn"
                type="button"
                onClick={() => handleSubmit()}
                disabled={!input.trim()}
                className="p-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-black rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs"
                title="Send message (Enter)"
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Review Changes Diff Modal */}
      {reviewingChangeSet && (
        <DiffReviewModal 
          changeSet={reviewingChangeSet} 
          onClose={() => setReviewingChangeSet(null)} 
        />
      )}
      
      {/* Agent Manager Modal */}
      {isAgentManagerOpen && (
        <AgentManagerModal onClose={() => setIsAgentManagerOpen(false)} />
      )}

      {/* Project File Picker Modal */}
      <ProjectFilePickerModal
        isOpen={isProjectPickerOpen}
        onClose={() => setIsProjectPickerOpen(false)}
        onSelectFile={handleSelectProjectFile}
        alreadyAttachedPaths={aiContext.map(c => c.path || c.name)}
      />

      {/* Codebase Search Modal */}
      <CodebaseSearchModal
        isOpen={isCodebaseSearchOpen}
        onClose={() => setIsCodebaseSearchOpen(false)}
        onSelectMatch={handleSelectSearchMatch}
        alreadyAttachedKeys={aiContext.filter(c => c.type === 'search_match').map(c => `${c.path}:${c.startLine}-${c.endLine}`)}
      />
    </div>
  );
}
