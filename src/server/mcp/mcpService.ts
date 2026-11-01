/**
 * FLOAT AI - Model Context Protocol (MCP) Service (Phase 3 Real Protocol Client)
 *
 * Implements real MCP client communication and governance:
 * - Server configuration (Streamable HTTP & stdio transports) scoped by userId and optional projectId
 * - Real JSON-RPC 2.0 protocol over stdio (child_process.spawn) and Streamable HTTP (fetch)
 * - Methods: initialize, tools/list, tools/call, resources/list
 * - Stdio security gate: blocked unless FLOAT_ALLOW_STDIO_MCP=true, and never executed
 *   in the web server process in production (routes to sandbox runner if configured)
 * - Strict authorization layer (tenant ownership + exact projectId match for project-scoped servers)
 * - Execution timeouts, deterministic process cleanup, and output truncation
 * - Server-side secret storage (credentials never returned to client)
 */

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import readline from 'readline';
import { projectProcessManager } from '../execution/processManager';

export type MCPTransportType = 'http' | 'stdio';

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: MCPTransportType;
  endpointUrl?: string; // for Streamable HTTP
  command?: string;     // for stdio
  args?: string[];
  env?: Record<string, string>; // stored securely server-side
  enabled: boolean;
  allowedTools?: string[]; // if defined, only these tools can be invoked
  requiresApproval?: boolean; // if true, each tool call requires user confirmation
  timeoutMs?: number;
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

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: Record<string, any>;
  serverInfo?: { name: string; version: string };
}

export const MAX_MCP_OUTPUT_CHARS = 16000;
const DEFAULT_MCP_TIMEOUT_MS = 15000;

export class MCPService {
  private static servers = new Map<string, MCPServerConfig>();
  private static toolCache = new Map<string, MCPDiscoveredTool[]>();
  private static resourceCache = new Map<string, MCPDiscoveredResource[]>();

  /**
   * Enforces user and project isolation for MCP servers:
   * 1. A project-scoped MCP server (`Boolean(srv.projectId)`) is ONLY accessible when:
   *    - The authenticated `userId` is present and matches `srv.userId`, AND
   *    - The supplied `projectId` is present and exactly matches `srv.projectId`.
   * 2. An explicitly user-scoped MCP server (`!srv.projectId`) is accessible when the authenticated
   *    `userId` matches `srv.userId`.
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

    if (srv.userId !== undefined) {
      return false;
    }
    return true;
  }

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
    const list = Array.from(this.servers.values()).filter((srv) =>
      this.canAccessServer(srv, userId, projectId)
    );
    if (!sanitizeSecrets) return list;

    return list.map((srv) => {
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

  static setDiscoveredTools(
    serverId: string,
    tools: Omit<MCPDiscoveredTool, 'serverId' | 'serverName' | 'isAllowed'>[],
    userId?: string,
    projectId?: string
  ): void {
    const srv = this.getServer(serverId, userId, projectId);
    if (!srv) return;

    const fullTools: MCPDiscoveredTool[] = tools.map((t) => {
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

  static setDiscoveredResources(
    serverId: string,
    resources: Omit<MCPDiscoveredResource, 'serverId' | 'serverName'>[],
    userId?: string,
    projectId?: string
  ): void {
    const srv = this.getServer(serverId, userId, projectId);
    if (!srv) return;

    const fullResources: MCPDiscoveredResource[] = resources.map((r) => ({
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
   * Validates stdio execution policy:
   * - Blocked unless FLOAT_ALLOW_STDIO_MCP=true
   * - Never runs in the web server process in production; routes to sandbox runner if configured.
   */
  private static validateStdioPolicy(srv: MCPServerConfig): { allowed: boolean; useSandbox: boolean; error?: string } {
    if (process.env.FLOAT_ALLOW_STDIO_MCP !== 'true') {
      return {
        allowed: false,
        useSandbox: false,
        error: `Stdio MCP execution is blocked for server "${srv.name}". Set FLOAT_ALLOW_STDIO_MCP=true to enable stdio MCP commands.`
      };
    }

    if (!srv.command || !srv.command.trim()) {
      return {
        allowed: false,
        useSandbox: false,
        error: `Stdio MCP server "${srv.name}" is missing an executable command.`
      };
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const isWebServerProcess = process.env.FLOAT_PROCESS_ROLE !== 'worker' && process.env.FLOAT_PROCESS_ROLE !== 'sandbox';

    if (isProduction && isWebServerProcess) {
      if (projectProcessManager.available) {
        return { allowed: true, useSandbox: true };
      }
      return {
        allowed: false,
        useSandbox: false,
        error: `Stdio MCP commands cannot run inside the production web server process and no Docker sandbox runner is available for "${srv.name}".`
      };
    }

    return { allowed: true, useSandbox: false };
  }

  /**
   * Executes a JSON-RPC 2.0 request over Streamable HTTP transport.
   */
  private static async sendHttpJsonRpc(
    srv: MCPServerConfig,
    method: string,
    params: Record<string, any> = {},
    timeoutMs = srv.timeoutMs || DEFAULT_MCP_TIMEOUT_MS
  ): Promise<any> {
    if (!srv.endpointUrl) {
      throw new Error(`HTTP MCP server "${srv.name}" is missing endpointUrl.`);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(srv.endpointUrl);
    } catch {
      throw new Error(`Invalid endpointUrl "${srv.endpointUrl}" for MCP server "${srv.name}".`);
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error(`Unsupported protocol "${parsedUrl.protocol}" for MCP server "${srv.name}".`);
    }

    const reqId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      jsonrpc: '2.0',
      id: reqId,
      method,
      params
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream'
      };
      if (srv.env?.AUTHORIZATION) {
        headers['Authorization'] = srv.env.AUTHORIZATION;
      } else if (srv.env?.API_KEY) {
        headers['Authorization'] = `Bearer ${srv.env.API_KEY}`;
      }

      const response = await fetch(srv.endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status} from MCP server "${srv.name}": ${errBody.slice(0, 300)}`);
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const rawText = await response.text();

      let rpcMessage: any = null;
      if (contentType.includes('text/event-stream')) {
        const lines = rawText.split(/\r?\n/);
        for (const line of lines) {
          if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim();
            if (!dataStr) continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.id === reqId || parsed.result !== undefined || parsed.error !== undefined) {
                rpcMessage = parsed;
                break;
              }
            } catch {}
          }
        }
      } else {
        rpcMessage = JSON.parse(rawText);
      }

      if (!rpcMessage) {
        throw new Error(`Empty or invalid JSON-RPC response from HTTP MCP server "${srv.name}".`);
      }

      if (rpcMessage.error) {
        throw new Error(
          `MCP JSON-RPC error (${rpcMessage.error.code ?? 'unknown'}): ${rpcMessage.error.message || JSON.stringify(rpcMessage.error)}`
        );
      }

      return rpcMessage.result;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error(`MCP HTTP request "${method}" timed out after ${timeoutMs}ms on server "${srv.name}".`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Executes an MCP session (`initialize` + target method) over stdio transport with timeout and cleanup.
   */
  private static async sendStdioJsonRpc(
    srv: MCPServerConfig,
    method: string,
    params: Record<string, any> = {},
    timeoutMs = srv.timeoutMs || DEFAULT_MCP_TIMEOUT_MS
  ): Promise<any> {
    const policy = this.validateStdioPolicy(srv);
    if (!policy.allowed) {
      throw new Error(policy.error || 'Stdio MCP execution is not permitted.');
    }

    const command = srv.command!;
    const args = Array.isArray(srv.args) ? srv.args : [];

    // Route through Docker sandbox runner if required in production
    if (policy.useSandbox) {
      const initReq = JSON.stringify({
        jsonrpc: '2.0',
        id: 'init-1',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'float-ai-mcp-client', version: '1.0.0' }
        }
      });
      const initializedNotif = JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      });
      const callId = `req-${Date.now()}`;
      const targetReq = JSON.stringify({
        jsonrpc: '2.0',
        id: callId,
        method,
        params
      });

      const fullInput = `${initReq}\n${initializedNotif}\n${targetReq}\n`;
      const cmdLine = [command, ...args].map((a) => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ');
      let stdoutBuf = '';
      let stderrBuf = '';

      const exec = projectProcessManager.start(
        {
          ownerId: srv.userId || 'system',
          projectId: srv.projectId || 'mcp-sandbox',
          command: `printf %s '${fullInput.replace(/'/g, `'\\''`)}' | ${cmdLine}`,
          files: [],
          timeoutMs
        },
        (ev) => {
          if (ev.type === 'output' && ev.stream === 'stdout' && ev.text) stdoutBuf += ev.text;
          if (ev.type === 'output' && ev.stream === 'stderr' && ev.text) stderrBuf += ev.text;
        }
      );
      await exec.done;

      const lines = stdoutBuf.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.id === callId) {
            if (msg.error) {
              throw new Error(`MCP JSON-RPC error (${msg.error.code}): ${msg.error.message}`);
            }
            return msg.result;
          }
        } catch (e: any) {
          if (e.message?.startsWith('MCP JSON-RPC error')) throw e;
        }
      }
      throw new Error(`Sandbox stdio MCP server "${srv.name}" did not return a valid JSON-RPC response. ${stderrBuf.slice(0, 300)}`);
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let child: ChildProcessWithoutNullStreams | null = null;
      let killTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (killTimer) {
          clearTimeout(killTimer);
          killTimer = null;
        }
        if (child) {
          try {
            child.stdin.end();
          } catch {}
          if (!child.killed && child.exitCode === null) {
            try {
              child.kill('SIGTERM');
              const proc = child;
              setTimeout(() => {
                try {
                  if (!proc.killed && proc.exitCode === null) {
                    proc.kill('SIGKILL');
                  }
                } catch {}
              }, 250).unref?.();
            } catch {}
          }
        }
      };

      const finishError = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const finishSuccess = (result: any) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      killTimer = setTimeout(() => {
        finishError(new Error(`MCP stdio request "${method}" timed out after ${timeoutMs}ms on server "${srv.name}".`));
      }, timeoutMs);

      try {
        child = spawn(command, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            ...(srv.env || {})
          }
        });
      } catch (err: any) {
        finishError(new Error(`Failed to spawn stdio MCP server "${srv.name}": ${err.message}`));
        return;
      }

      let stderrOutput = '';
      child.stderr.on('data', (chunk) => {
        if (stderrOutput.length < 2048) {
          stderrOutput += chunk.toString('utf8');
        }
      });

      child.on('error', (err) => {
        finishError(new Error(`Stdio MCP process error on "${srv.name}": ${err.message}`));
      });

      child.on('close', (code) => {
        if (!settled) {
          finishError(
            new Error(
              `Stdio MCP server "${srv.name}" exited prematurely with code ${code} before responding to "${method}". ${stderrOutput.trim()}`
            )
          );
        }
      });

      const initId = 'init-1';
      const targetId = `call-${Date.now()}`;
      let initialized = false;

      const rl = readline.createInterface({
        input: child.stdout,
        terminal: false
      });

      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let msg: any;
        try {
          msg = JSON.parse(trimmed);
        } catch {
          return;
        }

        if (msg.id === initId && !initialized) {
          if (msg.error) {
            finishError(new Error(`MCP initialize error (${msg.error.code}): ${msg.error.message}`));
            return;
          }
          initialized = true;
          if (method === 'initialize') {
            finishSuccess(msg.result);
            return;
          }
          // Send notifications/initialized followed by target request
          try {
            child!.stdin.write(
              JSON.stringify({
                jsonrpc: '2.0',
                method: 'notifications/initialized',
                params: {}
              }) + '\n'
            );
            child!.stdin.write(
              JSON.stringify({
                jsonrpc: '2.0',
                id: targetId,
                method,
                params
              }) + '\n'
            );
          } catch (writeErr: any) {
            finishError(new Error(`Failed writing to MCP stdio stdin: ${writeErr.message}`));
          }
          return;
        }

        if (msg.id === targetId) {
          if (msg.error) {
            finishError(new Error(`MCP JSON-RPC error (${msg.error.code}): ${msg.error.message}`));
            return;
          }
          finishSuccess(msg.result);
        }
      });

      // Kick off MCP handshake with initialize
      try {
        child.stdin.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: initId,
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {}, resources: {} },
              clientInfo: { name: 'float-ai-mcp-client', version: '1.0.0' }
            }
          }) + '\n'
        );
      } catch (err: any) {
        finishError(new Error(`Failed to send MCP initialize request: ${err.message}`));
      }
    });
  }

  private static async sendRpcRequest(
    srv: MCPServerConfig,
    method: string,
    params: Record<string, any> = {},
    timeoutMs?: number
  ): Promise<any> {
    if (srv.transport === 'stdio') {
      return this.sendStdioJsonRpc(srv, method, params, timeoutMs);
    }
    return this.sendHttpJsonRpc(srv, method, params, timeoutMs);
  }

  /**
   * Performs a live MCP `initialize` handshake with the configured server.
   */
  static async initializeServer(
    serverId: string,
    options?: { userId?: string; projectId?: string; timeoutMs?: number }
  ): Promise<MCPInitializeResult> {
    const srv = this.getServer(serverId, options?.userId, options?.projectId);
    if (!srv) {
      throw new Error(`MCP server "${serverId}" not found or access denied.`);
    }
    if (!srv.enabled) {
      throw new Error(`MCP server "${srv.name}" is disabled.`);
    }
    return this.sendRpcRequest(
      srv,
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {} },
        clientInfo: { name: 'float-ai-mcp-client', version: '1.0.0' }
      },
      options?.timeoutMs
    );
  }

  /**
   * Queries `tools/list` from the live MCP server and updates the server's tool cache.
   */
  static async discoverToolsLive(
    serverId: string,
    options?: { userId?: string; projectId?: string; timeoutMs?: number }
  ): Promise<MCPDiscoveredTool[]> {
    const srv = this.getServer(serverId, options?.userId, options?.projectId);
    if (!srv) {
      throw new Error(`MCP server "${serverId}" not found or access denied.`);
    }
    if (!srv.enabled) {
      throw new Error(`MCP server "${srv.name}" is disabled.`);
    }

    const result = await this.sendRpcRequest(srv, 'tools/list', {}, options?.timeoutMs);
    const rawTools = Array.isArray(result?.tools) ? result.tools : [];
    const normalized = rawTools.map((t: any) => ({
      name: String(t.name || ''),
      description: String(t.description || ''),
      inputSchema: (t.inputSchema || { type: 'object' }) as MCPToolParameterSchema
    }));
    this.setDiscoveredTools(serverId, normalized, options?.userId, options?.projectId);
    return this.getDiscoveredTools(serverId, options?.userId, options?.projectId);
  }

  /**
   * Queries `resources/list` from the live MCP server and updates the server's resource cache.
   */
  static async discoverResourcesLive(
    serverId: string,
    options?: { userId?: string; projectId?: string; timeoutMs?: number }
  ): Promise<MCPDiscoveredResource[]> {
    const srv = this.getServer(serverId, options?.userId, options?.projectId);
    if (!srv) {
      throw new Error(`MCP server "${serverId}" not found or access denied.`);
    }
    if (!srv.enabled) {
      throw new Error(`MCP server "${srv.name}" is disabled.`);
    }

    const result = await this.sendRpcRequest(srv, 'resources/list', {}, options?.timeoutMs);
    const rawResources = Array.isArray(result?.resources) ? result.resources : [];
    const normalized = rawResources.map((r: any) => ({
      uri: String(r.uri || ''),
      name: String(r.name || ''),
      description: r.description ? String(r.description) : undefined,
      mimeType: r.mimeType ? String(r.mimeType) : undefined
    }));
    this.setDiscoveredResources(serverId, normalized, options?.userId, options?.projectId);
    return this.getDiscoveredResources(serverId, options?.userId, options?.projectId);
  }

  /**
   * Authorizes and executes a real MCP `tools/call` request through FLOAT's governance layer.
   * Never returns a fabricated success result.
   */
  static async executeTool(
    serverId: string,
    toolName: string,
    args: Record<string, any>,
    options?: { userApproved?: boolean; userId?: string; projectId?: string; timeoutMs?: number }
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
        content: [
          {
            type: 'text',
            text: `Tool "${toolName}" is not on the permitted allowlist for server "${srv.name}".`
          }
        ]
      };
    }

    // Human review gate check
    if (srv.requiresApproval && !options?.userApproved) {
      return {
        success: false,
        isError: true,
        content: [
          {
            type: 'text',
            text: `Tool "${toolName}" requires explicit user approval before execution.`
          }
        ]
      };
    }

    try {
      const rpcResult = await this.sendRpcRequest(
        srv,
        'tools/call',
        {
          name: toolName,
          arguments: args || {}
        },
        options?.timeoutMs
      );

      const isError = rpcResult?.isError === true;
      const rawContent = Array.isArray(rpcResult?.content)
        ? rpcResult.content
        : [{ type: 'text', text: typeof rpcResult === 'string' ? rpcResult : JSON.stringify(rpcResult ?? '') }];

      let truncated = false;
      const boundedContent = rawContent.map((item: any) => {
        if (item?.type === 'text' && typeof item.text === 'string') {
          if (item.text.length > MAX_MCP_OUTPUT_CHARS) {
            truncated = true;
            return {
              ...item,
              text: item.text.slice(0, MAX_MCP_OUTPUT_CHARS) + '\n... [MCP Output Truncated]'
            };
          }
        }
        return item;
      });

      return {
        success: !isError,
        isError,
        truncated,
        content: boundedContent
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
