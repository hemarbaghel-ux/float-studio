import React, { useEffect, useRef, useState } from 'react';
import { FileUp, FolderUp, Github, Loader2, Package, Paperclip, Plus, X, LayoutDashboard, Cpu, Bug, Wand2, TestTube2, FileText, SearchCode } from 'lucide-react';
import { importFileList, importZip } from './projectIO';

export type Attachments = Record<string, string>;

/** "+" button: attach files, a folder, a .zip or a public GitHub repo to the new chat. */
export function AttachMenu({ onAttach, disabled, dropDown }: { onAttach: (files: Attachments, label: string) => void; disabled?: boolean; dropDown?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repo, setRepo] = useState('');
  const [showRepo, setShowRepo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (folderRef.current) folderRef.current.setAttribute('webkitdirectory', '');
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const wrap = async (fn: () => Promise<[Attachments, string]>) => {
    setBusy(true);
    setError(null);
    try {
      const [files, label] = await fn();
      if (Object.keys(files).length === 0) throw new Error('No readable text files were found.');
      onAttach(files, label);
      setOpen(false);
      setShowRepo(false);
      setRepo('');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const importRepo = () =>
    wrap(async () => {
      const m = repo.trim().replace(/\.git$/, '').match(/(?:github\.com\/)?([\w.-]+)\/([\w.-]+)(?:\/tree\/([\w./-]+))?/);
      if (!m) throw new Error('Use owner/repo or a github.com URL.');
      const [, owner, name, ref] = m;
      const res = await fetch(`https://api.github.com/repos/${owner}/${name}/zipball${ref ? `/${ref}` : ''}`);
      if (!res.ok) throw new Error(res.status === 404 ? 'Repository not found (private repos need GitHub sync).' : `GitHub returned ${res.status}`);
      const blob = await res.blob();
      const files = await importZip(new File([blob], `${name}.zip`));
      return [files, `${owner}/${name}`];
    });

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Attach context or files"
        aria-label="Attach context or files"
        className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 flex items-center justify-center text-slate-500 dark:text-[#8B949E] hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} />}
      </button>
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => e.target.files && wrap(async () => [await importFileList(e.target.files!), `${e.target.files!.length} file(s)`])} />
      <input ref={folderRef} type="file" multiple hidden onChange={(e) => e.target.files && wrap(async () => {
        const first = (e.target.files![0] as any)?.webkitRelativePath?.split('/')[0] || 'folder';
        return [await importFileList(e.target.files!), first];
      })} />
      <input ref={zipRef} type="file" accept=".zip" hidden onChange={(e) => e.target.files?.[0] && wrap(async () => [await importZip(e.target.files![0]), e.target.files![0].name])} />
      {open && (
        <div className={`absolute left-0 ${dropDown ? 'top-full mt-2' : 'bottom-full mb-2'} z-40 w-64 rounded-xl border border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] p-1 shadow-2xl`}>
          {showRepo ? (
            <div className="p-2">
              <div className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-[#8B949E]">Public GitHub repository</div>
              <input
                autoFocus
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void importRepo()}
                placeholder="owner/repo"
                className="w-full rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0A0A] px-2.5 py-1.5 text-xs focus:outline-none"
              />
              <div className="mt-2 flex justify-end gap-1.5">
                <button onClick={() => setShowRepo(false)} className="px-2 py-1 text-xs text-slate-500 cursor-pointer">Back</button>
                <button onClick={() => void importRepo()} disabled={!repo.trim() || busy} className="px-2.5 py-1 rounded-md bg-slate-900 dark:bg-white text-white dark:text-black text-xs font-semibold disabled:opacity-40 cursor-pointer">
                  Import
                </button>
              </div>
            </div>
          ) : (
            <>
              <Item icon={FileUp} label="Upload files" hint="Text & code files" onClick={() => fileRef.current?.click()} />
              <Item icon={FolderUp} label="Upload folder" hint="Keeps folder structure" onClick={() => folderRef.current?.click()} />
              <Item icon={Package} label="Import .zip" hint="node_modules & binaries skipped" onClick={() => zipRef.current?.click()} />
              <Item icon={Github} label="Import GitHub repo" hint="Public repositories" onClick={() => setShowRepo(true)} />
            </>
          )}
          {error && <div className="m-1 rounded-md bg-rose-50 dark:bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-600 dark:text-rose-400">{error}</div>}
        </div>
      )}
    </div>
  );
}

function Item({ icon: Icon, label, hint, onClick }: { icon: any; label: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer">
      <Icon size={14} className="text-slate-500 dark:text-[#8B949E]" />
      <span>
        <span className="block text-xs font-medium text-slate-900 dark:text-white">{label}</span>
        <span className="block text-[10px] text-slate-400 dark:text-[#6E7681]">{hint}</span>
      </span>
    </button>
  );
}

export function AttachmentChips({ groups, onRemove }: { groups: { label: string; count: number }[]; onRemove: (label: string) => void }) {
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {groups.map((g) => (
        <span key={g.label} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-1 text-[11px] text-slate-700 dark:text-[#C9D1D9]">
          <Paperclip size={11} />
          <span className="max-w-[180px] truncate">{g.label}</span>
          <span className="text-slate-400">{g.count} file{g.count === 1 ? '' : 's'}</span>
          <button onClick={() => onRemove(g.label)} aria-label={`Remove ${g.label}`} className="text-slate-400 hover:text-rose-500 cursor-pointer">
            <X size={11} />
          </button>
        </span>
      ))}
    </div>
  );
}

export const SLASH_COMMANDS = [
  { cmd: '/fix', icon: Bug, desc: 'Find and fix a bug', template: 'Find and fix the bug: ' },
  { cmd: '/explain', icon: SearchCode, desc: 'Explain how code works', template: 'Explain how this works, step by step: ' },
  { cmd: '/test', icon: TestTube2, desc: 'Write tests', template: 'Write thorough unit tests for: ' },
  { cmd: '/refactor', icon: Wand2, desc: 'Refactor for clarity', template: 'Refactor for readability and performance without changing behavior: ' },
  { cmd: '/docs', icon: FileText, desc: 'Write documentation', template: 'Write clear documentation (README + docstrings) for: ' },
];

/** Popup shown when the prompt starts with "/". Arrow keys + Enter/Tab select. */
export function SlashMenu({ prompt, index, onPick, dropDown }: { prompt: string; index: number; onPick: (template: string) => void; dropDown?: boolean }) {
  const items = slashMatches(prompt);
  if (items.length === 0) return null;
  return (
    <div className={`absolute left-3 right-3 ${dropDown ? 'top-full mt-1' : 'bottom-full mb-2'} z-40 rounded-xl border border-slate-200 dark:border-[#2A2A2A] bg-white dark:bg-[#141414] p-1 shadow-2xl`}>
      {items.map((c, i) => (
        <button
          key={c.cmd}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(c.template);
          }}
          className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs cursor-pointer ${i === index ? 'bg-slate-100 dark:bg-white/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
        >
          <c.icon size={13} className="text-slate-500" />
          <span className="font-mono font-semibold text-slate-900 dark:text-white">{c.cmd}</span>
          <span className="text-slate-400 dark:text-[#8B949E]">{c.desc}</span>
        </button>
      ))}
    </div>
  );
}

export function slashMatches(prompt: string) {
  if (!/^\/\w*$/.test(prompt)) return [];
  return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(prompt.toLowerCase()));
}

export const SUGGESTIONS = [
  { icon: LayoutDashboard, text: 'Build a responsive dashboard in React' },
  { icon: Cpu, text: 'Explain Python asyncio event loop' },
  { icon: Bug, text: 'Debug authentication race condition' },
];

export function SuggestionChips({ onPick, disabled }: { onPick: (text: string) => void; disabled?: boolean }) {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {SUGGESTIONS.map((s) => (
        <button
          key={s.text}
          disabled={disabled}
          onClick={() => onPick(s.text)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] px-3 py-1.5 text-xs text-slate-600 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 transition-colors cursor-pointer disabled:opacity-50"
        >
          <s.icon size={12} /> {s.text}
        </button>
      ))}
    </div>
  );
}
