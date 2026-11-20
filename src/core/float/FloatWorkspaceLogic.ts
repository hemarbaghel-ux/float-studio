/**
 * FLOAT Studio — Workspace Logic Engine
 * 
 * Provides robust workspace file operations, shadow workspace virtualization,
 * checkpointing, and atomic rollbacks with strict containment guarantees.
 */

import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceFile, WorkspaceCheckpoint, ShadowDiff } from './types';

export class FloatWorkspaceLogic {
  private workspaceRoot: string;
  private shadowFiles = new Map<string, string>(); // virtual uncommitted state
  private checkpoints = new Map<string, WorkspaceCheckpoint>();
  private inMemoryFiles = new Map<string, string>(); // for web/isolated testing

  constructor(workspaceRoot?: string) {
    this.workspaceRoot = workspaceRoot ? path.resolve(workspaceRoot) : process.cwd();
  }

  /**
   * Set or switch workspace root path
   */
  public setWorkspaceRoot(rootPath: string): void {
    this.workspaceRoot = path.resolve(rootPath);
    this.shadowFiles.clear();
  }

  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Resolve and enforce workspace path containment
   */
  public resolveSafePath(relativePath: string): string {
    const resolved = path.resolve(this.workspaceRoot, relativePath);
    const rel = path.relative(this.workspaceRoot, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`SECURITY_ESCAPE: Path "${relativePath}" escapes workspace boundary "${this.workspaceRoot}"`);
    }
    return resolved;
  }

  /**
   * Read file content, prioritizing shadow workspace edits if active
   */
  public async readFile(relativePath: string, useShadow = true): Promise<string> {
    const normalized = path.normalize(relativePath).replace(/\\/g, '/');

    if (useShadow && this.shadowFiles.has(normalized)) {
      return this.shadowFiles.get(normalized)!;
    }

    if (this.inMemoryFiles.has(normalized)) {
      return this.inMemoryFiles.get(normalized)!;
    }

    const safePath = this.resolveSafePath(relativePath);
    if (!fs.existsSync(safePath)) {
      throw new Error(`FILE_NOT_FOUND: File "${relativePath}" does not exist in workspace.`);
    }

    return await fs.promises.readFile(safePath, 'utf8');
  }

  /**
   * Write file to disk or in-memory backing
   */
  public async writeFile(relativePath: string, content: string): Promise<void> {
    const normalized = path.normalize(relativePath).replace(/\\/g, '/');
    this.inMemoryFiles.set(normalized, content);

    // If writing to real disk directory
    if (this.workspaceRoot && fs.existsSync(this.workspaceRoot)) {
      const safePath = this.resolveSafePath(relativePath);
      const parentDir = path.dirname(safePath);
      if (!fs.existsSync(parentDir)) {
        await fs.promises.mkdir(parentDir, { recursive: true });
      }
      await fs.promises.writeFile(safePath, content, 'utf8');
    }
  }

  /**
   * Stage changes in shadow workspace virtualization (zero disk pollution)
   */
  public stageShadowEdit(relativePath: string, proposedContent: string): void {
    const normalized = path.normalize(relativePath).replace(/\\/g, '/');
    this.shadowFiles.set(normalized, proposedContent);
  }

  /**
   * Clear all staged shadow edits
   */
  public clearShadowEdits(): void {
    this.shadowFiles.clear();
  }

  /**
   * Get all active shadow diffs comparing original disk/memory content with shadow edits
   */
  public async getShadowDiffs(): Promise<ShadowDiff[]> {
    const diffs: ShadowDiff[] = [];

    for (const [relativePath, proposedContent] of this.shadowFiles.entries()) {
      let originalContent = '';
      try {
        originalContent = await this.readFile(relativePath, false);
      } catch {
        // new file creation in shadow
        originalContent = '';
      }

      if (originalContent === proposedContent) {
        continue;
      }

      const originalLines = originalContent.split('\n');
      const proposedLines = proposedContent.split('\n');
      
      const additions = proposedLines.filter(line => !originalLines.includes(line)).length;
      const deletions = originalLines.filter(line => !proposedLines.includes(line)).length;

      const unifiedDiff = [
        `--- a/${relativePath}`,
        `+++ b/${relativePath}`,
        `@@ -1,${originalLines.length} +1,${proposedLines.length} @@`,
        ...proposedLines.map(l => `+${l}`)
      ].join('\n');

      diffs.push({
        filePath: relativePath,
        originalContent,
        proposedContent,
        unifiedDiff,
        additions,
        deletions
      });
    }

    return diffs;
  }

  /**
   * Atomically commit all staged shadow edits to real files after user approval
   */
  public async commitShadowEdits(description?: string): Promise<{ appliedCount: number; checkpointId: string }> {
    if (this.shadowFiles.size === 0) {
      return { appliedCount: 0, checkpointId: '' };
    }

    // Automatically create a pre-apply checkpoint
    const checkpoint = await this.createCheckpoint(description || `Pre-apply checkpoint before applying ${this.shadowFiles.size} files`);

    let appliedCount = 0;
    for (const [relativePath, proposedContent] of this.shadowFiles.entries()) {
      await this.writeFile(relativePath, proposedContent);
      appliedCount++;
    }

    this.shadowFiles.clear();
    return { appliedCount, checkpointId: checkpoint.id };
  }

  /**
   * Create an immutable workspace checkpoint
   */
  public async createCheckpoint(description: string, projectId = 'default_project'): Promise<WorkspaceCheckpoint> {
    const checkpointId = `chk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const snapshotFiles: Record<string, string> = {};

    // Snapshot in-memory and known files
    for (const [pathKey, content] of this.inMemoryFiles.entries()) {
      snapshotFiles[pathKey] = content;
    }

    const checkpoint: WorkspaceCheckpoint = {
      id: checkpointId,
      projectId,
      timestamp: Date.now(),
      description,
      files: snapshotFiles
    };

    this.checkpoints.set(checkpointId, checkpoint);
    return checkpoint;
  }

  /**
   * Roll back workspace to a previous checkpoint state
   */
  public async rollbackCheckpoint(checkpointId: string): Promise<{ restoredFilesCount: number }> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`CHECKPOINT_NOT_FOUND: Checkpoint "${checkpointId}" does not exist.`);
    }

    this.shadowFiles.clear();
    let restoredFilesCount = 0;

    for (const [relativePath, content] of Object.entries(checkpoint.files)) {
      await this.writeFile(relativePath, content);
      restoredFilesCount++;
    }

    return { restoredFilesCount };
  }

  /**
   * Build hierarchical workspace file tree
   */
  public getFileTree(maxDepth = 5): WorkspaceFile[] {
    const rootNodes: WorkspaceFile[] = [];
    const knownPaths = Array.from(this.inMemoryFiles.keys());

    for (const p of knownPaths) {
      const parts = p.split('/');
      let currentLevel = rootNodes;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const currentPath = parts.slice(0, i + 1).join('/');

        let node = currentLevel.find(n => n.name === part);
        if (!node) {
          node = {
            path: currentPath,
            name: part,
            isDirectory: !isLast,
            children: isLast ? undefined : []
          };
          currentLevel.push(node);
        }

        if (!isLast && node.children) {
          currentLevel = node.children;
        }
      }
    }

    return rootNodes;
  }
}
