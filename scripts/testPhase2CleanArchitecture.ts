/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';
import {
  validateSafeWorkspacePath,
  AuthoritativeModelCatalog,
  CANONICAL_FLOAT_MODELS,
  GatewayError,
  CanonicalToolRegistry,
  CANONICAL_TOOL_SCHEMAS,
  DaemonIpcFramer,
  DAEMON_IPC_VERSION,
  computeContentHash,
  computeDiffStats,
  validateChatApiRequest,
  validateProposalApiRequest,
  validateHealthResponse,
  ValidationError,
  DaemonIpcMessage,
  ToolExecutionContext,
  IToolDefinition,
  IWorkspaceService,
} from '../src/shared/contracts/index';

console.log('======================================================================');
console.log('FLOAT STUDIO — PHASE 2 CLEAN ARCHITECTURE REGRESSION & CONTRACT SUITE');
console.log('======================================================================\n');

let passedAssertions = 0;

function check(description: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${description}`);
    passedAssertions++;
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${description}`);
    console.error(`    ${err?.message || err}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 1. Authoritative Workspace Interface & Boundary Checks
// ---------------------------------------------------------------------------
console.log('--- 1. Authoritative Workspace Path & Boundary Enforcement ---');

check('validateSafeWorkspacePath normalizes safe workspace relative paths', () => {
  assert.strictEqual(validateSafeWorkspacePath('src/main.ts'), 'src/main.ts');
  assert.strictEqual(validateSafeWorkspacePath('./src/index.ts'), 'src/index.ts');
  assert.strictEqual(validateSafeWorkspacePath('docs/guide/readme.md'), 'docs/guide/readme.md');
});

check('validateSafeWorkspacePath strictly rejects directory traversal (../)', () => {
  assert.throws(() => validateSafeWorkspacePath('../secret.txt'), /Path traversal/);
  assert.throws(() => validateSafeWorkspacePath('src/../../etc/passwd'), /Path traversal/);
  assert.throws(() => validateSafeWorkspacePath('..\\config.json'), /Path traversal/);
});

check('validateSafeWorkspacePath strictly rejects absolute Unix and Windows paths', () => {
  assert.throws(() => validateSafeWorkspacePath('/etc/shadow'), /Path traversal/);
  assert.throws(() => validateSafeWorkspacePath('C:/Windows/System32'), /Path traversal/);
  assert.throws(() => validateSafeWorkspacePath('D:\\Data\\Project'), /Path traversal/);
});

check('validateSafeWorkspacePath strictly blocks sensitive files (.env, .git, private keys)', () => {
  assert.throws(() => validateSafeWorkspacePath('.env'), /sensitive/);
  assert.throws(() => validateSafeWorkspacePath('.env.local'), /sensitive/);
  assert.throws(() => validateSafeWorkspacePath('.git/config'), /sensitive/);
  assert.throws(() => validateSafeWorkspacePath('secrets/id_rsa'), /sensitive/);
  assert.throws(() => validateSafeWorkspacePath('certs/server.pem'), /sensitive/);
  assert.throws(() => validateSafeWorkspacePath('node_modules/pkg/index.js'), /sensitive/);
});

// ---------------------------------------------------------------------------
// 2. Authoritative Model Catalog & Capability Schema
// ---------------------------------------------------------------------------
console.log('\n--- 2. Authoritative Model Catalog & Capability Schema ---');

const catalog = new AuthoritativeModelCatalog();

check('Catalog contains verified canonical models with complete capability descriptors', () => {
  const models = catalog.getAllModels();
  assert.ok(models.length >= 3, `Expected at least 3 models, got ${models.length}`);

  const sol = catalog.getModel('gpt-6.1-sol');
  assert.ok(sol, 'gpt-6.1-sol must exist');
  assert.strictEqual(sol.providerId, 'openai');
  assert.strictEqual(sol.capabilities.coding, true);
  assert.strictEqual(sol.capabilities.reasoning, true);
  assert.strictEqual(sol.capabilities.streaming, true);
  assert.strictEqual(sol.contextWindow, 1050000);

  const gemini = catalog.getModel('gemini-3.8-flash');
  assert.ok(gemini, 'gemini-3.8-flash must exist');
  assert.strictEqual(gemini.providerId, 'google');
  assert.strictEqual(gemini.capabilities.coding, true);
  assert.strictEqual(gemini.contextWindow, 1048576);
});

check('Default model resolves to gpt-6.1-sol', () => {
  const def = catalog.getDefaultModel();
  assert.strictEqual(def.id, 'gpt-6.1-sol');
  assert.strictEqual(def.isDefault, true);
});

check('Model availability fails closed when provider credentials are unconfigured', () => {
  const unconfigured: Record<string, boolean> = { openai: false, google: false };
  assert.strictEqual(catalog.isModelAvailable('gpt-6.1-sol', unconfigured), false);
  assert.strictEqual(catalog.isModelAvailable('gemini-3.8-flash', unconfigured), false);

  const openaiConfigured: Record<string, boolean> = { openai: true, google: false };
  assert.strictEqual(catalog.isModelAvailable('gpt-6.1-sol', openaiConfigured), true);
  assert.strictEqual(catalog.isModelAvailable('gemini-3.8-flash', openaiConfigured), false);
});

// ---------------------------------------------------------------------------
// 3. Provider-Neutral Model Gateway & Error Normalization
// ---------------------------------------------------------------------------
console.log('\n--- 3. Provider-Neutral Model Gateway & Error Normalization ---');

check('GatewayError accurately maps error codes to HTTP status and retryability', () => {
  const authErr = new GatewayError({ message: 'Invalid API key', code: 'AUTH_ERROR', providerId: 'openai' });
  assert.strictEqual(authErr.statusCode, 401);
  assert.strictEqual(authErr.retryable, false);

  const rateLimitErr = new GatewayError({ message: 'Rate limited', code: 'RATE_LIMITED', providerId: 'openai' });
  assert.strictEqual(rateLimitErr.statusCode, 429);
  assert.strictEqual(rateLimitErr.retryable, true);

  const quotaErr = new GatewayError({ message: 'Quota exceeded', code: 'QUOTA_EXCEEDED', providerId: 'google' });
  assert.strictEqual(quotaErr.statusCode, 402);
  assert.strictEqual(quotaErr.retryable, false);

  const timeoutErr = new GatewayError({ message: 'Upstream timeout', code: 'TIMEOUT', providerId: 'openai' });
  assert.strictEqual(timeoutErr.statusCode, 504);
  assert.strictEqual(timeoutErr.retryable, true);

  const cancelErr = new GatewayError({ message: 'Request aborted', code: 'CANCELLED', providerId: 'openai' });
  assert.strictEqual(cancelErr.statusCode, 499);
  assert.strictEqual(cancelErr.retryable, false);
});

// ---------------------------------------------------------------------------
// 4. Canonical Agent Tool Registry
// ---------------------------------------------------------------------------
console.log('\n--- 4. Canonical Agent Tool Registry ---');

const toolRegistry = new CanonicalToolRegistry();

const mockListDirTool: IToolDefinition = {
  name: 'list_dir',
  description: 'List workspace directory files',
  parametersSchema: CANONICAL_TOOL_SCHEMAS.list_dir,
  requiresApproval: false,
  async execute(args, ctx) {
    return {
      toolName: 'list_dir',
      success: true,
      data: { files: ['src/app.ts', 'src/utils.ts'] },
      durationMs: 5,
      timestamp: Date.now(),
    };
  },
};

const mockProposeChangesTool: IToolDefinition = {
  name: 'propose_changes',
  description: 'Propose workspace changes',
  parametersSchema: CANONICAL_TOOL_SCHEMAS.propose_changes,
  requiresApproval: true,
  async execute(args, ctx) {
    return {
      toolName: 'propose_changes',
      success: true,
      requiresApproval: true,
      approvalReason: 'File modifications require explicit user approval.',
      data: { proposalId: 'prop-123' },
      durationMs: 10,
      timestamp: Date.now(),
    };
  },
};

check('Registers canonical tools and rejects duplicate registrations', () => {
  toolRegistry.register(mockListDirTool);
  toolRegistry.register(mockProposeChangesTool);
  assert.strictEqual(toolRegistry.list().length, 2);
  assert.throws(() => toolRegistry.register(mockListDirTool), /already registered/);
});

check('Executes tool within context and respects AbortSignal cancellation', async () => {
  const dummyWorkspace: any = { getRootUri: () => 'workspace://test' };
  const ctx: ToolExecutionContext = {
    workspace: dummyWorkspace,
    userId: 'user-alice',
    projectId: 'proj-1',
  };

  const listRes = await toolRegistry.execute('list_dir', {}, ctx);
  assert.strictEqual(listRes.success, true);
  assert.strictEqual(listRes.toolName, 'list_dir');

  const propRes = await toolRegistry.execute('propose_changes', { title: 'Fix bug' }, ctx);
  assert.strictEqual(propRes.success, true);
  assert.strictEqual(propRes.requiresApproval, true);

  const abortController = new AbortController();
  abortController.abort();
  const cancelRes = await toolRegistry.execute('list_dir', {}, { ...ctx, signal: abortController.signal });
  assert.strictEqual(cancelRes.success, false);
  assert.match(cancelRes.error || '', /cancelled/i);
});

// ---------------------------------------------------------------------------
// 5. Versioned Daemon IPC Protocol
// ---------------------------------------------------------------------------
console.log('\n--- 5. Versioned Daemon IPC Framing ---');

check('Daemon IPC protocol version is strictly defined as 1', () => {
  assert.strictEqual(DAEMON_IPC_VERSION, 1);
});

check('DaemonIpcFramer encodes length-prefixed binary frames and decodes streaming messages', () => {
  const reqMsg: DaemonIpcMessage = {
    id: 'req-1',
    type: 'request',
    method: 'daemon.ping',
    params: {},
  };

  const encoded = DaemonIpcFramer.encode(reqMsg);
  assert.ok(encoded.length > 4);
  const payloadLength = encoded.readUInt32BE(0);
  assert.strictEqual(payloadLength, encoded.length - 4);

  const received: DaemonIpcMessage[] = [];
  const trailing = DaemonIpcFramer.decodeStream(encoded, (msg) => {
    received.push(msg);
  });

  assert.strictEqual(trailing.length, 0);
  assert.strictEqual(received.length, 1);
  assert.strictEqual(received[0].id, 'req-1');
  assert.strictEqual((received[0] as any).method, 'daemon.ping');
});

// ---------------------------------------------------------------------------
// 6. Proposal & Diff Integrity
// ---------------------------------------------------------------------------
console.log('\n--- 6. Proposal & Diff Integrity ---');

check('computeContentHash is deterministic and CRLF/LF agnostic', () => {
  const lf = 'function hello() {\n  return true;\n}\n';
  const crlf = 'function hello() {\r\n  return true;\r\n}\r\n';
  assert.strictEqual(computeContentHash(lf), computeContentHash(crlf));
  assert.strictEqual(computeContentHash(lf).length, 16);
});

check('computeDiffStats accurately counts additions and deletions', () => {
  const oldCode = 'line 1\nline 2\nline 3\n';
  const newCode = 'line 1\nline 2 modified\nline 3\nline 4 added\n';
  const stats = computeDiffStats(oldCode, newCode);
  assert.strictEqual(stats.additions, 2);
  assert.strictEqual(stats.deletions, 1);
});

// ---------------------------------------------------------------------------
// 7. Typed API Contracts & Runtime Validation
// ---------------------------------------------------------------------------
console.log('\n--- 7. Typed API Contracts & Runtime Validation ---');

check('validateChatApiRequest accepts valid requests and rejects empty or malformed inputs', () => {
  const valid = validateChatApiRequest({
    model: 'gpt-6.1-sol',
    messages: [{ role: 'user', content: 'Hello' }],
    reasoningEffort: 'high',
    isStream: true,
  });
  assert.strictEqual(valid.model, 'gpt-6.1-sol');
  assert.strictEqual(valid.messages.length, 1);
  assert.strictEqual(valid.isStream, true);

  assert.throws(() => validateChatApiRequest(null), /must be an object/);
  assert.throws(() => validateChatApiRequest({ messages: [] }), /cannot be empty/);
});

check('validateProposalApiRequest enforces title and change list invariants', () => {
  const valid = validateProposalApiRequest({
    title: 'Update config',
    changes: [{ path: 'src/config.ts', proposedContent: 'export const x = 1;' }],
  });
  assert.strictEqual(valid.title, 'Update config');
  assert.strictEqual(valid.changes.length, 1);

  assert.throws(() => validateProposalApiRequest({ title: '' }), /Expected non-empty string/);
  assert.throws(() => validateProposalApiRequest({ title: 'Test', changes: [] }), /At least one file change/);
});

check('validateHealthResponse guarantees strict health schema conformance', () => {
  const valid = validateHealthResponse({ status: 'ok', uptime: 123.45, timestamp: 1794160000000 });
  assert.strictEqual(valid.status, 'ok');
  assert.strictEqual(valid.uptime, 123.45);

  assert.throws(() => validateHealthResponse({ status: 'degraded' }), /status === "ok"/);
});

console.log('\n======================================================================');
console.log(`ALL PHASE 2 CLEAN ARCHITECTURE TESTS PASSED (${passedAssertions} checks)!`);
console.log('======================================================================\n');
