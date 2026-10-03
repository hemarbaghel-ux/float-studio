import JSZip from 'jszip';
import type { Codebase } from './types';

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', md: 'markdown', css: 'css', scss: 'scss', html: 'html', htm: 'html', py: 'python', rs: 'rust',
  go: 'go', java: 'java', rb: 'ruby', php: 'php', sh: 'shell', yml: 'yaml', yaml: 'yaml', sql: 'sql', xml: 'xml',
  svg: 'xml', c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp', kt: 'kotlin', swift: 'swift', toml: 'ini', env: 'ini',
};

export function langFor(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? 'plaintext';
}

export function normalizePath(p: string) {
  return p
    .replace(/\\/g, '/')
    .replace(/^\.?\/+/, '')
    .split('/')
    .reduce<string[]>((acc, seg) => {
      if (!seg || seg === '.') return acc;
      if (seg === '..') acc.pop();
      else acc.push(seg);
      return acc;
    }, [])
    .join('/');
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children: TreeNode[];
}

export function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', type: 'dir', children: [] };
  for (const p of [...paths].sort()) {
    const segs = p.split('/');
    let cur = root;
    segs.forEach((seg, i) => {
      const path = segs.slice(0, i + 1).join('/');
      const isFile = i === segs.length - 1;
      let next = cur.children.find((c) => c.name === seg && c.type === (isFile ? 'file' : 'dir'));
      if (!next) {
        next = { name: seg, path, type: isFile ? 'file' : 'dir', children: [] };
        cur.children.push(next);
      }
      cur = next;
    });
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    n.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|eot|mp[34]|mov|wasm|lock)$/i;
const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|\.cache|coverage)(\/|$)/;

export function isImportable(path: string, size: number) {
  return !BINARY.test(path) && !SKIP.test(path) && size < 400_000;
}

export async function exportZip(cb: Codebase) {
  const zip = new JSZip();
  for (const [p, f] of Object.entries(cb.files)) zip.file(p, f.content);
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${cb.name || 'project'}.zip`);
}

export async function importZip(file: File): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(file);
  const out: Record<string, string> = {};
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  // strip common top-level folder (GitHub style zips)
  const tops = new Set(entries.map((e) => e.name.split('/')[0]));
  const strip = tops.size === 1 && entries.every((e) => e.name.includes('/'));
  for (const e of entries) {
    const p = strip ? e.name.split('/').slice(1).join('/') : e.name;
    if (!p || !isImportable(p, 0)) continue;
    out[p] = await e.async('string');
  }
  return out;
}

export async function importFileList(list: FileList): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const arr = Array.from(list);
  const rels = arr.map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
  const strip = rels.length > 0 && rels.every((r) => r.includes('/')) && new Set(rels.map((r) => r.split('/')[0])).size === 1;
  await Promise.all(
    arr.map(async (f, i) => {
      const rel = strip ? rels[i].split('/').slice(1).join('/') : rels[i];
      if (!isImportable(rel, f.size)) return;
      out[normalizePath(rel)] = await f.text();
    }),
  );
  return out;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readAsDataUrl(file: File) {
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

/** Build a self-contained HTML document for the preview iframe by inlining local css/js. */
export function buildPreviewDoc(files: Record<string, { content: string }>, entry: string) {
  const html = files[entry]?.content;
  if (html == null) return '<p style="font-family:sans-serif;padding:24px;color:#888">No HTML entry file.</p>';
  const dir = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : '';
  const resolve = (href: string) => normalizePath(dir + href);
  return html
    .replace(/<link([^>]*?)href=["']([^"']+)["']([^>]*)>/gi, (m, a, href, b) => {
      if (/^https?:|^\/\//.test(href) || !/stylesheet/i.test(a + b)) return m;
      const css = files[resolve(href)]?.content;
      return css != null ? `<style data-src="${href}">\n${css}\n</style>` : m;
    })
    .replace(/<script([^>]*?)src=["']([^"']+)["']([^>]*)><\/script>/gi, (m, a, src, b) => {
      if (/^https?:|^\/\//.test(src)) return m;
      const js = files[resolve(src)]?.content;
      return js != null ? `<script${a}${b} data-src="${src}">\n${js.replace(/<\/script>/g, '<\\/script>')}\n</script>` : m;
    });
}
