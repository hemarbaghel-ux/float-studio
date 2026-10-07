import { WorkspaceIndex } from './workspaceIndex';

const MAX_CACHED_PROJECT_INDICES = 50;

/**
 * Manages per-project WorkspaceIndex instances with LRU eviction and cross-project isolation.
 */
export class WorkspaceIndexManager {
  private indices = new Map<string, { index: WorkspaceIndex; lastAccessed: number }>();

  /**
   * Retrieves or creates the WorkspaceIndex for a specific projectId.
   * Guarantees strict cross-project isolation.
   */
  public getIndex(projectId: string): WorkspaceIndex {
    const safeProjectId = projectId ? projectId.trim() : 'default-workspace';
    const entry = this.indices.get(safeProjectId);

    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.index;
    }

    // Evict oldest if reaching capacity
    if (this.indices.size >= MAX_CACHED_PROJECT_INDICES) {
      this.evictOldest();
    }

    const newIndex = new WorkspaceIndex(safeProjectId);
    this.indices.set(safeProjectId, {
      index: newIndex,
      lastAccessed: Date.now()
    });

    return newIndex;
  }

  /**
   * Syncs an index with virtual project files, performing incremental updates
   * or recovery from stale state.
   */
  public syncProject(
    projectId: string,
    files: Array<{ path?: string; name?: string; content?: string; type?: string }>
  ): WorkspaceIndex {
    const index = this.getIndex(projectId);
    index.indexProject(files);
    return index;
  }

  /**
   * Invalidates or clears a specific project index.
   */
  public invalidateProject(projectId: string): void {
    const safeProjectId = projectId ? projectId.trim() : 'default-workspace';
    const entry = this.indices.get(safeProjectId);
    if (entry) {
      entry.index.clear();
      this.indices.delete(safeProjectId);
    }
  }

  /**
   * Clears all cached indices.
   */
  public clearAll(): void {
    for (const entry of this.indices.values()) {
      entry.index.clear();
    }
    this.indices.clear();
  }

  /**
   * Returns current number of active project indices.
   */
  public getActiveProjectCount(): number {
    return this.indices.size;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.indices.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.indices.get(oldestKey);
      if (entry) entry.index.clear();
      this.indices.delete(oldestKey);
    }
  }
}

export const workspaceIndexManager = new WorkspaceIndexManager();
