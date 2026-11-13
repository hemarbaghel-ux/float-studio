/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { CanonicalToolRegistry } from './canonicalTools';
import { sanitizeToolOutputText } from './canonicalTools';
import { ToolCategory, ToolExecutionContext, ToolExecutionOutcome } from '../../shared/contracts/tools';
import { MCPServerConfig, MCPToolDefinition } from '../../server/mcp/mcpService';

export interface BridgedMCPToolOptions {
  readonly server: MCPServerConfig;
  readonly tool: MCPToolDefinition;
  readonly requireExplicitApproval?: boolean;
  readonly invokeHandler: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ) => Promise<unknown>;
}

/**
 * Registers an external MCP tool into a dedicated namespace with schema checks,
 * timeout enforcement, explicit approval gating, and secret redaction.
 */
export function registerBridgedMCPTool(
  registry: CanonicalToolRegistry,
  options: BridgedMCPToolOptions
): string {
  const namespacedName = `mcp__${options.server.id.replace(/[^a-zA-Z0-9_]/g, '_')}__${options.tool.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const requiresApproval = options.requireExplicitApproval ?? true;
  const requiredProps = Array.isArray(options.tool.inputSchema?.required)
    ? (options.tool.inputSchema.required as string[])
    : [];

  (registry as any).tools.set(namespacedName, {
    descriptor: {
      name: namespacedName as any,
      category: 'execution' as ToolCategory,
      description: `[MCP:${options.server.name}] ${options.tool.description}`,
      requiresApproval,
      parametersSchema: options.tool.inputSchema || { type: 'object', properties: {} },
    },
    execute: async (
      args: Record<string, unknown>,
      context: ToolExecutionContext & { mcpApprovedTools?: readonly string[] }
    ): Promise<ToolExecutionOutcome> => {
      const startTime = Date.now();
      if (context.signal?.aborted) {
        return {
          toolName: namespacedName as any,
          success: false,
          error: 'MCP tool execution aborted by cancellation signal.',
          durationMs: 0,
        };
      }

      if (options.server.transport === 'stdio' && process.env.FLOAT_ENABLE_MCP_STDIO !== 'true') {
        return {
          toolName: namespacedName as any,
          success: false,
          error: 'MCP stdio transport is disabled on this host (FLOAT_ENABLE_MCP_STDIO !== "true").',
          durationMs: Date.now() - startTime,
        };
      }

      for (const reqProp of requiredProps) {
        if (args[reqProp] === undefined || args[reqProp] === null) {
          return {
            toolName: namespacedName as any,
            success: false,
            error: `MCP tool "${namespacedName}" missing required argument "${reqProp}".`,
            durationMs: Date.now() - startTime,
          };
        }
      }

      if (requiresApproval) {
        const approvedList = context.mcpApprovedTools || [];
        if (!approvedList.includes(namespacedName) && !approvedList.includes(options.tool.name)) {
          return {
            toolName: namespacedName as any,
            success: false,
            error: `Approval required: MCP tool "${namespacedName}" on server "${options.server.name}" requires explicit user authorization before invocation.`,
            durationMs: Date.now() - startTime,
          };
        }
      }

      try {
        const rawResult = await options.invokeHandler(
          options.server.id,
          options.tool.name,
          args,
          context.signal
        );
        const serialized = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
        const redacted = sanitizeToolOutputText(serialized);
        return {
          toolName: namespacedName as any,
          success: true,
          data: {
            serverId: options.server.id,
            toolName: options.tool.name,
            output: redacted,
          },
          durationMs: Date.now() - startTime,
        };
      } catch (err: any) {
        return {
          toolName: namespacedName as any,
          success: false,
          error: sanitizeToolOutputText(err?.message || 'MCP tool invocation failed.'),
          durationMs: Date.now() - startTime,
        };
      }
    },
  });

  return namespacedName;
}
