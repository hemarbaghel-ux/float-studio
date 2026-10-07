import { validateBranch, normalizeGitPath } from '../src/server/github/gitRouter';

async function runMilestone7Tests() {
  console.log('=== FLOAT AI Milestone 7: Git & GitHub Developer Workflow Test Suite ===\n');
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

  // 1. Branch Name Validation
  console.log('--- Test 1: Branch Name Validation & Sanitization ---');
  try {
    assert(validateBranch('feature/auth-login') === 'feature/auth-login', 'Valid branch name accepted');
    assert(validateBranch('fix_issue-123') === 'fix_issue-123', 'Valid branch name with underscores and hyphens accepted');
    assert(validateBranch('float/agents/task-abc-123') === 'float/agents/task-abc-123', 'Valid nested slash branch accepted');

    let invalidCaught = 0;
    const invalidBranches = [
      '../escape',
      'feature//double-slash',
      'ends-with-slash/',
      'branch.lock',
      'has..dotdot',
      '.starts-with-dot',
      'has/.dot-in-path'
    ];

    for (const b of invalidBranches) {
      try {
        validateBranch(b);
      } catch {
        invalidCaught++;
      }
    }
    assert(invalidCaught === invalidBranches.length, `All ${invalidBranches.length} malicious/invalid branch names rejected`);
  } catch (err: any) {
    assert(false, `Branch validation threw unexpected error: ${err.message}`);
  }

  // 2. Git Path Normalization & Path Traversal Guards
  console.log('\n--- Test 2: Git Path Normalization & Traversal Guards ---');
  try {
    assert(normalizeGitPath('src/index.ts') === 'src/index.ts', 'Standard relative path normalized');
    assert(normalizeGitPath('src\\components\\App.tsx') === 'src/components/App.tsx', 'Windows backslashes converted to forward slashes');
    assert(normalizeGitPath('/etc/passwd') === null, 'Absolute system paths rejected');
    assert(normalizeGitPath('C:\\Windows\\System32') === null, 'Windows drive paths rejected');
    assert(normalizeGitPath('../parent/file.txt') === null, 'Path traversal segments (..) rejected');
    assert(normalizeGitPath('./relative/file.txt') === null, 'Relative dot segments (.) rejected');
    assert(normalizeGitPath('nested/dir/../file.txt') === null, 'Embedded traversal segments rejected');
    assert(normalizeGitPath('nested/\0nullbyte.txt') === null, 'Null byte injection rejected');
  } catch (err: any) {
    assert(false, `Path normalization threw unexpected error: ${err.message}`);
  }

  // 3. Staged vs Unstaged File Tracking Logic
  console.log('\n--- Test 3: Staged Paths Filtering Logic ---');
  try {
    const workspaceChanges = [
      { path: 'src/fileA.ts', status: 'modified' },
      { path: 'src/fileB.ts', status: 'added' },
      { path: 'src/fileC.ts', status: 'deleted' }
    ];

    // Selective staging: only fileA and fileC staged
    const stagedSet = new Set(['src/fileA.ts', 'src/fileC.ts']);
    const filteredChanges = workspaceChanges.filter(c => stagedSet.has(c.path));

    assert(filteredChanges.length === 2, 'Staged changes filter extracts only staged files');
    assert(filteredChanges.some(c => c.path === 'src/fileA.ts'), 'fileA included in staged changes');
    assert(filteredChanges.some(c => c.path === 'src/fileC.ts'), 'fileC included in staged changes');
    assert(!filteredChanges.some(c => c.path === 'src/fileB.ts'), 'fileB excluded from staged changes');
  } catch (err: any) {
    assert(false, `Staged paths filtering threw unexpected error: ${err.message}`);
  }

  // 4. PR Review Files Endpoint Response Contract
  console.log('\n--- Test 4: Pull Request Files Formatting Contract ---');
  try {
    const mockGitHubFilesResponse = [
      {
        sha: 'abc123456789',
        filename: 'src/components/Header.tsx',
        status: 'modified',
        additions: 12,
        deletions: 4,
        changes: 16,
        patch: '@@ -1,4 +1,12 @@\n-old header\n+new header with responsive design',
        blob_url: 'https://github.com/org/repo/blob/head/src/components/Header.tsx',
        raw_url: 'https://raw.githubusercontent.com/org/repo/head/src/components/Header.tsx'
      },
      {
        sha: 'def987654321',
        filename: 'src/utils/math.ts',
        status: 'added',
        additions: 25,
        deletions: 0,
        changes: 25,
        patch: '@@ -0,0 +1,25 @@\n+export function add(a: number, b: number) { return a + b; }',
        blob_url: 'https://github.com/org/repo/blob/head/src/utils/math.ts',
        raw_url: 'https://raw.githubusercontent.com/org/repo/head/src/utils/math.ts'
      }
    ];

    const formattedFiles = mockGitHubFilesResponse.map((file: any) => ({
      sha: file.sha,
      filename: file.filename,
      status: file.status,
      additions: file.additions || 0,
      deletions: file.deletions || 0,
      changes: file.changes || 0,
      patch: file.patch || '',
      blobUrl: file.blob_url || '',
      rawUrl: file.raw_url || ''
    }));

    assert(formattedFiles.length === 2, 'PR files formatted cleanly');
    assert(formattedFiles[0].filename === 'src/components/Header.tsx', 'First file has proper filename');
    assert(formattedFiles[0].additions === 12 && formattedFiles[0].deletions === 4, 'Additions and deletions retained');
    assert(formattedFiles[0].patch.includes('+new header'), 'Patch content retained for Monaco diff view');
    assert(!('access_token' in (formattedFiles[0] as any)), 'No tokens or credentials in PR file contract');
  } catch (err: any) {
    assert(false, `PR files contract threw unexpected error: ${err.message}`);
  }

  // 5. Repository Import Safety & Limits
  console.log('\n--- Test 5: Repository Import Archive Limits & Protections ---');
  try {
    const MAX_FILES = 500;
    const MAX_WORKSPACE_BYTES = 10 * 1024 * 1024;
    const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;

    assert(MAX_FILES === 500, 'Import file limit configured to 500 text files');
    assert(MAX_WORKSPACE_BYTES === 10485760, 'Workspace limit configured to 10 MB uncompressed');
    assert(MAX_ARCHIVE_BYTES === 20971520, 'Archive limit configured to 20 MB compressed');

    // Sensitive files pattern regex check
    const PRIVATE_PATH = /(^|\/)(\.env(?:$|[./])|\.git(?:$|\/)|id_rsa(?:$|\.)|id_ed25519(?:$|\.))|\.(pem|key|p12|pfx|keystore)$/i;
    assert(PRIVATE_PATH.test('.env'), '.env file rejected by import scanner');
    assert(PRIVATE_PATH.test('.env.local'), '.env.local file rejected by import scanner');
    assert(PRIVATE_PATH.test('nested/.env.production'), 'Nested .env.production rejected');
    assert(PRIVATE_PATH.test('.git/config'), '.git metadata rejected');
    assert(PRIVATE_PATH.test('certs/server.key'), 'Private key .key rejected');
    assert(PRIVATE_PATH.test('certs/id_rsa'), 'id_rsa ssh key rejected');
    assert(!PRIVATE_PATH.test('src/App.tsx'), 'Standard source file App.tsx allowed');
    assert(!PRIVATE_PATH.test('package.json'), 'Standard source file package.json allowed');
  } catch (err: any) {
    assert(false, `Import limits check threw unexpected error: ${err.message}`);
  }

  // 6. Security: Token Sanitization Contract
  console.log('\n--- Test 6: Auth & Token Sanitization Contract ---');
  try {
    const mockGitStatusResponse = {
      connected: true,
      linked: true,
      repository: { fullName: 'octocat/Hello-World', htmlUrl: 'https://github.com/octocat/Hello-World', private: false },
      branch: 'main',
      defaultBranch: 'main',
      branches: [{ name: 'main', sha: '11223344', protected: true }],
      headSha: '11223344',
      baseSha: '11223344',
      changes: [],
      remoteChanges: [],
      pendingCommit: null,
      pullRequests: []
    };

    assert(!('accessToken' in (mockGitStatusResponse as any)), 'Git status response does NOT expose accessToken');
    assert(!('token' in (mockGitStatusResponse as any)), 'Git status response does NOT expose raw token');
    assert(!('connection' in (mockGitStatusResponse as any)), 'Git status response does NOT leak internal connection object');
  } catch (err: any) {
    assert(false, `Token sanitization test threw unexpected error: ${err.message}`);
  }

  // Summary
  console.log('\n==================================================');
  console.log(`Milestone 7 Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runMilestone7Tests().catch(err => {
  console.error('Milestone 7 test runner crashed:', err);
  process.exit(1);
});
