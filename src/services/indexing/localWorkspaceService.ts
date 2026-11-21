/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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

  resolvePath(relativePath: string, allowSymlinkLeaf: boolean = false): string {
    const safeRel = validateSafeWorkspacePath(relativePath);

    // Check all roots
    for (const root of this.rootPaths) {
      let realRoot = root;
      try {
        if (fs.existsSync(root)) {
          realRoot = fs.realpathSync(root);
        }
      } catch {}

      const candidate = path.resolve(root, safeRel);
      try {
        const lstat = fs.lstatSync(candidate);
        if (lstat.isSymbolicLink() && allowSymlinkLeaf) {
          const parentDir = path.dirname(candidate);
          const realParent = fs.realpathSync(parentDir);
          const relParent = path.relative(realRoot, realParent);
          if (relParent.startsWith('..') || path.isAbsolute(relParent)) {
            throw new Error(`Path containment violation: parent directory of "${relativePath}" resolves outside workspace root "${realRoot}".`);
          }
          return candidate;
        }

        const realCandidate = fs.realpathSync(candidate);
        const rel = path.relative(realRoot, realCandidate);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          throw new Error(`Path containment violation: "${relativePath}" resolves to "${realCandidate}" outside workspace root "${realRoot}".`);
        }
        return candidate;
      } catch (err: any) {
        if (err.message && err.message.includes('Path containment violation')) {
          throw err;
        }
      }
    }

    // Default to primary root
    const primaryRoot = this.rootPaths[0];
    let realPrimaryRoot = primaryRoot;
    try {
      if (fs.existsSync(primaryRoot)) {
        realPrimaryRoot = fs.realpathSync(primaryRoot);
      }
    } catch {}

    const candidate = path.resolve(primaryRoot, safeRel);

    try {
      const lstat = fs.lstatSync(candidate);
      if (lstat.isSymbolicLink() && allowSymlinkLeaf) {
        const parentDir = path.dirname(candidate);
        const realParent = fs.realpathSync(parentDir);
        const relParent = path.relative(realPrimaryRoot, realParent);
        if (relParent.startsWith('..') || path.isAbsolute(relParent)) {
          throw new Error(`Path containment violation: parent directory of "${relativePath}" resolves outside workspace root "${realPrimaryRoot}".`);
        }
        return candidate;
      }

      const realCandidate = fs.realpathSync(candidate);
      const rel = path.relative(realPrimaryRoot, realCandidate);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Path containment violation: "${relativePath}" resolves to "${realCandidate}" outside workspace root "${realPrimaryRoot}".`);
      }
      return candidate;
    } catch (err: any) {
      if (err.message && err.message.includes('Path containment violation')) {
        throw err;
      }
    }

    // If candidate does not exist yet (e.g. for writeFile), verify closest existing ancestor
    let ancestor = path.dirname(candidate);
    while (!fs.existsSync(ancestor) && ancestor !== path.dirname(ancestor)) {
      ancestor = path.dirname(ancestor);
    }
    if (fs.existsSync(ancestor)) {
      const realAncestor = fs.realpathSync(ancestor);
      const rel = path.relative(realPrimaryRoot, realAncestor);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Path containment violation: ancestor directory of "${relativePath}" resolves outside workspace root "${realPrimaryRoot}".`);
      }
    }

    const relToRoot = path.relative(realPrimaryRoot, candidate);
    if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
      throw new Error(`Path containment violation: "${relativePath}" escapes primary workspace root "${realPrimaryRoot}".`);
    }

    return candidate;
  }

  private assertContainedInRoots(realCandidate: string, relativePath: string): void {
    let contained = false;
    for (const root of this.rootPaths) {
      let realRoot = root;
      try {
        if (fs.existsSync(root)) realRoot = fs.realpathSync(root);
      } catch {}
      const rel = path.relative(realRoot, realCandidate);
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
        contained = true;
        break;
      }
    }
    if (!contained) {
      throw new Error(`Path containment violation: "${relativePath}" resolves to "${realCandidate}" outside workspace roots.`);
    }
  }

  private validateDirectoryHierarchy(dirPath: string): void {
    let current = path.resolve(dirPath);
    while (current && current !== path.dirname(current)) {
      if (fs.existsSync(current)) {
        try {
          const lstat = fs.lstatSync(current);
          if (lstat.isSymbolicLink()) {
            const realDir = fs.realpathSync(current);
            this.assertContainedInRoots(realDir, current);
          }
        } catch (err: any) {
          if (err.message && err.message.includes('Path containment violation')) throw err;
        }
      }
      current = path.dirname(current);
    }
  }

  async readFile(relativePath: string): Promise<string> {
    const fullPath = this.resolvePath(relativePath);
    
    // 1. Verify parent directory hierarchy has no escaping symlinks
    this.validateDirectoryHierarchy(path.dirname(fullPath));

    // 2. Secure file handle open with post-open realpath and inode verification
    const handle = await fs.promises.open(fullPath, 'r');
    try {
      const fdStat = await handle.stat();
      if (fdStat.isDirectory()) {
        throw new Error(`Cannot readFile on directory "${relativePath}".`);
      }
      if (fdStat.isSocket() || fdStat.isFIFO() || fdStat.isCharacterDevice() || fdStat.isBlockDevice()) {
        throw new Error(`Special filesystem objects (sockets, FIFOs, device nodes) cannot be read: "${relativePath}".`);
      }
      const realAfterOpen = fs.realpathSync(fullPath);
      this.assertContainedInRoots(realAfterOpen, relativePath);

      // Verify open descriptor points to the exact same filesystem object as realAfterOpen
      const realStat = fs.statSync(realAfterOpen);
      if (fdStat.dev && realStat.dev && (fdStat.dev !== realStat.dev || fdStat.ino !== realStat.ino)) {
        throw new Error(`TOCTOU race detected: file descriptor does not match realpath target for "${relativePath}".`);
      }

      return await handle.readFile('utf8');
    } finally {
      await handle.close();
    }
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    const parentDir = path.dirname(fullPath);

    // 1. Validate parent directory hierarchy contains no escaping symlinks
    this.validateDirectoryHierarchy(parentDir);
    await fs.promises.mkdir(parentDir, { recursive: true });

    // 2. Refuse writing if target is an existing symlink or special file (prevents writing through symlinks)
    try {
      const lstat = await fs.promises.lstat(fullPath);
      if (lstat.isSymbolicLink()) {
        throw new Error(`Path containment violation: refusing to write through symlink "${relativePath}".`);
      }
      if (lstat.isSocket() || lstat.isFIFO() || lstat.isCharacterDevice() || lstat.isBlockDevice()) {
        throw new Error(`Path containment violation: refusing to write to special filesystem object "${relativePath}".`);
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }

    // 3. Write via unique temporary file in the same directory using O_CREAT | O_EXCL
    const tempName = `.${path.basename(fullPath)}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    const tempPath = path.join(parentDir, tempName);

    const tempHandle = await fs.promises.open(
      tempPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600
    );
    try {
      const realTemp = fs.realpathSync(tempPath);
      this.assertContainedInRoots(realTemp, tempName);
      await tempHandle.writeFile(content, 'utf8');
    } finally {
      await tempHandle.close();
    }

    // 4. Double check target is not a symlink right before atomic rename
    try {
      const finalLstat = await fs.promises.lstat(fullPath);
      if (finalLstat.isSymbolicLink()) {
        await fs.promises.unlink(tempPath).catch(() => {});
        throw new Error(`Path containment violation: refusing to write through symlink "${relativePath}".`);
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        await fs.promises.unlink(tempPath).catch(() => {});
        throw err;
      }
    }

    // 5. Atomic rename into place
    await fs.promises.rename(tempPath, fullPath);

    // Incrementally update index
    const safeRel = validateSafeWorkspacePath(relativePath);
    if (shouldIndexFile(safeRel)) {
      this.index.updateFile(safeRel, content);
    }
  }

  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath, true);
    await this.validateDirectoryHierarchy(path.dirname(fullPath));
    try {
      const lstat = await fs.promises.lstat(fullPath);
      if (lstat.isSymbolicLink()) {
        // Unlink ONLY the symlink itself; never follow to external target
        await fs.promises.unlink(fullPath);
      } else if (lstat.isDirectory()) {
        await fs.promises.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(fullPath);
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
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
      const fullPath = path.join(baseDir, relPath);

      // Verify symlink containment
      if (entry.isSymbolicLink()) {
        try {
          const realTarget = fs.realpathSync(fullPath);
          let realBase = baseDir;
          try { realBase = fs.realpathSync(baseDir); } catch {}
          const relFromBase = path.relative(realBase, realTarget);
          if (relFromBase.startsWith('..') || path.isAbsolute(relFromBase)) {
            // Symlink escapes workspace root; skip for containment security
            continue;
          }
        } catch {
          continue;
        }
      }

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
   * Respects .gitignore, .floatignore, and scalable file budgets.
   */
  async initializeIndex(options?: { maxFiles?: number }): Promise<{ totalIndexed: number; totalScanned: number; durationMs: number }> {
    const start = Date.now();
    const maxFiles = options?.maxFiles ?? 25_000;
    const files = await this.listFiles({ recursive: true, maxFiles });
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
      totalScanned: files.length,
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
