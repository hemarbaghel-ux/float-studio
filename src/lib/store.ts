import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type {
  Automation,
  AutomationRun,
  Chat,
  CloudSession,
  Codebase,
  FileChange,
  Message,
  ModelConfig,
  Plan,
  Settings,
  Theme,
  UserProfile,
  View,
} from './types';
import { seedChats, seedCodebase } from './seed';

export interface Toast {
  id: string;
  text: string;
  tone?: 'default' | 'success' | 'error';
}

interface State {
  view: View;
  activeChatId: string | null;
  sidebarCollapsed: boolean;
  theme: Theme;
  chats: Chat[];
  codebase: Codebase;
  automations: Automation[];
  settings: Settings;
  modelConfig: ModelConfig;
  cloud: CloudSession;
  user: UserProfile;

  // ephemeral
  toasts: Toast[];
  runningChats: string[];
  modal: null | 'upgrade' | 'desktop' | 'session' | 'settings' | 'palette' | 'shortcuts';
  composerSeed: { text: string; nonce: number } | null;

  // navigation
  setView: (v: View) => void;
  openChat: (id: string) => void;
  newChat: () => void;
  toggleSidebar: () => void;
  setTheme: (t: Theme) => void;
  setModal: (m: State['modal']) => void;
  seedComposer: (text: string) => void;

  // chats
  createChat: (title: string, extra?: Partial<Chat>) => string;
  renameChat: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
  togglePin: (id: string) => void;
  appendMessage: (chatId: string, m: Message) => void;
  updateMessage: (chatId: string, msgId: string, fn: (m: Message) => Message) => void;
  truncateAfter: (chatId: string, msgId: string) => void;
  addChange: (chatId: string, c: FileChange) => void;
  setChangeStatus: (chatId: string, changeIds: string[], status: FileChange['status']) => void;
  setRunning: (chatId: string, running: boolean) => void;

  // codebase
  writeFile: (path: string, content: string) => void;
  deleteFile: (path: string) => void;
  renamePath: (from: string, to: string) => void;
  openFile: (path: string) => void;
  closeTab: (path: string) => void;
  replaceCodebase: (cb: Codebase) => void;
  restoreSnapshot: (snap: Record<string, string>) => void;
  snapshot: () => Record<string, string>;

  // automations
  upsertAutomation: (a: Automation) => void;
  deleteAutomation: (id: string) => void;
  addRun: (automationId: string, run: AutomationRun) => void;
  updateRun: (automationId: string, runId: string, patch: Partial<AutomationRun>) => void;

  // misc
  updateSettings: (p: Partial<Settings>) => void;
  updateModelConfig: (p: Partial<ModelConfig>) => void;
  startSession: (region: string, machine: string) => void;
  stopSession: () => void;
  setPlan: (p: Plan) => void;
  countRequest: () => void;
  updateUser: (p: Partial<UserProfile>) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
}

const monthKey = () => new Date().toISOString().slice(0, 7);

const mapChat = (chats: Chat[], id: string, fn: (c: Chat) => Chat) => chats.map((c) => (c.id === id ? fn(c) : c));

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      view: 'home',
      activeChatId: null,
      sidebarCollapsed: false,
      theme: 'light',
      chats: seedChats(),
      codebase: seedCodebase(),
      automations: [],
      settings: {
        geminiKey: '',
        openaiKey: '',
        openaiBaseUrl: 'https://api.openai.com/v1',
        openaiModel: 'gpt-4.1-mini',
        githubToken: '',
        slackWebhook: '',
        customInstructions: '',
        autoRunCommands: true,
      },
      modelConfig: { model: 'auto', effort: 'high', mode: 'agent', maxMode: false },
      cloud: { active: false },
      user: { name: 'Navinya Baghel', email: 'navinyabaghel61@gmail.com', plan: 'free', usage: { month: monthKey(), requests: 0 } },

      toasts: [],
      runningChats: [],
      modal: null,
      composerSeed: null,

      setView: (view) => set({ view, ...(view !== 'chat' ? {} : {}) }),
      openChat: (id) => set({ activeChatId: id, view: 'chat' }),
      newChat: () => set({ activeChatId: null, view: 'home' }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      setModal: (modal) => set({ modal }),
      seedComposer: (text) => set({ composerSeed: { text, nonce: Date.now() } }),

      createChat: (title, extra) => {
        const id = nanoid(10);
        const t = Date.now();
        const chat: Chat = { id, title, createdAt: t, updatedAt: t, messages: [], changes: [], source: 'user', ...extra };
        set((s) => ({ chats: [chat, ...s.chats] }));
        return id;
      },
      renameChat: (id, title) => set((s) => ({ chats: mapChat(s.chats, id, (c) => ({ ...c, title })) })),
      deleteChat: (id) =>
        set((s) => ({
          chats: s.chats.filter((c) => c.id !== id),
          ...(s.activeChatId === id ? { activeChatId: null, view: 'home' as View } : {}),
        })),
      togglePin: (id) => set((s) => ({ chats: mapChat(s.chats, id, (c) => ({ ...c, pinned: !c.pinned })) })),
      appendMessage: (chatId, m) =>
        set((s) => ({ chats: mapChat(s.chats, chatId, (c) => ({ ...c, updatedAt: Date.now(), messages: [...c.messages, m] })) })),
      updateMessage: (chatId, msgId, fn) =>
        set((s) => ({
          chats: mapChat(s.chats, chatId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === msgId ? fn(m) : m)) })),
        })),
      truncateAfter: (chatId, msgId) =>
        set((s) => ({
          chats: mapChat(s.chats, chatId, (c) => {
            const idx = c.messages.findIndex((m) => m.id === msgId);
            if (idx < 0) return c;
            const kept = c.messages.slice(0, idx);
            const keptIds = new Set(kept.map((m) => m.id));
            return { ...c, messages: kept, changes: c.changes.filter((ch) => keptIds.has(ch.messageId)) };
          }),
        })),
      addChange: (chatId, ch) => set((s) => ({ chats: mapChat(s.chats, chatId, (c) => ({ ...c, changes: [...c.changes, ch] })) })),
      setChangeStatus: (chatId, ids, status) =>
        set((s) => ({
          chats: mapChat(s.chats, chatId, (c) => ({
            ...c,
            changes: c.changes.map((ch) => (ids.includes(ch.id) ? { ...ch, status } : ch)),
          })),
        })),
      setRunning: (chatId, running) =>
        set((s) => ({
          runningChats: running ? [...new Set([...s.runningChats, chatId])] : s.runningChats.filter((i) => i !== chatId),
        })),

      writeFile: (path, content) =>
        set((s) => {
          const files = { ...s.codebase.files, [path]: { content, updatedAt: Date.now() } };
          return { codebase: { ...s.codebase, files } };
        }),
      deleteFile: (path) =>
        set((s) => {
          const files = { ...s.codebase.files };
          // supports deleting folders (prefix)
          for (const p of Object.keys(files)) if (p === path || p.startsWith(path + '/')) delete files[p];
          const openTabs = s.codebase.openTabs.filter((t) => t in files);
          const activePath = s.codebase.activePath && s.codebase.activePath in files ? s.codebase.activePath : openTabs[0] ?? null;
          return { codebase: { ...s.codebase, files, openTabs, activePath } };
        }),
      renamePath: (from, to) =>
        set((s) => {
          const files: Codebase['files'] = {};
          for (const [p, f] of Object.entries(s.codebase.files)) {
            if (p === from) files[to] = f;
            else if (p.startsWith(from + '/')) files[to + p.slice(from.length)] = f;
            else files[p] = f;
          }
          const fix = (p: string) => (p === from ? to : p.startsWith(from + '/') ? to + p.slice(from.length) : p);
          return {
            codebase: {
              ...s.codebase,
              files,
              openTabs: s.codebase.openTabs.map(fix),
              activePath: s.codebase.activePath ? fix(s.codebase.activePath) : null,
            },
          };
        }),
      openFile: (path) =>
        set((s) => ({
          view: s.view,
          codebase: {
            ...s.codebase,
            openTabs: s.codebase.openTabs.includes(path) ? s.codebase.openTabs : [...s.codebase.openTabs, path],
            activePath: path,
          },
        })),
      closeTab: (path) =>
        set((s) => {
          const idx = s.codebase.openTabs.indexOf(path);
          const openTabs = s.codebase.openTabs.filter((t) => t !== path);
          const activePath =
            s.codebase.activePath === path ? openTabs[Math.min(idx, openTabs.length - 1)] ?? null : s.codebase.activePath;
          return { codebase: { ...s.codebase, openTabs, activePath } };
        }),
      replaceCodebase: (codebase) => set({ codebase }),
      restoreSnapshot: (snap) =>
        set((s) => {
          const files: Codebase['files'] = {};
          for (const [p, c] of Object.entries(snap)) files[p] = { content: c, updatedAt: Date.now() };
          const openTabs = s.codebase.openTabs.filter((t) => t in files);
          return { codebase: { ...s.codebase, files, openTabs, activePath: openTabs[0] ?? null } };
        }),
      snapshot: () => Object.fromEntries(Object.entries(get().codebase.files).map(([p, f]) => [p, f.content])),

      upsertAutomation: (a) =>
        set((s) => ({
          automations: s.automations.some((x) => x.id === a.id)
            ? s.automations.map((x) => (x.id === a.id ? a : x))
            : [a, ...s.automations],
        })),
      deleteAutomation: (id) => set((s) => ({ automations: s.automations.filter((a) => a.id !== id) })),
      addRun: (automationId, run) =>
        set((s) => ({
          automations: s.automations.map((a) =>
            a.id === automationId ? { ...a, lastRunAt: run.at, runs: [run, ...a.runs].slice(0, 25) } : a,
          ),
        })),
      updateRun: (automationId, runId, patch) =>
        set((s) => ({
          automations: s.automations.map((a) =>
            a.id === automationId ? { ...a, runs: a.runs.map((r) => (r.id === runId ? { ...r, ...patch } : r)) } : a,
          ),
        })),

      updateSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      updateModelConfig: (p) => set((s) => ({ modelConfig: { ...s.modelConfig, ...p } })),
      startSession: (region, machine) => set({ cloud: { active: true, startedAt: Date.now(), region, machine } }),
      stopSession: () => set({ cloud: { active: false } }),
      setPlan: (plan) => set((s) => ({ user: { ...s.user, plan } })),
      countRequest: () =>
        set((s) => {
          const m = monthKey();
          const requests = s.user.usage.month === m ? s.user.usage.requests + 1 : 1;
          return { user: { ...s.user, usage: { month: m, requests } } };
        }),
      updateUser: (p) => set((s) => ({ user: { ...s.user, ...p } })),
      toast: (text, tone = 'default') => {
        const id = nanoid(6);
        set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
        setTimeout(() => get().dismissToast(id), 3200);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'float-store',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        view: s.view === 'chat' && !s.activeChatId ? 'home' : s.view,
        activeChatId: s.activeChatId,
        sidebarCollapsed: s.sidebarCollapsed,
        theme: s.theme,
        chats: s.chats,
        codebase: s.codebase,
        automations: s.automations,
        settings: s.settings,
        modelConfig: s.modelConfig,
        cloud: s.cloud,
        user: s.user,
      }),
    },
  ),
);

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export const getState = () => useStore.getState();
