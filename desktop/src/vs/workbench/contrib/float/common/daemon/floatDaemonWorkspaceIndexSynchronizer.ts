/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IFileService, IFileStat } from '../../../../../platform/files/common/files.js';
import { IFloatDaemonRuntimeClient } from './floatDaemonRuntimeService.js';

const MAX_INDEXED_FILES = 10_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const INDEXABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyi', '.rs', '.go', '.java', '.cs',
  '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh',
  '.php', '.rb', '.swift', '.kt', '.kts', '.scala',
  '.sh', '.bash', '.zsh', '.sql', '.json', '.jsonc',
  '.yaml', '.yml', '.toml', '.ini', '.md', '.mdx',
  '.html', '.css', '.scss', '.less', '.vue', '.svelte',
  '.xml', '.graphql', '.gql', '.proto', '.dart', '.lua',
  '.ex', '.exs', '.erl', '.hrl', '.clj', '.cljs',
  '.fs', '.fsx', '.vb', '.pl', '.r', '.jl'
]);

const INDEXABLE_EXTENSIONLESS_NAMES = new Set([
  'dockerfile', 'makefile', 'justfile', 'gemfile', 'rakefile'
]);

const EXCLUDED_SEGMENTS = new Set([
  '.git', '.float', '.vscode', '.idea', '.next', '.nuxt',
  'node_modules', 'vendor', 'dist', 'build', 'out', 'target',
  'coverage', '.turbo', '.cache', '.venv', 'venv', '__pycache__',
  '.aws', '.azure', '.ssh', '.gnupg', '.kube', '.docker'
]);

export interface IFloatDaemonWorkspaceFileChanges {
  readonly added?: readonly URI[];
  readonly updated?: readonly URI[];
  readonly deleted?: readonly URI[];
}

interface IFloatWorkspaceRootContext {
  root: URI;
  index: number;
}

interface IFloatWorkspaceScanState {
  complete: boolean;
  limitReached: boolean;
}

export interface IFloatDaemonWorkspaceIndexOptions {
  maxIndexedFiles?: number;
  maxFileBytes?: number;
}

/**
 * Keeps local workspace folders synchronized with FLOAT's daemon index.
 * Multi-root paths are namespaced so identical relative paths in different
 * roots cannot overwrite one another. It never follows symlinks, indexes
 * binary files, or sends absolute workspace paths to the daemon.
 */
export class FloatDaemonWorkspaceIndexSynchronizer {
  private _roots: readonly URI[] = [];
  private readonly _indexedPaths = new Set<string>();
  private _generation = 0;
  private _queue: Promise<void> = Promise.resolve();
  private readonly _maxIndexedFiles: number;
  private readonly _maxFileBytes: number;

  constructor(
    private readonly _fileService: IFileService,
    private readonly _getClient: () => IFloatDaemonRuntimeClient | undefined,
    private readonly _onError: (error: unknown) => void = () => undefined,
    options: IFloatDaemonWorkspaceIndexOptions = {}
  ) {
    this._maxIndexedFiles = Number.isSafeInteger(options.maxIndexedFiles) && (options.maxIndexedFiles ?? 0) > 0
      ? options.maxIndexedFiles!
      : MAX_INDEXED_FILES;
    this._maxFileBytes = Number.isSafeInteger(options.maxFileBytes) && (options.maxFileBytes ?? 0) > 0
      ? options.maxFileBytes!
      : MAX_FILE_BYTES;
  }

  public get indexedFileCount(): number {
    return this._indexedPaths.size;
  }

  public get workspaceRoot(): URI | undefined {
    return this._roots[0];
  }

  public get workspaceRoots(): readonly URI[] {
    return this._roots;
  }

  public setWorkspaceRoot(root: URI | undefined): Promise<void> {
    return this.setWorkspaceRoots(root ? [root] : []);
  }

  public setWorkspaceRoots(roots: readonly URI[]): Promise<void> {
    const uniqueRoots = Array.from(new Map(roots.map(root => [root.toString(), root])).values());
    const previousKey = this._roots.map(root => root.toString()).join('|');
    const nextKey = uniqueRoots.map(root => root.toString()).join('|');
    if (previousKey === nextKey) {
      return this._queue;
    }

    const generation = ++this._generation;
    return this._enqueue(async () => {
      const client = this._getClient();
      if (client) {
        for (const relativePath of this._indexedPaths) {
          try {
            await client.removeFileSemantics(relativePath);
          } catch (error) {
            this._report(error);
          }
        }
      }
      this._indexedPaths.clear();
      this._roots = uniqueRoots;
      if (generation !== this._generation) {
        return;
      }
    });
  }

  public scanWorkspace(): Promise<void> {
    const generation = this._generation;
    return this._enqueue(async () => {
      const roots = this._roots;
      const client = this._getClient();
      if (!client || generation !== this._generation) {
        return;
      }

      // Recover daemon paths so the scan can prune files deleted while FLOAT
      // was closed. Never prune after an incomplete filesystem scan.
      let previousPaths: string[] = [];
      let canReconcile = false;
      try {
        const indexed = await client.call<{ files?: unknown }>('semantic_list_indexed_files', {}, 5_000);
        if (Array.isArray(indexed?.files) && indexed.files.every(filePath => typeof filePath === 'string')) {
          previousPaths = indexed.files as string[];
          canReconcile = true;
          for (const filePath of previousPaths) {
            this._indexedPaths.add(filePath);
          }
        }
      } catch (error) {
        this._report(error);
      }

      let visited = 0;
      const discoveredPaths = new Set<string>();
      const scanState: IFloatWorkspaceScanState = { complete: true, limitReached: false };
      const allowNextFile = (): boolean => {
        if (visited >= this._maxIndexedFiles) {
          scanState.complete = false;
          scanState.limitReached = true;
          return false;
        }
        visited++;
        return true;
      };

      for (let rootIndex = 0; rootIndex < roots.length; rootIndex++) {
        if (generation !== this._generation) {
          scanState.complete = false;
          break;
        }

        const root = roots[rootIndex];
        let rootStat: IFileStat;
        try {
          rootStat = await this._fileService.resolve(root, { resolveMetadata: true });
        } catch (error) {
          this._report(error);
          scanState.complete = false;
          continue;
        }

        if (rootStat.isSymbolicLink) {
          continue;
        }
        if (!rootStat.isDirectory) {
          scanState.complete = false;
          continue;
        }

        await this._scanStat(
          rootStat,
          generation,
          allowNextFile,
          discoveredPaths,
          root,
          rootIndex,
          scanState
        );
      }

      if (canReconcile && scanState.complete && generation === this._generation) {
        for (const stalePath of previousPaths) {
          if (!discoveredPaths.has(stalePath)) {
            await this._removeFile(client, stalePath);
          }
        }
      }
    });
  }

  public handleFileChanges(changes: IFloatDaemonWorkspaceFileChanges): Promise<void> {
    const generation = this._generation;
    return this._enqueue(async () => {
      const client = this._getClient();
      if (this._roots.length === 0 || !client || generation !== this._generation) {
        return;
      }

      for (const resource of changes.deleted ?? []) {
        const rootContext = this._findRootForResource(resource);
        if (!rootContext) {
          continue;
        }
        const relativePath = this._toRelativePath(rootContext.root, resource, rootContext.index);
        if (!relativePath) {
          continue;
        }
        const descendants = Array.from(this._indexedPaths).filter(
          indexedPath => indexedPath === relativePath || indexedPath.startsWith(relativePath + '/')
        );
        for (const indexedPath of descendants) {
          await this._removeFile(client, indexedPath);
        }
      }

      for (const resource of [...(changes.added ?? []), ...(changes.updated ?? [])]) {
        if (generation !== this._generation) {
          return;
        }
        await this._indexResource(resource, generation);
      }
    });
  }

  private async _scanStat(
    stat: IFileStat,
    generation: number,
    allowNextFile: () => boolean,
    discoveredPaths: Set<string>,
    root: URI,
    rootIndex: number,
    scanState: IFloatWorkspaceScanState
  ): Promise<void> {
    if (generation !== this._generation || stat.isSymbolicLink || scanState.limitReached) {
      return;
    }

    if (stat.isDirectory) {
      for (const child of stat.children ?? []) {
        if (generation !== this._generation || scanState.limitReached) {
          if (generation !== this._generation) {
            scanState.complete = false;
          }
          return;
        }

        if (this._isAnotherWorkspaceRoot(child.resource, rootIndex)) {
          continue;
        }
        const relativePath = this._toRelativePath(root, child.resource, rootIndex);
        if (!relativePath || this._isExcludedPath(relativePath)) {
          continue;
        }

        if (child.isDirectory) {
          let resolved = child;
          if (!child.children) {
            try {
              resolved = await this._fileService.resolve(child.resource, { resolveMetadata: true });
            } catch (error) {
              this._report(error);
              scanState.complete = false;
              continue;
            }
          }
          await this._scanStat(
            resolved,
            generation,
            allowNextFile,
            discoveredPaths,
            root,
            rootIndex,
            scanState
          );
        } else if (child.isFile && allowNextFile()) {
          await this._indexResource(
            child.resource,
            generation,
            discoveredPaths,
            { root, index: rootIndex },
            scanState
          );
        }
      }
    } else if (stat.isFile && allowNextFile()) {
      await this._indexResource(
        stat.resource,
        generation,
        discoveredPaths,
        { root, index: rootIndex },
        scanState
      );
    }
  }

  private async _indexResource(
    resource: URI,
    generation: number,
    discoveredPaths?: Set<string>,
    knownRoot?: IFloatWorkspaceRootContext,
    scanState?: IFloatWorkspaceScanState
  ): Promise<void> {
    const client = this._getClient();
    const rootContext = knownRoot ?? this._findRootForResource(resource);
    if (!rootContext || !client || generation !== this._generation) {
      return;
    }

    const relativePath = this._toRelativePath(rootContext.root, resource, rootContext.index);
    if (!relativePath) {
      return;
    }

    let stat: IFileStat;
    try {
      stat = await this._fileService.stat(resource);
    } catch (error) {
      this._report(error);
      if (scanState) {
        scanState.complete = false;
      }
      return;
    }

    if (stat.isSymbolicLink) {
      await this._removeFile(client, relativePath);
      return;
    }
    if (stat.isDirectory) {
      let resolved: IFileStat;
      try {
        resolved = await this._fileService.resolve(resource, { resolveMetadata: true });
      } catch (error) {
        this._report(error);
        if (scanState) {
          scanState.complete = false;
        }
        return;
      }
      const directoryScanState = scanState ?? { complete: true, limitReached: false };
      const allowNextDirectoryFile = (): boolean => {
        if (this._indexedPaths.size >= this._maxIndexedFiles) {
          directoryScanState.complete = false;
          directoryScanState.limitReached = true;
          return false;
        }
        return true;
      };
      await this._scanStat(
        resolved,
        generation,
        allowNextDirectoryFile,
        discoveredPaths ?? new Set<string>(),
        rootContext.root,
        rootContext.index,
        directoryScanState
      );
      return;
    }

    if (!stat.isFile || !this._isIndexablePath(relativePath) || (stat.size ?? 0) > this._maxFileBytes) {
      await this._removeFile(client, relativePath);
      return;
    }

    try {
      const file = await this._fileService.readFile(resource, { atomic: true });
      if (file.value.buffer.includes(0)) {
        await this._removeFile(client, relativePath);
        return;
      }
      const content = file.value.toString();
      if (generation !== this._generation) {
        return;
      }
      await client.indexFileSemantics(relativePath, content);
      this._indexedPaths.add(relativePath);
      discoveredPaths?.add(relativePath);
    } catch (error) {
      this._report(error);
      if (scanState) {
        scanState.complete = false;
      }
    }
  }

  private async _removeFile(client: IFloatDaemonRuntimeClient, relativePath: string): Promise<void> {
    if (!this._indexedPaths.has(relativePath)) {
      return;
    }
    try {
      await client.removeFileSemantics(relativePath);
      this._indexedPaths.delete(relativePath);
    } catch (error) {
      this._report(error);
    }
  }

  private _findRootForResource(resource: URI): IFloatWorkspaceRootContext | undefined {
    let match: (IFloatWorkspaceRootContext & { length: number }) | undefined;
    for (let index = 0; index < this._roots.length; index++) {
      const root = this._roots[index];
      if (resource.scheme !== root.scheme || resource.authority !== root.authority) {
        continue;
      }
      const rootPath = root.path.endsWith('/') ? root.path : root.path + '/';
      if (resource.path === root.path || resource.path.startsWith(rootPath)) {
        if (!match || root.path.length > match.length) {
          match = { root, index, length: root.path.length };
        }
      }
    }
    return match ? { root: match.root, index: match.index } : undefined;
  }

  private _isAnotherWorkspaceRoot(resource: URI, currentRootIndex: number): boolean {
    const normalizedPath = resource.path.length > 1 ? resource.path.replace(/\/+$/, '') : resource.path;
    return this._roots.some((root, index) => {
      if (index === currentRootIndex || root.scheme !== resource.scheme || root.authority !== resource.authority) {
        return false;
      }
      const rootPath = root.path.length > 1 ? root.path.replace(/\/+$/, '') : root.path;
      return rootPath === normalizedPath;
    });
  }

  private _toRelativePath(root: URI, resource: URI, rootIndex: number): string | undefined {
    if (resource.scheme !== root.scheme || resource.authority !== root.authority) {
      return undefined;
    }
    const rootPath = root.path.endsWith('/') ? root.path : root.path + '/';
    if (!resource.path.startsWith(rootPath)) {
      return undefined;
    }
    const relativePath = resource.path.slice(rootPath.length).replace(/^\/+/, '');
    if (!relativePath || relativePath.startsWith('../') || relativePath.includes('\0')) {
      return undefined;
    }
    return this._roots.length > 1
      ? 'workspace-' + (rootIndex + 1) + '/' + relativePath
      : relativePath;
  }

  private _isExcludedPath(relativePath: string): boolean {
    return relativePath.replace(/\\/g, '/').split('/').some(segment =>
      EXCLUDED_SEGMENTS.has(segment.toLowerCase()) ||
      segment.toLowerCase() === '.env' ||
      segment.toLowerCase().startsWith('.env.')
    );
  }

  private _isIndexablePath(relativePath: string): boolean {
    if (this._isExcludedPath(relativePath)) {
      return false;
    }

    const normalized = relativePath.replace(/\\/g, '/');
    const basename = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase();
    if (
      basename === '.npmrc' ||
      basename === '.pypirc' ||
      basename === '.netrc' ||
      basename === '.git-credentials' ||
      basename.includes('credentials') ||
      basename.includes('client_secret') ||
      basename.includes('service-account') ||
      basename.includes('private_key') ||
      /\\.(pem|key|pfx|p12|ppk|jks|keystore|crt|cer|der)$/i.test(basename)
    ) {
      return false;
    }

    const dot = basename.lastIndexOf('.');
    const extension = dot > 0 ? basename.slice(dot) : '';
    return INDEXABLE_EXTENSIONS.has(extension) || INDEXABLE_EXTENSIONLESS_NAMES.has(basename);
  }

  private _enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this._queue.then(operation, operation);
    this._queue = next.catch(error => this._report(error));
    return next;
  }

  private _report(error: unknown): void {
    try {
      this._onError(error);
    } catch {
      // Error handling must not break the index synchronization queue.
    }
  }
}
