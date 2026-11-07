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

/**
 * Keeps one local workspace root synchronized with the in-memory semantic index
 * hosted by FLOAT's utility process. It never follows symlinks, indexes binary
 * files, or sends absolute workspace paths to the daemon.
 */
export class FloatDaemonWorkspaceIndexSynchronizer {
  private _root: URI | undefined;
  private readonly _indexedPaths = new Set<string>();
  private _generation = 0;
  private _queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly _fileService: IFileService,
    private readonly _getClient: () => IFloatDaemonRuntimeClient | undefined,
    private readonly _onError: (error: unknown) => void = () => undefined
  ) {}

  public get indexedFileCount(): number {
    return this._indexedPaths.size;
  }

  public get workspaceRoot(): URI | undefined {
    return this._root;
  }

  public setWorkspaceRoot(root: URI | undefined): Promise<void> {
    const previous = this._root;
    if (previous?.toString() === root?.toString()) {
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
      this._root = root;
      if (generation !== this._generation || !root) {
        return;
      }
    });
  }

  public scanWorkspace(): Promise<void> {
    const generation = this._generation;
    return this._enqueue(async () => {
      const root = this._root;
      const client = this._getClient();
      if (!root || !client || generation !== this._generation) {
        return;
      }

      let rootStat: IFileStat;
      try {
        rootStat = await this._fileService.resolve(root, { resolveMetadata: true });
      } catch (error) {
        this._report(error);
        return;
      }
      if (!rootStat.isDirectory || rootStat.isSymbolicLink) {
        return;
      }

      // Recover the daemon's pre-existing file set so a full scan can prune
      // entries for files deleted while FLOAT was not running.
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
      await this._scanStat(rootStat, generation, () => ++visited <= MAX_INDEXED_FILES, discoveredPaths);

      if (canReconcile && generation === this._generation) {
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
      const root = this._root;
      const client = this._getClient();
      if (!root || !client || generation !== this._generation) {
        return;
      }

      for (const resource of changes.deleted ?? []) {
        const relativePath = this._toRelativePath(root, resource);
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
    discoveredPaths?: Set<string>
  ): Promise<void> {
    if (generation !== this._generation || stat.isSymbolicLink) {
      return;
    }

    if (stat.isDirectory) {
      for (const child of stat.children ?? []) {
        if (generation !== this._generation) {
          return;
        }
        const relativePath = this._toRelativePath(this._root!, child.resource);
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
              continue;
            }
          }
          await this._scanStat(resolved, generation, allowNextFile, discoveredPaths);
        } else if (child.isFile && allowNextFile()) {
          await this._indexResource(child.resource, generation, discoveredPaths);
        }
      }
    } else if (stat.isFile && allowNextFile()) {
      await this._indexResource(stat.resource, generation, discoveredPaths);
    }
  }

  private async _indexResource(resource: URI, generation: number, discoveredPaths?: Set<string>): Promise<void> {
    const root = this._root;
    const client = this._getClient();
    if (!root || !client || generation !== this._generation) {
      return;
    }

    const relativePath = this._toRelativePath(root, resource);
    if (!relativePath) {
      return;
    }

    let stat: IFileStat;
    try {
      stat = await this._fileService.stat(resource);
    } catch (error) {
      this._report(error);
      return;
    }

    if (stat.isSymbolicLink) {
      return;
    }
    if (stat.isDirectory) {
      let resolved: IFileStat;
      try {
        resolved = await this._fileService.resolve(resource, { resolveMetadata: true });
      } catch (error) {
        this._report(error);
        return;
      }
      await this._scanStat(resolved, generation, () => this._indexedPaths.size < MAX_INDEXED_FILES, discoveredPaths);
      return;
    }

    if (!stat.isFile || !this._isIndexablePath(relativePath) || (stat.size ?? 0) > MAX_FILE_BYTES) {
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

  private _toRelativePath(root: URI, resource: URI): string | undefined {
    if (resource.scheme !== root.scheme || resource.authority !== root.authority) {
      return undefined;
    }
    const rootPath = root.path.endsWith('/') ? root.path : root.path + '/';
    if (!resource.path.startsWith(rootPath)) {
      return undefined;
    }
    const relativePath = resource.path.slice(rootPath.length).replace(/^\/+/, '');
    if (!relativePath || relativePath.startsWith('../') || relativePath.includes('\\0')) {
      return undefined;
    }
    return relativePath;
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
      /\.(pem|key|pfx|p12|ppk|jks|keystore|crt|cer|der)$/i.test(basename)
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
