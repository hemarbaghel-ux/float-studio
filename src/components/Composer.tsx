import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { nanoid } from 'nanoid';
import { ArrowUp, ArrowRight, Plus, Square, Paperclip, FileCode2, ImageIcon, X, AtSign, Slash, Cloud } from 'lucide-react';
import { useStore } from '../lib/store';
import { runAgent, stopAgent } from '../lib/agent/runAgent';
import { formatBytes, readAsDataUrl } from '../lib/files';
import { formatDuration } from '../lib/time';
import { useNow } from '../hooks/useNow';
import type { Attachment } from '../lib/types';
import { ModelPicker } from './ModelPicker';
import { MenuItem, Popover } from './ui';

const SLASH = [
  { cmd: '/test', label: 'Write unit tests', text: 'Write unit tests for ' },
  { cmd: '/fix', label: 'Find and fix bugs', text: 'Find and fix bugs in ' },
  { cmd: '/explain', label: 'Explain code', text: 'Explain how this works: ' },
  { cmd: '/refactor', label: 'Refactor for readability', text: 'Refactor for readability and performance: ' },
  { cmd: '/docs', label: 'Write documentation', text: 'Write a README section documenting ' },
  { cmd: '/run', label: 'Run tests in cloud session', text: 'Run npm test and fix any failures' },
];

export async function sendPrompt(prompt: string, attachments: Attachment[] = [], chatId?: string | null) {
  const s = useStore.getState();
  let id = chatId ?? null;
  if (!id) {
    id = s.createChat('New chat');
    s.openChat(id);
  }
  return runAgent({ chatId: id, prompt, attachments });
}

export function Composer({ chatId, autoFocus }: { chatId?: string | null; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [drag, setDrag] = useState(false);
  const [menu, setMenu] = useState<null | { kind: '@' | '/'; query: string; start: number }>(null);
  const [sel, setSel] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const running = useStore((s) => (chatId ? s.runningChats.includes(chatId) : false));
  const files = useStore((s) => s.codebase.files);
  const seed = useStore((s) => s.composerSeed);

  useEffect(() => {
    if (autoFocus) ta.current?.focus();
  }, [autoFocus, chatId]);

  useEffect(() => {
    if (!seed) return;
    setText(seed.text);
    requestAnimationFrame(() => {
      ta.current?.focus();
      ta.current?.setSelectionRange(seed.text.length, seed.text.length);
    });
  }, [seed]);

  // auto-resize
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = Math.min(320, Math.max(72, el.scrollHeight)) + 'px';
  }, [text]);

  const items = useMemo(() => {
    if (!menu) return [];
    const q = menu.query.toLowerCase();
    if (menu.kind === '@')
      return Object.keys(files)
        .filter((p) => p.toLowerCase().includes(q))
        .sort((a, b) => a.length - b.length)
        .slice(0, 8)
        .map((p) => ({ key: p, label: p.split('/').pop()!, hint: p }));
    return SLASH.filter((c) => c.cmd.includes(q)).map((c) => ({ key: c.cmd, label: c.cmd, hint: c.label }));
  }, [menu, files]);

  const detectMenu = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const m = before.match(/(^|\s)([@/])([\w./-]*)$/);
    if (m) {
      setMenu({ kind: m[2] as '@' | '/', query: m[3], start: caret - m[3].length - 1 });
      setSel(0);
    } else setMenu(null);
  };

  const attachCodebaseFile = (path: string) => {
    if (atts.some((a) => a.name === path)) return;
    const content = files[path]?.content ?? '';
    setAtts((a) => [...a, { id: nanoid(6), name: path, mime: 'text/plain', size: content.length, text: content }]);
  };

  const pick = (key: string) => {
    if (!menu) return;
    const el = ta.current!;
    const caret = el.selectionStart;
    let insert = '';
    if (menu.kind === '@') {
      insert = '@' + key + ' ';
      attachCodebaseFile(key);
    } else insert = SLASH.find((c) => c.cmd === key)!.text;
    const next = text.slice(0, menu.start) + insert + text.slice(caret);
    setText(next);
    setMenu(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = menu.start + insert.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const addFiles = async (list: FileList | File[]) => {
    const out: Attachment[] = [];
    for (const f of Array.from(list)) {
      if (f.size > 5_000_000) {
        useStore.getState().toast(`${f.name} is larger than 5 MB`, 'error');
        continue;
      }
      if (f.type.startsWith('image/')) out.push({ id: nanoid(6), name: f.name, mime: f.type, size: f.size, dataUrl: await readAsDataUrl(f) });
      else out.push({ id: nanoid(6), name: f.name, mime: f.type || 'text/plain', size: f.size, text: await f.text() });
    }
    setAtts((a) => [...a, ...out]);
  };

  const submit = () => {
    const prompt = text.trim();
    if (!prompt && !atts.length) return;
    if (running) return;
    setText('');
    setAtts([]);
    setMenu(null);
    void sendPrompt(prompt || 'Review the attached files.', atts, chatId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menu && items.length) {
      if (e.key === 'ArrowDown') return (e.preventDefault(), setSel((s) => (s + 1) % items.length));
      if (e.key === 'ArrowUp') return (e.preventDefault(), setSel((s) => (s - 1 + items.length) % items.length));
      if (e.key === 'Enter' || e.key === 'Tab') return (e.preventDefault(), pick(items[sel].key));
      if (e.key === 'Escape') return (e.preventDefault(), setMenu(null));
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (imgs.length) {
      e.preventDefault();
      void addFiles(imgs);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  };

  const canSend = (text.trim().length > 0 || atts.length > 0) && !running;

  return (
    <div
      className={clsx('card relative shadow-[0_8px_30px_rgba(16,24,40,0.06)] transition-colors', drag && 'border-fg/40 bg-muted/40')}
      onDragOver={(e) => (e.preventDefault(), setDrag(true))}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <SessionBanner />

      {atts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {atts.map((a) => (
            <span key={a.id} className="group flex items-center gap-1.5 rounded-lg border border-line bg-bg py-1 pl-1.5 pr-1 text-[12px]">
              {a.dataUrl ? <img src={a.dataUrl} alt="" className="h-5 w-5 rounded object-cover" /> : <FileCode2 size={13} className="text-sub" />}
              <span className="max-w-[160px] truncate">{a.name}</span>
              <span className="text-faint">{formatBytes(a.size)}</span>
              <button onClick={() => setAtts((x) => x.filter((y) => y.id !== a.id))} className="rounded p-0.5 text-faint hover:bg-muted hover:text-fg" aria-label={`Remove ${a.name}`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        id="composer-input"
        ref={ta}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          detectMenu(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onClick={(e) => detectMenu(text, (e.target as HTMLTextAreaElement).selectionStart)}
        placeholder={chatId ? 'Ask a follow-up, @ to add files, / for commands…' : 'Ask FLOAT to build, fix bugs, explore...'}
        className="block w-full resize-none bg-transparent px-4 pt-4 text-[15px] leading-relaxed outline-none placeholder:text-faint"
        rows={3}
        aria-label="Message FLOAT"
      />

      {menu && items.length > 0 && (
        <div className="absolute bottom-full left-4 z-30 mb-2 w-[340px] overflow-hidden rounded-xl border border-line bg-panel p-1 shadow-xl animate-fade-in">
          <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-faint">
            {menu.kind === '@' ? <AtSign size={11} /> : <Slash size={11} />}
            {menu.kind === '@' ? 'Files' : 'Commands'}
          </div>
          {items.map((it, i) => (
            <button
              key={it.key}
              onMouseDown={(e) => (e.preventDefault(), pick(it.key))}
              onMouseEnter={() => setSel(i)}
              className={clsx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px]', i === sel && 'bg-muted')}
            >
              {menu.kind === '@' ? <FileCode2 size={14} className="text-sub" /> : <Slash size={13} className="text-sub" />}
              <span className="font-medium">{it.label}</span>
              <span className="ml-auto truncate text-[11px] text-faint">{it.hint}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mx-3 mt-2 flex items-center gap-1 border-t border-line py-2.5">
        <Popover
          side="top"
          trigger={(_, toggle) => (
            <button onClick={toggle} className="grid h-7 w-7 place-items-center rounded-full bg-muted text-sub hover:bg-line hover:text-fg" aria-label="Add context">
              <Plus size={16} />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem icon={<Paperclip size={14} />} onClick={() => (fileInput.current?.click(), close())}>
                Upload files
              </MenuItem>
              <MenuItem
                icon={<ImageIcon size={14} />}
                onClick={() => {
                  if (fileInput.current) {
                    fileInput.current.accept = 'image/*';
                    fileInput.current.click();
                    fileInput.current.accept = '';
                  }
                  close();
                }}
              >
                Add image
              </MenuItem>
              <MenuItem
                icon={<AtSign size={14} />}
                onClick={() => {
                  close();
                  const next = text + (text && !text.endsWith(' ') ? ' @' : '@');
                  setText(next);
                  setMenu({ kind: '@', query: '', start: next.length - 1 });
                  requestAnimationFrame(() => ta.current?.focus());
                }}
              >
                Mention codebase file
              </MenuItem>
            </>
          )}
        </Popover>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => (e.target.files && void addFiles(e.target.files), (e.target.value = ''))} />
        <div className="ml-2">
          <ModelPicker />
        </div>
        <div className="flex-1" />
        {running ? (
          <button
            onClick={() => chatId && stopAgent(chatId)}
            className="grid h-8 w-8 place-items-center rounded-full bg-fg text-bg hover:opacity-90"
            aria-label="Stop generating"
            title="Stop (Esc)"
          >
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!canSend}
            className={clsx(
              'grid h-8 w-8 place-items-center rounded-full transition-colors',
              canSend ? 'bg-fg text-bg hover:opacity-90' : 'bg-muted text-faint',
            )}
            aria-label="Send message"
            title="Send (Enter)"
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function SessionBanner() {
  const cloud = useStore((s) => s.cloud);
  const { setModal, stopSession, toast } = useStore.getState();
  const now = useNow(1000);
  if (!cloud.active)
    return (
      <button
        onClick={() => setModal('session')}
        className="flex w-full items-center justify-center gap-1.5 rounded-t-xl border-b border-line bg-bg/60 py-2.5 text-[13px] text-sub hover:text-fg"
      >
        Cloud Agents require an active session <ArrowRight size={14} />
      </button>
    );
  return (
    <div className="flex items-center justify-center gap-2 rounded-t-xl border-b border-line bg-emerald-50/60 py-2 text-[12.5px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <Cloud size={13} />
      Cloud session active · {cloud.region} · {cloud.machine} · {formatDuration(now - (cloud.startedAt ?? now))}
      <button
        onClick={() => {
          stopSession();
          toast('Cloud session ended');
        }}
        className="ml-1 rounded px-1.5 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline"
      >
        End
      </button>
    </div>
  );
}
