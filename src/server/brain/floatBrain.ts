import { KnowledgeGraph } from './knowledgeGraph';
import { WorkspaceIndex } from '../../services/indexing/workspaceIndex';
import { workspaceIndexManager } from '../../services/indexing/workspaceIndexManager';
import { BrainRetrievalEngine } from './brainRetrieval';
import { BrainSyncPipeline, BrainMutationEvent } from './brainSync';
import { BrainMemoryService } from './brainMemory';
import {
  BrainContextQueryOptions,
  BrainContextResponse,
  BrainObservabilityReport,
  EmbeddingProvider
} from './types';

/**
 * FLOAT Brain: The Central Subsystem for Whole-Codebase Intelligence.
 * Seamlessly integrates Knowledge Graph, Multi-Signal Indexing, Hybrid Retrieval,
 * Scoped Memory, and Event-Driven Synchronization.
 */
export class FloatBrain {
  public readonly projectId: string;
  public readonly userId: string;

  public readonly graph: KnowledgeGraph;
  public readonly workspaceIndex: WorkspaceIndex;
  public readonly retrieval: BrainRetrievalEngine;
  public readonly sync: BrainSyncPipeline;

  constructor(projectId: string, userId: string = 'default-user', embeddingProvider?: EmbeddingProvider) {
    this.projectId = projectId;
    this.userId = userId;

    this.graph = new KnowledgeGraph(projectId);
    this.workspaceIndex = workspaceIndexManager.getIndex(projectId);
    this.retrieval = new BrainRetrievalEngine(this.graph, this.workspaceIndex, embeddingProvider);
    this.sync = new BrainSyncPipeline(this.graph, this.workspaceIndex, userId);
  }

  /**
   * Retrieves codebase-wide unified context for a prompt or task.
   */
  public async queryContext(query: string, options: BrainContextQueryOptions = {}): Promise<BrainContextResponse> {
    return this.retrieval.retrieve(query, options, this.userId);
  }

  /**
   * Bulk synchronizes workspace files into KnowledgeGraph and WorkspaceIndex.
   */
  public async syncFiles(files: Array<{ path?: string; name?: string; content?: string; type?: string }>): Promise<void> {
    await this.sync.syncAll(files);
  }

  /**
   * Handles an event mutation (file change, deletion, rename, proposal application).
   */
  public onFileMutation(event: BrainMutationEvent): void {
    switch (event.type) {
      case 'change':
        if (event.filePath && typeof event.content === 'string') {
          this.sync.onFileModified(event.filePath, event.content);
        }
        break;
      case 'delete':
        if (event.filePath) {
          this.sync.onFileDeleted(event.filePath);
        }
        break;
      case 'rename':
        if (event.oldFilePath && event.filePath) {
          this.sync.onFileRenamed(event.oldFilePath, event.filePath, event.content);
        }
        break;
      case 'proposal_applied':
        if (event.files) {
          this.sync.onProposalApplied('applied_proposal', event.files.map(f => ({
            path: f.path || f.name || '',
            content: f.content || ''
          })));
        }
        break;
      case 'sync_all':
        if (event.files) {
          this.sync.syncAll(event.files);
        }
        break;
    }
  }

  /**
   * Returns a comprehensive observability report for monitoring, developer tools, and audits.
   */
  public getObservabilityReport(): BrainObservabilityReport {
    const graphStats = this.graph.getStats();
    const indexStats = this.workspaceIndex.getStats();
    const syncStatus = this.sync.getStatus();
    const searchMode = this.retrieval.getSearchMode();
    const memories = BrainMemoryService.queryMemories(this.projectId, this.userId);

    return {
      projectId: this.projectId,
      status: syncStatus.status,
      lastIndexedAt: syncStatus.lastIndexedAt,
      revisionHash: syncStatus.revisionHash,
      searchMode,
      stats: {
        totalFiles: Math.max(graphStats.totalFiles, indexStats.totalFiles),
        totalSymbols: Math.max(graphStats.totalSymbols, indexStats.totalSymbols),
        totalNodes: graphStats.totalNodes,
        totalEdges: graphStats.totalEdges,
        totalApiRoutes: graphStats.totalApiRoutes,
        totalComponents: graphStats.totalComponents,
        totalStores: graphStats.totalStores,
        totalTests: graphStats.totalTests,
        totalMemories: memories.length
      },
      warnings: syncStatus.warnings
    };
  }
}

/**
 * Multi-tenant manager for FloatBrain instances with LRU eviction and isolation.
 */
export class FloatBrainManager {
  private static brains = new Map<string, { brain: FloatBrain; lastAccessed: number }>();
  private static MAX_ACTIVE_BRAINS = 50;

  private static getScopeKey(projectId: string, userId: string): string {
    return `${userId || 'default-user'}:::${projectId || 'default-project'}`;
  }

  /**
   * Retrieves or creates a FloatBrain instance for a specific project and user tenant.
   */
  public static getBrain(projectId: string, userId: string = 'default-user'): FloatBrain {
    const safeProjectId = projectId || 'default-project';
    const safeUserId = userId || 'default-user';
    const key = this.getScopeKey(safeProjectId, safeUserId);

    const existing = this.brains.get(key);
    if (existing) {
      existing.lastAccessed = Date.now();
      return existing.brain;
    }

    // LRU eviction if full
    if (this.brains.size >= this.MAX_ACTIVE_BRAINS) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.brains.entries()) {
        if (v.lastAccessed < oldestTime) {
          oldestTime = v.lastAccessed;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        this.brains.delete(oldestKey);
      }
    }

    const brain = new FloatBrain(safeProjectId, safeUserId);
    this.brains.set(key, { brain, lastAccessed: Date.now() });
    return brain;
  }

  /**
   * Clears all brain instances (used in tests or restarts).
   */
  public static clearAll(): void {
    this.brains.clear();
  }
}

export const floatBrainManager = FloatBrainManager;
