import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  ArrowUp, Check, CheckCheck, ChevronDown, ChevronRight, Copy, FileCode2, FilePlus2, FileX2, Files, History,
  Loader2, Play, RotateCcw, Square, Terminal as TerminalIcon, Trash2, X, Download, Save,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { useIDEStore } from '../../store';
import { useAIStore } from '../../store/aiStore';
import { useAuthStore } from '../../store/authStore';
import { ConsentService } from '../../services/consentService';
import { ConversationService } from '../../services/conversationService';
import { runPythonCode } from '../../services/pythonRunner';
import { flattenFileTree } from '../../lib/utils';
import type { AIContextItem, ChangeSet, FileNode } from '../../types';
import { ModelSelector } from '../ai/ModelSelector';
import { AgentSelector } from '../ai/AgentSelector';
import { AGENT_SYSTEM_PROMPT, diffRows, diffStats, parseSegments, type Segment } from './chatParsing';
import { filesToMap, exportZip, parseStoredFiles } from './projectIO';
import { sandboxFs } from './workspaceFs';
import { isShellCommand, runShell } from './sandbox';
import { useCloudSession } from './cloudSessionStore';
import { AttachMenu, SlashMenu, slashMatches } from './ComposerExtras';
import { CloudSessionBanner } from './CloudSession';

type ChangeStatus = 'pending' | 'accepted' | 'rejected';

interface ThreadMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: number;
  /** files before this turn ran (user messages only) — used for "Restore checkpoint" */
  checkpoint?: FileNode[];
  /** model messages: path -> status, plus the file content before the change was accepted */
  changes?: Record<string, { status: ChangeStatus; before?: string | null }>;
  changeSet?: ChangeSet;
  agentEvents?: Array<{ type?: string; action?: string; message?: string; tool?: string }>;
  error?: string;
  cancelled?: boolean;
}

const MAX_CHECKPOINTS = 12;
const storageKey = (id: string, ownerId: string) => `float_chat_${ownerId}_${id}`;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function loadThread(id: string, ownerId: string): ThreadMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(id, ownerId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveThread(id: string, ownerId: string, messages: ThreadMessage[]) {
  // keep only the newest checkpoints to stay within localStorage limits
  let kept = 0;
  const trimmed = [...messages].reverse().map((m) => {
    if (!m.checkpoint) return m;
    kept++;
    return kept > MAX_CHECKPOINTS ? { ...m, checkpoint: undefined } : m;
  }).reverse();
  try {
    localStorage.setItem(storageKey(id, ownerId), JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Chat history too large to store locally', e);
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persistProjectSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    useIDEStore.getState().saveProject().catch((e) => console.warn('saveProject failed', e));
  }, 800);
}

function fileContent(path: string): string | undefined {
  return filesToMap(useIDEStore.getState().files)[path];
}

function isSafeWorkspacePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return !!normalized && !normalized.startsWith('/') && !/^[a-z]:/i.test(normalized) &&
    !normalized.includes('\0') && !normalized.split('/').some((part) => part === '..') &&
    !/(^|\/)\.env(?:\/|\.|$)|(^|\/)(id_rsa|id_ed25519)(?:\.|$)|\.(pem|key|p12|pfx|keystore)$/i.test(normalized);
}

/* ----------------------------------------------------------------------------------------- */

export function ChatThread({ chatId }: { chatId: string }) {
  const ownerId = useAuthStore((s) => s.user?.uid);
  const messagesOwnerId = useRef(ownerId);
  const messagesBelongToPreviousAccount = messagesOwnerId.current !== ownerId;
  const projectId = useIDEStore((s) => s.projectId);
  const projectName = useIDEStore((s) => s.projectName);
  const files = useIDEStore((s) => s.files);
  const { selectedModel, setSelectedModel, selectedAgent, setSelectedAgent, agents } = useAIStore();
  const [loadingProject, setLoadingProject] = useState(projectId !== chatId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>(() => ownerId ? loadThread(chatId, ownerId) : []);
  const [historyLoading, setHistoryLoading] = useState(() => !ownerId || loadThread(chatId, ownerId).length === 0);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [drawer, setDrawer] = useState<'files' | 'terminal' | null>(null);
  const [mention, setMention] = useState<{ query: string; index: number } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const startedRef = useRef(false);

  const paths = useMemo(() => flattenFileTree(files).filter((f) => f.type === 'file').map((f) => f.path), [files]);

  // Load the project when opening /chat/:id directly (refresh / shared link)
  useEffect(() => {
    let cancelled = false;
    abortRef.current?.abort();
    messagesOwnerId.current = ownerId;
    setLoadError(null);
    setMessages(ownerId ? loadThread(chatId, ownerId) : []);
    setHistoryLoading(!ownerId || loadThread(chatId, ownerId).length === 0);
    startedRef.current = false;
    if (!ownerId) {
      setLoadingProject(false);
      return () => { cancelled = true; };
    }
    if (useIDEStore.getState().projectId === chatId) {
      setLoadingProject(false);
      return;
    }
    setLoadingProject(true);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'projects', chatId));
        if (cancelled) return;
        if (!snap.exists()) throw new Error('This chat was not found. It may have been deleted.');
        const data = snap.data() as any;
        useIDEStore.getState().setProject(data.name || 'Untitled Project', parseStoredFiles(data.files), chatId);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || 'Could not load this chat.');
      } finally {
        if (!cancelled) setLoadingProject(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, ownerId, projectId]);

  useEffect(() => {
    if (!messagesBelongToPreviousAccount && ownerId) saveThread(chatId, ownerId, messages);
  }, [chatId, ownerId, messages, messagesBelongToPreviousAccount]);

  useEffect(() => {
    let cancelled = false;
    if (!ownerId) {
      setMessages([]);
      setHistoryLoading(false);
      return () => { cancelled = true; };
    }
    const cached = loadThread(chatId, ownerId);
    setMessages(cached);
    if (cached.length) {
      setHistoryLoading(false);
      return () => { cancelled = true; };
    }

    setHistoryLoading(true);
    void ConversationService.fetchCloudConversation(chatId)
      .then((cloudMessages) => {
        if (cancelled) return;
        if (cloudMessages?.length) {
          setMessages(cloudMessages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.timestamp || Date.now(),
            checkpoint: message.checkpoint,
            changes: message.changes,
            changeSet: message.changeSet,
            agentEvents: message.agentEvents,
            error: message.error,
            cancelled: message.cancelled,
          })));
        }
      })
      .catch((error) => console.warn('Could not restore cloud chat history:', error))
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [chatId, ownerId, projectId]);

  useEffect(() => {
    if (messagesBelongToPreviousAccount || !ownerId || historyLoading || streaming || messages.length === 0) return;
    const timer = setTimeout(() => {
      const persisted = messages.slice(-24).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.createdAt,
        changes: message.changes,
        changeSet: message.changeSet,
        agentEvents: message.agentEvents,
        error: message.error,
        cancelled: message.cancelled,
      }));
      void ConversationService.syncToCloud({
        id: chatId,
        projectId: chatId,
        title: projectName || 'Untitled Chat',
        createdAt: persisted[0]?.timestamp || Date.now(),
        updatedAt: Date.now(),
        messages: persisted,
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [chatId, ownerId, projectName, messages, streaming, historyLoading, messagesBelongToPreviousAccount]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: streaming ? 'auto' : 'smooth' });
  }, [messages, streaming]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 44), 220)}px`;
    }
  }, [input]);

  const send = useCallback(
    async (text: string, opts: { retryOf?: string } = {}) => {
      const prompt = text.trim();
      if (!prompt || streaming || historyLoading) return;
      const user = auth.currentUser;
      const activeAgent = agents.find((agent) => agent.id === selectedAgent);
      const useToolAgent = activeAgent?.mode === 'agent' || activeAgent?.mode === 'edit';
      const history = opts.retryOf ? messages.slice(0, messages.findIndex((m) => m.id === opts.retryOf)) : messages;
      const userMsg: ThreadMessage = {
        id: uid(),
        role: 'user',
        content: prompt,
        createdAt: Date.now(),
        checkpoint: JSON.parse(JSON.stringify(useIDEStore.getState().files)),
      };
      const modelMsg: ThreadMessage = { id: uid(), role: 'model', content: '', createdAt: Date.now(), changes: {} };
      const base = opts.retryOf ? history.slice(0, -1) : history;
      const userTurn = opts.retryOf ? history[history.length - 1] ?? userMsg : userMsg;
      setMessages([...base, userTurn, modelMsg]);
      setInput('');
      setStreaming(true);

      const patch = (p: Partial<ThreadMessage>) => setMessages((prev) => prev.map((m) => (m.id === modelMsg.id ? { ...m, ...p } : m)));

      try {
        if (!user) throw new Error('Please sign in to chat with FLOAT.');
        const token = await user.getIdToken();
        const map = filesToMap(useIDEStore.getState().files);
        const mentioned = new Set(Array.from(prompt.matchAll(/@([\w./-]+)/g)).map((m) => m[1]).filter((p) => p in map));
        const contextItems: AIContextItem[] = Object.entries(map).map(([path, content]) => ({
          id: path,
          type: mentioned.has(path) ? 'attachment' : 'file',
          name: path,
          path,
          content,
        }));
        const requestMessages = [
          ...base.filter((m) => m.content && !m.error).map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
          { role: 'user', parts: [{ text: prompt }] },
        ];
        abortRef.current = new AbortController();
        const res = await fetch(useToolAgent ? '/api/ai/agent' : '/api/ai/chat', {
          method: 'POST',
          signal: abortRef.current.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Float-Data-Sharing': ConsentService.isSharingAllowed() ? 'true' : 'false',
          },
          body: JSON.stringify(useToolAgent ? {
            prompt: `${prompt}${contextItems.filter((item) => item.type === 'attachment').map((item) => `\n\n--- ${item.path} ---\n${item.content}`).join('')}`,
            conversationHistory: base.filter((message) => message.content && !message.error)
              .slice(-12)
              .map((message) => ({ role: message.role, content: message.content })),
            virtualFiles: flattenFileTree(useIDEStore.getState().files),
            model: selectedModel,
            agentId: selectedAgent,
            systemInstruction: activeAgent?.systemInstructions,
            projectName: useIDEStore.getState().projectName || 'Project Workspace',
            projectId: chatId,
          } : {
            messages: requestMessages,
            model: selectedModel,
            reasoningEffort: useAIStore.getState().selectedEffort,
            systemInstruction: activeAgent?.systemInstructions || AGENT_SYSTEM_PROMPT,
            contextItems,
            projectName: useIDEStore.getState().projectName || 'Project Workspace',
            projectId: chatId,
            stream: true,
          }),
        });
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let full = '';
        const agentEvents: NonNullable<ThreadMessage['agentEvents']> = [];
        let finalChangeSet: ChangeSet | undefined;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() || '';
          for (const evt of events) {
            const line = evt.split(/\r?\n/).find((l) => l.startsWith('data:'));
            if (!line) continue;
            try {
              const data = JSON.parse(line.slice(5).trim());
              if (useToolAgent && data.type === 'event') {
                const event = data.data || {};
                agentEvents.push(event);
                patch({ agentEvents: [...agentEvents] });
                if (event.type === 'failed') throw new Error(event.message || 'Agent execution failed.');
              } else if (useToolAgent && data.type === 'delta') {
                full += data.data?.text || data.text || '';
                patch({ content: full, agentEvents: [...agentEvents] });
              } else if (useToolAgent && data.type === 'result') {
                finalChangeSet = data.data?.changeSet;
                // Keep code proposals structured. Re-encoding file contents as fenced
                // Markdown corrupts files that themselves contain triple backticks.
                full = data.data?.text || full;
                patch({ content: full, changeSet: finalChangeSet, agentEvents: [...agentEvents] });
              } else if (data.type === 'delta' && data.text) {
                full += data.text;
                patch({ content: full });
              } else if (data.type === 'done') {
                if (data.text && data.text.length >= full.length) full = data.text;
                patch({ content: full, cancelled: !!data.cancelled });
              } else if (data.type === 'error') {
                throw new Error(data.error || 'Generation failed');
              }
            } catch (e: any) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
        const pending: Record<string, { status: ChangeStatus }> = {};
        for (const seg of parseSegments(full)) if (seg.kind !== 'text') pending[seg.path] = { status: 'pending' };
        patch({ content: full || '(No response)', changes: pending, changeSet: finalChangeSet, agentEvents: agentEvents.length ? agentEvents : undefined });
      } catch (e: any) {
        if (e?.name === 'AbortError') patch({ cancelled: true });
        else patch({ error: e?.message || String(e) });
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [messages, streaming, historyLoading, selectedModel, selectedAgent, agents, chatId],
  );

  // Auto-send the prompt typed on the home screen
  useEffect(() => {
    if (loadingProject || historyLoading || startedRef.current) return;
    const initial = useIDEStore.getState().initialPrompt;
    if (initial && useIDEStore.getState().projectId === chatId) {
      startedRef.current = true;
      useIDEStore.getState().setInitialPrompt(null);
      void send(initial);
    }
  }, [loadingProject, historyLoading, chatId, send]);

  /* ---------------------------- change review ---------------------------- */

  const setChange = (msgId: string, path: string, status: ChangeStatus, before?: string | null) =>
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, changes: { ...m.changes, [path]: { status, before: before !== undefined ? before : m.changes?.[path]?.before } } } : m)),
    );

  const applySegment = (msgId: string, seg: Segment) => {
    if (seg.kind === 'text') return;
    if (!isSafeWorkspacePath(seg.path)) {
      setMessages((prev) => prev.map((message) => message.id === msgId
        ? { ...message, error: `Refused an unsafe workspace path: ${seg.path}` }
        : message));
      return;
    }
    const fs = sandboxFs();
    const before = fileContent(seg.path);
    const message = messages.find((item) => item.id === msgId);
    const proposalChange = message?.changeSet?.changes.find((change) => change.path === seg.path);
    if (proposalChange?.operation === 'create' && before !== undefined) {
      setMessages((prev) => prev.map((item) => item.id === msgId
        ? { ...item, error: `Cannot create ${seg.path}: a file with that path already exists.` }
        : item));
      return;
    }
    if ((proposalChange?.operation === 'modify' || proposalChange?.operation === 'delete') &&
        proposalChange.originalContent !== undefined && before !== proposalChange.originalContent) {
      setMessages((prev) => prev.map((item) => item.id === msgId
        ? { ...item, error: `Cannot apply ${seg.path}: it changed after this proposal was generated. Ask the agent to review the latest file.` }
        : item));
      return;
    }
    if (seg.kind === 'delete') fs.remove(seg.path);
    else fs.write(seg.path, seg.content);
    setChange(msgId, seg.path, 'accepted', before === undefined ? null : before);
    persistProjectSoon();
  };

  const undoSegment = (msgId: string, seg: Segment, before?: string | null) => {
    if (seg.kind === 'text') return;
    const fs = sandboxFs();
    if (before === null || before === undefined) fs.remove(seg.path);
    else fs.write(seg.path, before);
    setChange(msgId, seg.path, 'pending');
    persistProjectSoon();
  };

  const restoreCheckpoint = (msg: ThreadMessage) => {
    if (!msg.checkpoint) return;
    if (!confirm('Restore all files to how they were before this message? Later chat messages are kept.')) return;
    const s = useIDEStore.getState();
    s.setProject(s.projectName || 'Project', JSON.parse(JSON.stringify(msg.checkpoint)), chatId);
    setMessages((prev) =>
      prev.map((m) =>
        m.createdAt > msg.createdAt && m.changes
          ? { ...m, changes: Object.fromEntries(Object.entries(m.changes).map(([p, c]) => [p, { ...c, status: 'pending' as ChangeStatus }])) }
          : m,
      ),
    );
    persistProjectSoon();
  };

  /* ---------------------------- composer keys ---------------------------- */

  const mentionItems = mention ? paths.filter((p) => p.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 8) : [];
  const slashItems = slashMatches(input);

  const onInputChange = (value: string, caret: number) => {
    setInput(value);
    setSlashIndex(0);
    const upto = value.slice(0, caret);
    const m = upto.match(/(?:^|\s)@([\w./-]*)$/);
    setMention(m ? { query: m[1], index: 0 } : null);
  };

  const pickMention = (path: string) => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? input.length;
    const upto = input.slice(0, caret).replace(/@([\w./-]*)$/, `@${path} `);
    setInput(upto + input.slice(caret));
    setMention(null);
    requestAnimationFrame(() => el?.focus());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const list = mention && mentionItems.length ? mentionItems : slashItems.length ? slashItems.map((s) => s.cmd) : null;
    if (list) {
      const idx = mention && mentionItems.length ? mention.index : slashIndex;
      const setIdx = (n: number) => (mention && mentionItems.length ? setMention({ ...mention, index: n }) : setSlashIndex(n));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIdx((idx + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (mention && mentionItems.length) pickMention(mentionItems[Math.min(idx, mentionItems.length - 1)]);
        else setInput(slashItems[Math.min(idx, slashItems.length - 1)].template);
        return;
      }
      if (e.key === 'Escape') {
        setMention(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-slate-600 dark:text-[#8B949E]">{loadError}</p>
        <button
          onClick={() => {
            window.history.pushState({}, '', '/');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black text-xs font-semibold cursor-pointer"
        >
          Back to home
        </button>
      </div>
    );
  }

  if (loadingProject) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 size={14} className="animate-spin" /> Loading chat…
      </div>
    );
  }

  const lastUserId = [...messages].reverse().find((m) => m.role === 'user')?.id;

  return (
    <div className="flex-1 flex min-h-0 h-full">
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* header */}
        <div className="h-14 shrink-0 border-b border-slate-200 dark:border-[#2A2A2A] flex items-center gap-3 px-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{projectName || 'Untitled chat'}</div>
            <div className="text-[11px] text-slate-400 dark:text-[#6E7681]">{paths.length} file{paths.length === 1 ? '' : 's'} in workspace</div>
          </div>
          <HeaderButton icon={Files} label="Files" active={drawer === 'files'} onClick={() => setDrawer(drawer === 'files' ? null : 'files')} />
          <HeaderButton icon={TerminalIcon} label="Terminal" active={drawer === 'terminal'} onClick={() => setDrawer(drawer === 'terminal' ? null : 'terminal')} />
          <HeaderButton icon={Download} label="Export" onClick={() => void exportZip(projectName || 'project', useIDEStore.getState().files)} />
        </div>

        {/* messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-5">
            {historyLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-400 dark:text-[#8B949E]">
                <Loader2 size={13} className="animate-spin" /> Restoring conversation…
              </div>
            ) : messages.length === 0 && (
              <div className="text-center text-sm text-slate-500 dark:text-[#8B949E] py-16">
                Ask FLOAT to build, fix bugs or explain code. Mention files with <code className="font-mono">@</code>, use <code className="font-mono">/</code> for commands.
              </div>
            )}
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="group flex flex-col items-end gap-1">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-slate-100 dark:bg-[#1C1C1C] px-4 py-2.5 text-sm text-slate-900 dark:text-white whitespace-pre-wrap break-words">
                    {m.content}
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {m.checkpoint && (
                      <button onClick={() => restoreCheckpoint(m)} className="text-[11px] text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 cursor-pointer">
                        <History size={11} /> Restore checkpoint
                      </button>
                    )}
                    {m.id === lastUserId && !streaming && (
                      <button onClick={() => void send(m.content, { retryOf: messages[messages.length - 1]?.id })} className="text-[11px] text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 cursor-pointer">
                        <RotateCcw size={11} /> Retry
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <AssistantMessage
                  key={m.id}
                  msg={m}
                  streaming={streaming && m.id === messages[messages.length - 1]?.id}
                  onAccept={(seg) => applySegment(m.id, seg)}
                  onReject={(seg) => seg.kind !== 'text' && setChange(m.id, seg.path, 'rejected')}
                  onUndo={(seg) => undoSegment(m.id, seg, m.changes?.[seg.kind === 'text' ? '' : seg.path]?.before)}
                />
              ),
            )}
          </div>
        </div>

        {/* composer */}
        <div className="shrink-0 px-4 pb-4">
          <div className="max-w-3xl mx-auto">
            <CloudSessionBanner />
            <div className="relative bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 rounded-b-2xl shadow-lg focus-within:border-slate-400 dark:focus-within:border-white/30">
              <SlashMenu prompt={input} index={Math.min(slashIndex, Math.max(0, slashItems.length - 1))} onPick={(t) => setInput(t)} />
              {mention && mentionItems.length > 0 && (
                <div className="absolute left-3 right-3 bottom-full mb-2 z-40 rounded-xl border border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] p-1 shadow-2xl">
                  {mentionItems.map((p, i) => (
                    <button
                      key={p}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickMention(p);
                      }}
                      className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-mono cursor-pointer ${i === mention.index ? 'bg-slate-100 dark:bg-white/10' : ''}`}
                    >
                      <FileCode2 size={12} className="text-slate-400" /> {p}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => onInputChange(e.target.value, e.target.selectionStart)}
                onKeyDown={onKeyDown}
                disabled={historyLoading}
                placeholder={historyLoading ? 'Restoring conversation…' : 'Ask FLOAT to build, fix bugs, explore... (@ to mention files)'}
                rows={1}
                className="w-full bg-transparent px-4 pt-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#6E7681] focus:outline-none resize-none"
              />
              <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
                <div className="flex items-center gap-1.5">
                  <AttachMenu
                    onAttach={(added) => {
                      const fs = sandboxFs();
                      for (const [p, c] of Object.entries(added)) fs.write(p, c);
                      persistProjectSoon();
                      setInput((v) => `${v}${v && !v.endsWith(' ') ? ' ' : ''}${Object.keys(added).slice(0, 3).map((p) => `@${p}`).join(' ')} `);
                    }}
                  />
                  <AgentSelector
                    activeAgentId={selectedAgent}
                    onAgentChange={(id) => {
                      setSelectedAgent(id);
                      const agent = agents.find((item) => item.id === id);
                      if (agent?.defaultModel) setSelectedModel(agent.defaultModel);
                    }}
                    onAgentManagerOpen={() => document.dispatchEvent(new Event('open-agent-manager'))}
                  />
                  <ModelSelector activeModelId={selectedModel} onModelChange={setSelectedModel} placement="top" variant="composer" />
                </div>
                {streaming ? (
                  <button onClick={() => abortRef.current?.abort()} aria-label="Stop generating" className="w-8 h-8 rounded-full bg-slate-900 dark:bg-white text-white dark:text-black flex items-center justify-center cursor-pointer">
                    <Square size={12} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={() => void send(input)}
                    disabled={!input.trim() || historyLoading}
                    aria-label="Send"
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-900 text-white dark:bg-white dark:text-black disabled:bg-slate-100 disabled:text-slate-300 dark:disabled:bg-white/5 dark:disabled:text-[#6E7681] cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ArrowUp size={16} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {drawer && (
        <aside className="w-[min(440px,45vw)] shrink-0 border-l border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#0D0D0D] flex flex-col min-h-0">
          <div className="h-10 shrink-0 flex items-center justify-between px-3 border-b border-slate-200 dark:border-[#2A2A2A]">
            <span className="text-xs font-semibold text-slate-700 dark:text-[#C9D1D9]">{drawer === 'files' ? 'Workspace files' : 'Terminal'}</span>
            <button onClick={() => setDrawer(null)} aria-label="Close panel" className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
              <X size={13} />
            </button>
          </div>
          {drawer === 'files' ? <FilesPanel paths={paths} /> : <MiniTerminal />}
        </aside>
      )}
    </div>
  );
}

function HeaderButton({ icon: Icon, label, onClick, active }: { icon: any; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer ${
        active ? 'bg-slate-200/80 dark:bg-[#242424] text-slate-900 dark:text-white' : 'text-slate-600 dark:text-[#A0A0A0] hover:bg-slate-100 dark:hover:bg-[#1C1C1C]'
      }`}
    >
      <Icon size={13} /> <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/* ----------------------------------------------------------------------------------------- */

function AssistantMessage({
  msg, streaming, onAccept, onReject, onUndo,
}: {
  msg: ThreadMessage;
  streaming: boolean;
  onAccept: (seg: Segment) => void;
  onReject: (seg: Segment) => void;
  onUndo: (seg: Segment) => void;
}) {
  const segments = useMemo(() => {
    if (!msg.changeSet?.changes.length) return parseSegments(msg.content);
    const prose = msg.content.trim()
      ? [{ kind: 'text' as const, text: msg.content }]
      : [];
    const proposed = msg.changeSet.changes.map((change): Segment => change.operation === 'delete'
      ? { kind: 'delete', path: change.path }
      : { kind: 'file', path: change.path, lang: change.path.split('.').pop() || '', content: change.proposedContent ?? '', complete: true });
    return [...prose, ...proposed];
  }, [msg.content, msg.changeSet]);
  const edits = segments.filter((s) => s.kind !== 'text') as Exclude<Segment, { kind: 'text' }>[];
  const pending = edits.filter((s) => (msg.changes?.[s.path]?.status ?? 'pending') === 'pending' && (s.kind === 'delete' || s.complete));

  return (
    <div className="flex flex-col gap-2.5">
      {!!msg.agentEvents?.length && (
        <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] px-3 py-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-[#8B949E]">
            {streaming ? <Loader2 size={11} className="animate-spin text-blue-500" /> : <Check size={11} className="text-emerald-500" />}
            Agent activity · {msg.agentEvents.length} step{msg.agentEvents.length === 1 ? '' : 's'}
          </div>
          <div className="flex flex-col gap-1">
            {msg.agentEvents.slice(-4).map((event, index) => (
              <div key={`${index}-${event.message}`} className="truncate text-[11px] text-slate-500 dark:text-[#8B949E]">
                {event.message || event.action || event.type || 'Working…'}
              </div>
            ))}
          </div>
        </div>
      )}
      {segments.length === 0 && streaming && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 size={12} className="animate-spin" /> Thinking…
        </div>
      )}
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <div key={i} className="prose prose-sm dark:prose-invert max-w-none prose-pre:p-0 prose-pre:bg-transparent prose-code:before:content-none prose-code:after:content-none text-slate-800 dark:text-[#D6DDE4]">
            <ReactMarkdown components={{ pre: CodeBlock as any }}>{seg.text}</ReactMarkdown>
          </div>
        ) : (
          <FileChangeCard
            key={`${seg.path}-${i}`}
            seg={seg}
            status={msg.changes?.[seg.path]?.status ?? 'pending'}
            streaming={streaming}
            onAccept={() => onAccept(seg)}
            onReject={() => onReject(seg)}
            onUndo={() => onUndo(seg)}
          />
        ),
      )}
      {!streaming && pending.length > 1 && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 text-xs">
          <span className="flex-1 text-slate-600 dark:text-[#8B949E]">{pending.length} file changes waiting for review</span>
          <button onClick={() => pending.forEach(onReject)} className="px-2.5 py-1 rounded-md text-slate-600 dark:text-[#C9D1D9] hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">Reject all</button>
          <button onClick={() => pending.forEach(onAccept)} className="px-2.5 py-1 rounded-md bg-slate-900 dark:bg-white text-white dark:text-black font-semibold flex items-center gap-1 cursor-pointer">
            <CheckCheck size={12} /> Accept all
          </button>
        </div>
      )}
      {msg.error && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">{msg.error}</div>
      )}
      {msg.cancelled && <div className="text-[11px] text-slate-400">Stopped.</div>}
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = extractText(children);
  return (
    <div className="relative group my-2">
      <button
        onClick={() => {
          void navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="absolute right-2 top-2 p-1 rounded bg-white/10 text-slate-300 opacity-0 group-hover:opacity-100 cursor-pointer"
        aria-label="Copy code"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      <pre className="overflow-x-auto rounded-xl bg-[#0D1117] text-[#E6EDF3] p-3.5 text-xs leading-relaxed font-mono">{children}</pre>
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) return extractText((node.props as any).children);
  return '';
}

function FileChangeCard({
  seg, status, streaming, onAccept, onReject, onUndo,
}: {
  seg: Exclude<Segment, { kind: 'text' }>;
  status: ChangeStatus;
  streaming: boolean;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = fileContent(seg.path);
  const isDelete = seg.kind === 'delete';
  const writing = seg.kind === 'file' && !seg.complete;
  const isNew = !isDelete && current === undefined && status !== 'accepted';
  const stats = useMemo(() => (seg.kind === 'file' && seg.complete ? diffStats(status === 'accepted' ? undefined : current, seg.content) : null), [seg, current, status]);
  const rows = useMemo(() => (open && seg.kind === 'file' ? diffRows(current, seg.content) : []), [open, seg, current]);
  const Icon = isDelete ? FileX2 : isNew ? FilePlus2 : FileCode2;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer" disabled={writing}>
          {open ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
          <Icon size={14} className={isDelete ? 'text-rose-500' : isNew ? 'text-emerald-500' : 'text-blue-500'} />
          <span className="font-mono text-xs text-slate-900 dark:text-white truncate">{seg.path}</span>
          {writing && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <Loader2 size={11} className="animate-spin" /> writing…
            </span>
          )}
          {stats && status !== 'accepted' && (
            <span className="text-[11px] font-mono">
              <span className="text-emerald-600">+{stats.added}</span> <span className="text-rose-500">-{stats.removed}</span>
            </span>
          )}
          {isDelete && <span className="text-[11px] text-rose-500">delete</span>}
        </button>
        {!writing && !streaming && status === 'pending' && (
          <>
            <button onClick={onReject} className="px-2 py-1 rounded-md text-[11px] text-slate-600 dark:text-[#C9D1D9] hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">Reject</button>
            <button onClick={onAccept} className="px-2 py-1 rounded-md text-[11px] bg-slate-900 dark:bg-white text-white dark:text-black font-semibold flex items-center gap-1 cursor-pointer">
              <Check size={11} /> Accept
            </button>
          </>
        )}
        {status === 'accepted' && (
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-600">
            <Check size={11} /> Applied
            <button onClick={onUndo} className="ml-1 text-slate-400 hover:text-slate-800 dark:hover:text-white underline cursor-pointer">Undo</button>
          </span>
        )}
        {status === 'rejected' && (
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            Rejected
            <button onClick={onAccept} className="underline hover:text-slate-800 dark:hover:text-white cursor-pointer">Apply anyway</button>
          </span>
        )}
      </div>
      {open && seg.kind === 'file' && (
        <div className="border-t border-slate-100 dark:border-white/5 max-h-80 overflow-auto bg-slate-50 dark:bg-[#0A0A0A] font-mono text-[11px] leading-5">
          {rows.map((r, i) =>
            r.type === 'gap' ? (
              <div key={i} className="px-3 py-0.5 text-slate-400 bg-slate-100/70 dark:bg-white/5">⋯ {r.text}</div>
            ) : (
              <div
                key={i}
                className={`flex whitespace-pre ${r.type === 'add' ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : r.type === 'del' ? 'bg-rose-500/10 text-rose-800 dark:text-rose-300' : 'text-slate-600 dark:text-[#8B949E]'}`}
              >
                <span className="w-9 shrink-0 text-right pr-2 text-slate-400 select-none">{r.oldNo ?? ''}</span>
                <span className="w-9 shrink-0 text-right pr-2 text-slate-400 select-none">{r.newNo ?? ''}</span>
                <span className="w-4 shrink-0 select-none">{r.type === 'add' ? '+' : r.type === 'del' ? '-' : ' '}</span>
                <span>{r.text}</span>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------- */

function FilesPanel({ paths }: { paths: string[] }) {
  const [selected, setSelected] = useState<string | null>(paths[0] ?? null);
  const [draft, setDraft] = useState('');
  const content = selected ? fileContent(selected) ?? '' : '';
  const dirty = draft !== content;

  useEffect(() => setDraft(content), [selected, content]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="max-h-[40%] overflow-y-auto border-b border-slate-200 dark:border-[#2A2A2A] py-1">
        {paths.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No files yet.</div>}
        {paths.map((p) => (
          <div key={p} className={`group flex items-center gap-2 px-3 py-1 text-xs font-mono cursor-pointer ${selected === p ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-[#A0A0A0] hover:bg-slate-50 dark:hover:bg-white/5'}`} onClick={() => setSelected(p)}>
            <FileCode2 size={12} className="shrink-0 text-slate-400" />
            <span className="flex-1 truncate">{p}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!confirm(`Delete ${p}?`)) return;
                sandboxFs().remove(p);
                persistProjectSoon();
                if (selected === p) setSelected(null);
              }}
              className="hidden group-hover:block text-slate-400 hover:text-rose-500"
              aria-label={`Delete ${p}`}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
      {selected && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-slate-500 border-b border-slate-100 dark:border-white/5">
            <span className="font-mono truncate">{selected}</span>
            <button
              disabled={!dirty}
              onClick={() => {
                sandboxFs().write(selected, draft);
                persistProjectSoon();
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 dark:bg-white text-white dark:text-black disabled:opacity-30 cursor-pointer"
            >
              <Save size={11} /> Save
            </button>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                sandboxFs().write(selected, draft);
                persistProjectSoon();
              }
            }}
            spellCheck={false}
            className="flex-1 w-full resize-none bg-slate-50 dark:bg-[#0A0A0A] p-3 font-mono text-[11px] leading-5 text-slate-800 dark:text-[#C9D1D9] focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

function MiniTerminal() {
  const active = useCloudSession((s) => s.active);
  const openModal = useCloudSession((s) => s.openModal);
  const [lines, setLines] = useState<{ type: 'cmd' | 'out' | 'err'; text: string }[]>([]);
  const [cmd, setCmd] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView(), [lines]);

  const run = async (raw: string) => {
    const c = raw.trim();
    if (!c) return;
    setCmd('');
    setHistory((h) => [c, ...h].slice(0, 50));
    setHIdx(-1);
    if (c === 'clear') return setLines([]);
    setLines((l) => [...l, { type: 'cmd', text: c }]);
    setBusy(true);
    try {
      if (c.startsWith('python')) {
        const target = c.replace(/^python3?\s*/, '').trim();
        const map = filesToMap(useIDEStore.getState().files);
        const code = target ? map[target] : undefined;
        if (target && code === undefined) throw new Error(`python: can't open file '${target}'`);
        const res = await runPythonCode(code ?? '', Object.entries(map).map(([path, content]) => ({ path, content })));
        setLines((l) => [...l, { type: res.success ? 'out' : 'err', text: (res.success ? res.output : res.error) || '' }]);
      } else if (!active) {
        setLines((l) => [...l, { type: 'err', text: 'Shell commands need the browser worker. Enable it below to continue.' }]);
      } else if (isShellCommand(c) || c === 'help') {
        const { output, code } = await runShell(c, sandboxFs());
        if (output) setLines((l) => [...l, { type: code === 0 ? 'out' : 'err', text: output }]);
        persistProjectSoon();
      } else {
        setLines((l) => [...l, { type: 'err', text: `${c.split(' ')[0]}: command not found (type help)` }]);
      }
    } catch (e: any) {
      setLines((l) => [...l, { type: 'err', text: e?.message || String(e) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0A0A0A] text-[#C9D1D9] font-mono text-[11px]">
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <div className="text-[#6E7681]">{active ? 'Browser worker ready. Try: npm test, node index.js, ls, help. Python: python main.py' : 'Python runs in Pyodide (python main.py). Enable the browser worker for node and supported shell commands.'}</div>
        {lines.map((l, i) => (
          <div key={i} className={`whitespace-pre-wrap break-words ${l.type === 'cmd' ? 'text-white' : l.type === 'err' ? 'text-rose-400' : ''}`}>
            {l.type === 'cmd' ? `$ ${l.text}` : l.text}
          </div>
        ))}
        {busy && <Loader2 size={12} className="animate-spin text-[#6E7681]" />}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
        <span className="text-emerald-400">$</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void run(cmd);
            if (e.key === 'ArrowUp' && history.length) {
              e.preventDefault();
              const n = Math.min(hIdx + 1, history.length - 1);
              setHIdx(n);
              setCmd(history[n]);
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              const n = hIdx - 1;
              setHIdx(n);
              setCmd(n >= 0 ? history[n] : '');
            }
          }}
          disabled={busy}
          placeholder={active ? 'npm test' : 'python main.py'}
          className="flex-1 bg-transparent focus:outline-none placeholder:text-[#484F58]"
        />
        {!active && (
          <button onClick={openModal} className="flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[10px] text-white hover:bg-white/20 cursor-pointer">
            <Play size={10} /> Start session
          </button>
        )}
      </div>
    </div>
  );
}
