import assert from 'assert';
import { MCPService, MCPServerConfig } from '../src/server/mcp/mcpService';

console.log('=== FLOAT AI Milestone 9: Model Context Protocol (MCP) Verification ===\n');

async function runTests() {
  try {
    MCPService.clear();

    // 1. Register HTTP & Stdio MCP Servers
    console.log('--- Test 1: MCP Server Registration & Secret Masking ---');
    const serverConfig: MCPServerConfig = {
      id: 'srv-db-mcp',
      name: 'PostgreSQL MCP Server',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
      env: {
        DATABASE_URL: 'postgres://admin:supersecret@localhost:5432/main'
      },
      enabled: true,
      allowedTools: ['query_schema', 'explain_query'],
      requiresApproval: true,
      createdAt: Date.now()
    };
    MCPService.registerServer(serverConfig);

    const listed = MCPService.listServers(true);
    assert.strictEqual(listed.length, 1, 'Server listed');
    assert.strictEqual(listed[0].name, 'PostgreSQL MCP Server', 'Server name matches');
    assert.strictEqual(listed[0].env?.DATABASE_URL, '••••••••', 'Database secret masked in listing');
    console.log('[PASS] Server registered and secrets sanitized for client delivery');

    // 2. Tool & Resource Discovery
    console.log('\n--- Test 2: Tool & Resource Discovery ---');
    MCPService.setDiscoveredTools('srv-db-mcp', [
      {
        name: 'query_schema',
        description: 'Inspects relational database table schemas.',
        inputSchema: { type: 'object', properties: { tableName: { type: 'string' } } }
      },
      {
        name: 'drop_database',
        description: 'Drops all tables in database.',
        inputSchema: { type: 'object' }
      }
    ]);

    const tools = MCPService.getDiscoveredTools('srv-db-mcp');
    assert.strictEqual(tools.length, 2, 'Two tools discovered');
    const queryTool = tools.find(t => t.name === 'query_schema');
    const dropTool = tools.find(t => t.name === 'drop_database');

    assert.strictEqual(queryTool?.isAllowed, true, 'query_schema is on allowlist');
    assert.strictEqual(dropTool?.isAllowed, false, 'drop_database is NOT on allowlist');
    console.log('[PASS] Discovered tools inherit server allowlist permissions');

    // 3. Execution Authorization & Human Review Gate
    console.log('\n--- Test 3: Execution Authorization & Review Gate ---');
    // Invoking disallowed tool
    const dropResult = await MCPService.executeTool('srv-db-mcp', 'drop_database', {});
    assert.strictEqual(dropResult.success, false, 'Disallowed tool call blocked');
    assert.ok(dropResult.content[0].text?.includes('not on the permitted allowlist'), 'Reports allowlist violation');

    // Invoking allowed tool without required approval
    const unapprovedResult = await MCPService.executeTool('srv-db-mcp', 'query_schema', { tableName: 'users' });
    assert.strictEqual(unapprovedResult.success, false, 'Unapproved tool call blocked by approval gate');
    assert.ok(unapprovedResult.content[0].text?.includes('requires explicit user approval'), 'Reports approval requirement');

    // Invoking with explicit user approval
    const approvedResult = await MCPService.executeTool('srv-db-mcp', 'query_schema', { tableName: 'users' }, { userApproved: true });
    assert.strictEqual(approvedResult.success, true, 'Approved tool call executes successfully');
    assert.ok(approvedResult.content[0].text?.includes('query_schema'), 'Contains execution output');
    console.log('[PASS] Authorization checks and human approval gates strictly enforced');

    console.log('\n==================================================');
    console.log('Milestone 9 MCP Architecture: All 3 suites passed!');
    console.log('==================================================\n');
  } catch (err: any) {
    console.error('[FAIL] MCP verification failed:', err);
    process.exit(1);
  } finally {
    MCPService.clear();
  }
}

runTests();
