import { createHash } from 'node:crypto';
import type { FileNode } from '../../types';
import { sanitizeProposalPath } from '../proposals/proposalService';

export const MAX_COMPOSER_WORKSPACE_FILES = 500;
export const MAX_COMPOSER_WORKSPACE_FILE_BYTES = 500 * 1024;
export const MAX_COMPOSER_WORKSPACE_BYTES = 10 * 1024 * 1024;

export interface ComposerWorkspaceFileInput {
  path: string;
  content: string;
}

export interface ComposerWorkspaceSnapshot {
  files: FileNode[];
  fileCount: number;
  totalBytes: number;
}

/**
 * Validate a renderer-supplied workspace snapshot before it is used as agent
 * context. This is content input only: all actual reads/writes remain scoped
 * by the authenticated persisted project and the server tool executor.
 */
export function normalizeComposerWorkspaceSnapshot(input: unknown): ComposerWorkspaceSnapshot {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('A non-empty workspace file snapshot is required for Composer.');
  }
  if (input.length > MAX_COMPOSER_WORKSPACE_FILES) {
    throw new Error(`Composer workspace snapshots are limited to ${MAX_COMPOSER_WORKSPACE_FILES} files.`);
  }

  const root: FileNode[] = [];
  const seenFiles = new Set<string>();
  let totalBytes = 0;

  for (const candidate of input) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('Workspace snapshot contains an invalid file record.');
    }
    const record = candidate as Record<string, unknown>;
    if (typeof record.path !== 'string' || typeof record.content !== 'string') {
      throw new Error('Every workspace snapshot record must contain a path and text content.');
    }

    const sanitized = sanitizeProposalPath(record.path);
    if (sanitized.error || !sanitized.safePath) {
      throw new Error(`Workspace snapshot path rejected: ${sanitized.error || 'invalid path'}`);
    }
    const filePath = sanitized.safePath;
    if (seenFiles.has(filePath)) {
      throw new Error(`Workspace snapshot contains duplicate path "${filePath}".`);
    }
    seenFiles.add(filePath);

    const bytes = Buffer.byteLength(record.content, 'utf8');
    if (bytes > MAX_COMPOSER_WORKSPACE_FILE_BYTES) {
      throw new Error(`Workspace file "${filePath}" exceeds the 500 KB Composer context limit.`);
    }
    totalBytes += bytes;
    if (totalBytes > MAX_COMPOSER_WORKSPACE_BYTES) {
      throw new Error('Composer workspace snapshot exceeds the 10 MB context limit.');
    }

    const segments = filePath.split('/');
    let level = root;
    let currentPath = '';
    for (let index = 0; index < segments.length; index += 1) {
      const name = segments[index];
      currentPath = currentPath ? `${currentPath}/${name}` : name;
      const isFile = index === segments.length - 1;
      const expectedType = isFile ? 'file' : 'folder';
      let node = level.find(item => item.name === name);

      if (!node) {
        node = {
          id: 'composer-' + createHash('sha256').update(currentPath).digest('hex').slice(0, 24),
          name,
          type: expectedType,
          ...(isFile ? { content: record.content } : { children: [] })
        };
        level.push(node);
      } else if (node.type !== expectedType) {
        throw new Error(`Workspace snapshot has a file/directory path collision at "${currentPath}".`);
      } else if (isFile) {
        throw new Error(`Workspace snapshot contains duplicate path "${filePath}".`);
      }

      if (!isFile) {
        node.children = node.children || [];
        level = node.children;
      }
    }
  }

  return { files: root, fileCount: seenFiles.size, totalBytes };
}
