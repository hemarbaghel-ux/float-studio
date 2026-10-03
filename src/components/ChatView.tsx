import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Brain,
  ChevronRight,
  Check,
  X,
  Loader2,
  FileText,
  FilePen,
  FilePlus2,
  FileX2,
  FolderTree,
  Search,
  TerminalSquare,
  Copy,
  RotateCcw,
  History,
  Pencil,
  FolderCode,
  AlertTriangle,
  Bot,
  ArrowDown,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { runAgent } from '../lib/agent/runAgent';
import { acceptChanges, rejectChanges } from '../lib/changes';
import type { Chat, FileChange, Message, ToolCall } from '../lib/types';
import { Markdown } from './Markdown';
import { DiffView, diffStats } from './DiffView';
import { Composer } from './Composer';

export function ChatView() {
  const chatId = useStore((s) => s.activeChatId);
  const chat = useStore((s) => s.chats.find((c) => c.id === s.activeChatId));
  const running = useStore((s) => (chatId ? s.runningChats.includes(chatId) : false));
  const scroller = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  // Stick to bottom while streaming unless the user scrolled up
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => setPinned(true), [chatId]);

  if (!chat) return null;
  const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user');

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <ChatHeader chat={chat} />
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
        }}
        className="relative min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-[760px] px-5 pb-10 pt-6">
          {chat.messages.map((m, i) =>
            m.role === 'user' ? (
              <UserMessage key={m.id} chat={chat} msg={m} isLast={m.id === lastUser?.id} running={running} />
            ) : (
              <AssistantMessage key={m.id} chat={chat} msg={m} streaming={running && i === chat.messages.length - 1} />
            ),
          )}
        </div>
      </div>
      {!pinned && (
        <button
          onClick={() => {
            const el = scroller.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          }}
          className="absolute bottom-40 left-1/2 z-10 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full border border-line bg-panel shadow-md"
          aria-label="Scroll to bottom"
        >
          <ArrowDown size={15} />
        </button>
      )}
      <div className="mx-auto w-full max-w-[760px] px-5 pb-5">
        <Composer chatId={chat.id} autoFocus />
      </div>
    </div>
  );
}

function ChatHeader({ chat }: { chat: Chat }) {
  const { setView, openFile } = useStore.getState();
  const pending = chat.changes.filter((c) => c.status === 'pending');
  const files = [...new Set(pending.map((c) => c.path))];
  const totals = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const c of pending) {
      const d = diffStats(c.before, c.after);
      add += d.add;
      del += d.del;
    }
    return { add, del };
  }, [pending]);
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel/70 px-5 backdrop-blur">
      {chat.source === 'automation' && <Bot size={15} className="text-faint" />}
      <h1 className="truncate text-[14px] font-semibold">{chat.title}</h1>
      <div className="flex-1" />
      {pending.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-3 pr-1 text-[12px] animate-fade-in">
          <button
            className="hover:underline"
            onClick={() => {
              openFile(files[0]);
              setView('codebase');
            }}
          >
            {files.length} file{files.length > 1 ? 's' : ''} changed
          </button>
          <span className="text-emerald-600">+{totals.add}</span>
          <span className="text-red-500">−{totals.del}</span>
          <button onClick={() => rejectChanges(chat.id)} className="btn-ghost px-2 py-0.5 text-[12px]">
            Reject all
          </button>
          <button onClick={() => acceptChanges(chat.id)} className="btn-primary px-2 py-0.5 text-[12px]">
            Accept all
          </button>
        </div>
      )}
      <button onClick={() => setView('codebase')} className="btn-ghost px-2" title="Open codebase">
        <FolderCode size={15} />
      </button>
    </div>
  );
}

function UserMessage({ chat, msg, isLast, running }: { chat: Chat; msg: Message; isLast: boolean; running: boolean }) {
  const [editing, setEditing] = useState(false);
  const text = msg.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
  const [draft, setDraft] = useState(text);
  const s = useStore.getState();

  const restore = () => {
    if (!msg.checkpoint) return;
    if (!confirm('Restore the codebase to the state before this message? Later file changes will be undone.')) return;
    s.restoreSnapshot(msg.checkpoint);
    s.toast('Checkpoint restored', 'success');
  };

  const resend = () => {
    if (msg.checkpoint) s.restoreSnapshot(msg.checkpoint);
    s.truncateAfter(chat.id, msg.id);
    setEditing(false);
    void runAgent({ chatId: chat.id, prompt: draft.trim() || text, attachments: msg.attachments });
  };

  return (
    <div className="group mb-5 flex flex-col items-end animate-fade-in">
      {editing ? (
        <div className="w-full max-w-[85%] rounded-2xl border border-line bg-surface p-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), resend());
              if (e.key === 'Escape') setEditing(false);
            }}
            className="block min-h-[60px] w-full resize-y bg-transparent p-2 text-[14px] outline-none"
          />
          <div className="flex justify-end gap-1.5">
            <button className="btn-ghost py-1" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn-primary py-1" onClick={resend} disabled={running}>
              Resend
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words">{text}</div>
      )}
      {msg.attachments && msg.attachments.length > 0 && (
        <div className="mt-1.5 flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {msg.attachments.map((a) =>
            a.dataUrl ? (
              <img key={a.id} src={a.dataUrl} alt={a.name} className="h-20 rounded-lg border border-line object-cover" />
            ) : (
              <span key={a.id} className="flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11px] text-sub">
                <FileText size={11} /> {a.name}
              </span>
            ),
          )}
        </div>
      )}
      {!editing && (
        <div className="mt-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {msg.checkpoint && (
            <button onClick={restore} className="btn-ghost px-1.5 py-0.5 text-[11px]" title="Restore checkpoint">
              <History size={12} /> Restore checkpoint
            </button>
          )}
          {!running && (
            <button
              onClick={() => (setDraft(text), setEditing(true))}
              className="btn-ghost px-1.5 py-0.5 text-[11px]"
              title={isLast ? 'Edit message' : 'Edit and rerun from here'}
            >
              <Pencil size={12} /> Edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AssistantMessage({ chat, msg, streaming }: { chat: Chat; msg: Message; streaming: boolean }) {
  const [copied, setCopied] = useState(false);
  const fullText = msg.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
  const setModal = useStore((s) => s.setModal);

  const retry = () => {
    const idx = chat.messages.findIndex((m) => m.id === msg.id);
    const user = [...chat.messages.slice(0, idx)].reverse().find((m) => m.role === 'user');
    if (!user) return;
    const s = useStore.getState();
    if (user.checkpoint) s.restoreSnapshot(user.checkpoint);
    s.truncateAfter(chat.id, user.id);
    void runAgent({ chatId: chat.id, prompt: user.parts.map((p) => (p.type === 'text' ? p.text : '')).join(''), attachments: user.attachments });
  };

  const empty = msg.parts.length === 0 && !msg.error;

  return (
    <div className="group mb-7 animate-fade-in">
      {empty && streaming && (
        <div className="flex items-center gap-2 text-[13px] text-faint">
          <Loader2 size={14} className="animate-spin" /> Planning next moves…
        </div>
      )}
      {msg.parts.map((p, i) => {
        if (p.type === 'thinking') return <Thinking key={i} text={p.text} live={streaming && i === msg.parts.length - 1} />;
        if (p.type === 'tool') return <ToolCard key={p.call.id + i} chat={chat} call={p.call} />;
        return (
          <div key={i}>
            <Markdown text={p.text} />
            {streaming && i === msg.parts.length - 1 && <span className="ml-0.5 inline-block h-4 w-[7px] translate-y-0.5 animate-blink bg-fg/70" />}
          </div>
        );
      })}
      {msg.error && (
        <div
          className={clsx(
            'mt-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-[13px]',
            msg.error === 'Stopped by user' ? 'border-line text-faint' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
          )}
        >
          {msg.error !== 'Stopped by user' && <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{msg.error}</span>
          {/Upgrade/.test(msg.error) && (
            <button className="btn-primary py-0.5 text-[12px]" onClick={() => setModal('upgrade')}>
              Upgrade
            </button>
          )}
        </div>
      )}
      {!streaming && (msg.parts.length > 0 || msg.error) && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-faint opacity-0 transition-opacity group-hover:opacity-100">
          {msg.model && <span className="mr-1">{msg.model}</span>}
          {msg.durationMs != null && <span className="mr-1">· {(msg.durationMs / 1000).toFixed(1)}s</span>}
          <button
            className="rounded p-1 hover:bg-muted hover:text-fg"
            title="Copy"
            onClick={() => {
              navigator.clipboard.writeText(fullText);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button className="rounded p-1 hover:bg-muted hover:text-fg" title="Retry" onClick={retry}>
            <RotateCcw size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function Thinking({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-[12.5px] text-faint hover:text-sub">
        <Brain size={13} className={clsx(live && 'animate-pulse')} />
        {live ? 'Thinking…' : 'Thought'}
        <ChevronRight size={13} className={clsx('transition-transform', open && 'rotate-90')} />
      </button>
      {(open || live) && <div className="mt-1 border-l-2 border-line pl-3 text-[12.5px] leading-relaxed text-faint whitespace-pre-wrap">{text}</div>}
    </div>
  );
}

const TOOL_META: Record<string, { icon: typeof FileText; verb: string; done: string }> = {
  list_files: { icon: FolderTree, verb: 'Listing files', done: 'Listed files' },
  read_file: { icon: FileText, verb: 'Reading', done: 'Read' },
  search_files: { icon: Search, verb: 'Searching', done: 'Searched' },
  write_file: { icon: FilePlus2, verb: 'Writing', done: 'Wrote' },
  edit_file: { icon: FilePen, verb: 'Editing', done: 'Edited' },
  delete_file: { icon: FileX2, verb: 'Deleting', done: 'Deleted' },
  run_command: { icon: TerminalSquare, verb: 'Running', done: 'Ran' },
};

function ToolCard({ chat, call }: { chat: Chat; call: ToolCall }) {
  const meta = TOOL_META[call.name] ?? { icon: Bot, verb: call.name, done: call.name };
  const change: FileChange | undefined = chat.changes.find((c) => c.id === call.changeId);
  const isCmd = call.name === 'run_command';
  const [open, setOpen] = useState(isCmd || !!change);
  const { openFile, setView } = useStore.getState();
  const target = String(call.args.path ?? call.args.command ?? call.args.query ?? call.args.dir ?? '');
  const stats = change ? diffStats(change.before, change.after) : null;
  const Icon = meta.icon;

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 px-3 py-2 text-[12.5px]">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight size={13} className={clsx('shrink-0 text-faint transition-transform', open && 'rotate-90')} />
          <Icon size={14} className="shrink-0 text-sub" />
          <span className="shrink-0 text-sub">{call.status === 'running' ? meta.verb : meta.done}</span>
          <span className="truncate font-mono text-[12px]">{target}</span>
          {stats && (
            <span className="shrink-0 font-mono text-[11px]">
              <span className="text-emerald-600">+{stats.add}</span> <span className="text-red-500">−{stats.del}</span>
            </span>
          )}
        </button>
        {change && change.status !== 'pending' && (
          <span className={clsx('rounded px-1.5 py-0.5 text-[10px] font-medium', change.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500')}>
            {change.status === 'accepted' ? 'Accepted' : 'Rejected'}
          </span>
        )}
        {change && change.status === 'pending' && (
          <span className="flex shrink-0 gap-1">
            <button onClick={() => rejectChanges(chat.id, [change.id])} className="rounded-md border border-line px-1.5 py-0.5 text-[11px] hover:bg-muted" title="Reject (revert)">
              <X size={11} className="inline" /> Reject
            </button>
            <button onClick={() => acceptChanges(chat.id, [change.id])} className="rounded-md bg-fg px-1.5 py-0.5 text-[11px] text-bg hover:opacity-90" title="Accept">
              <Check size={11} className="inline" /> Accept
            </button>
          </span>
        )}
        {change && change.after != null && (
          <button
            onClick={() => (openFile(change.path), setView('codebase'))}
            className="shrink-0 rounded p-1 text-faint hover:bg-muted hover:text-fg"
            title="Open in editor"
          >
            <FolderCode size={13} />
          </button>
        )}
        <span className="shrink-0">
          {call.status === 'running' ? (
            <Loader2 size={13} className="animate-spin text-faint" />
          ) : call.status === 'done' ? (
            <Check size={13} className="text-emerald-600" />
          ) : (
            <X size={13} className="text-red-500" />
          )}
        </span>
      </div>
      {open && (
        <div className="border-t border-line">
          {change ? (
            <DiffView before={change.before} after={change.after} />
          ) : call.result ? (
            <pre
              className={clsx(
                'max-h-[280px] overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11.5px] leading-[1.55]',
                isCmd ? 'bg-[#0d0f14] text-[#d7dae0]' : 'text-sub',
              )}
            >
              {call.result}
            </pre>
          ) : (
            <div className="px-3 py-2 text-[12px] text-faint">Waiting for output…</div>
          )}
        </div>
      )}
    </div>
  );
}
