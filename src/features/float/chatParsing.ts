import { diffLines } from 'diff';

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'file'; path: string; lang: string; content: string; complete: boolean }
  | { kind: 'delete'; path: string };

/**
 * Splits an assistant reply into prose and file edits.
 * File edits use fenced blocks with a path:  ```ts path=src/app.ts
 * Deletions use:                              ```delete path=old.ts```
 * An unterminated block (still streaming) is returned with complete=false.
 */
export function parseSegments(text: string): Segment[] {
  const out: Segment[] = [];
  const blockRe = /```([^\n]*)\n([\s\S]*?)(```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = blockRe.exec(text))) {
    const [, rawHeader, rawBody, close] = m;
    const header = rawHeader.trim();

    // Check if this block specifies a file path
    const isDelete = /^delete\b/i.test(header);
    let extractedPath: string | null = null;
    let lang = '';
    let body = rawBody;

    if (isDelete) {
      const match = header.match(/^delete[ \t]+(?:path|filename|file)=["']?([^\s"'>`]+)["']?/i);
      if (match) {
        extractedPath = match[1];
      }
    } else {
      // 1. Check path attribute in header: path=..., filename=..., file=...
      const attrMatch = header.match(/^([\w+.#-]*)[ \t]+(?:path|filename|file)=["']?([^\s"'>`]+)["']?/i);
      if (attrMatch) {
        lang = attrMatch[1] || '';
        extractedPath = attrMatch[2];
      } else {
        // 2. Check colon format: lang:path/to/file.ext
        const colonMatch = header.match(/^([\w+.#-]+):([^\s"'>`]+)$/);
        if (colonMatch && (colonMatch[2].includes('/') || colonMatch[2].includes('\\') || colonMatch[2].includes('.'))) {
          lang = colonMatch[1];
          extractedPath = colonMatch[2];
        } else {
          // 3. Check top-line comment inside body: // filepath: ... or # filepath: ...
          const commentMatch = body.match(/^(?:\/\/\s*|#\s*|\/\*\s*)(?:filepath|file|path):\s*["']?([^\s"'>`*]+)["']?\s*(?:\*\/)?\r?\n/i);
          if (commentMatch) {
            lang = header.split(/\s+/)[0] || '';
            extractedPath = commentMatch[1];
            body = body.slice(commentMatch[0].length);
          }
        }
      }
    }

    if (extractedPath) {
      if (m.index > last) {
        out.push({ kind: 'text', text: text.slice(last, m.index) });
      }
      const cleanPath = extractedPath
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\\/g, '/')
        .replace(/^\.?\/+/, '');

      if (isDelete) {
        out.push({ kind: 'delete', path: cleanPath });
      } else {
        out.push({
          kind: 'file',
          path: cleanPath,
          lang: lang || 'plaintext',
          content: body.replace(/\n$/, ''),
          complete: close === '```'
        });
      }
      last = blockRe.lastIndex;
      if (!close) break;
    }
  }

  if (last < text.length) {
    out.push({ kind: 'text', text: text.slice(last) });
  }

  // Handle single-line delete forms: ```delete path=x``` (which have no newline after ```delete)
  return out
    .flatMap((s) => {
      if (s.kind !== 'text') return [s];
      const parts: Segment[] = [];
      const dre = /```delete[ \t]+(?:path|filename|file)=["']?([^\s"'>`]+)["']?\s*```/gi;
      let i = 0;
      let d: RegExpExecArray | null;
      while ((d = dre.exec(s.text))) {
        if (d.index > i) parts.push({ kind: 'text', text: s.text.slice(i, d.index) });
        const cleanPath = d[1].trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/').replace(/^\.?\/+/, '');
        parts.push({ kind: 'delete', path: cleanPath });
        i = dre.lastIndex;
      }
      if (i < s.text.length) parts.push({ kind: 'text', text: s.text.slice(i) });
      return parts;
    })
    .filter((s) => s.kind !== 'text' || s.text.trim().length > 0);
}

export function diffStats(before: string | undefined, after: string) {
  let added = 0;
  let removed = 0;
  for (const part of diffLines(before ?? '', after)) {
    const n = part.count ?? part.value.split('\n').length - 1;
    if (part.added) added += n;
    else if (part.removed) removed += n;
  }
  return { added, removed };
}

export interface DiffRow {
  type: 'add' | 'del' | 'ctx' | 'gap';
  text: string;
  oldNo?: number;
  newNo?: number;
}

/** Unified diff rows with 3 lines of context, collapsing unchanged regions. */
export function diffRows(before: string | undefined, after: string, context = 3): DiffRow[] {
  const rows: DiffRow[] = [];
  let o = 1;
  let n = 1;
  for (const part of diffLines(before ?? '', after)) {
    const lines = part.value.replace(/\n$/, '').split('\n');
    for (const line of lines) {
      if (part.added) rows.push({ type: 'add', text: line, newNo: n++ });
      else if (part.removed) rows.push({ type: 'del', text: line, oldNo: o++ });
      else rows.push({ type: 'ctx', text: line, oldNo: o++, newNo: n++ });
    }
  }
  const keep = rows.map((r) => r.type !== 'ctx');
  const near = rows.map((_, i) => {
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) if (keep[k]) return true;
    return false;
  });
  const out: DiffRow[] = [];
  let skipped = 0;
  rows.forEach((r, i) => {
    if (near[i]) {
      if (skipped) out.push({ type: 'gap', text: `${skipped} unchanged line${skipped === 1 ? '' : 's'}` });
      skipped = 0;
      out.push(r);
    } else skipped++;
  });
  if (skipped && out.length) out.push({ type: 'gap', text: `${skipped} unchanged line${skipped === 1 ? '' : 's'}` });
  return out;
}

export const CODING_ASSISTANT_SYSTEM_PROMPT = `You are FLOAT, a coding assistant helping the user prepare changes for review.
- Read the provided workspace files carefully before answering.
- When you create or modify a file, output the COMPLETE new file content in a fenced code block whose info string includes the path, e.g.:
\`\`\`tsx path=src/components/Button.tsx
...entire file...
\`\`\`
- To delete a file, output: \`\`\`delete path=old/file.ts\`\`\`
- Never output partial files or "rest unchanged" placeholders inside path blocks. Use normal fenced blocks (without path=) for snippets that should not be written.
- Keep explanations short: a one-line plan before the edits, and a brief summary (plus how to run/test) after.
- If tests exist or you add them, use the repository's configured test command for this browser worker environment.`;
