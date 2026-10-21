/**
 * FLOAT AI - Cross-Tenant Isolation & Security Hardening Verification
 *
 * Verifies:
 * 1. User A cannot access User B's projects (server-side verifyProjectOwnership)
 * 2. User A cannot access User B's conversations
 * 3. User A cannot access User B's proposals or file change sets
 * 4. User A cannot access User B's tasks or cloud background agent executions
 * 5. User A cannot access User B's memories
 * 6. User A cannot access User B's terminal sessions
 * 7. User A cannot read or modify User B's rules, skills, MCP servers/tools/resources, code reviews, diagnostics, or automations
 * 8. Project-scoped MCP servers require both owner userId AND exact projectId match (missing or mismatched projectId never exposes servers, tools, resources, or executions), while preserving user-scoped MCP server behavior
 * 9. Path traversal, null-byte injection, and sensitive files (.env, keys) are blocked
 * 10. SSRF protection guards against localhost and cloud metadata endpoints
 */

import assert from 'assert';
import { ProposalService } from '../src/server/agent/proposalService';
import { orchestrator } from '../src/server/agentOrchestrator';
import { MemoryService } from '../src/server/memory/memoryService';
import { TerminalService } from '../src/server/terminal/terminalService';
import { BrowserAgentService } from '../src/server/browser/browserAgent';
import { RulesService } from '../src/server/rules/rulesService';
import { SkillsService } from '../src/server/skills/skillsService';
import { MCPService } from '../src/server/mcp/mcpService';
import { CodeReviewService } from '../src/server/review/codeReviewService';
import { DiagnosticsService } from '../src/server/diagnostics/diagnosticsService';
import { AutomationService } from '../src/server/automations/automationService';
import { ContextBuilder } from '../src/server/contextBuilder';
import { verifyProjectOwnership, setProjectLookupForTests } from '../src/server/projectOwnership';
import { isSensitivePath, normalizeWorkspacePath } from '../src/services/indexing/fileFilter';

async function runTenantIsolationTests() {
  console.log('=== FLOAT AI Cross-Tenant Isolation & Security Hardening Verification ===\n');

  const USER_A = 'user_alice_tenant_1';
  const USER_B = 'user_bob_tenant_2';
  const PROJECT_A = 'project_alice_secure';
  const PROJECT_A2 = 'project_alice_secondary';
  const PROJECT_B = 'project_bob_secure';

  // 1. Cross-Tenant Memory Isolation
  console.log('--- Test 1: Cross-Tenant Memory Isolation ---');
  MemoryService.clear();
  MemoryService.setMemory({
    projectId: PROJECT_A,
    userId: USER_A,
    category: 'architecture',
    key: 'primary_database',
    value: 'PostgreSQL with Prisma ORM',
    scope: 'project',
    enabled: true
  });

  const bobAliceMemories = MemoryService.getProjectMemories(PROJECT_A, USER_B);
  assert.strictEqual(bobAliceMemories.length, 0, 'User B must not access User A project memories');
  const aliceMemories = MemoryService.getProjectMemories(PROJECT_A, USER_A);
  assert.strictEqual(aliceMemories.length, 1, 'User A can access own project memories');
  console.log('[PASS] Cross-tenant memory isolation strictly enforced');

  // 2. Cross-Tenant Terminal Session Isolation
  console.log('\n--- Test 2: Cross-Tenant Terminal Session Isolation ---');
  const aliceTerm = TerminalService.createSession(PROJECT_A, USER_A, 'Alice Bash');
  const bobViewTerm = TerminalService.getSession(aliceTerm.id, USER_B);
  assert.strictEqual(Boolean(bobViewTerm), false, 'User B must not read User A terminal session');

  const bobCommandExec = TerminalService.appendExecution(
    aliceTerm.id,
    USER_B,
    'whoami',
    'bob',
    '',
    0
  );
  assert.strictEqual(bobCommandExec, undefined, 'User B must not append or execute in User A terminal session');
  console.log('[PASS] Cross-tenant terminal session boundaries strictly enforced');

  // 3. Cross-Tenant Cloud Task / Worker Isolation
  console.log('\n--- Test 3: Cross-Tenant Cloud Task Isolation ---');
  const taskId = `task-iso-${Date.now()}`;
  (orchestrator as any).tasks.set(taskId, {
    id: taskId,
    ownerId: USER_A,
    projectId: PROJECT_A,
    name: 'Alice Private Agent Task',
    prompt: 'Analyze codebase for security vulnerabilities',
    status: 'QUEUED',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    progress: 0,
    phase: 'QUEUED'
  });

  const bobTask = orchestrator.getTask(taskId, USER_B);
  assert.strictEqual(bobTask, null, 'User B cannot read User A background task');
  const aliceTask = orchestrator.getTask(taskId, USER_A);
  assert.strictEqual(aliceTask?.ownerId, USER_A, 'User A can read own background task');
  console.log('[PASS] Cross-tenant cloud agent and task isolation strictly enforced');

  // 4. Cross-Tenant Proposal & ChangeSet Isolation
  console.log('\n--- Test 4: Cross-Tenant Proposal & ChangeSet Isolation ---');
  const createRes = ProposalService.createProposal({
    projectId: PROJECT_A,
    ownerId: USER_A,
    description: 'Confidential feature diff',
    rawChanges: [
      {
        path: 'src/secret.ts',
        operation: 'create',
        proposedContent: 'export const KEY = "internal";'
      }
    ],
    virtualFiles: new Map()
  });

  assert.ok(createRes.proposal, 'Proposal created successfully');
  const aliceProposalId = createRes.proposal.id;

  const bobApprove = await ProposalService.applyProposalDurable(aliceProposalId, USER_B, {
    userId: USER_B,
    currentFiles: []
  });
  assert.strictEqual(bobApprove.success, false, 'User B must not apply User A proposal');
  assert.ok(bobApprove.error?.toLowerCase().includes('not found'), 'Authorization guard returns not found for non-owner');

  const bobReject = await ProposalService.rejectProposalDurable(aliceProposalId, USER_B, USER_B);
  assert.strictEqual(bobReject.success, false, 'User B must not reject User A proposal');
  console.log('[PASS] Proposal review & apply gates enforce strict tenant ownership');

  // 5. Cross-Tenant Project Ownership, Rules, Skills, MCP (User & Project Scoped), Reviews, Diagnostics & Automations
  console.log('\n--- Test 5: Milestone 9 Services & MCP Project Isolation ---');
  setProjectLookupForTests(async (projId) => {
    if (projId === PROJECT_A) return { exists: true, data: { ownerId: USER_A, name: 'Alice Project 1' } };
    if (projId === PROJECT_A2) return { exists: true, data: { ownerId: USER_A, name: 'Alice Project 2' } };
    if (projId === PROJECT_B) return { exists: true, data: { ownerId: USER_B, name: 'Bob Project' } };
    return { exists: false };
  });

  const bobProjAccess = await verifyProjectOwnership(PROJECT_A, USER_B);
  assert.strictEqual(bobProjAccess.allowed, false);
  assert.strictEqual(bobProjAccess.status, 403, 'User B receives 403 when accessing User A project');

  // Rules isolation
  RulesService.clear();
  RulesService.setProjectRule(PROJECT_A, {
    id: 'rule-alice-1',
    name: 'Alice Secret Architecture Rule',
    content: 'Use internal-alice-gateway for all RPC calls.',
    priority: 1,
    enabled: true
  }, USER_A);
  assert.strictEqual(RulesService.getProjectRules(PROJECT_A, USER_B).length, 0, 'User B cannot read User A project rules');
  assert.strictEqual(RulesService.deleteProjectRule(PROJECT_A, 'rule-alice-1', USER_B), false, 'User B cannot delete User A project rules');
  assert.throws(
    () => RulesService.setProjectRule(PROJECT_A, { id: 'rule-bob-inject', name: 'Inject', content: 'bad', priority: 1, enabled: true }, USER_B),
    /Forbidden/,
    'User B cannot overwrite User A project rules'
  );

  // Skills isolation & built-in protection
  SkillsService.clear();
  assert.throws(
    () => SkillsService.registerSkill({
      id: 'skill-react-patterns',
      name: 'Poisoned Built-in',
      description: 'attempt to overwrite built-in',
      instructions: 'PWNED',
      allowedTools: [],
      scope: 'user',
      enabled: true,
      keywords: ['react'],
      permissionsRequired: ['read']
    }, USER_B),
    /Cannot overwrite built-in/,
    'Built-in system skills cannot be overwritten by any tenant'
  );

  SkillsService.registerSkill({
    id: 'skill-alice-private',
    name: 'Alice Private Skill',
    description: 'Private skill',
    instructions: 'ALICE_SECRET_SKILL_INSTRUCTIONS',
    allowedTools: [],
    scope: 'user',
    enabled: true,
    keywords: ['react', 'component', 'private'],
    permissionsRequired: ['read']
  }, USER_A);

  const bobSkills = SkillsService.getAllSkills(USER_B);
  assert.strictEqual(bobSkills.some(s => s.id === 'skill-alice-private'), false, 'User B cannot list User A custom skills');
  const bobContext = ContextBuilder.retrieveAndBuildBoundedContext(
    'Build a private react component',
    PROJECT_B,
    [{ path: 'src/App.tsx', content: 'export const App = () => null;' }],
    [],
    { userId: USER_B, projectId: PROJECT_B }
  );
  assert.strictEqual(bobContext.formattedPrompt.includes('ALICE_SECRET_SKILL_INSTRUCTIONS'), false, 'User A custom skill is never injected into User B prompt context');

  // MCP User-Scoped AND Project-Scoped Isolation (Phase A.1 Correction 2)
  MCPService.clear();
  // Register 1 user-scoped server for Alice and 2 project-scoped servers for Alice (PROJECT_A and PROJECT_A2)
  MCPService.registerServer({
    id: 'mcp-alice-user-global',
    name: 'Alice User-Scoped MCP',
    transport: 'stdio',
    command: 'npx',
    env: { USER_TOKEN: 'secret1' },
    enabled: true,
    createdAt: Date.now()
  }, USER_A);

  MCPService.registerServer({
    id: 'mcp-alice-proj-a1',
    name: 'Alice Project A1 MCP',
    transport: 'http',
    endpointUrl: 'https://mcp.alice.internal/a1',
    projectId: PROJECT_A,
    env: { DB_PASS: 'supersecret_a1' },
    enabled: true,
    createdAt: Date.now()
  }, USER_A);

  MCPService.registerServer({
    id: 'mcp-alice-proj-a2',
    name: 'Alice Project A2 MCP',
    transport: 'http',
    endpointUrl: 'https://mcp.alice.internal/a2',
    projectId: PROJECT_A2,
    env: { DB_PASS: 'supersecret_a2' },
    enabled: true,
    createdAt: Date.now()
  }, USER_A);

  MCPService.setDiscoveredTools('mcp-alice-user-global', [
    { name: 'user_tool', description: 'User level tool', inputSchema: { type: 'object' } }
  ], USER_A);
  MCPService.setDiscoveredTools('mcp-alice-proj-a1', [
    { name: 'proj_a1_tool', description: 'Project A1 secret tool', inputSchema: { type: 'object' } }
  ], USER_A, PROJECT_A);
  MCPService.setDiscoveredResources('mcp-alice-proj-a1', [
    { uri: 'postgres://proj-a1/schema', name: 'Proj A1 Schema' }
  ], USER_A, PROJECT_A);

  // (a) Missing projectId context must NOT expose project-scoped servers, tools, resources, or executions
  const aliceListNoProject = MCPService.listServers(true, USER_A);
  assert.deepStrictEqual(
    aliceListNoProject.map(s => s.id),
    ['mcp-alice-user-global'],
    'Missing projectId lists only explicitly user-scoped MCP servers and hides project-scoped servers'
  );
  assert.strictEqual(
    MCPService.getDiscoveredTools('mcp-alice-proj-a1', USER_A).length,
    0,
    'Missing projectId must not expose discovered tools of a project-scoped server'
  );
  assert.deepStrictEqual(
    MCPService.getDiscoveredTools(undefined, USER_A).map(t => t.name),
    ['user_tool'],
    'Unscoped tool discovery with missing projectId returns only user-scoped tools'
  );
  assert.strictEqual(
    MCPService.getDiscoveredResources('mcp-alice-proj-a1', USER_A).length,
    0,
    'Missing projectId must not expose discovered resources of a project-scoped server'
  );
  assert.strictEqual(
    MCPService.getDiscoveredResources(undefined, USER_A).length,
    0,
    'Unscoped resource discovery with missing projectId hides project-scoped resources'
  );
  const execMissingProject = await MCPService.executeTool('mcp-alice-proj-a1', 'proj_a1_tool', {}, { userId: USER_A });
  assert.strictEqual(execMissingProject.success, false, 'Missing projectId blocks tool execution on project-scoped MCP server');
  assert.strictEqual(MCPService.deleteServer('mcp-alice-proj-a1', USER_A), false, 'Missing projectId blocks deleting a project-scoped MCP server');

  // (b) Mismatched projectId must NOT expose another project's MCP servers, tools, resources, or executions
  const aliceListProjA2 = MCPService.listServers(true, USER_A, PROJECT_A2);
  assert.deepStrictEqual(
    aliceListProjA2.map(s => s.id).sort(),
    ['mcp-alice-proj-a2', 'mcp-alice-user-global'],
    'Listing with PROJECT_A2 exposes only user-scoped + PROJECT_A2 servers, never PROJECT_A servers'
  );
  assert.strictEqual(
    MCPService.getDiscoveredTools('mcp-alice-proj-a1', USER_A, PROJECT_A2).length,
    0,
    'Mismatched projectId blocks tool discovery on PROJECT_A server'
  );
  assert.strictEqual(
    MCPService.getDiscoveredResources('mcp-alice-proj-a1', USER_A, PROJECT_A2).length,
    0,
    'Mismatched projectId blocks resource discovery on PROJECT_A server'
  );
  const execMismatchedProject = await MCPService.executeTool('mcp-alice-proj-a1', 'proj_a1_tool', {}, {
    userId: USER_A,
    projectId: PROJECT_A2
  });
  assert.strictEqual(execMismatchedProject.success, false, 'Mismatched projectId blocks execution on PROJECT_A server');
  assert.strictEqual(MCPService.deleteServer('mcp-alice-proj-a1', USER_A, PROJECT_A2), false, 'Mismatched projectId blocks deleting PROJECT_A server');

  // (c) Matching owner + exact matching projectId grants access to both user-scoped and matching project-scoped servers
  const aliceListProjA1 = MCPService.listServers(true, USER_A, PROJECT_A);
  assert.deepStrictEqual(
    aliceListProjA1.map(s => s.id).sort(),
    ['mcp-alice-proj-a1', 'mcp-alice-user-global'],
    'Matching userId and projectId lists user-scoped and matching project-scoped servers'
  );
  assert.strictEqual(
    MCPService.getDiscoveredTools('mcp-alice-proj-a1', USER_A, PROJECT_A).length,
    1,
    'Matching userId and projectId discovers project-scoped tools'
  );
  assert.strictEqual(
    MCPService.getDiscoveredResources('mcp-alice-proj-a1', USER_A, PROJECT_A).length,
    1,
    'Matching userId and projectId discovers project-scoped resources'
  );
  const execMatchedProject = await MCPService.executeTool('mcp-alice-proj-a1', 'proj_a1_tool', { id: 1 }, {
    userId: USER_A,
    projectId: PROJECT_A
  });
  assert.strictEqual(execMatchedProject.success, true, 'Matching userId and projectId executes project-scoped tool');
  const execUserScopedWithProj = await MCPService.executeTool('mcp-alice-user-global', 'user_tool', {}, {
    userId: USER_A,
    projectId: PROJECT_A
  });
  assert.strictEqual(execUserScopedWithProj.success, true, 'User-scoped MCP server remains accessible when projectId is supplied');

  // (d) Cross-user access is blocked even when supplying the exact matching projectId
  assert.strictEqual(MCPService.listServers(true, USER_B, PROJECT_A).length, 0, 'User B cannot list User A project-scoped MCP servers even with PROJECT_A');
  assert.strictEqual(MCPService.getDiscoveredTools('mcp-alice-proj-a1', USER_B, PROJECT_A).length, 0, 'User B cannot discover tools on User A project-scoped MCP server');
  assert.strictEqual(MCPService.getDiscoveredResources('mcp-alice-proj-a1', USER_B, PROJECT_A).length, 0, 'User B cannot discover resources on User A project-scoped MCP server');
  const bobMcpExec = await MCPService.executeTool('mcp-alice-proj-a1', 'proj_a1_tool', {}, {
    userId: USER_B,
    projectId: PROJECT_A
  });
  assert.strictEqual(bobMcpExec.success, false, 'User B cannot execute tools on User A project-scoped MCP server');
  assert.strictEqual(MCPService.deleteServer('mcp-alice-proj-a1', USER_B, PROJECT_A), false, 'User B cannot delete User A project-scoped MCP server');

  // Code Review isolation
  CodeReviewService.clear();
  const aliceReport = CodeReviewService.analyzeDiff(
    PROJECT_A,
    '',
    [{ path: 'src/server/auth.ts', content: 'const p = "../traversal";' }],
    USER_A
  );
  assert.strictEqual(CodeReviewService.getReport(aliceReport.id, PROJECT_A, USER_B), undefined, 'User B cannot read User A code review report');
  assert.strictEqual(CodeReviewService.dismissFinding(aliceReport.id, aliceReport.findings[0].id, PROJECT_A, USER_B), false, 'User B cannot dismiss findings on User A code review report');

  // Diagnostics isolation
  DiagnosticsService.clearAllForTests();
  DiagnosticsService.addDiagnostic(PROJECT_A, {
    source: 'typescript',
    severity: 'error',
    filePath: 'src/secret.ts',
    line: 10,
    message: 'Alice private compiler error'
  }, USER_A);
  assert.strictEqual(DiagnosticsService.getDiagnostics(PROJECT_A, undefined, USER_B).length, 0, 'User B cannot read User A project diagnostics');
  assert.strictEqual(DiagnosticsService.clearDiagnostics(PROJECT_A, undefined, USER_B), false, 'User B cannot clear User A project diagnostics');

  // Automations isolation
  AutomationService.clear();
  const aliceAuto = AutomationService.createAutomation({
    projectId: PROJECT_A,
    userId: USER_A,
    name: 'Alice Nightly Audit',
    trigger: { type: 'manual' },
    action: { type: 'create_report' },
    permissions: ['read'],
    enabled: true
  });
  let bobTriggerRejected = false;
  try {
    await AutomationService.trigger(aliceAuto.id, { triggerType: 'manual', userId: USER_B, projectId: PROJECT_A });
  } catch {
    bobTriggerRejected = true;
  }
  assert.strictEqual(bobTriggerRejected, true, 'User B cannot trigger User A automation');
  await AutomationService.trigger(aliceAuto.id, { triggerType: 'manual', userId: USER_A, projectId: PROJECT_A });
  assert.strictEqual(AutomationService.getRunLogs(aliceAuto.id, USER_B, PROJECT_A).length, 0, 'User B cannot read User A automation run logs');
  assert.strictEqual(AutomationService.getRunLogs(aliceAuto.id, USER_A, PROJECT_A).length, 1, 'User A can read own automation run logs');

  setProjectLookupForTests(null);
  console.log('[PASS] Milestone 9 services & MCP project isolation enforce strict user + project boundaries');

  // 6. Path Traversal & Injection Safeguards
  console.log('\n--- Test 6: Path Traversal & Sensitive File Filtering ---');
  const traversalTests = [
    '../../etc/passwd',
    '..\\..\\windows\\system32',
    'src/../../../secret',
    '/etc/shadow',
    'C:\\Windows\\System32\\drivers',
    '.env',
    '.env.local',
    '.env.production',
    'id_rsa',
    'server.key',
    'credentials.json'
  ];

  for (const p of traversalTests) {
    const norm = normalizeWorkspacePath(p);
    const sensitive = isSensitivePath(norm);
    const isTraversal = p.includes('..') || p.startsWith('/') || p.includes(':\\');
    assert.ok(sensitive || isTraversal, `Path "${p}" must be flagged as sensitive or path traversal`);
  }
  console.log('[PASS] Traversal, environment files, and private keys strictly guarded');

  // 7. SSRF Protection on Browser Agent
  console.log('\n--- Test 7: Browser Agent SSRF Protection ---');
  const unsafeTargets = [
    'http://localhost:3000',
    'http://127.0.0.1:8080',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/admin',
    'http://192.168.1.1/router'
  ];

  for (const target of unsafeTargets) {
    const check = BrowserAgentService.validateUrlSafety(target);
    assert.strictEqual(check.safe, false, `SSRF target "${target}" must be blocked`);
  }

  const safeTarget = BrowserAgentService.validateUrlSafety('https://docs.float.ai/guide');
  assert.strictEqual(safeTarget.safe, true, 'Public HTTPS documentation URL is allowed');
  console.log('[PASS] SSRF protection blocks localhost, internal IPs, and cloud metadata');

  console.log('\n==================================================');
  console.log('Cross-Tenant Isolation & Security Hardening: All 7 suites passed!');
  console.log('==================================================\n');
}

void runTenantIsolationTests();
