import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react';
import {
  X,
  Play,
  TerminalSquare,
  Eye,
  Code2,
  FolderUp,
  FileArchive,
  Download,
  MoreHorizontal,
  Search,
  Files,
  GitCommitHorizontal,
  RotateCcw,
  RefreshCw,
  Sparkles,
  Check,
  Loader2,
  MessageSquarePlus,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { buildPreviewDoc, exportZip, importFileList, importZip, langFor } from '../lib/files';
import { seedCodebase } from '../lib/seed';
import { githubCommit } from '../lib/integrations';
import { acceptChanges, rejectChanges } from '../lib/changes';
import { runAgent } from '../lib/agent/runAgent';
import { MOD } from '../hooks/useShortcuts';
import { FileTree } from './FileTree';
import { Terminal } from './Terminal';
import { MenuItem, Popover, GithubIcon } from './ui';

function useIsDark() {
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

export function CodebaseView() {
  const cb = useStore((s) => s.codebase);
  const chats = useStore((s) => s.chats);
  const { openFile, closeTab, writeFile } = useStore.getState();
  const [panel, setPanel] = useState<'files' | 'search'>('files');
  const [showPreview, setShowPreview] = useState(false);
  const [showTerm, setShowTerm] = useState(false);
  const [diffMode, setDiffMode] = useState(false);
  const [inline, setInline] = useState<null | { selection: string; startLine: number; endLine: number }>(null);
  const dark = useIsDark();

  // pending agent changes across chats, keyed by path
  const pending = useMemo(() => {
    const map = new Map<string, { chatId: string; ids: string[]; before: string | null }>();
    for (const c of chats)
      for (const ch of c.changes)
        if (ch.status === 'pending') {
          const e = map.get(ch.path);
          if (e) e.ids.push(ch.id);
          else map.set(ch.path, { chatId: c.id, ids: [ch.id], before: ch.before });
        }
    return map;
  }, [chats]);
  const changedPaths = useMemo(() => new Set(pending.keys()), [pending]);

  const active = cb.activePath && cb.files[cb.activePath] ? cb.activePath : null;
  const activePending = active ? pending.get(active) : undefined;
  useEffect(() => {
    if (!activePending) setDiffMode(false);
  }, [activePending]);

  const htmlEntries = Object.keys(cb.files).filter((p) => /\.html?$/.test(p));
  const [previewEntry, setPreviewEntry] = useState<string>('');
  const entry = previewEntry && cb.files[previewEntry] ? previewEntry : active && /\.html?$/.test(active) ? active : htmlEntries.includes('index.html') ? 'index.html' : htmlEntries[0];

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addAction({
      id: 'float-inline-edit',
      label: 'FLOAT: Edit selection with AI',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
      contextMenuGroupId: 'navigation',
      run: (ed) => {
        const sel = ed.getSelection();
        const model = ed.getModel();
        if (!sel || !model) return;
        setInline({ selection: model.getValueInRange(sel), startLine: sel.startLineNumber, endLine: sel.endLineNumber });
      },
    });
    editor.addAction({
      id: 'float-add-to-chat',
      label: 'FLOAT: Add selection to chat',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL],
      contextMenuGroupId: 'navigation',
      run: (ed) => {
        const sel = ed.getSelection();
        const model = ed.getModel();
        const s = useStore.getState();
        if (!sel || !model) return;
        const text = model.getValueInRange(sel) || model.getValue();
        const path = s.codebase.activePath ?? 'file';
        s.seedComposer(`In \`${path}\` (lines ${sel.startLineNumber}-${sel.endLineNumber}):\n\`\`\`${langFor(path)}\n${text}\n\`\`\`\n`);
        if (s.activeChatId) s.setView('chat');
        else s.setView('home');
      },
    });
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Left panel */}
      <div className="flex w-[240px] shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex h-11 items-center gap-1 border-b border-line px-2">
          <button onClick={() => setPanel('files')} className={clsx('rounded-md p-1.5', panel === 'files' ? 'bg-muted text-fg' : 'text-faint hover:text-fg')} title="Explorer">
            <Files size={15} />
          </button>
          <button onClick={() => setPanel('search')} className={clsx('rounded-md p-1.5', panel === 'search' ? 'bg-muted text-fg' : 'text-faint hover:text-fg')} title="Search">
            <Search size={15} />
          </button>
          <span className="ml-1 truncate text-[12px] font-semibold uppercase tracking-wider text-sub">{cb.name}</span>
          <span className="flex-1" />
          <ProjectMenu />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{panel === 'files' ? <FileTree changedPaths={changedPaths} /> : <SearchPanel />}</div>
        {cb.github && <GitPanel />}
      </div>

      {/* Editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center border-b border-line bg-panel">
          <div className="flex min-w-0 flex-1 overflow-x-auto">
            {cb.openTabs.filter((t) => cb.files[t]).map((t) => (
              <div
                key={t}
                onClick={() => openFile(t)}
                onAuxClick={(e) => e.button === 1 && closeTab(t)}
                className={clsx(
                  'group flex h-11 shrink-0 cursor-pointer items-center gap-2 border-r border-line px-3 text-[12.5px]',
                  t === active ? 'bg-bg text-fg' : 'text-sub hover:bg-muted/50',
                )}
                title={t}
              >
                <span className={clsx(changedPaths.has(t) && 'text-amber-600 dark:text-amber-400')}>{t.split('/').pop()}</span>
                <button
                  onClick={(e) => (e.stopPropagation(), closeTab(t))}
                  className="rounded p-0.5 text-faint opacity-0 hover:bg-line hover:text-fg group-hover:opacity-100"
                  aria-label={`Close ${t}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1 px-2">
            <button onClick={() => setShowPreview((v) => !v)} className={clsx('btn-ghost px-2 py-1 text-[12px]', showPreview && 'bg-muted text-fg')} title="Toggle preview">
              {showPreview ? <Code2 size={14} /> : <Eye size={14} />} Preview
            </button>
            <button onClick={() => setShowTerm((v) => !v)} className={clsx('btn-ghost px-2 py-1 text-[12px]', showTerm && 'bg-muted text-fg')} title="Toggle terminal">
              <TerminalSquare size={14} /> Terminal
            </button>
          </div>
        </div>

        {activePending && active && (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[12px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <Sparkles size={13} />
            <span className="flex-1">FLOAT agent modified this file ({activePending.ids.length} change{activePending.ids.length > 1 ? 's' : ''} pending review)</span>
            <button onClick={() => setDiffMode((v) => !v)} className="rounded px-2 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/40">
              {diffMode ? 'Hide diff' : 'Review diff'}
            </button>
            <button onClick={() => rejectChanges(activePending.chatId, activePending.ids)} className="rounded px-2 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/40">
              Reject
            </button>
            <button onClick={() => acceptChanges(activePending.chatId, activePending.ids)} className="rounded bg-amber-900 px-2 py-0.5 text-white dark:bg-amber-300 dark:text-amber-950">
              Accept
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            {active ? (
              diffMode && activePending ? (
                <DiffEditor
                  key={'diff-' + active}
                  original={activePending.before ?? ''}
                  modified={cb.files[active].content}
                  language={langFor(active)}
                  theme={dark ? 'vs-dark' : 'light'}
                  options={{ readOnly: true, renderSideBySide: true, fontSize: 13, minimap: { enabled: false } }}
                />
              ) : (
                <Editor
                  key={active}
                  path={active}
                  value={cb.files[active].content}
                  language={langFor(active)}
                  theme={dark ? 'vs-dark' : 'light'}
                  onMount={onMount}
                  onChange={(v) => v != null && writeFile(active, v)}
                  loading={<div className="p-6 text-[13px] text-faint">Loading editor…</div>}
                  options={{
                    fontSize: 13,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    minimap: { enabled: true, scale: 1 },
                    smoothScrolling: true,
                    cursorSmoothCaretAnimation: 'on',
                    scrollBeyondLastLine: false,
                    padding: { top: 12 },
                    tabSize: 2,
                    bracketPairColorization: { enabled: true },
                    automaticLayout: true,
                  }}
                />
              )
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[13px] text-faint">
                <Code2 size={22} />
                <p>Open a file from the explorer</p>
                <p className="text-[12px]">
                  Select code and press <span className="kbd">{MOD} K</span> to edit with AI, <span className="kbd">{MOD} L</span> to add it to chat
                </p>
              </div>
            )}
            {inline && active && <InlineEdit path={active} sel={inline} onClose={() => setInline(null)} />}
          </div>
          {showPreview && (
            <div className="flex w-[45%] min-w-[280px] flex-col border-l border-line bg-panel">
              <Preview entry={entry} entries={htmlEntries} onEntry={setPreviewEntry} />
            </div>
          )}
        </div>
        {showTerm && (
          <div className="h-[240px] shrink-0 border-t border-line">
            <Terminal onClose={() => setShowTerm(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

function Preview({ entry, entries, onEntry }: { entry?: string; entries: string[]; onEntry: (e: string) => void }) {
  const files = useStore((s) => s.codebase.files);
  const [nonce, setNonce] = useState(0);
  const [doc, setDoc] = useState('');
  // debounce rebuilds while typing
  useEffect(() => {
    const t = setTimeout(() => setDoc(entry ? buildPreviewDoc(files, entry) : ''), 250);
    return () => clearTimeout(t);
  }, [files, entry, nonce]);
  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-[12px]">
        <Play size={12} className="text-emerald-600" />
        <select value={entry ?? ''} onChange={(e) => onEntry(e.target.value)} className="min-w-0 flex-1 truncate bg-transparent font-mono outline-none">
          {entries.length === 0 && <option value="">No HTML files</option>}
          {entries.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <button onClick={() => setNonce((n) => n + 1)} className="rounded p-1 text-faint hover:bg-muted hover:text-fg" title="Reload preview">
          <RefreshCw size={12} />
        </button>
      </div>
      <iframe key={nonce} title="Preview" className="min-h-0 flex-1 bg-white" sandbox="allow-scripts allow-forms allow-modals" srcDoc={doc} />
    </>
  );
}

function InlineEdit({ path, sel, onClose }: { path: string; sel: { selection: string; startLine: number; endLine: number }; onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const s = useStore.getState();
    const chatId = s.createChat(`Inline edit · ${path.split('/').pop()}`);
    const prompt = `Edit \`${path}\` lines ${sel.startLine}-${sel.endLine}. Instruction: ${text}\n\nSelected code:\n\`\`\`${langFor(path)}\n${sel.selection}\n\`\`\`\nRead the file, then apply the change with edit_file. Keep the rest of the file unchanged.`;
    const r = await runAgent({ chatId, prompt });
    setBusy(false);
    s.toast(r.ok ? 'Inline edit applied — review the diff' : 'Inline edit failed', r.ok ? 'success' : 'error');
    onClose();
  };
  return (
    <div className="absolute left-1/2 top-4 z-20 w-[min(560px,90%)] -translate-x-1/2 rounded-xl border border-line bg-panel p-2 shadow-2xl animate-fade-in">
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] text-faint">
        <Sparkles size={12} className="text-accent" /> Edit lines {sel.startLine}–{sel.endLine} of {path}
      </div>
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
            if (e.key === 'Escape') onClose();
          }}
          placeholder="Describe the change… (Enter to apply, Esc to cancel)"
          className="input"
        />
        <button className="btn-primary" onClick={() => void submit()} disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        </button>
      </div>
    </div>
  );
}

function SearchPanel() {
  const files = useStore((s) => s.codebase.files);
  const openFile = useStore((s) => s.openFile);
  const [q, setQ] = useState('');
  const [replace, setReplace] = useState('');
  const results = useMemo(() => {
    if (q.length < 2) return [];
    const out: { path: string; line: number; text: string }[] = [];
    const needle = q.toLowerCase();
    for (const [p, f] of Object.entries(files))
      f.content.split('\n').forEach((l, i) => l.toLowerCase().includes(needle) && out.push({ path: p, line: i + 1, text: l.trim() }));
    return out.slice(0, 300);
  }, [q, files]);
  const replaceAll = () => {
    const s = useStore.getState();
    let n = 0;
    for (const [p, f] of Object.entries(files)) {
      const parts = f.content.split(q);
      if (parts.length > 1) {
        n += parts.length - 1;
        s.writeFile(p, parts.join(replace));
      }
    }
    s.toast(`Replaced ${n} occurrence${n === 1 ? '' : 's'}`, 'success');
  };
  return (
    <div className="p-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="input mb-1.5 py-1.5" autoFocus />
      <div className="mb-2 flex gap-1">
        <input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Replace" className="input py-1.5" />
        <button className="btn-outline px-2 py-1 text-[11px]" disabled={!q} onClick={replaceAll} title="Replace all (case-sensitive)">
          All
        </button>
      </div>
      {q.length >= 2 && <div className="mb-1 px-1 text-[11px] text-faint">{results.length} results</div>}
      {results.map((r, i) => (
        <button key={i} onClick={() => openFile(r.path)} className="block w-full rounded px-1.5 py-1 text-left hover:bg-muted">
          <div className="truncate font-mono text-[11px] text-faint">
            {r.path}:{r.line}
          </div>
          <div className="truncate text-[12px]">{r.text}</div>
        </button>
      ))}
    </div>
  );
}

function ProjectMenu() {
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const s = useStore.getState();
  const load = (files: Record<string, string>, name: string) => {
    const now = Date.now();
    const first = Object.keys(files).find((p) => /readme/i.test(p)) ?? Object.keys(files)[0] ?? null;
    s.replaceCodebase({
      name,
      files: Object.fromEntries(Object.entries(files).map(([p, c]) => [p, { content: c, updatedAt: now }])),
      openTabs: first ? [first] : [],
      activePath: first,
    });
    s.toast(`Imported ${Object.keys(files).length} files`, 'success');
  };
  return (
    <>
      <input
        ref={folderInput}
        type="file"
        hidden
        multiple
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={async (e) => {
          if (!e.target.files?.length) return;
          const rel = (e.target.files[0] as File & { webkitRelativePath: string }).webkitRelativePath;
          load(await importFileList(e.target.files), rel.split('/')[0] || 'project');
          e.target.value = '';
        }}
      />
      <input
        ref={zipInput}
        type="file"
        hidden
        accept=".zip"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          load(await importZip(f), f.name.replace(/\.zip$/, ''));
          e.target.value = '';
        }}
      />
      <Popover
        align="right"
        trigger={(_, toggle) => (
          <button onClick={toggle} className="rounded-md p-1.5 text-faint hover:bg-muted hover:text-fg" aria-label="Project actions">
            <MoreHorizontal size={15} />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuItem icon={<FolderUp size={14} />} onClick={() => (folderInput.current?.click(), close())}>
              Open local folder
            </MenuItem>
            <MenuItem icon={<FileArchive size={14} />} onClick={() => (zipInput.current?.click(), close())}>
              Import .zip
            </MenuItem>
            <MenuItem icon={<GithubIcon size={14} />} onClick={() => (s.setView('integrations'), close())}>
              Import from GitHub
            </MenuItem>
            <MenuItem icon={<Download size={14} />} onClick={() => (void exportZip(useStore.getState().codebase), close())}>
              Download as .zip
            </MenuItem>
            <MenuItem
              icon={<MessageSquarePlus size={14} />}
              onClick={() => {
                s.seedComposer('Explore this codebase and give me an architecture overview with the key modules and how they interact.');
                s.newChat();
                close();
              }}
            >
              Ask FLOAT about this codebase
            </MenuItem>
            <div className="my-1 border-t border-line" />
            <MenuItem
              icon={<RotateCcw size={14} />}
              danger
              onClick={() => {
                if (confirm('Replace the workspace with the starter project?')) s.replaceCodebase(seedCodebase());
                close();
              }}
            >
              Reset to starter project
            </MenuItem>
          </>
        )}
      </Popover>
    </>
  );
}

function GitPanel() {
  const gh = useStore((s) => s.codebase.github)!;
  const token = useStore((s) => s.settings.githubToken);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const commit = async () => {
    const s = useStore.getState();
    if (!token) return s.toast('Connect GitHub in Integrations first', 'error');
    setBusy(true);
    try {
      const files = Object.fromEntries(Object.entries(s.codebase.files).map(([p, f]) => [p, f.content]));
      const c = await githubCommit(token, gh.owner, gh.repo, gh.branch, files, msg || 'Update from FLOAT');
      s.toast(`Pushed ${c.sha.slice(0, 7)} to ${gh.branch}`, 'success');
      setMsg('');
    } catch (e) {
      s.toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-t border-line p-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-sub">
        <GithubIcon size={12} />
        <span className="truncate">
          {gh.owner}/{gh.repo}
        </span>
        <span className="ml-auto rounded bg-muted px-1 font-mono text-[10px]">{gh.branch}</span>
      </div>
      <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Commit message" className="input mb-1.5 py-1 text-[12px]" />
      <button onClick={() => void commit()} disabled={busy} className="btn-primary w-full py-1 text-[12px]">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <GitCommitHorizontal size={13} />} Commit & push
      </button>
    </div>
  );
}
