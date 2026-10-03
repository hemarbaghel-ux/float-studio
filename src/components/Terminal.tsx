import { useEffect, useRef, useState } from 'react';
import { Cloud, Trash2, X } from 'lucide-react';
import { getState, useStore } from '../lib/store';
import { runShell } from '../lib/sandbox';

interface Line {
  kind: 'in' | 'out' | 'err' | 'sys';
  text: string;
}

export function Terminal({ onClose }: { onClose: () => void }) {
  const cloud = useStore((s) => s.cloud);
  const setModal = useStore((s) => s.setModal);
  const [lines, setLines] = useState<Line[]>([{ kind: 'sys', text: 'Float cloud sandbox · type `help` for commands' }]);
  const [input, setInput] = useState('');
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [lines]);

  const exec = async (cmd: string) => {
    if (!cmd.trim()) return;
    setHist((h) => [cmd, ...h].slice(0, 50));
    setHi(-1);
    if (cmd.trim() === 'clear') return setLines([]);
    setLines((l) => [...l, { kind: 'in', text: cmd }]);
    setBusy(true);
    const r = await runShell(cmd, {
      files: () => Object.fromEntries(Object.entries(getState().codebase.files).map(([p, f]) => [p, f.content])),
      write: (p, c) => getState().writeFile(p, c),
      remove: (p) => getState().deleteFile(p),
    });
    setBusy(false);
    setLines((l) => [...l, { kind: r.code === 0 ? 'out' : 'err', text: r.output }]);
  };

  return (
    <div className="flex h-full flex-col bg-[#0d0f14] font-mono text-[12px] text-[#d7dae0]" onClick={() => inputRef.current?.focus()}>
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-white/10 px-3 text-[11px] uppercase tracking-wider text-white/50">
        <span>Terminal</span>
        {cloud.active && <span className="normal-case tracking-normal text-emerald-400">● {cloud.region}</span>}
        <span className="flex-1" />
        <button className="rounded p-1 hover:bg-white/10" onClick={() => setLines([])} title="Clear">
          <Trash2 size={12} />
        </button>
        <button className="rounded p-1 hover:bg-white/10" onClick={onClose} title="Close terminal">
          <X size={12} />
        </button>
      </div>
      {!cloud.active ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-white/60">
          <Cloud size={18} />
          <p className="font-sans text-[13px]">The terminal runs in a cloud session.</p>
          <button className="btn rounded-lg bg-white px-3 py-1 font-sans text-[12px] font-medium text-black hover:bg-white/90" onClick={() => setModal('session')}>
            Start session
          </button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {lines.map((l, i) => (
            <div key={i} className={l.kind === 'err' ? 'whitespace-pre-wrap text-red-300' : l.kind === 'sys' ? 'text-white/40' : 'whitespace-pre-wrap'}>
              {l.kind === 'in' ? (
                <>
                  <span className="text-emerald-400">float@cloud</span>
                  <span className="text-white/40">:~/workspace$ </span>
                  {l.text}
                </>
              ) : (
                l.text
              )}
            </div>
          ))}
          <div className="flex items-center" ref={end}>
            <span className="text-emerald-400">float@cloud</span>
            <span className="text-white/40">:~/workspace$&nbsp;</span>
            <input
              ref={inputRef}
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const c = input;
                  setInput('');
                  void exec(c);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const n = Math.min(hist.length - 1, hi + 1);
                  if (hist[n] != null) (setHi(n), setInput(hist[n]));
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const n = hi - 1;
                  setHi(Math.max(-1, n));
                  setInput(n >= 0 ? hist[n] : '');
                } else if (e.key === 'l' && e.ctrlKey) {
                  e.preventDefault();
                  setLines([]);
                }
              }}
              className="flex-1 bg-transparent outline-none"
              autoFocus
              spellCheck={false}
              aria-label="Terminal input"
            />
            {busy && <span className="text-white/40">running…</span>}
          </div>
        </div>
      )}
    </div>
  );
}
