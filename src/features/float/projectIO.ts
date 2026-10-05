import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import type { FileNode } from '../../types';
import { flattenFileTree } from '../../lib/utils';

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

const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|eot|mp[34]|mov|wasm|lock|exe|dll|so)$/i;
const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|\.cache|coverage|__pycache__|\.venv|venv)(\/|$)/;
const SENSITIVE = /(^|\/)\.env(?:\/|\.|$)|(^|\/)(id_rsa|id_ed25519)(?:\.|$)|\.(pem|key|p12|pfx|keystore)$/i;
export const MAX_IMPORT_FILES = 300;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export function isImportable(path: string, size: number) {
  return !BINARY.test(path) && !SKIP.test(path) && !SENSITIVE.test(path) && size < 400_000;
}

/** Map of path -> content for the sandbox / AI context. */
export function filesToMap(files: FileNode[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of flattenFileTree(files)) if (f.type === 'file') out[f.path] = f.content ?? '';
  return out;
}

/** Convert a flat path map into FLOAT's nested FileNode tree. */
export function mapToTree(map: Record<string, string>): FileNode[] {
  const root: FileNode[] = [];
  const paths = Object.keys(map).sort();
  for (const path of paths) {
    const segs = path.split('/');
    let level = root;
    segs.forEach((seg, i) => {
      const isFile = i === segs.length - 1;
      let node = level.find((n) => n.name === seg && n.type === (isFile ? 'file' : 'folder'));
      if (!node) {
        node = isFile
          ? { id: uuidv4(), name: seg, type: 'file', content: map[path] }
          : { id: uuidv4(), name: seg, type: 'folder', children: [], isOpen: i === 0 };
        level.push(node);
      }
      if (!isFile) level = node.children!;
    });
  }
  const sort = (nodes: FileNode[]) => {
    nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
    nodes.forEach((n) => n.children && sort(n.children));
  };
  sort(root);
  return root;
}

export async function importZip(file: File): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  const tops = new Set(entries.map((e) => e.name.split('/')[0]));
  const strip = tops.size === 1 && entries.every((e) => e.name.includes('/'));
  const out: Record<string, string> = {};
  let totalSize = 0;
  for (const e of entries) {
    if (/(^|\/)\.\.(\/|$)/.test(e.name) || e.name.includes('\0')) continue;
    const p = normalizePath(strip ? e.name.split('/').slice(1).join('/') : e.name);
    if (!p || !isImportable(p, Number((e as any)._data?.uncompressedSize || 0))) continue;
    if (Object.keys(out).length >= MAX_IMPORT_FILES) break;
    const content = await e.async('string');
    const size = new TextEncoder().encode(content).byteLength;
    if (!isImportable(p, size)) continue;
    if (totalSize + size > MAX_IMPORT_BYTES) throw new Error('Repository exceeds the 10 MB text import limit. Import a smaller folder or branch.');
    totalSize += size;
    out[p] = content;
  }
  return out;
}

export async function importFileList(list: FileList | File[]): Promise<Record<string, string>> {
  const arr = Array.from(list);
  const rels = arr.map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
  const strip = rels.length > 0 && rels.every((r) => r.includes('/')) && new Set(rels.map((r) => r.split('/')[0])).size === 1;
  const out: Record<string, string> = {};
  let totalSize = 0;
  for (let i = 0; i < arr.length && Object.keys(out).length < MAX_IMPORT_FILES; i++) {
    if (/(^|\/)\.\.(\/|$)/.test(rels[i]) || rels[i].includes('\0')) continue;
    const rel = normalizePath(strip ? rels[i].split('/').slice(1).join('/') : rels[i]);
    if (!rel || !isImportable(rel, arr[i].size)) continue;
    totalSize += arr[i].size;
    if (totalSize > MAX_IMPORT_BYTES) throw new Error('Folder exceeds the 10 MB text import limit. Choose a smaller folder.');
    out[rel] = await arr[i].text();
  }
  return out;
}

export async function exportZip(name: string, files: FileNode[]) {
  const zip = new JSZip();
  for (const [p, c] of Object.entries(filesToMap(files))) zip.file(p, c);
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(name || 'project').replace(/[^\w.-]+/g, '-')}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseStoredFiles(raw: unknown): FileNode[] {
  if (Array.isArray(raw)) return raw as FileNode[];
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}
