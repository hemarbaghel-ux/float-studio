import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Pin, PinOff, Search, Trash2, X, Loader2 } from 'lucide-react';

export interface ChatItem {
  id: string;
  name: string;
  updatedAt?: any;
}

const PIN_KEY = 'float_pinned_chats';

function toMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (ts.toMillis) return ts.toMillis();
  if (ts.toDate) return ts.toDate().getTime();
  const n = new Date(ts).getTime();
  return Number.isNaN(n) ? 0 : n;
}

export function relativeTime(ts: any, now = Date.now()) {
  const ms = toMillis(ts);
  if (!ms) return '';
  const d = Math.max(0, now - ms);
  const m = Math.floor(d / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Sidebar "Chats" section: count, search, pin, rename, delete and live relative timestamps. */
export function ChatList({
  chats,
  loading,
  activeId,
  onOpen,
  onRename,
  onDelete,
  searchRef,
}: {
  chats: ChatItem[];
  loading: boolean;
  activeId?: string | null;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  searchRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [queryText, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [pins, setPins] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(PIN_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [now, setNow] = useState(Date.now());
  const localSearch = useRef<HTMLInputElement>(null);
  const inputRef = searchRef ?? localSearch;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => localStorage.setItem(PIN_KEY, JSON.stringify(pins)), [pins]);
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen, inputRef]);

  const visible = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const list = chats.filter((c) => !q || (c.name || '').toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      const pa = pins.includes(a.id) ? 1 : 0;
      const pb = pins.includes(b.id) ? 1 : 0;
      return pb - pa || toMillis(b.updatedAt) - toMillis(a.updatedAt);
    });
  }, [chats, queryText, pins]);

  const commitRename = async () => {
    const id = renaming;
    const name = draft.trim();
    setRenaming(null);
    if (id && name) await onRename(id, name);
  };

  return (
    <div className="flex flex-col min-h-0 flex-1 px-2 pb-2">
      <div className="flex items-center justify-between px-2.5 pt-3 pb-1.5">
        <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 dark:text-[#6E7681]">
          Chats <span className="ml-1 font-mono">{chats.length}</span>
        </span>
        <button
          onClick={() => {
            setSearchOpen((v) => !v);
            if (searchOpen) setQuery('');
          }}
          aria-label="Search chats"
          title="Search chats (⌘⇧F)"
          className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1C1C1C] cursor-pointer"
        >
          {searchOpen ? <X size={13} /> : <Search size={13} />}
        </button>
      </div>
      {searchOpen && (
        <div className="px-1 pb-1.5">
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={queryText}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('');
                setSearchOpen(false);
              }
              if (e.key === 'Enter' && visible[0]) onOpen(visible[0].id);
            }}
            placeholder="Search chats..."
            className="w-full rounded-md border border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] px-2.5 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-400 dark:focus:border-white/30"
          />
        </div>
      )}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-0.5">
        {loading ? (
          <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-slate-400">
            <Loader2 size={12} className="animate-spin" /> Loading chats…
          </div>
        ) : visible.length === 0 ? (
          <div className="px-2.5 py-2 text-xs text-slate-400 dark:text-[#6E7681]">{queryText ? 'No matching chats' : 'No chats yet'}</div>
        ) : (
          visible.map((c) => (
            <div
              key={c.id}
              className={`group relative flex items-center rounded-lg pl-2.5 pr-1 py-1.5 text-xs cursor-pointer ${
                activeId === c.id
                  ? 'bg-slate-200/80 dark:bg-[#242424] text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-[#A0A0A0] hover:bg-slate-100 dark:hover:bg-[#1C1C1C] hover:text-slate-900 dark:hover:text-white'
              }`}
              onClick={() => renaming !== c.id && onOpen(c.id)}
            >
              {pins.includes(c.id) && <Pin size={10} className="mr-1.5 shrink-0 text-slate-400" />}
              {renaming === c.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => void commitRename()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitRename();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  className="flex-1 min-w-0 rounded border border-slate-300 dark:border-white/20 bg-white dark:bg-[#0A0A0A] px-1.5 py-0.5 text-xs focus:outline-none"
                />
              ) : (
                <span className="flex-1 truncate">{c.name || 'Untitled chat'}</span>
              )}
              <span className="ml-2 shrink-0 text-[10px] text-slate-400 dark:text-[#6E7681] group-hover:hidden">{relativeTime(c.updatedAt, now)}</span>
              <button
                aria-label="Chat actions"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuFor(menuFor === c.id ? null : c.id);
                }}
                className="hidden group-hover:flex ml-1 p-0.5 rounded text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
              >
                <MoreHorizontal size={13} />
              </button>
              {menuFor === c.id && (
                <div
                  className="absolute right-1 top-full z-40 mt-1 w-36 rounded-lg border border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] py-1 shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MenuItem
                    icon={pins.includes(c.id) ? PinOff : Pin}
                    label={pins.includes(c.id) ? 'Unpin' : 'Pin'}
                    onClick={() => {
                      setPins((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [c.id, ...p]));
                      setMenuFor(null);
                    }}
                  />
                  <MenuItem
                    icon={Pencil}
                    label="Rename"
                    onClick={() => {
                      setDraft(c.name || '');
                      setRenaming(c.id);
                      setMenuFor(null);
                    }}
                  />
                  <MenuItem
                    icon={Trash2}
                    label="Delete"
                    danger
                    onClick={() => {
                      setMenuFor(null);
                      if (confirm(`Delete "${c.name || 'this chat'}"? This cannot be undone.`)) void onDelete(c.id);
                    }}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer ${
        danger ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10' : 'text-slate-700 dark:text-[#C9D1D9] hover:bg-slate-100 dark:hover:bg-white/5'
      }`}
    >
      <Icon size={12} /> {label}
    </button>
  );
}
