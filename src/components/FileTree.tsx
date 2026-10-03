import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronRight, File, FileCode2, FileJson, FileText, Folder, FolderOpen, Pencil, Trash2, FilePlus2, FolderPlus } from 'lucide-react';
import { useStore } from '../lib/store';
import { buildTree, normalizePath, type TreeNode } from '../lib/files';

function iconFor(name: string) {
  if (/\.(json)$/.test(name)) return <FileJson size={14} className="text-amber-500" />;
  if (/\.(md|txt)$/.test(name)) return <FileText size={14} className="text-sky-500" />;
  if (/\.(tsx?|jsx?|mjs|cjs|py|go|rs|html|css)$/.test(name)) return <FileCode2 size={14} className={/\.tsx?$/.test(name) ? 'text-blue-500' : /\.html$/.test(name) ? 'text-orange-500' : /\.css$/.test(name) ? 'text-violet-500' : 'text-yellow-500'} />;
  return <File size={14} className="text-faint" />;
}

export function FileTree({ changedPaths }: { changedPaths: Set<string> }) {
  const files = useStore((s) => s.codebase.files);
  const active = useStore((s) => s.codebase.activePath);
  const tree = useMemo(() => buildTree(Object.keys(files)), [files]);
  const [open, setOpen] = useState<Record<string, boolean>>({ src: true });
  const [creating, setCreating] = useState<null | { dir: string; kind: 'file' | 'folder' }>(null);

  return (
    <div className="py-1 text-[13px]">
      <div className="flex items-center justify-end gap-0.5 px-2 pb-1">
        <button className="rounded p-1 text-faint hover:bg-muted hover:text-fg" title="New file" onClick={() => setCreating({ dir: '', kind: 'file' })}>
          <FilePlus2 size={14} />
        </button>
        <button className="rounded p-1 text-faint hover:bg-muted hover:text-fg" title="New folder" onClick={() => setCreating({ dir: '', kind: 'folder' })}>
          <FolderPlus size={14} />
        </button>
      </div>
      {creating?.dir === '' && <NewEntry dir="" kind={creating.kind} onDone={() => setCreating(null)} depth={0} />}
      {tree.map((n) => (
        <Node key={n.path} node={n} depth={0} open={open} setOpen={setOpen} active={active} changed={changedPaths} creating={creating} setCreating={setCreating} />
      ))}
      {tree.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-faint">Empty workspace. Create a file or import a project.</p>}
    </div>
  );
}

function NewEntry({ dir, kind, onDone, depth }: { dir: string; kind: 'file' | 'folder'; onDone: () => void; depth: number }) {
  const [name, setName] = useState('');
  const { writeFile, openFile } = useStore.getState();
  const commit = () => {
    const n = name.trim();
    if (n) {
      const path = normalizePath((dir ? dir + '/' : '') + n + (kind === 'folder' ? '/.gitkeep' : ''));
      writeFile(path, '');
      if (kind === 'file') openFile(path);
    }
    onDone();
  };
  return (
    <div style={{ paddingLeft: 12 + depth * 12 }} className="pr-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onDone();
        }}
        placeholder={kind === 'file' ? 'filename.ts' : 'folder'}
        className="w-full rounded border border-fg/30 bg-surface px-1.5 py-0.5 font-mono text-[12px] outline-none"
      />
    </div>
  );
}

function Node({
  node,
  depth,
  open,
  setOpen,
  active,
  changed,
  creating,
  setCreating,
}: {
  node: TreeNode;
  depth: number;
  open: Record<string, boolean>;
  setOpen: (f: (o: Record<string, boolean>) => Record<string, boolean>) => void;
  active: string | null;
  changed: Set<string>;
  creating: null | { dir: string; kind: 'file' | 'folder' };
  setCreating: (c: null | { dir: string; kind: 'file' | 'folder' }) => void;
}) {
  const { openFile, deleteFile, renamePath } = useStore.getState();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(node.name);
  const isOpen = open[node.path] ?? depth === 0;
  const hasChange = node.type === 'file' ? changed.has(node.path) : [...changed].some((p) => p.startsWith(node.path + '/'));

  const commitRename = () => {
    const n = name.trim();
    setRenaming(false);
    if (!n || n === node.name) return;
    const parent = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/') + 1) : '';
    renamePath(node.path, normalizePath(parent + n));
  };

  if (node.name === '.gitkeep') return null;

  return (
    <div>
      <div
        className={clsx(
          'group flex cursor-pointer items-center gap-1.5 py-[3px] pr-2',
          node.type === 'file' && active === node.path ? 'bg-muted text-fg' : 'text-fg/85 hover:bg-muted/60',
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => (node.type === 'dir' ? setOpen((o) => ({ ...o, [node.path]: !isOpen })) : openFile(node.path))}
        onDoubleClick={() => setRenaming(true)}
      >
        {node.type === 'dir' ? (
          <>
            <ChevronRight size={12} className={clsx('shrink-0 text-faint transition-transform', isOpen && 'rotate-90')} />
            {isOpen ? <FolderOpen size={14} className="shrink-0 text-sub" /> : <Folder size={14} className="shrink-0 text-sub" />}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <span className="shrink-0">{iconFor(node.name)}</span>
          </>
        )}
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            className="min-w-0 flex-1 rounded border border-fg/30 bg-surface px-1 font-mono text-[12px] outline-none"
          />
        ) : (
          <span className={clsx('min-w-0 flex-1 truncate', hasChange && 'text-amber-600 dark:text-amber-400')}>{node.name}</span>
        )}
        {hasChange && !renaming && <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">M</span>}
        <span className="hidden shrink-0 gap-0.5 group-hover:flex" onClick={(e) => e.stopPropagation()}>
          {node.type === 'dir' && (
            <button
              className="rounded p-0.5 text-faint hover:text-fg"
              title="New file in folder"
              onClick={() => {
                setOpen((o) => ({ ...o, [node.path]: true }));
                setCreating({ dir: node.path, kind: 'file' });
              }}
            >
              <FilePlus2 size={12} />
            </button>
          )}
          <button className="rounded p-0.5 text-faint hover:text-fg" title="Rename" onClick={() => setRenaming(true)}>
            <Pencil size={12} />
          </button>
          <button
            className="rounded p-0.5 text-faint hover:text-red-500"
            title="Delete"
            onClick={() => confirm(`Delete ${node.path}?`) && deleteFile(node.path)}
          >
            <Trash2 size={12} />
          </button>
        </span>
      </div>
      {node.type === 'dir' && isOpen && (
        <div>
          {creating?.dir === node.path && <NewEntry dir={node.path} kind={creating.kind} onDone={() => setCreating(null)} depth={depth + 1} />}
          {node.children.map((c) => (
            <Node key={c.path} node={c} depth={depth + 1} open={open} setOpen={setOpen} active={active} changed={changed} creating={creating} setCreating={setCreating} />
          ))}
        </div>
      )}
    </div>
  );
}
