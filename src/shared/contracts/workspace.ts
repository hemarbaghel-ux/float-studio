/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Authoritative Workspace Contracts & Interface (Phase 2)
 *
 * Defines the canonical abstraction for workspace file access, path traversal
 * protection, secret exclusion, directory listing, and change watching across both
 * local desktop (Electron/Node) and web/cloud (in-memory / virtual) environments.
 */

export type WorkspaceFileType = 'file' | 'directory';

export interface WorkspaceFileStat {
  readonly size: number;
  readonly mtime: number;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
}

export interface WorkspaceFile {
  readonly path: string;
  readonly name: string;
  readonly type: WorkspaceFileType;
  readonly size?: number;
  readonly mtime?: number;
  readonly content?: string;
}

export interface WorkspaceFileChangeEvent {
  readonly type: 'created' | 'modified' | 'deleted';
  readonly path: string;
  readonly timestamp: number;
}

export interface ListFilesOptions {
  readonly recursive?: boolean;
  readonly maxFiles?: number;
  readonly excludePatterns?: RegExp[];
  readonly includePatterns?: RegExp[];
}

export interface WorkspaceCapabilities {
  readonly canWatch: boolean;
  readonly canWrite: boolean;
  readonly isLocalDisk: boolean;
  readonly maxFileSize: number;
}

/**
 * Path traversal and sensitive file security patterns.
 */
export const SENSITIVE_SEGMENTS = /^(?:\.env(?:$|\.)|\.git$|node_modules$|vendor$|dist$|build$|coverage$|\.next$|\.cache$|\.venv$|venv$|\.ssh$|\.aws$|\.npmrc$|\.pypirc$|\.netrc$|\.ds_store$|id_rsa(?:$|\.)|id_ed25519(?:$|\.))/i;
export const SENSITIVE_EXTENSIONS = /\.(?:pem|key|p12|pfx|keystore|crt|cer)$/i;

/**
 * Strict path sanitization that enforces workspace confinement and traversal protection.
 */
export function validateSafeWorkspacePath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') {
    throw new Error('Workspace path must be a non-empty string.');
  }

  let normalized = rawPath.trim().replace(/\\/g, '/');

  // Strip leading ./
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  // Reject null bytes, root slashes, Windows absolute drives, and parent traversal
  if (
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/i.test(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`Path traversal is strictly prohibited: "${rawPath}"`);
  }

  // Reject sensitive paths
  if (
    normalized.split('/').some((part) => SENSITIVE_SEGMENTS.test(part)) ||
    SENSITIVE_EXTENSIONS.test(normalized)
  ) {
    throw new Error(`Access to sensitive workspace path is forbidden: "${rawPath}"`);
  }

  return normalized;
}

/**
 * Authoritative Workspace Service Contract
 */
export interface IWorkspaceService {
  /** Root identifier or URI of the workspace */
  getRootUri(): string;

  /** Resolves and validates a relative workspace path against security bounds */
  resolvePath(relativePath: string): string;

  /** Reads the full content of a workspace file */
  readFile(relativePath: string): Promise<string>;

  /** Writes content to a workspace file, creating parent directories as needed */
  writeFile(relativePath: string, content: string): Promise<void>;

  /** Deletes a workspace file */
  deleteFile(relativePath: string): Promise<void>;

  /** Checks if a file exists */
  fileExists(relativePath: string): Promise<boolean>;

  /** Lists files within the workspace */
  listFiles(options?: ListFilesOptions): Promise<WorkspaceFile[]>;

  /** Retrieves file metadata */
  stat(relativePath: string): Promise<WorkspaceFileStat>;

  /** Subscribes to file system change events */
  watch(listener: (event: WorkspaceFileChangeEvent) => void): () => void;

  /** Declares runtime capabilities */
  getCapabilities(): WorkspaceCapabilities;
}
