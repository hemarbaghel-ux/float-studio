import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { FileNode } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function flattenFileTree(files: FileNode[], prefix = ''): { path: string; name: string; type: 'file' | 'folder'; content?: string; id: string }[] {
  let result: { path: string; name: string; type: 'file' | 'folder'; content?: string; id: string }[] = [];
  for (const file of files) {
    const currentPath = prefix ? `${prefix}/${file.name}` : file.name;
    result.push({ path: currentPath, name: file.name, type: file.type, content: file.content, id: file.id });
    if (file.children) {
      result = result.concat(flattenFileTree(file.children, currentPath));
    }
  }
  return result;
}
