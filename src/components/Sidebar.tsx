import { useMemo, useRef, useState, useEffect } from 'react';
import clsx from 'clsx';
import {
  SquarePlus,
  FolderCode,
  Workflow,
  Plug,
  Search,
  Sparkles,
  ChevronRight,
  MoreHorizontal,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Bot,
  Loader2,
  Sun,
  Moon,
  Monitor,
  Settings,
  Keyboard,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  X,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { timeAgo } from '../lib/time';
import { useNow } from '../hooks/useNow';
import { PLAN_LIMITS } from '../lib/models';
import { MOD } from '../hooks/useShortcuts';
import { Logo, MenuItem, Popover } from './ui';
import type { Chat, View } from '../lib/types';

const NAV: { id: View | 'new'; label: string; icon: typeof SquarePlus; kbd?: string }[] = [
  { id: 'new', label: 'New Chat', icon: SquarePlus, kbd: `${MOD} I` },
  { id: 'codebase', label: 'Codebase', icon: FolderCode, kbd: `${MOD} ⇧ E` },
  { id: 'automations', label: 'Automations', icon: Workflow },
  { id: 'integrations', label: 'Integrations', icon: Plug },
];

export function Sidebar() {
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const view = useStore((s) => s.view);
  const activeChatId = useStore((s) => s.activeChatId);
  const chats = useStore((s) => s.chats);
  const { setView, newChat, toggleSidebar } = useStore.getState();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? chats.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            c.messages.some((m) => m.parts.some((p) => p.type === 'text' && p.text.toLowerCase().includes(q))),
        )
      : chats;
    return [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
  }, [chats, query]);

  const navActive = (id: View | 'new') => (id === 'new' ? view === 'home' : view === id);
  const onNav = (id: View | 'new') => {
    if (id === 'new') {
      newChat();
      setTimeout(() => document.getElementById('composer-input')?.focus(), 30);
    } else setView(id);
  };

  if (collapsed) {
    return (
      <aside className="flex w-[56px] shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-3">
        <button className="mb-2 rounded-lg p-2 text-sub hover:bg-muted" onClick={toggleSidebar} title={`Expand sidebar (${MOD} B)`}>
          <PanelLeftOpen size={18} />
        </button>
        {NAV.map((n) => (
          <button
            key={n.id}
            title={n.label}
            onClick={() => onNav(n.id)}
            className={clsx('rounded-lg p-2.5 hover:bg-muted', navActive(n.id) ? 'bg-muted text-fg' : 'text-sub')}
          >
            <n.icon size={18} />
          </button>
        ))}
        <div className="flex-1" />
        <UserButton compact />
      </aside>
    );
  }

  return (
    <aside className="flex w-[256px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <div className="flex items-center gap-2 px-1 font-semibold tracking-tight">
          <Logo size={20} />
          <span className="text-[14px]">FLOAT</span>
        </div>
        <button className="rounded-md p-1.5 text-faint hover:bg-muted hover:text-fg" onClick={toggleSidebar} title={`Collapse sidebar (${MOD} B)`}>
          <PanelLeftClose size={16} />
        </button>
      </div>

      <nav className="flex flex-col gap-1 px-2 pt-2">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => onNav(n.id)}
            className={clsx(
              'group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors',
              navActive(n.id) ? 'bg-muted font-medium text-fg' : 'text-fg/85 hover:bg-muted/70',
            )}
          >
            <n.icon size={16} className="text-sub" />
            <span className="flex-1 text-left">{n.label}</span>
            {n.kbd && <span className="kbd opacity-0 transition-opacity group-hover:opacity-100">{n.kbd}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-3 border-t border-line px-3 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-faint">Chats</span>
          <span className="rounded-md bg-muted px-1.5 text-[11px] text-sub">{chats.length}</span>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Search chats..."
            aria-label="Search chats"
            className="w-full rounded-lg bg-muted/80 py-1.5 pl-8 pr-7 text-[13px] outline-none placeholder:text-faint focus:ring-2 focus:ring-fg/10"
          />
          {query && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-fg" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 && <p className="px-3 py-6 text-center text-[12px] text-faint">{query ? 'No chats match your search' : 'No chats yet'}</p>}
        {filtered.map((c) => (
          <ChatRow key={c.id} chat={c} active={view === 'chat' && activeChatId === c.id} />
        ))}
      </div>

      <div className="border-t border-line p-2">
        <UpgradeButton />
        <UserButton />
      </div>
    </aside>
  );
}

function ChatRow({ chat, active }: { chat: Chat; active: boolean }) {
  const now = useNow();
  const running = useStore((s) => s.runningChats.includes(chat.id));
  const { openChat, renameChat, deleteChat, togglePin } = useStore.getState();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chat.title);
  const [confirm, setConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const t = draft.trim();
    if (t) renameChat(chat.id, t);
    setEditing(false);
  };

  return (
    <div
      className={clsx('group relative mb-0.5 rounded-lg px-2.5 py-2 cursor-pointer', active ? 'bg-muted' : 'hover:bg-muted/60')}
      onClick={() => !editing && openChat(chat.id)}
      onDoubleClick={() => {
        setDraft(chat.title);
        setEditing(true);
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-full rounded border border-line bg-surface px-1.5 py-0.5 text-[13px] font-semibold outline-none"
        />
      ) : (
        <div className="flex items-center gap-1.5 pr-6">
          {chat.pinned && <Pin size={11} className="shrink-0 text-faint" />}
          {chat.source === 'automation' && <Bot size={12} className="shrink-0 text-faint" />}
          <span className="truncate text-[13px] font-semibold">{chat.title}</span>
        </div>
      )}
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
        {running ? (
          <>
            <Loader2 size={10} className="animate-spin" /> Running…
          </>
        ) : (
          timeAgo(chat.updatedAt, now)
        )}
      </div>

      {!editing && (
        <div className="absolute right-1.5 top-2" onClick={(e) => e.stopPropagation()}>
          <Popover
            align="right"
            trigger={(open, toggle) => (
              <button
                onClick={toggle}
                aria-label="Chat options"
                className={clsx('rounded-md p-1 text-faint hover:bg-line hover:text-fg', open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
              >
                <MoreHorizontal size={14} />
              </button>
            )}
          >
            {(close) =>
              confirm ? (
                <div className="p-2">
                  <p className="mb-2 px-1 text-[12px] text-sub">Delete “{chat.title}”?</p>
                  <div className="flex gap-1.5">
                    <button className="btn-outline flex-1 py-1" onClick={() => (setConfirm(false), close())}>
                      Cancel
                    </button>
                    <button className="btn flex-1 bg-red-600 py-1 text-white hover:bg-red-700" onClick={() => (deleteChat(chat.id), close())}>
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <MenuItem icon={chat.pinned ? <PinOff size={14} /> : <Pin size={14} />} onClick={() => (togglePin(chat.id), close())}>
                    {chat.pinned ? 'Unpin' : 'Pin'}
                  </MenuItem>
                  <MenuItem
                    icon={<Pencil size={14} />}
                    onClick={() => {
                      setDraft(chat.title);
                      setEditing(true);
                      close();
                    }}
                  >
                    Rename
                  </MenuItem>
                  <MenuItem icon={<Trash2 size={14} />} danger onClick={() => setConfirm(true)}>
                    Delete
                  </MenuItem>
                </>
              )
            }
          </Popover>
        </div>
      )}
    </div>
  );
}

function UpgradeButton() {
  const plan = useStore((s) => s.user.plan);
  const usage = useStore((s) => s.user.usage.requests);
  const setModal = useStore((s) => s.setModal);
  const limit = PLAN_LIMITS[plan].requests;
  if (plan !== 'free') {
    return (
      <button onClick={() => setModal('upgrade')} className="mb-1.5 w-full rounded-lg border border-line px-3 py-2 text-left hover:bg-muted/60">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-medium">{PLAN_LIMITS[plan].label} plan</span>
          <span className="text-faint">
            {usage}/{limit}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (usage / limit) * 100)}%` }} />
        </div>
      </button>
    );
  }
  return (
    <button
      onClick={() => setModal('upgrade')}
      className="mb-1.5 flex w-full items-center gap-2.5 rounded-lg border border-line bg-bg px-3 py-2 text-[13px] font-medium hover:bg-muted"
    >
      <Sparkles size={15} className="text-sub" />
      <span className="flex-1 text-left">Upgrade to Pro</span>
      <ChevronRight size={15} className="text-faint" />
    </button>
  );
}

function UserButton({ compact }: { compact?: boolean }) {
  const user = useStore((s) => s.user);
  const theme = useStore((s) => s.theme);
  const { setTheme, setModal } = useStore.getState();
  const limit = PLAN_LIMITS[user.plan].requests;
  const themeLabel = theme[0].toUpperCase() + theme.slice(1);

  return (
    <Popover
      side="top"
      className="w-[236px]"
      trigger={(_, toggle) =>
        compact ? (
          <button onClick={toggle} className="grid h-8 w-8 place-items-center rounded-full bg-fg text-[12px] font-semibold text-bg">
            {user.name[0]}
          </button>
        ) : (
          <button onClick={toggle} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/60">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fg text-[12px] font-semibold text-bg">{user.name[0]}</span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13px] font-semibold">{user.name}</span>
              <span className="block text-[11px] text-faint">
                {PLAN_LIMITS[user.plan].label} <span className="mx-0.5">•</span> {themeLabel}
              </span>
            </span>
          </button>
        )
      }
    >
      {(close) => (
        <>
          <div className="px-2.5 pb-2 pt-1.5">
            <div className="truncate text-[13px] font-medium">{user.email}</div>
            <div className="mt-2 flex justify-between text-[11px] text-faint">
              <span>Agent requests this month</span>
              <span>
                {user.usage.requests}/{limit}
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-fg" style={{ width: `${Math.min(100, (user.usage.requests / limit) * 100)}%` }} />
            </div>
          </div>
          <div className="my-1 border-t border-line" />
          <div className="flex gap-1 px-1.5 py-1">
            {(
              [
                ['light', Sun],
                ['dark', Moon],
                ['system', Monitor],
              ] as const
            ).map(([t, Icon]) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={clsx(
                  'flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[12px] capitalize',
                  theme === t ? 'bg-muted font-medium text-fg' : 'text-sub hover:bg-muted/60',
                )}
              >
                <Icon size={13} /> {t}
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-line" />
          <MenuItem icon={<Settings size={14} />} right={<span className="kbd">{MOD} ,</span>} onClick={() => (setModal('settings'), close())}>
            Settings
          </MenuItem>
          <MenuItem icon={<Keyboard size={14} />} right={<span className="kbd">{MOD} /</span>} onClick={() => (setModal('shortcuts'), close())}>
            Keyboard shortcuts
          </MenuItem>
          <MenuItem icon={<Sparkles size={14} />} onClick={() => (setModal('upgrade'), close())}>
            {user.plan === 'free' ? 'Upgrade plan' : 'Manage plan'}
          </MenuItem>
          <div className="my-1 border-t border-line" />
          <MenuItem
            icon={<LogOut size={14} />}
            danger
            onClick={() => {
              if (confirm('Sign out and clear all local FLOAT data on this device?')) {
                localStorage.removeItem('float-store');
                location.reload();
              }
            }}
          >
            Sign out
          </MenuItem>
        </>
      )}
    </Popover>
  );
}
