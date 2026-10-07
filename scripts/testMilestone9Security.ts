import assert from 'assert';
import { ExecutionPolicyManager } from '../src/server/policy/executionPolicy';
import { TerminalService } from '../src/server/terminal/terminalService';
import { MCPService } from '../src/server/mcp/mcpService';
import { isSensitivePath } from '../src/services/indexing/fileFilter';

console.log('=== FLOAT AI Milestone 9: Security Hardening & Policy Verification ===\n');

try {
  // 1. Sensitive Files Filtering
  console.log('--- Test 1: Sensitive File Filter ---');
  assert.strictEqual(isSensitivePath('.env'), true, '.env recognized as sensitive');
  assert.strictEqual(isSensitivePath('.env.production'), true, '.env.production recognized as sensitive');
  assert.strictEqual(isSensitivePath('id_rsa'), true, 'id_rsa ssh key recognized as sensitive');
  assert.strictEqual(isSensitivePath('certs/server.key'), true, '.key file recognized as sensitive');
  assert.strictEqual(isSensitivePath('src/App.tsx'), false, 'Normal source file is not sensitive');
  console.log('[PASS] Sensitive paths and private keys are recognized');

  // 2. Execution Policy Modes
  console.log('\n--- Test 2: Execution Policy Modes Enforcement ---');
  const userId = 'user-sec-policy';

  // Safe mode: only read allowed
  ExecutionPolicyManager.setPolicyMode(userId, 'safe');
  const readDecision = ExecutionPolicyManager.evaluate({
    toolName: 'read_project_file',
    category: 'read',
    args: { path: 'src/App.tsx' },
    userId,
    projectId: 'p1'
  });
  assert.strictEqual(readDecision.permitted, true, 'Safe read allowed in safe mode');

  const writeDecision = ExecutionPolicyManager.evaluate({
    toolName: 'propose_changes',
    category: 'write',
    args: {},
    userId,
    projectId: 'p1'
  });
  assert.strictEqual(writeDecision.permitted, false, 'Mutating operation blocked in safe mode');

  // Danger operation: git_push or delete_file always requires approval
  const dangerDecision = ExecutionPolicyManager.evaluate({
    toolName: 'git_push',
    category: 'git',
    args: {},
    userId,
    projectId: 'p1'
  });
  assert.strictEqual(dangerDecision.requiresHumanApproval, true, 'High-risk git_push requires explicit manual confirmation');

  // Manual mode: every operation requires confirmation
  ExecutionPolicyManager.setPolicyMode(userId, 'manual');
  const manualReadDecision = ExecutionPolicyManager.evaluate({
    toolName: 'read_project_file',
    category: 'read',
    args: {},
    userId,
    projectId: 'p1'
  });
  assert.strictEqual(manualReadDecision.permitted, false, 'Manual mode requires human approval even for read');
  assert.strictEqual(manualReadDecision.requiresHumanApproval, true, 'Requires human approval');
  console.log('[PASS] Execution policy modes enforce least-privilege boundaries');

  // 3. Terminal Sanitization & Traversal Prevention
  console.log('\n--- Test 3: Terminal Sanitization & Traversal Prevention ---');
  const termSession = TerminalService.createSession('p1', userId, 'Sec Term');
  // Attempt directory traversal
  const travResult = TerminalService.changeDirectory(termSession.id, userId, '../../etc');
  assert.strictEqual(travResult.success, false, 'Terminal rejects cwd traversal');
  assert.ok(travResult.error?.includes('traversal'), 'Reports path traversal error');

  // Append output containing API token
  TerminalService.appendExecution(
    termSession.id,
    userId,
    'echo $TOKEN',
    'sk-111122223333444455556666777788889999000011112222',
    '',
    0
  );
  const updatedTerm = TerminalService.getSession(termSession.id, userId);
  assert.ok(!updatedTerm?.outputBuffer.includes('sk-11112222'), 'Raw secret token redacted from terminal buffer');
  assert.ok(updatedTerm?.outputBuffer.includes('[REDACTED_SECRET]'), 'Token replaced with redaction marker');
  console.log('[PASS] Terminal path traversal rejected and secrets redacted from buffer');

  // 4. MCP Secret Scrubbing
  console.log('\n--- Test 4: MCP Client Credential Protection ---');
  MCPService.registerServer({
    id: 'sec-mcp',
    name: 'Secret Server',
    transport: 'http',
    endpointUrl: 'http://localhost:8080',
    env: { API_KEY: 'ghp_supersecretkeyhere1234567890abcdef' },
    enabled: true,
    createdAt: Date.now()
  });

  const sanitizedServers = MCPService.listServers(true);
  const secServer = sanitizedServers.find(s => s.id === 'sec-mcp');
  assert.strictEqual(secServer?.env?.API_KEY, '••••••••', 'MCP environment credentials masked');
  console.log('[PASS] MCP credentials securely masked from API/UI delivery');

  console.log('\n==================================================');
  console.log('Milestone 9 Security Hardening: All 4 suites passed!');
  console.log('==================================================\n');
} catch (err: any) {
  console.error('[FAIL] Security verification failed:', err);
  process.exit(1);
} finally {
  TerminalService.clear();
  MCPService.clear();
}
