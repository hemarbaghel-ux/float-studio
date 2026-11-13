/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
  CanonicalToolRegistry,
  IToolDefinition,
  IToolRegistry,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../../shared/contracts/tools';
import { sanitizeToolOutputText } from './canonicalTools';
import { MCPDiscoveredTool, MCPServerConfig, MCPToolParameterSchema } from '../../server/mcp/mcpService';

export type BridgedMCPToolInput = Pick<MCPDiscoveredTool, 'name' | 'description' | 'inputSchema'> &
  Partial<Pick<MCPDiscoveredTool, 'serverId' | 'serverName' | 'isAllowed'>>;

export type BridgedMCPServerInput = Pick<MCPServerConfig, 'id' | 'name' | 'transport' | 'enabled'> &
  Partial<Omit<MCPServerConfig, 'id' | 'name' | 'transport' | 'enabled'>>;

export interface MCPToolExecutionContext extends ToolExecutionContext {
  readonly mcpApprovedTools?: readonly string[];
}

export interface BridgedMCPToolOptions {
  readonly server: BridgedMCPServerInput;
  readonly tool: BridgedMCPToolInput;
  readonly requireExplicitApproval?: boolean;
  readonly timeoutMs?: number;
  readonly invokeHandler: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ) => Promise<unknown>;
}

const DEFAULT_BRIDGED_MCP_TIMEOUT_MS = 15_000;

function validateMCPInputSchema(
  toolName: string,
  schema: MCPToolParameterSchema | undefined,
  args: Record<string, unknown>
): string | null {
  if (!schema) return null;

  const requiredProps = Array.isArray(schema.required) ? schema.required : [];
  for (const reqProp of requiredProps) {
    if (args[reqProp] === undefined || args[reqProp] === null) {
      return `MCP tool "${toolName}" missing required argument "${reqProp}".`;
    }
  }

  if (schema.properties && typeof schema.properties === 'object') {
    for (const [propName, propSpec] of Object.entries(schema.properties)) {
      if (args[propName] === undefined || args[propName] === null) continue;
      const expectedType = propSpec && typeof propSpec === 'object' ? (propSpec as { type?: string }).type : undefined;
      if (!expectedType) continue;

      const val = args[propName];
      if (expectedType === 'array') {
        if (!Array.isArray(val)) {
          return `MCP tool "${toolName}" argument "${propName}" must be an array.`;
        }
      } else if (expectedType === 'object') {
        if (typeof val !== 'object' || Array.isArray(val)) {
          return `MCP tool "${toolName}" argument "${propName}" must be an object.`;
        }
      } else if (expectedType === 'string' || expectedType === 'number' || expectedType === 'boolean') {
        if (typeof val !== expectedType) {
          return `MCP tool "${toolName}" argument "${propName}" must be of type ${expectedType}.`;
        }
      }
    }
  }

  return null;
}

/**
 * Registers an external MCP tool into a dedicated namespace using the public
 * `IToolRegistry.register()` / `CanonicalToolRegistry.register()` contract with
 * input schema validation, timeout enforcement, explicit approval gating, and secret redaction.
 */
export function registerBridgedMCPTool(
  registry: IToolRegistry | CanonicalToolRegistry,
  options: BridgedMCPToolOptions
): string {
  const sanitizedServerId = options.server.id.replace(/[^a-zA-Z0-9_]/g, '_');
  const sanitizedToolName = options.tool.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const namespacedName = `mcp__${sanitizedServerId}__${sanitizedToolName}`;
  const requiresApproval = options.requireExplicitApproval ?? options.server.requiresApproval ?? true;
  const effectiveTimeoutMs = options.timeoutMs ?? options.server.timeoutMs ?? DEFAULT_BRIDGED_MCP_TIMEOUT_MS;

  const toolDefinition: IToolDefinition = {
    name: namespacedName,
    description: `[MCP:${options.server.name}] ${options.tool.description}`,
    parametersSchema: options.tool.inputSchema || { type: 'object', properties: {} },
    requiresApproval,
    execute: async (
      rawArgs: Record<string, unknown>,
      context: MCPToolExecutionContext
    ): Promise<ToolExecutionResult> => {
      const startTime = Date.now();
      const args: Record<string, unknown> =
        typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {};

      if (context.signal?.aborted) {
        return {
          toolName: namespacedName,
          success: false,
          error: 'MCP tool execution aborted by cancellation signal.',
          durationMs: Date.now() - startTime,
          timestamp: startTime,
        };
      }

      if (!options.server.enabled || options.tool.isAllowed === false) {
        return {
          toolName: namespacedName,
          success: false,
          error: `MCP tool "${namespacedName}" is disabled or not allowed on server "${options.server.name}".`,
          durationMs: Date.now() - startTime,
          timestamp: startTime,
        };
      }

      if (
        options.server.transport === 'stdio' &&
        process.env.FLOAT_ENABLE_MCP_STDIO !== 'true' &&
        process.env.FLOAT_ALLOW_STDIO_MCP !== 'true'
      ) {
        return {
          toolName: namespacedName,
          success: false,
          error: 'MCP stdio transport is disabled on this host (FLOAT_ENABLE_MCP_STDIO !== "true").',
          durationMs: Date.now() - startTime,
          timestamp: startTime,
        };
      }

      const schemaError = validateMCPInputSchema(namespacedName, options.tool.inputSchema, args);
      if (schemaError) {
        return {
          toolName: namespacedName,
          success: false,
          error: schemaError,
          durationMs: Date.now() - startTime,
          timestamp: startTime,
        };
      }

      if (requiresApproval) {
        const approvedList = context.mcpApprovedTools || [];
        if (!approvedList.includes(namespacedName) && !approvedList.includes(options.tool.name)) {
          const reason = `Approval required: MCP tool "${namespacedName}" on server "${options.server.name}" requires explicit user authorization before invocation.`;
          return {
            toolName: namespacedName,
            success: false,
            requiresApproval: true,
            approvalReason: reason,
            error: reason,
            durationMs: Date.now() - startTime,
            timestamp: startTime,
          };
        }
      }

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        const invocationPromise = options.invokeHandler(
          options.server.id,
          options.tool.name,
          args,
          context.signal
        );

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`MCP tool "${namespacedName}" timed out after ${effectiveTimeoutMs}ms.`));
          }, effectiveTimeoutMs);
        });

        const rawResult = await Promise.race([invocationPromise, timeoutPromise]);
        const serialized = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
        const redacted = sanitizeToolOutputText(serialized);

        return {
          toolName: namespacedName,
          success: true,
          data: {
            serverId: options.server.id,
            toolName: options.tool.name,
            output: redacted,
          },
          durationMs: Date.now() - startTime,
          timestamp: startTime,
        };
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : String(err || 'MCP tool invocation failed.');
        return {
          toolName: namespacedName,
          success: false,
          error: sanitizeToolOutputText(errMessage),
          durationMs: Date.now() - startTime,
          timestamp: startTime,
        };
      } finally {
        if (timeoutHandle !== undefined) {
          clearTimeout(timeoutHandle);
        }
      }
    },
  };

  registry.register(toolDefinition);
  return namespacedName;
}
