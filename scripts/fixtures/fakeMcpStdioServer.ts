/**
 * Fake MCP Stdio Server Fixture (JSON-RPC 2.0 over stdin/stdout)
 * Used by automated tests to verify real MCP stdio protocol communication:
 * - initialize
 * - notifications/initialized
 * - tools/list
 * - resources/list
 * - tools/call (including normal tools, large output truncation, and error tools)
 */

import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false
});

function sendResponse(id: string | number | null, result?: any, error?: { code: number; message: string; data?: any }) {
  const payload: Record<string, any> = {
    jsonrpc: '2.0',
    id
  };
  if (error) {
    payload.error = error;
  } else {
    payload.result = result;
  }
  process.stdout.write(JSON.stringify(payload) + '\n');
}

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg: any;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    sendResponse(null, undefined, { code: -32700, message: 'Parse error' });
    return;
  }

  const { id, method, params } = msg;

  // Notifications have no id
  if (id === undefined || id === null) {
    return;
  }

  if (method === 'initialize') {
    sendResponse(id, {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {}
      },
      serverInfo: {
        name: 'FakeMCPStdioFixture',
        version: '1.0.0'
      }
    });
    return;
  }

  if (method === 'tools/list') {
    sendResponse(id, {
      tools: [
        {
          name: 'query_schema',
          description: 'Inspects relational database table schemas.',
          inputSchema: {
            type: 'object',
            properties: { tableName: { type: 'string' } },
            required: ['tableName']
          }
        },
        {
          name: 'explain_query',
          description: 'Explains a SQL query execution plan.',
          inputSchema: {
            type: 'object',
            properties: { sql: { type: 'string' } },
            required: ['sql']
          }
        },
        {
          name: 'drop_database',
          description: 'Drops all tables in database.',
          inputSchema: { type: 'object' }
        },
        {
          name: 'proj_a1_tool',
          description: 'Project A1 scoped tool.',
          inputSchema: { type: 'object' }
        },
        {
          name: 'user_tool',
          description: 'User scoped tool.',
          inputSchema: { type: 'object' }
        },
        {
          name: 'large_output_tool',
          description: 'Returns output exceeding MAX_MCP_OUTPUT_CHARS.',
          inputSchema: { type: 'object' }
        },
        {
          name: 'failing_tool',
          description: 'Always returns an MCP tool error.',
          inputSchema: { type: 'object' }
        }
      ]
    });
    return;
  }

  if (method === 'resources/list') {
    sendResponse(id, {
      resources: [
        {
          uri: 'postgres://main/schema',
          name: 'Main Database Schema',
          description: 'Public schema tables and views',
          mimeType: 'application/sql'
        }
      ]
    });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (!toolName) {
      sendResponse(id, undefined, { code: -32602, message: 'Missing tool name' });
      return;
    }

    if (toolName === 'failing_tool') {
      if (args.rpcError) {
        sendResponse(id, undefined, { code: -32000, message: 'Upstream JSON-RPC tool execution failure' });
      } else {
        sendResponse(id, {
          isError: true,
          content: [{ type: 'text', text: 'Tool execution failed inside MCP server.' }]
        });
      }
      return;
    }

    if (toolName === 'large_output_tool') {
      const largeText = 'X'.repeat(22000);
      sendResponse(id, {
        isError: false,
        content: [{ type: 'text', text: largeText }]
      });
      return;
    }

    sendResponse(id, {
      isError: false,
      content: [
        {
          type: 'text',
          text: `MCP_STDIO_OK:${toolName}:${JSON.stringify(args)}`
        }
      ]
    });
    return;
  }

  sendResponse(id, undefined, { code: -32601, message: `Method not found: ${method}` });
});
