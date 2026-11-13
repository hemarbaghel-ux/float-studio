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


export interface ComposerProposalChangeInput {
  path: string;
  operation: 'create' | 'modify' | 'delete' | 'rename';
  originalContent?: string;
  proposedContent?: string;
}

/**
 * Merge only explicitly approved proposal paths into the latest persisted
 * project tree. Unrelated local edits are not implicitly uploaded, and an
 * affected cloud file must still match the proposal's original baseline.
 */
export function mergeApprovedComposerChanges(
  savedWorkspace: FileNode[],
  submittedWorkspace: FileNode[],
  changes: ComposerProposalChangeInput[],
  approvedPaths: string[]
): ComposerWorkspaceSnapshot {
  if (!Array.isArray(approvedPaths) || approvedPaths.length === 0 ||
      new Set(approvedPaths).size !== approvedPaths.length) {
    throw new Error('Select at least one unique path to apply.');
  }

  const flatten = (nodes: FileNode[], prefix = '', output = new Map<string, string>()): Map<string, string> => {
    for (const node of nodes) {
      const filePath = prefix ? `${prefix}/${node.name}` : node.name;
      if (node.type === 'file') {
        output.set(filePath, node.content || '');
      } else if (node.type === 'folder') {
        flatten(Array.isArray(node.children) ? node.children : [], filePath, output);
      }
    }
    return output;
  };

  const saved = flatten(savedWorkspace);
  const submitted = flatten(submittedWorkspace);
  const byPath = new Map(changes.map(change => [change.path, change]));
  const merged = new Map(saved);

  for (const rawPath of approvedPaths) {
    const sanitized = sanitizeProposalPath(rawPath);
    if (sanitized.error || !sanitized.safePath) {
      throw new Error(`Approved proposal path rejected: ${sanitized.error || 'invalid path'}`);
    }
    const filePath = sanitized.safePath;
    const change = byPath.get(filePath);
    if (!change) throw new Error(`Path "${filePath}" is not part of this proposal.`);
    if (change.operation !== 'create' && change.operation !== 'modify') {
      throw new Error(`Composer cannot automatically apply "${change.operation}" operations.`);
    }

    const existsInCloud = saved.has(filePath);
    const originalContent = change.originalContent || '';
    if (change.operation === 'create') {
      if (existsInCloud) {
        throw new Error(`File "${filePath}" was created elsewhere after this proposal was generated.`);
      }
    } else if (!existsInCloud || saved.get(filePath) !== originalContent) {
      throw new Error(`File "${filePath}" changed in cloud storage since this proposal was generated. Reload and review it again.`);
    }

    const proposedContent = change.proposedContent || '';
    if (!submitted.has(filePath) || submitted.get(filePath) !== proposedContent) {
      throw new Error(`The local workspace does not contain the proposed content for "${filePath}".`);
    }
    merged.set(filePath, proposedContent);
  }

  return normalizeComposerWorkspaceSnapshot(
    Array.from(merged, ([filePath, content]) => ({ path: filePath, content }))
  );
}
