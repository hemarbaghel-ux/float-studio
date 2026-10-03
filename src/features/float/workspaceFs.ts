import { filesToMap } from './projectIO';
import { v4 as uuidv4 } from 'uuid';
import type { FileNode } from '../../types';
import { useIDEStore } from '../../store';
import { flattenFileTree } from '../../lib/utils';

/** Bridge between the sandbox shell and the IDE file tree. */
export function sandboxFs() {
  const findByPath = (path: string) => flattenFileTree(useIDEStore.getState().files).find(f => f.path === path);
  return {
    files: () => filesToMap(useIDEStore.getState().files),
    write: (path: string, content: string) => {
      const store = useIDEStore.getState();
      const existing = findByPath(path);
      if (existing && existing.type === 'file') {
        store.updateFileContent(existing.id, content);
        return;
      }
      const segs = path.split('/');
      const name = segs.pop() || path;
      let parentId: string | null = null;
      let prefix = '';
      for (const seg of segs) {
        prefix = prefix ? `${prefix}/${seg}` : seg;
        const folder = findByPath(prefix);
        if (folder && folder.type === 'folder') {
          parentId = folder.id;
        } else {
          const node: FileNode = { id: uuidv4(), name: seg, type: 'folder', children: [], isOpen: true };
          useIDEStore.getState().addFile(parentId, node);
          parentId = node.id;
        }
      }
      useIDEStore.getState().addFile(parentId, { id: uuidv4(), name, type: 'file', content });
    },
    remove: (path: string) => {
      const existing = findByPath(path);
      if (existing) useIDEStore.getState().deleteFile(existing.id);
    },
  };
}

