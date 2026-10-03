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

  // Valid project access
  const validAccess = await validateProjectAccess('user-alice', 'project-float-101');
  assert(validAccess.authorized, 'Authorizes valid project access for user-alice');

  // Ownership conflict in orchestrator
  orchestrator.registerProjectOwner('project-float-101', 'user-alice');
  const conflictAccess = await validateProjectAccess('user-bob', 'project-float-101');
  assert(!conflictAccess.authorized, 'Rejects access to project-float-101 for unauthorized user-bob');
  assert(conflictAccess.error?.includes('owned by another user'), 'Explains ownership conflict');

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

  // Creating task with valid parameters
  const task = await orchestrator.createTask({
    name: 'Implement User Profile Component',
    description: 'Add a new Profile card component to the dashboard.',
    projectId: 'proj-orch-test',
    assignedAgentId: 'main-agent',
    context: {
      files: [
        { path: '/src/App.tsx', content: 'export default function App() {}' },
        { path: '.env.local', content: 'SECRET=hidden' } // Must be filtered
      ]
    }
  }, { uid: 'user-alice' });

  assert(task.status === 'QUEUED', 'Task successfully created with QUEUED status');
  assert(task.ownerId === 'user-alice', 'Task ownerId is bound to user-alice');
  assert(task.context.files.length === 1, 'Sanitizes context.files: excludes .env.local (1 file remaining)');
  assert(task.context.files[0].path === 'src/App.tsx', 'Normalized path is src/App.tsx');

  // Events emitted for project access and file path normalization
  const taskEvents = orchestrator.getEvents(task.id);
  assert(taskEvents.some(e => e.type === 'project_access_verified'), 'Emitted project_access_verified event');
  assert(taskEvents.some(e => e.type === 'file_paths_normalized'), 'Emitted file_paths_normalized event');

  // Creating task for unauthorized project is blocked
  try {
    await orchestrator.createTask({
      name: 'Tamper Task',
      projectId: 'proj-orch-test', // owned by user-alice
      assignedAgentId: 'main-agent'
    }, { uid: 'user-intruder' });
    assert(false, 'Should have blocked user-intruder from creating task in user-alice project');
  } catch (err: any) {
    assert(err.message.includes('owned by another user') || err.message.includes('Unauthorized'), 'Blocked unauthorized task creation with access error');
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
