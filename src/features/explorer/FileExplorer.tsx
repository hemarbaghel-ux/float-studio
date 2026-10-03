import React, { useState } from 'react';
import { useIDEStore } from '../../store';
import { ChevronRight, ChevronDown, File, Folder, FileJson, FileCode2, Image, Plus, FolderPlus, Trash, Check, X } from 'lucide-react';
import { FileNode } from '../../types';
import { cn } from '../../lib/utils';
import { v4 as uuidv4 } from 'uuid';

export function FileExplorer() {
  const { projectName, files, openFile, addFile } = useIDEStore();
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newItemName, setNewItemName] = useState('');

  if (!projectName) return null;

  const handleCreateItem = (type: 'file' | 'folder') => {
    const trimmed = newItemName.trim();
    if (trimmed) {
      if (type === 'file') {
        const defaultContent = trimmed.endsWith('.py')
          ? `# ${trimmed}\ndef main():\n    print("Hello from ${trimmed}!")\n\nif __name__ == "__main__":\n    main()\n`
          : '';
        addFile(null, { id: uuidv4(), name: trimmed, type: 'file', content: defaultContent });
      } else {
        addFile(null, { id: uuidv4(), name: trimmed, type: 'folder', isOpen: true, children: [] });
      }
    }
    setNewItemName('');
    setIsCreatingFile(false);
    setIsCreatingFolder(false);
  };

  return (
    <div className="h-full flex flex-col text-sm bg-white dark:bg-[#0A0A0A]">
      <div className="group px-4 py-3 flex items-center justify-between select-none border-b border-slate-200 dark:border-[#2A2A2A]">
        <span className="font-semibold text-xs tracking-wider uppercase text-slate-500 dark:text-[#8B949E] truncate pr-2">{projectName}</span>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => { setIsCreatingFile(true); setIsCreatingFolder(false); setNewItemName(''); }} 
            className="p-1 text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-[#1C1C1C] transition-colors" 
            title="New File"
          >
            <Plus size={14} />
          </button>
          <button 
            onClick={() => { setIsCreatingFolder(true); setIsCreatingFile(false); setNewItemName(''); }} 
            className="p-1 text-slate-500 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-[#1C1C1C] transition-colors" 
            title="New Folder"
          >
            <FolderPlus size={14} />
          </button>
        </div>
      </div>

      {/* Inline Creation Input */}
      {(isCreatingFile || isCreatingFolder) && (
        <div className="px-3 py-2 border-b border-slate-200 dark:border-[#2A2A2A] flex items-center gap-1.5 bg-slate-50 dark:bg-[#141414]">
          {isCreatingFolder ? <Folder size={14} className="text-slate-600 dark:text-[#C5C5C5] shrink-0" /> : <File size={14} className="text-slate-400 dark:text-[#A0A0A0] shrink-0" />}
          <input
            autoFocus
            type="text"
            value={newItemName}
            placeholder={isCreatingFolder ? "Folder name..." : "file.py..."}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateItem(isCreatingFolder ? 'folder' : 'file');
              if (e.key === 'Escape') { setIsCreatingFile(false); setIsCreatingFolder(false); }
            }}
            className="flex-1 bg-transparent text-xs text-slate-900 dark:text-white outline-none"
          />
          <button 
            onClick={() => handleCreateItem(isCreatingFolder ? 'folder' : 'file')}
            className="text-slate-700 hover:text-slate-900 dark:text-white p-0.5"
          >
            <Check size={13} />
          </button>
          <button 
            onClick={() => { setIsCreatingFile(false); setIsCreatingFolder(false); }}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5"
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-4 group">
        {files.map(node => (
          <FileTreeNode key={node.id} node={node} level={0} onFileClick={openFile} />
        ))}
      </div>
    </div>
  );
}

function FileTreeNode({ node, level, onFileClick }: { node: FileNode, level: number, onFileClick: (id: string) => void }) {
  const { activeFileId } = useIDEStore();
  const deleteFile = useIDEStore(state => state.deleteFile);
  const [isOpen, setIsOpen] = React.useState(node.isOpen ?? true);
  const isFolder = node.type === 'folder';
  const isActive = activeFileId === node.id;

  const handleClick = () => {
    if (isFolder) {
      setIsOpen(!isOpen);
    } else {
      onFileClick(node.id);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteFile(node.id);
  };

  const paddingLeft = `${(level * 12) + 16}px`;

  return (
    <div>
      <div 
        className={cn(
          "flex items-center py-1.5 pr-2 cursor-pointer select-none transition-colors group/node text-xs",
          isActive 
            ? "bg-slate-200/80 dark:bg-[#242424] font-semibold text-slate-900 dark:text-white" 
            : "hover:bg-slate-100 dark:hover:bg-[#1C1C1C] text-slate-700 dark:text-[#C5C5C5]"
        )}
        style={{ paddingLeft }}
        onClick={handleClick}
      >
        <div className="w-4 h-4 flex items-center justify-center mr-1 text-slate-400 dark:text-[#8B949E] shrink-0">
          {isFolder ? (
            isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : null}
        </div>
        <FileIcon name={node.name} isFolder={isFolder} isOpen={isOpen} />
        <span className="ml-1.5 truncate flex-1">{node.name}</span>
        <button 
          onClick={handleDelete}
          title={`Delete ${node.name}`}
          className="p-1 opacity-0 group-hover/node:opacity-100 text-slate-400 dark:text-[#8B949E] hover:text-slate-900 dark:hover:text-white transition-opacity"
        >
          <Trash size={12} />
        </button>
      </div>
      
      {isFolder && isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <FileTreeNode key={child.id} node={child} level={level + 1} onFileClick={onFileClick} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileIcon({ name, isFolder, isOpen }: { name: string, isFolder: boolean, isOpen: boolean }) {
  if (isFolder) {
    return <Folder size={14} className={isOpen ? "text-slate-800 dark:text-white" : "text-slate-500 dark:text-[#A0A0A0]"} fill={isOpen ? "currentColor" : "none"} />;
  }
  
  if (name.endsWith('.py')) return <FileCode2 size={14} className="text-slate-600 dark:text-[#C5C5C5]" />;
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return <FileCode2 size={14} className="text-slate-600 dark:text-[#C5C5C5]" />;
  if (name.endsWith('.js') || name.endsWith('.jsx')) return <FileCode2 size={14} className="text-slate-600 dark:text-[#C5C5C5]" />;
  if (name.endsWith('.json')) return <FileJson size={14} className="text-slate-600 dark:text-[#C5C5C5]" />;
  if (name.endsWith('.css')) return <FileCode2 size={14} className="text-slate-600 dark:text-[#C5C5C5]" />;
  if (name.endsWith('.svg') || name.endsWith('.png')) return <Image size={14} className="text-slate-600 dark:text-[#C5C5C5]" />;
  
  return <File size={14} className="text-slate-500 dark:text-[#A0A0A0]" />;
}
