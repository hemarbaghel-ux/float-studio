/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi } from 'vitest';
import { CanonicalToolRegistry } from '../src/shared/contracts/tools';
import { registerBridgedMCPTool } from '../src/services/composer/mcpToolBridge';

describe('MCP Tool Bridge (Model Context Protocol Extensibility)', () => {
  it('registers bridged MCP tool into tool registry with namespaced name', () => {
    const registry = new CanonicalToolRegistry();
    const invokeHandler = vi.fn().mockResolvedValue({ result: 'database_query_success' });

    const registeredName = registerBridgedMCPTool(registry, {
      server: {
        id: 'postgres_db',
        name: 'PostgreSQL Server',
        transport: 'sse',
        enabled: true,
      },
      tool: {
        name: 'execute_query',
        description: 'Execute SQL query on staging database',
        inputSchema: {
          type: 'object',
          properties: {
            sql: { type: 'string' },
          },
          required: ['sql'],
        },
      },
      requireExplicitApproval: false,
      invokeHandler,
    });

    expect(registeredName).toBe('mcp__postgres_db__execute_query');
    expect(registry.get(registeredName)).toBeDefined();

    const toolDef = registry.get(registeredName);
    expect(toolDef).toBeDefined();
    expect(toolDef?.description).toContain('[MCP:PostgreSQL Server]');
  });

  it('validates schema and catches missing required parameters', async () => {
    const registry = new CanonicalToolRegistry();
    const invokeHandler = vi.fn().mockResolvedValue({ status: 'ok' });

    const registeredName = registerBridgedMCPTool(registry, {
      server: {
        id: 'github_tools',
        name: 'GitHub MCP',
        transport: 'sse',
        enabled: true,
      },
      tool: {
        name: 'create_issue',
        description: 'Create issue in repository',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['title'],
        },
      },
      requireExplicitApproval: false,
      invokeHandler,
    });

    const toolDef = registry.get(registeredName);
    expect(toolDef).toBeDefined();

    // Call without required 'title'
    const result = await toolDef!.execute({}, {
      taskId: 'task-123',
      stepIndex: 1,
      workspace: {} as any,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('missing required argument "title"');
    expect(invokeHandler).not.toHaveBeenCalled();
  });

  it('invokes handler and returns output text upon valid parameters', async () => {
    const registry = new CanonicalToolRegistry();
    const invokeHandler = vi.fn().mockResolvedValue({ status: 'issue_created', issueNumber: 42 });

    const registeredName = registerBridgedMCPTool(registry, {
      server: {
        id: 'github_tools',
        name: 'GitHub MCP',
        transport: 'sse',
        enabled: true,
      },
      tool: {
        name: 'create_issue',
        description: 'Create issue in repository',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
          required: ['title'],
        },
      },
      requireExplicitApproval: false,
      invokeHandler,
    });

    const toolDef = registry.get(registeredName);
    const result = await toolDef!.execute({ title: 'Bug report' }, {
      taskId: 'task-123',
      stepIndex: 1,
      workspace: {} as any,
    });

    expect(result.success).toBe(true);
    expect(invokeHandler).toHaveBeenCalledWith('github_tools', 'create_issue', { title: 'Bug report' }, undefined);
    expect((result.data as any)?.output).toContain('issue_created');
  });
});
