/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import {
  IWorkspaceService,
  WorkspaceCapabilities,
  WorkspaceFile,
  WorkspaceFileChangeEvent,
  WorkspaceFileStat,
  ListFilesOptions,
  validateSafeWorkspacePath,
  SENSITIVE_SEGMENTS,
  SENSITIVE_EXTENSIONS,
} from '../../shared/contracts/workspace';
import { WorkspaceIndex } from './workspaceIndex';
import { shouldIndexFile } from './fileFilter';

/**
 * Local File System Workspace Service (Phase 4)
 *
 * Implements IWorkspaceService for local hard-drive repositories and multi-root workspaces.
 * Provides recursive file scanning, incremental indexing synchronization, file watching,
 * and index persistence.
 */
export class LocalFileSystemWorkspaceService implements IWorkspaceService {
  private readonly rootPaths: string[] = [];
  private readonly watchers: fs.FSWatcher[] = [];
  private readonly listeners: Array<(event: WorkspaceFileChangeEvent) => void> = [];
  public readonly index: WorkspaceIndex;

  constructor(primaryRoot: string, additionalRoots: string[] = []) {
    const normalizedPrimary = path.resolve(primaryRoot);
    this.rootPaths.push(normalizedPrimary);
    for (const r of additionalRoots) {
      const norm = path.resolve(r);
      if (!this.rootPaths.includes(norm)) {
        this.rootPaths.push(norm);
      }
    }
    this.index = new WorkspaceIndex(path.basename(normalizedPrimary));
  }

  getRootUri(): string {
    return `file://${this.rootPaths[0].replace(/\\/g, '/')}`;
  }

  getAllRoots(): readonly string[] {
    return this.rootPaths;
  }

  getCapabilities(): WorkspaceCapabilities {
    return {
      canWatch: true,
      canWrite: true,
      isLocalDisk: true,
      maxFileSize: 25 * 1024 * 1024, // 25 MB
    };
  }

  resolvePath(relativePath: string): string {
    const safeRel = validateSafeWorkspacePath(relativePath);
    // Find matching root if multi-root
    for (const root of this.rootPaths) {
      const candidate = path.join(root, safeRel);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    // Default to primary root
    return path.join(this.rootPaths[0], safeRel);
  }

  async readFile(relativePath: string): Promise<string> {
    const fullPath = this.resolvePath(relativePath);
    return fs.promises.readFile(fullPath, 'utf8');
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, content, 'utf8');

    // Incrementally update index
    const safeRel = validateSafeWorkspacePath(relativePath);
    if (shouldIndexFile(safeRel)) {
      this.index.updateFile(safeRel, content);
    }
  }

  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }

    // Incrementally prune from index
    const safeRel = validateSafeWorkspacePath(relativePath);
    this.index.removeFile(safeRel);
  }

  async fileExists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(relativePath);
      return fs.existsSync(fullPath);
    } catch {
      return false;
    }
  }

  async stat(relativePath: string): Promise<WorkspaceFileStat> {
    const fullPath = this.resolvePath(relativePath);
    const st = await fs.promises.stat(fullPath);
    return {
      size: st.size,
      mtime: st.mtimeMs,
      isDirectory: st.isDirectory(),
      isFile: st.isFile(),
    };
  }

  async listFiles(options: ListFilesOptions = {}): Promise<WorkspaceFile[]> {
    const result: WorkspaceFile[] = [];
    const maxFiles = options.maxFiles || 5000;

    for (const root of this.rootPaths) {
      await this.scanDir(root, '', result, maxFiles, options);
      if (result.length >= maxFiles) break;
    }

    return result;
  }

  private async scanDir(
    baseDir: string,
    currentRel: string,
    out: WorkspaceFile[],
    maxFiles: number,
    options: ListFilesOptions
  ): Promise<void> {
    if (out.length >= maxFiles) return;

    const currentAbs = currentRel ? path.join(baseDir, currentRel) : baseDir;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentAbs, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (out.length >= maxFiles) break;

      const name = entry.name;
      // Skip sensitive and ignored folders/files
      if (SENSITIVE_SEGMENTS.test(name) || SENSITIVE_EXTENSIONS.test(name)) {
        continue;
      }

      const relPath = currentRel ? `${currentRel}/${name}` : name;

      if (entry.isDirectory()) {
        out.push({
          path: relPath,
          name,
          type: 'directory',
        });
        if (options.recursive !== false) {
          await this.scanDir(baseDir, relPath, out, maxFiles, options);
        }
      } else if (entry.isFile()) {
        try {
          const st = await fs.promises.stat(path.join(baseDir, relPath));
          out.push({
            path: relPath,
            name,
            type: 'file',
            size: st.size,
            mtime: st.mtimeMs,
          });
        } catch {
          out.push({
            path: relPath,
            name,
            type: 'file',
          });
        }
      }
    }
  }

  /**
   * Initializes workspace indexing by scanning files and populating WorkspaceIndex.
   */
  async initializeIndex(): Promise<{ totalIndexed: number; durationMs: number }> {
    const start = Date.now();
    const files = await this.listFiles({ recursive: true, maxFiles: 1000 });
    const documentsToIndex: Array<{ path: string; content: string }> = [];

    for (const f of files) {
      if (f.type !== 'file' || !shouldIndexFile(f.path)) continue;
      try {
        const content = await this.readFile(f.path);
        documentsToIndex.push({ path: f.path, content });
      } catch {}
    }

    this.index.indexProject(documentsToIndex);
    return {
      totalIndexed: documentsToIndex.length,
      durationMs: Date.now() - start,
    };
  }

  watch(listener: (event: WorkspaceFileChangeEvent) => void): () => void {
    this.listeners.push(listener);

    for (const root of this.rootPaths) {
      try {
        const watcher = fs.watch(root, { recursive: true }, async (eventType, filename) => {
          if (!filename) return;
          const normalized = filename.replace(/\\/g, '/');
          if (SENSITIVE_SEGMENTS.test(normalized) || SENSITIVE_EXTENSIONS.test(normalized)) {
            return;
          }

          const fullPath = path.join(root, filename);
          const exists = fs.existsSync(fullPath);

          let eventKind: 'created' | 'modified' | 'deleted' = 'modified';
          if (!exists) {
            eventKind = 'deleted';
            this.index.removeFile(normalized);
          } else {
            try {
              const content = await fs.promises.readFile(fullPath, 'utf8');
              if (shouldIndexFile(normalized)) {
                this.index.updateFile(normalized, content);
              }
            } catch {}
          }

          const event: WorkspaceFileChangeEvent = {
            type: eventKind,
            path: normalized,
            timestamp: Date.now(),
          };

          for (const l of this.listeners) {
            try {
              l(event);
            } catch {}
          }
        });

        this.watchers.push(watcher);
      } catch (watchErr) {
        console.warn(`[LocalFileSystemWorkspaceService] Could not establish watcher on ${root}:`, watchErr);
      }
    }

    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
      this.closeWatchers();
    };
  }

  closeWatchers(): void {
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {}
    }
    this.watchers.length = 0;
  }
}
