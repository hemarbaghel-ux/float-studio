/**
 * FLOAT AI - Multi-Repository Workspace Service (Milestone 9)
 *
 * Supports compound workspaces containing multiple independent repositories
 * (e.g. frontend, backend, shared-libs):
 * - Maintains repository boundaries and isolated git branches
 * - Context searches can be scoped to a single repo or across the workspace
 * - Enforces per-repository permission checks
 */

export interface WorkspaceRepository {
  id: string;
  name: string;
  subpath: string; // e.g. "frontend" or "services/api"
  remoteUrl: string;
  defaultBranch: string;
  currentBranch: string;
  isPrimary: boolean;
  permissions: {
    canRead: boolean;
    canWrite: boolean;
    canPush: boolean;
  };
}

export interface MultiRepoWorkspace {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  repositories: WorkspaceRepository[];
  updatedAt: number;
}

export class MultiRepoService {
  private static workspaces = new Map<string, MultiRepoWorkspace>(); // projectId -> workspace

  static registerWorkspace(workspace: MultiRepoWorkspace): void {
    this.workspaces.set(workspace.projectId, {
      ...workspace,
      updatedAt: Date.now()
    });
  }

  static getWorkspace(projectId: string, userId: string): MultiRepoWorkspace | undefined {
    const ws = this.workspaces.get(projectId);
    if (!ws || ws.userId !== userId) return undefined;
    return ws;
  }

  static addRepository(projectId: string, userId: string, repo: WorkspaceRepository): boolean {
    const ws = this.getWorkspace(projectId, userId);
    if (!ws) return false;

    // Check for duplicate subpath
    if (ws.repositories.some(r => r.subpath === repo.subpath)) {
      return false;
    }

    ws.repositories.push(repo);
    ws.updatedAt = Date.now();
    return true;
  }

  /**
   * Resolves which repository a relative file path belongs to.
   */
  static resolveRepositoryForPath(
    projectId: string,
    userId: string,
    filePath: string
  ): WorkspaceRepository | undefined {
    const ws = this.getWorkspace(projectId, userId);
    if (!ws || ws.repositories.length === 0) return undefined;

    const norm = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    // Match longest matching subpath prefix
    const sorted = [...ws.repositories].sort((a, b) => b.subpath.length - a.subpath.length);

    for (const repo of sorted) {
      if (norm === repo.subpath || norm.startsWith(`${repo.subpath}/`)) {
        return repo;
      }
    }

    return ws.repositories.find(r => r.isPrimary) || ws.repositories[0];
  }

  static clear(): void {
    this.workspaces.clear();
  }
}
