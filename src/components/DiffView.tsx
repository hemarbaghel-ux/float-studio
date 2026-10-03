import { useMemo } from 'react';
import { diffLines } from 'diff';
import clsx from 'clsx';

interface Row {
  type: 'add' | 'del' | 'ctx' | 'gap';
  text: string;
  a?: number;
  b?: number;
}

export function diffStats(before: string | null, after: string | null) {
  let add = 0;
  let del = 0;
  for (const part of diffLines(before ?? '', after ?? '')) {
    const n = part.count ?? 0;
    if (part.added) add += n;
    else if (part.removed) del += n;
  }
  return { add, del };
}

export function DiffView({ before, after, context = 3, maxRows = 400 }: { before: string | null; after: string | null; context?: number; maxRows?: number }) {
  const rows = useMemo(() => {
    const out: Row[] = [];
    let a = 1;
    let b = 1;
    for (const part of diffLines(before ?? '', after ?? '')) {
      const lines = part.value.replace(/\n$/, '').split('\n');
      for (const l of lines) {
        if (part.added) out.push({ type: 'add', text: l, b: b++ });
        else if (part.removed) out.push({ type: 'del', text: l, a: a++ });
        else out.push({ type: 'ctx', text: l, a: a++, b: b++ });
      }
    }
    // collapse unchanged regions far from changes
    const keep = out.map((r) => r.type !== 'ctx');
    const near = out.map((_, i) => {
      for (let d = -context; d <= context; d++) if (keep[i + d]) return true;
      return false;
    });
    const collapsed: Row[] = [];
    let skipped = 0;
    out.forEach((r, i) => {
      if (near[i]) {
        if (skipped) collapsed.push({ type: 'gap', text: `${skipped} unchanged line${skipped > 1 ? 's' : ''}` });
        skipped = 0;
        collapsed.push(r);
      } else skipped++;
    });
    if (skipped) collapsed.push({ type: 'gap', text: `${skipped} unchanged line${skipped > 1 ? 's' : ''}` });
    return collapsed;
  }, [before, after, context]);

  return (
    <div className="max-h-[360px] overflow-auto font-mono text-[12px] leading-[1.6]">
      <table className="w-full border-collapse">
        <tbody>
          {rows.slice(0, maxRows).map((r, i) =>
            r.type === 'gap' ? (
              <tr key={i} className="bg-muted/60 text-faint">
                <td colSpan={3} className="px-3 py-0.5 text-[11px]">
                  ⋯ {r.text}
                </td>
              </tr>
            ) : (
              <tr
                key={i}
                className={clsx(
                  r.type === 'add' && 'bg-emerald-500/10',
                  r.type === 'del' && 'bg-red-500/10',
                )}
              >
                <td className="w-10 select-none px-2 text-right text-faint">{r.a ?? ''}</td>
                <td className="w-10 select-none px-2 text-right text-faint">{r.b ?? ''}</td>
                <td className="whitespace-pre px-2">
                  <span className={clsx('mr-2 select-none', r.type === 'add' ? 'text-emerald-600' : r.type === 'del' ? 'text-red-500' : 'text-faint')}>
                    {r.type === 'add' ? '+' : r.type === 'del' ? '−' : ' '}
                  </span>
                  {r.text}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {rows.length > maxRows && <div className="px-3 py-1 text-[11px] text-faint">… diff truncated</div>}
    </div>
  );
}
