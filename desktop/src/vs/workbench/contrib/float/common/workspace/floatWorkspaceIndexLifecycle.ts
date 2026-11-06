/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { FloatWorkspaceIndexer } from './floatWorkspaceIndexer.js';

export interface IFloatWorkspaceFileChanges {
  readonly added?: readonly string[];
  readonly updated?: readonly string[];
  readonly deleted?: readonly string[];
}

export interface IFloatWorkspaceIndexLifecycleOptions {
  readonly maxFileBytes?: number;
  readonly saveDebounceMs?: number;
  readonly onError?: (error: unknown) => void;
}

const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_SAVE_DEBOUNCE_MS = 500;

/**
 * Owns the lifetime of one active local workspace index:
 * - restores the last persisted snapshot,
 * - performs an incremental filesystem scan on workspace open,
 * - applies subsequent file create/change/delete events,
 * - persists updates with a short debounce.
 *
 * The workbench adapter is responsible for supplying local file-system paths.
 * Remote/virtual URI schemes are intentionally not passed to this Node.js indexer.
 */
export class FloatWorkspaceIndexLifecycle {
  private _workspaceRoot: string | undefined;
  private _requestedRoot: string | undefined;
  private _hasRequestedRoot = false;
  private _generation = 0;
  private _queue: Promise<void> = Promise.resolve();
  private _saveTimer: ReturnType<typeof setTimeout> | undefined;
  private _disposed = false;

  private readonly _maxFileBytes: number;
  private readonly _saveDebounceMs: number;

  constructor(
    private readonly _indexer: FloatWorkspaceIndexer,
    private readonly _options: IFloatWorkspaceIndexLifecycleOptions = {}
  ) {
    this._maxFileBytes = Math.max(1024, _options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES);
    this._saveDebounceMs = Math.max(0, _options.saveDebounceMs ?? DEFAULT_SAVE_DEBOUNCE_MS);
  }

  public get workspaceRoot(): string | undefined {
    return this._workspaceRoot;
  }

  /**
   * Activate a local workspace. Repeated notifications for the same root do
   * not trigger duplicate full scans.
   */
  public activateWorkspace(rootPath?: string): Promise<void> {
    if (this._disposed) {
      return Promise.resolve();
    }

    const normalizedRoot = rootPath ? path.resolve(rootPath) : undefined;
    if (this._hasRequestedRoot && normalizedRoot === this._requestedRoot) {
      return this._queue;
    }

    this._hasRequestedRoot = true;
    this._requestedRoot = normalizedRoot;
    const generation = ++this._generation;

    return this._enqueue(async () => {
      this._cancelSaveTimer();
      await this._persistCurrentWorkspace();

      if (generation !== this._generation) {
        return;
      }

      this._workspaceRoot = normalizedRoot;
      this._indexer.clear();

      if (!normalizedRoot) {
        return;
      }

      let rootStat: fs.Stats;
      try {
        rootStat = await fsp.stat(normalizedRoot);
      } catch (error) {
        this._report(error);
        return;
      }

      if (!rootStat.isDirectory()) {
        this._report(new Error('FLOAT codebase indexing requires a local workspace directory.'));
        return;
      }

      const metadataPath = path.join(normalizedRoot, '.float', 'index-meta.json');
      await this._indexer.loadIndexMetadata(metadataPath);

      if (generation !== this._generation || this._disposed) {
        return;
      }

      await this._indexer.discoverAndIndexWorkspace(normalizedRoot);

      if (generation !== this._generation || this._disposed) {
        return;
      }

      await this._persistCurrentWorkspace();
    });
  }

  /**
   * Applies local file-system events. The deleted list is processed first so
   * an atomic rename represented as delete+add ends with the new file indexed.
   */
  public handleFileChanges(changes: IFloatWorkspaceFileChanges): Promise<void> {
    if (this._disposed || !this._workspaceRoot) {
      return Promise.resolve();
    }

    const generation = this._generation;
    const added = Array.from(new Set(changes.added ?? []));
    const updated = Array.from(new Set(changes.updated ?? []));
    const deleted = Array.from(new Set(changes.deleted ?? []));

    return this._enqueue(async () => {
      const root = this._workspaceRoot;
      if (!root || generation !== this._generation || this._disposed) {
        return;
      }

      let needsRescan = false;
      let changedIndex = false;

      for (const resourcePath of deleted) {
        const relativePath = this._relativeWorkspacePath(root, resourcePath);
        if (!relativePath) {
          continue;
        }
        this._indexer.unregisterPath(relativePath);
        changedIndex = true;
      }

      const upsert = async (resourcePath: string): Promise<void> => {
        const relativePath = this._relativeWorkspacePath(root, resourcePath);
        if (!relativePath) {
          return;
        }

        if (!this._indexer.isIndexableFile(relativePath)) {
          this._indexer.unregisterPath(relativePath);
          changedIndex = true;
          return;
        }

        const absolutePath = path.resolve(root, relativePath);
        let stat: fs.Stats;
        try {
          stat = await fsp.lstat(absolutePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            this._indexer.unregisterPath(relativePath);
            changedIndex = true;
          } else {
            this._report(error);
          }
          return;
        }

        if (stat.isSymbolicLink()) {
          this._indexer.unregisterPath(relativePath);
          changedIndex = true;
          return;
        }

        if (stat.isDirectory()) {
          needsRescan = true;
          return;
        }

        if (!stat.isFile()) {
          this._indexer.unregisterPath(relativePath);
          changedIndex = true;
          return;
        }

        if (stat.size > this._maxFileBytes) {
          this._indexer.unregisterPath(relativePath);
          changedIndex = true;
          return;
        }

        try {
          const buffer = await fsp.readFile(absolutePath);
          if (buffer.includes(0)) {
            this._indexer.unregisterPath(relativePath);
            changedIndex = true;
            return;
          }

          const content = buffer.toString('utf8');
          changedIndex = this._indexer.indexFile(relativePath, content) || changedIndex;
        } catch (error) {
          this._report(error);
        }
      };

      for (const resourcePath of added) {
        await upsert(resourcePath);
      }
      for (const resourcePath of updated) {
        await upsert(resourcePath);
      }

      if (needsRescan && generation === this._generation) {
        await this._indexer.discoverAndIndexWorkspace(root);
        changedIndex = true;
      }

      if (changedIndex && generation === this._generation) {
        this._scheduleSave();
      }
    });
  }

  /** Force pending index changes to disk. Primarily useful for shutdown/tests. */
  public flush(): Promise<void> {
    this._cancelSaveTimer();
    if (this._disposed) {
      return this._queue;
    }
    return this._enqueue(() => this._persistCurrentWorkspace());
  }

  /** Wait until all queued index operations have settled. */
  public async whenIdle(): Promise<void> {
    await this._queue;
  }

  public dispose(): void {
    if (this._disposed) {
      return;
    }
    this._cancelSaveTimer();
    this._disposed = true;
    void this._queue.then(() => this._persistCurrentWorkspace()).catch(error => this._report(error));
  }

  private _relativeWorkspacePath(root: string, resourcePath: string): string | undefined {
    if (!resourcePath || typeof resourcePath !== 'string') {
      return undefined;
    }

    const absolutePath = path.resolve(resourcePath);
    const relativePath = path.relative(root, absolutePath);
    if (
      !relativePath ||
      relativePath === '..' ||
      relativePath.startsWith('..' + path.sep) ||
      path.isAbsolute(relativePath)
    ) {
      return undefined;
    }

    return relativePath.split(path.sep).join('/');
  }

  private _scheduleSave(): void {
    this._cancelSaveTimer();
    this._saveTimer = setTimeout(() => {
      this._saveTimer = undefined;
      void this._enqueue(() => this._persistCurrentWorkspace()).catch(error => this._report(error));
    }, this._saveDebounceMs);
  }

  private _cancelSaveTimer(): void {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = undefined;
    }
  }

  private async _persistCurrentWorkspace(): Promise<void> {
    if (!this._workspaceRoot) {
      return;
    }

    const metadataPath = path.join(this._workspaceRoot, '.float', 'index-meta.json');
    try {
      await this._indexer.saveIndexMetadata(metadataPath);
    } catch (error) {
      this._report(error);
    }
  }

  private _enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this._queue.then(operation, operation);
    this._queue = result.catch(error => {
      this._report(error);
    });
    return result;
  }

  private _report(error: unknown): void {
    try {
      this._options.onError?.(error);
    } catch {
      // Error reporting must not break the index lifecycle queue.
    }
  }
}
