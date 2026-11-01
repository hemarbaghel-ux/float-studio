import assert from 'assert';
import path from 'path';
import http from 'http';
import { MCPService, MCPServerConfig, MAX_MCP_OUTPUT_CHARS } from '../src/server/mcp/mcpService';

console.log('=== FLOAT AI Phase 3: Real Model Context Protocol (MCP) Client Verification ===\n');

const FIXTURE_PATH = path.resolve(process.cwd(), 'scripts/fixtures/fakeMcpStdioServer.ts');
const TSX_CLI = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');

async function runTests() {
  const prevAllowStdio = process.env.FLOAT_ALLOW_STDIO_MCP;
  const prevNodeEnv = process.env.NODE_ENV;

  try {
    MCPService.clear();

    // 1. Register Stdio MCP Server (using real fakeMcpStdioServer fixture) & Secret Masking
    console.log('--- Test 1: MCP Server Registration & Secret Masking ---');
    const serverConfig: MCPServerConfig = {
      id: 'srv-db-mcp',
      name: 'PostgreSQL MCP Server',
      transport: 'stdio',
      command: process.execPath,
      args: [TSX_CLI, FIXTURE_PATH],
      env: {
        DATABASE_URL: 'postgres://admin:supersecret@localhost:5432/main'
      },
      enabled: true,
      allowedTools: ['query_schema', 'explain_query', 'large_output_tool', 'failing_tool'],
      requiresApproval: true,
      createdAt: Date.now()
    };
    MCPService.registerServer(serverConfig);

    const listed = MCPService.listServers(true);
    assert.strictEqual(listed.length, 1, 'Server listed');
    assert.strictEqual(listed[0].name, 'PostgreSQL MCP Server', 'Server name matches');
    assert.strictEqual(listed[0].env?.DATABASE_URL, '••••••••', 'Database secret masked in listing');
    console.log('[PASS] Server registered and secrets sanitized for client delivery');

    // 2. Stdio Security Gate: Blocked unless FLOAT_ALLOW_STDIO_MCP=true
    console.log('\n--- Test 2: Stdio Security Gate (FLOAT_ALLOW_STDIO_MCP) & Production Web Process Block ---');
    delete process.env.FLOAT_ALLOW_STDIO_MCP;
    const blockedStdioRes = await MCPService.executeTool(
      'srv-db-mcp',
      'query_schema',
      { tableName: 'users' },
      { userApproved: true }
    );
    assert.strictEqual(blockedStdioRes.success, false, 'Stdio blocked when FLOAT_ALLOW_STDIO_MCP is not true');
    assert.strictEqual(blockedStdioRes.isError, true, 'isError is true when stdio blocked');
    assert.ok(
      blockedStdioRes.content[0].text?.includes('FLOAT_ALLOW_STDIO_MCP=true'),
      'Error explains FLOAT_ALLOW_STDIO_MCP=true requirement'
    );

    // Enable FLOAT_ALLOW_STDIO_MCP=true
    process.env.FLOAT_ALLOW_STDIO_MCP = 'true';

    // Test production web server process block when sandbox is unavailable
    process.env.NODE_ENV = 'production';
    delete process.env.FLOAT_PROCESS_ROLE;
    const prodBlockedRes = await MCPService.executeTool(
      'srv-db-mcp',
      'query_schema',
      { tableName: 'users' },
      { userApproved: true }
    );
    assert.strictEqual(prodBlockedRes.success, false, 'Stdio blocked in production web server process without sandbox');
    assert.ok(
      prodBlockedRes.content[0].text?.includes('production web server process'),
      'Explains production web server process restriction'
    );
    process.env.NODE_ENV = prevNodeEnv || 'development';
    console.log('[PASS] Stdio gate and production web process guard strictly enforced');

    // 3. Real MCP Stdio Handshake (initialize, tools/list, resources/list)
    console.log('\n--- Test 3: Live Stdio JSON-RPC initialize, tools/list & resources/list ---');
    const initInfo = await MCPService.initializeServer('srv-db-mcp');
    assert.strictEqual(initInfo.protocolVersion, '2024-11-05', 'MCP initialize negotiated protocolVersion');
    assert.strictEqual(initInfo.serverInfo?.name, 'FakeMCPStdioFixture', 'MCP initialize returned fixture serverInfo');

    const discoveredTools = await MCPService.discoverToolsLive('srv-db-mcp');
    assert.ok(discoveredTools.length >= 4, `Discovered ${discoveredTools.length} tools over live stdio JSON-RPC`);
    const queryTool = discoveredTools.find((t) => t.name === 'query_schema');
    const dropTool = discoveredTools.find((t) => t.name === 'drop_database');
    assert.strictEqual(queryTool?.isAllowed, true, 'query_schema is allowed by allowlist');
    assert.strictEqual(dropTool?.isAllowed, false, 'drop_database is blocked by allowlist');

    const discoveredResources = await MCPService.discoverResourcesLive('srv-db-mcp');
    assert.strictEqual(discoveredResources.length, 1, 'Discovered 1 resource over live stdio JSON-RPC');
    assert.strictEqual(discoveredResources[0].uri, 'postgres://main/schema', 'Resource URI matches');
    console.log('[PASS] Live stdio initialize, tools/list, and resources/list verified');

    // 4. Execution Authorization, Review Gate, Real tools/call, Truncation & Failure Handling
    console.log('\n--- Test 4: Real tools/call, Output Truncation & Honest Failure Reporting ---');
    // Disallowed tool
    const dropResult = await MCPService.executeTool('srv-db-mcp', 'drop_database', {});
    assert.strictEqual(dropResult.success, false, 'Disallowed tool call blocked');
    assert.ok(dropResult.content[0].text?.includes('not on the permitted allowlist'), 'Reports allowlist violation');

    // Allowed tool without required approval
    const unapprovedResult = await MCPService.executeTool('srv-db-mcp', 'query_schema', { tableName: 'users' });
    assert.strictEqual(unapprovedResult.success, false, 'Unapproved tool call blocked by approval gate');
    assert.ok(unapprovedResult.content[0].text?.includes('requires explicit user approval'), 'Reports approval requirement');

    // Approved tool executes over real stdio JSON-RPC
    const approvedResult = await MCPService.executeTool(
      'srv-db-mcp',
      'query_schema',
      { tableName: 'users' },
      { userApproved: true }
    );
    assert.strictEqual(approvedResult.success, true, 'Approved tool call executes over real stdio JSON-RPC');
    assert.strictEqual(approvedResult.isError, false, 'isError is false');
    assert.ok(
      approvedResult.content[0].text?.includes('MCP_STDIO_OK:query_schema:{"tableName":"users"}'),
      'Returned real stdio JSON-RPC tool output (not fabricated string)'
    );

    // Output truncation check
    const largeRes = await MCPService.executeTool('srv-db-mcp', 'large_output_tool', {}, { userApproved: true });
    assert.strictEqual(largeRes.success, true, 'Large output tool succeeded');
    assert.strictEqual(largeRes.truncated, true, 'Large output marked as truncated');
    assert.ok(
      (largeRes.content[0].text?.length || 0) <= MAX_MCP_OUTPUT_CHARS + 50,
      'Output truncated to MAX_MCP_OUTPUT_CHARS'
    );

    // Failing tool (isError: true in MCP response) must NEVER be reported as success: true
    const toolFailRes = await MCPService.executeTool('srv-db-mcp', 'failing_tool', {}, { userApproved: true });
    assert.strictEqual(toolFailRes.success, false, 'MCP tool returning isError:true is reported as success:false');
    assert.strictEqual(toolFailRes.isError, true, 'isError is true');

    // JSON-RPC error response must NEVER be reported as success: true
    const rpcFailRes = await MCPService.executeTool(
      'srv-db-mcp',
      'failing_tool',
      { rpcError: true },
      { userApproved: true }
    );
    assert.strictEqual(rpcFailRes.success, false, 'JSON-RPC error is reported as success:false');
    assert.strictEqual(rpcFailRes.isError, true, 'isError is true on JSON-RPC error');

    // 5. Streamable HTTP MCP Transport Test (Real local HTTP server + unreachable failure test)
    console.log('\n--- Test 5: Streamable HTTP MCP Transport & Unreachable Failure Proof ---');
    const httpServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const rpc = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const reply = {
          jsonrpc: '2.0',
          id: rpc.id,
          result: {
            isError: false,
            content: [{ type: 'text', text: `HTTP_SSE_OK:${rpc.params?.name}` }]
          }
        };
        res.end(`event: message\ndata: ${JSON.stringify(reply)}\n\n`);
      });
    });

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const port = (httpServer.address() as any).port;

    MCPService.registerServer({
      id: 'srv-http-mcp',
      name: 'Streamable HTTP MCP',
      transport: 'http',
      endpointUrl: `http://127.0.0.1:${port}/mcp`,
      enabled: true,
      createdAt: Date.now()
    });

    const httpRes = await MCPService.executeTool('srv-http-mcp', 'ping_http', { ok: 1 });
    assert.strictEqual(httpRes.success, true, 'Streamable HTTP SSE tool call succeeded');
    assert.strictEqual(httpRes.content[0].text, 'HTTP_SSE_OK:ping_http', 'Streamable HTTP response parsed');

    await new Promise<void>((resolve) => httpServer.close(() => resolve()));

    // Now that the HTTP server is closed, calling executeTool must return success: false
    const deadHttpRes = await MCPService.executeTool('srv-http-mcp', 'ping_http', { ok: 1 });
    assert.strictEqual(deadHttpRes.success, false, 'Unreachable HTTP MCP server returns success: false');
    assert.strictEqual(deadHttpRes.isError, true, 'Unreachable HTTP MCP server sets isError: true');
    console.log('[PASS] Streamable HTTP transport and failure reporting verified');

    console.log('\n==================================================');
    console.log('Phase 3 MCP Client: All 5 suites passed!');
    console.log('==================================================\n');
  } catch (err: any) {
    console.error('[FAIL] MCP verification failed:', err);
    process.exit(1);
  } finally {
    if (prevAllowStdio === undefined) delete process.env.FLOAT_ALLOW_STDIO_MCP;
    else process.env.FLOAT_ALLOW_STDIO_MCP = prevAllowStdio;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    MCPService.clear();
  }
}

void runTests();
