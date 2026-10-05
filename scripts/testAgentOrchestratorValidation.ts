import { 
  orchestrator,
  normalizeAndSanitizePath, 
  validateAndNormalizeFileNodes, 
  validateToolPermission, 
  validateProjectAccess,
  AGENT_ROLES 
} from '../src/server/agentOrchestrator';

async function runOrchestratorValidationTests() {
  console.log('=== FLOAT AI Agent Orchestrator Validation Test Suite ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // --- SECTION 1: File Path Normalization & Sanitization ---
  console.log('--- 1. File Path Normalization & Sanitization ---');

  // Normalization of standard and windows slashes
  const norm1 = normalizeAndSanitizePath('src\\components\\App.tsx');
  assert(norm1.safePath === 'src/components/App.tsx', 'Normalizes backslashes to forward slashes');

  const norm2 = normalizeAndSanitizePath('/src/utils/math.ts/');
  assert(norm2.safePath === 'src/utils/math.ts', 'Strips leading and trailing slashes');

  // Path traversal rejection
  const trav1 = normalizeAndSanitizePath('../../etc/passwd');
  assert(!!trav1.error && trav1.error.includes('Path traversal'), 'Rejects path traversal (../../etc/passwd)');

  const trav2 = normalizeAndSanitizePath('src/../secret.txt');
  assert(!!trav2.error && trav2.error.includes('Path traversal'), 'Rejects internal path traversal (src/../secret.txt)');

  // Null byte injection rejection
  const nullByte = normalizeAndSanitizePath('src/main.ts\0.exe');
  assert(!!nullByte.error && nullByte.error.includes('control characters'), 'Rejects null-byte injection');

  // Absolute system path rejection
  const absPath = normalizeAndSanitizePath('/etc/shadow');
  assert(!!absPath.error && (absPath.error.includes('Absolute') || absPath.error.includes('forbidden')), 'Rejects absolute system path');

  // Sensitive credentials filtering
  const envCheck = normalizeAndSanitizePath('.env.production');
  assert(!!envCheck.error && envCheck.error.includes('sensitive path'), 'Rejects sensitive .env files');

  const pemCheck = normalizeAndSanitizePath('keys/server.pem');
  assert(!!pemCheck.error && pemCheck.error.includes('sensitive path'), 'Rejects sensitive .pem certificates');

  const gitCheck = normalizeAndSanitizePath('.git/config');
  assert(!!gitCheck.error && gitCheck.error.includes('sensitive path'), 'Rejects .git folder files');

  const nestedEnvCheck = normalizeAndSanitizePath('src/.env.local');
  assert(!!nestedEnvCheck.error, 'Rejects nested environment secret files');
  const nestedKeyCheck = normalizeAndSanitizePath('config/service.pem');
  assert(!!nestedKeyCheck.error, 'Rejects nested private key files');
  const dotSegment = normalizeAndSanitizePath('src/./index.ts');
  assert(!!dotSegment.error, 'Rejects dot segments in task file paths');

  // validateAndNormalizeFileNodes batch processing
  const mixedFiles = [
    { path: '/src/index.ts', content: 'console.log("ok");' },
    { path: '.env', content: 'SECRET=123' },
    { path: '../../bad.ts', content: 'malicious' },
    { path: 'src\\components\\Button.tsx', content: 'export const Button = () => null;' }
  ];
  const { safeFiles, rejectedCount, errors } = validateAndNormalizeFileNodes(mixedFiles);
  assert(safeFiles.length === 2, 'Keeps only safe normalized files (2/4)');
  assert(rejectedCount === 2, 'Counts rejected unsafe files (2)');
  assert(safeFiles[0].path === 'src/index.ts', 'Normalizes path for index.ts');
  assert(safeFiles[1].path === 'src/components/Button.tsx', 'Normalizes path for Button.tsx');
  const oversized = validateAndNormalizeFileNodes([{ path: 'src/large.ts', content: 'x'.repeat(500 * 1024 + 1) }]);
  assert(oversized.safeFiles.length === 0 && oversized.rejectedCount === 1, 'Excludes oversized files instead of truncating their proposal baseline');

  // --- SECTION 2: Project Access Validation ---
  console.log('\n--- 2. Project Access Validation ---');

  // Empty userId or projectId
  const emptyUser = await validateProjectAccess('', 'valid-proj');
  assert(!emptyUser.authorized, 'Rejects empty userId');

  const emptyProj = await validateProjectAccess('user-1', '');
  assert(!emptyProj.authorized, 'Rejects empty projectId');

  // Malformed / traversal projectId
  const badProjId = await validateProjectAccess('user-1', '../../secret-db');
  assert(!badProjId.authorized, 'Rejects projectId containing path traversal (../../secret-db)');

  // Background tasks require a persisted project with an exact owner; a plausible ID is insufficient.
  const validAccess = await validateProjectAccess('user-alice', 'project-float-101');
  assert(!validAccess.authorized, 'Fails closed when project ownership cannot be verified in Firestore');

  // In-memory registration cannot substitute for persisted project ownership.
  orchestrator.registerProjectOwner('project-float-101', 'user-alice');
  const conflictAccess = await validateProjectAccess('user-bob', 'project-float-101');
  assert(!conflictAccess.authorized, 'Rejects project access when the persisted owner cannot be verified');

  // --- SECTION 3: Tool Permission Checking ---
  console.log('\n--- 3. Tool Permission Checking ---');

  // Main agent permissions
  const mainRead = validateToolPermission('main-agent', 'read_project_file');
  assert(mainRead.allowed, 'main-agent authorized to read_project_file');

  const mainPropose = validateToolPermission('main-agent', 'propose_changes');
  assert(mainPropose.allowed, 'main-agent authorized to propose_changes');

  // Reviewer agent read-only constraint
  const reviewerRead = validateToolPermission('reviewer-agent', 'search_project');
  assert(reviewerRead.allowed, 'reviewer-agent authorized to search_project');

  const reviewerPropose = validateToolPermission('reviewer-agent', 'propose_changes');
  assert(!reviewerPropose.allowed, 'reviewer-agent strictly DENIED propose_changes');
  assert(reviewerPropose.error?.includes('read-only permission'), 'Explains reviewer-agent is read-only');

  // Prohibited direct file modification tools across all agents
  const directWrite = validateToolPermission('main-agent', 'write_file');
  assert(!directWrite.allowed, 'write_file strictly prohibited for main-agent');
  assert(directWrite.error?.includes('propose_changes'), 'Direct write error instructs using propose_changes');

  const directDelete = validateToolPermission('backend-agent', 'delete_file');
  assert(!directDelete.allowed, 'delete_file strictly prohibited for backend-agent');

  // Prohibited direct command execution tools
  const directBash = validateToolPermission('main-agent', 'bash');
  assert(!directBash.allowed, 'bash execution strictly prohibited');

  const directRun = validateToolPermission('debugger-agent', 'run_command');
  assert(!directRun.allowed, 'run_command strictly prohibited');

  // --- SECTION 4: Agent Orchestrator Task Creation & Security Verification ---
  console.log('\n--- 4. Orchestrator Task Lifecycle & Security Verification ---');

  // A request-supplied project tree cannot create a background task for an unsaved project.
  try {
    await orchestrator.createTask({
      name: 'Unsaved workspace task', description: 'Must not execute from client-supplied files.',
      projectId: 'proj-orch-test', assignedAgentId: 'main-agent',
      context: { files: [{ path: 'src/App.tsx', content: 'fake client supplied file' }] }
    }, { uid: 'user-alice' });
    assert(false, 'Should have blocked task creation without a Firestore-owned project snapshot');
  } catch (err: any) {
    assert(err.message.includes('Save the project') || err.message.includes('verify project ownership') || err.message.includes('Firestore'), 'Blocked task creation without authoritative project data');
  }

  console.log(`\n======================================================`);
  console.log(`Agent Orchestrator Test Suite: ${passed} passed, ${failed} failed.`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runOrchestratorValidationTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
