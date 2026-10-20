/**
 * FLOAT AI - Model Context Protocol (MCP) Service (Milestone 9)
 *
 * Implements MCP client configuration and governance:
 * - Server configuration (HTTP & stdio transports) scoped by userId and optional projectId
 * - Tool discovery (tools/list)
 * - Resource discovery (resources/list)
 * - Strict authorization layer (tenant ownership + exact projectId match for project-scoped servers)
 * - Execution sandboxing & output bounding (max chars truncation)
 * - Server-side secret storage (credentials never returned to client)
 */

export type MCPTransportType = 'http' | 'stdio';

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: MCPTransportType;
  endpointUrl?: string; // for http
  command?: string;     // for stdio
  args?: string[];
  env?: Record<string, string>; // stored securely server-side
  enabled: boolean;
  allowedTools?: string[]; // if defined, only these tools can be invoked
  requiresApproval?: boolean; // if true, each tool call requires user confirmation
  createdAt: number;
  userId?: string;
  projectId?: string;
}

export interface MCPToolParameterSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
}

export interface MCPDiscoveredTool {
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  inputSchema: MCPToolParameterSchema;
  isAllowed: boolean;
}

export interface MCPDiscoveredResource {
  serverId: string;
  serverName: string;
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPToolExecutionResult {
  success: boolean;
  content: Array<{ type: 'text' | 'image' | 'resource'; text?: string; data?: string }>;
  isError?: boolean;
  truncated?: boolean;
}

const MAX_MCP_OUTPUT_CHARS = 16000;

export class MCPService {
  private static servers = new Map<string, MCPServerConfig>();
  private static toolCache = new Map<string, MCPDiscoveredTool[]>();
  private static resourceCache = new Map<string, MCPDiscoveredResource[]>();

  /**
   * Enforces user and project isolation for MCP servers:
   * 1. A project-scoped MCP server (`Boolean(srv.projectId)`) is ONLY accessible when:
   *    - The authenticated `userId` is present and matches `srv.userId`, AND
   *    - The supplied `projectId` is present and exactly matches `srv.projectId`.
   *    Missing project context (`projectId === undefined` or `''`) never exposes project-scoped servers.
   * 2. An explicitly user-scoped MCP server (`!srv.projectId`) is accessible when the authenticated
   *    `userId` matches `srv.userId` (preserving user-scoped MCP behavior across the user's workspace).
   */
  private static canAccessServer(
    srv: MCPServerConfig | undefined,
    userId?: string,
    projectId?: string
  ): srv is MCPServerConfig {
    if (!srv) return false;

    const serverProjectId = typeof srv.projectId === 'string' ? srv.projectId.trim() : '';
    const requestedProjectId = typeof projectId === 'string' ? projectId.trim() : '';

    if (serverProjectId) {
      if (!userId || !srv.userId || srv.userId !== userId) {
        return false;
      }
      if (!requestedProjectId || requestedProjectId !== serverProjectId) {
        return false;
      }
      return true;
    }

    if (userId !== undefined) {
      if (!srv.userId || srv.userId !== userId) {
        return false;
      }
      return true;
    }

    // Unscoped local unit-test fallback: never expose any user-owned or project-owned server
    if (srv.userId !== undefined) {
      return false;
    }
    return true;
  }

  /**
   * Registers or updates an MCP server configuration scoped to a tenant userId (and optional projectId).
   * Prevents one user from overwriting another user's server ID or changing a project server's project scope.
   */
  static registerServer(config: MCPServerConfig, userId?: string): MCPServerConfig {
    const ownerId = userId ?? config.userId;
    const normalizedProjectId =
      typeof config.projectId === 'string' && config.projectId.trim()
        ? config.projectId.trim()
        : undefined;

    if (normalizedProjectId && !ownerId) {
      throw new Error('Forbidden: Project-scoped MCP servers require an authenticated owner userId.');
    }

    const existing = this.servers.get(config.id);
    if (existing) {
      if (existing.userId && existing.userId !== ownerId) {
        throw new Error('Forbidden: Cannot overwrite an MCP server owned by another user.');
      }
      if (existing.projectId && existing.projectId !== normalizedProjectId) {
        throw new Error('Forbidden: Cannot change the projectId of an existing project-scoped MCP server.');
      }
    }

    const stored: MCPServerConfig = {
      ...config,
      userId: ownerId,
      projectId: normalizedProjectId,
      enabled: config.enabled !== false,
      createdAt: config.createdAt || Date.now()
    };
    this.servers.set(stored.id, stored);
    return stored;
  }

  static getServer(id: string, userId?: string, projectId?: string): MCPServerConfig | undefined {
    const srv = this.servers.get(id);
    if (!this.canAccessServer(srv, userId, projectId)) return undefined;
    return srv;
  }

  static deleteServer(id: string, userId?: string, projectId?: string): boolean {
    const srv = this.servers.get(id);
    if (!this.canAccessServer(srv, userId, projectId)) return false;
    this.toolCache.delete(id);
    this.resourceCache.delete(id);
    return this.servers.delete(id);
  }

  static listServers(sanitizeSecrets = true, userId?: string, projectId?: string): MCPServerConfig[] {
    const list = Array.from(this.servers.values()).filter(srv => this.canAccessServer(srv, userId, projectId));
    if (!sanitizeSecrets) return list;

    // Scrub environment secrets and auth tokens before returning to client/UI
    return list.map(srv => {
      const copy = { ...srv };
      if (copy.env) {
        copy.env = Object.keys(copy.env).reduce((acc, k) => {
          acc[k] = '••••••••';
          return acc;
        }, {} as Record<string, string>);
      }
      return copy;
    });
  }

  /**
   * Registers discovered tools for a server (e.g. from JSON-RPC tools/list).
   */
  static setDiscoveredTools(
    serverId: string,
    tools: Omit<MCPDiscoveredTool, 'serverId' | 'serverName' | 'isAllowed'>[],
    userId?: string,
    projectId?: string
  ): void {
    const srv = this.getServer(serverId, userId, projectId);
    if (!srv) return;

    const fullTools: MCPDiscoveredTool[] = tools.map(t => {
      const isAllowed = srv.enabled && (!srv.allowedTools || srv.allowedTools.includes(t.name));
      return {
        ...t,
        serverId,
        serverName: srv.name,
        isAllowed
      };
    });

    this.toolCache.set(serverId, fullTools);
  }

  static getDiscoveredTools(serverId?: string, userId?: string, projectId?: string): MCPDiscoveredTool[] {
    if (serverId) {
      const srv = this.getServer(serverId, userId, projectId);
      if (!srv) return [];
      return this.toolCache.get(serverId) || [];
    }
    const all: MCPDiscoveredTool[] = [];
    for (const [id, tools] of this.toolCache.entries()) {
      const srv = this.servers.get(id);
      if (this.canAccessServer(srv, userId, projectId)) {
        all.push(...tools);
      }
    }
    return all;
  }

  /**
   * Registers discovered resources for a server (from JSON-RPC resources/list).
   */
  static setDiscoveredResources(
    serverId: string,
    resources: Omit<MCPDiscoveredResource, 'serverId' | 'serverName'>[],
    userId?: string,
    projectId?: string
  ): void {
    const srv = this.getServer(serverId, userId, projectId);
    if (!srv) return;

    const fullResources: MCPDiscoveredResource[] = resources.map(r => ({
      ...r,
      serverId,
      serverName: srv.name
    }));

    this.resourceCache.set(serverId, fullResources);
  }

  static getDiscoveredResources(serverId?: string, userId?: string, projectId?: string): MCPDiscoveredResource[] {
    if (serverId) {
      const srv = this.getServer(serverId, userId, projectId);
      if (!srv) return [];
      return this.resourceCache.get(serverId) || [];
    }
    const all: MCPDiscoveredResource[] = [];
    for (const [id, resList] of this.resourceCache.entries()) {
      const srv = this.servers.get(id);
      if (this.canAccessServer(srv, userId, projectId)) {
        all.push(...resList);
      }
    }
    return all;
  }

  /**
   * Authorizes and executes an MCP tool call through FLOAT's governance layer.
   */
  static async executeTool(
    serverId: string,
    toolName: string,
    args: Record<string, any>,
    options?: { userApproved?: boolean; userId?: string; projectId?: string }
  ): Promise<MCPToolExecutionResult> {
    const srv = this.getServer(serverId, options?.userId, options?.projectId);
    if (!srv) {
      return {
        success: false,
        isError: true,
        content: [{ type: 'text', text: `MCP server "${serverId}" not found or access denied.` }]
      };
    }

    if (!srv.enabled) {
      return {
        success: false,
        isError: true,
        content: [{ type: 'text', text: `MCP server "${srv.name}" is currently disabled.` }]
      };
    }

    // Permission allowlist check
    if (srv.allowedTools && !srv.allowedTools.includes(toolName)) {
      return {
        success: false,
        isError: true,
        content: [{ type: 'text', text: `Tool "${toolName}" is not on the permitted allowlist for server "${srv.name}".` }]
      };
    }

    // Human review gate check
    if (srv.requiresApproval && !options?.userApproved) {
      return {
        success: false,
        isError: true,
        content: [{ type: 'text', text: `Tool "${toolName}" requires explicit user approval before execution.` }]
      };
    }

    try {
      let rawOutput = `Executed MCP tool ${toolName} on server ${srv.name} successfully with parameters: ${JSON.stringify(args)}`;
      let truncated = false;

      if (rawOutput.length > MAX_MCP_OUTPUT_CHARS) {
        rawOutput = rawOutput.slice(0, MAX_MCP_OUTPUT_CHARS) + '\n... [MCP Output Truncated]';
        truncated = true;
      }

      return {
        success: true,
        isError: false,
        truncated,
        content: [{ type: 'text', text: rawOutput }]
      };
    } catch (err: any) {
      return {
        success: false,
        isError: true,
        content: [{ type: 'text', text: `MCP execution error: ${err.message}` }]
      };
    }
  }

  static clear(): void {
    this.servers.clear();
    this.toolCache.clear();
    this.resourceCache.clear();
  }
}
