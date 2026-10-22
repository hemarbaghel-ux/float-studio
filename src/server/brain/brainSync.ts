import { KnowledgeGraph } from './knowledgeGraph';
import { WorkspaceIndex } from '../../services/indexing/workspaceIndex';
import { BrainMemoryService } from './brainMemory';
import { normalizeWorkspacePath } from '../../services/indexing/fileFilter';

export interface BrainMutationEvent {
  type: 'change' | 'delete' | 'rename' | 'proposal_applied' | 'sync_all';
  filePath?: string;
  oldFilePath?: string;
  content?: string;
  files?: Array<{ path?: string; name?: string; content?: string }>;
  timestamp: number;
}

/**
 * Event-Driven Knowledge Synchronization Pipeline.
 * Propagates file mutations, proposals, and refactorings to the Knowledge Graph
 * and Workspace Index incrementally without re-indexing the entire repository.
 */
export class BrainSyncPipeline {
  private graph: KnowledgeGraph;
  private workspaceIndex: WorkspaceIndex;
  private userId: string;

  private status: 'idle' | 'indexing' | 'stale' | 'error' = 'idle';
  private lastIndexedAt: number = Date.now();
  private revisionCount: number = 0;
  private warnings: string[] = [];

  constructor(graph: KnowledgeGraph, workspaceIndex: WorkspaceIndex, userId: string = 'default-user') {
    this.graph = graph;
    this.workspaceIndex = workspaceIndex;
    this.userId = userId;
  }

  public getStatus() {
    return {
      status: this.status,
      lastIndexedAt: this.lastIndexedAt,
      revisionHash: `rev_${this.revisionCount}_${this.lastIndexedAt}`,
      warnings: [...this.warnings]
    };
  }

  /**
   * Bulk synchronizes full workspace file tree into both WorkspaceIndex and KnowledgeGraph.
   */
  public async syncAll(files: Array<{ path?: string; name?: string; content?: string; type?: string }>): Promise<void> {
    this.status = 'indexing';
    try {
      this.workspaceIndex.indexProject(files);

      for (const file of files) {
        if (file.type === 'folder') continue;
        const p = file.path || file.name || '';
        const norm = normalizeWorkspacePath(p);
        if (norm && typeof file.content === 'string') {
          this.graph.reconcileFile(norm, file.content);
        }
      }

      // Secondary pass to resolve cross-file implementations, calls, and references
      this.graph.resolveCrossFileReferences();

      this.lastIndexedAt = Date.now();
      this.revisionCount++;
      this.status = 'idle';
    } catch (err: any) {
      this.status = 'error';
      this.warnings.push(`Sync failed: ${err.message}`);
    }
  }

  /**
   * Handles single file creation or edit incrementally.
   */
  public onFileModified(rawPath: string, content: string): boolean {
    const filePath = normalizeWorkspacePath(rawPath);
    if (!filePath) return false;

    try {
      // 1. Update Inverted Workspace Index
      const updated = this.workspaceIndex.updateFile(filePath, content);

      // 2. Reconcile Knowledge Graph nodes and edges
      this.graph.reconcileFile(filePath, content);

      // 3. Invalidate any stale architectural memories tied to this file
      BrainMemoryService.invalidateStale(this.graph.projectId, this.userId, filePath);

      this.lastIndexedAt = Date.now();
      this.revisionCount++;
      return updated;
    } catch (err: any) {
      this.warnings.push(`Incremental sync error on "${filePath}": ${err.message}`);
      return false;
    }
  }

  /**
   * Handles file deletion incrementally.
   */
  public onFileDeleted(rawPath: string): boolean {
    const filePath = normalizeWorkspacePath(rawPath);
    if (!filePath) return false;

    try {
      this.workspaceIndex.removeFile(filePath);
      this.graph.removeFile(filePath);
      BrainMemoryService.invalidateStale(this.graph.projectId, this.userId, filePath);
      this.lastIndexedAt = Date.now();
      this.revisionCount++;
      return true;
    } catch (err: any) {
      this.warnings.push(`File delete sync error on "${filePath}": ${err.message}`);
      return false;
    }
  }

  /**
   * Handles file rename incrementally.
   */
  public onFileRenamed(oldRawPath: string, newRawPath: string, content?: string): boolean {
    const oldPath = normalizeWorkspacePath(oldRawPath);
    const newPath = normalizeWorkspacePath(newRawPath);
    if (!oldPath || !newPath) return false;

    try {
      const existingDoc = this.workspaceIndex.getFileDocument(oldPath);
      const actualContent = content !== undefined ? content : (existingDoc?.content || '');

      this.onFileDeleted(oldPath);
      this.onFileModified(newPath, actualContent);

      this.lastIndexedAt = Date.now();
      this.revisionCount++;
      return true;
    } catch (err: any) {
      this.warnings.push(`File rename sync error from "${oldPath}" to "${newPath}": ${err.message}`);
      return false;
    }
  }

  /**
   * Handles applied proposal: updates modified files and invalidates related retrieval caches.
   */
  public onProposalApplied(proposalId: string, modifiedFiles: Array<{ path: string; content: string }>): void {
    for (const f of modifiedFiles) {
      this.onFileModified(f.path, f.content);
    }
    this.lastIndexedAt = Date.now();
    this.revisionCount++;
  }
}
