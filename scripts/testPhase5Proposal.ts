import { ProposalService, computeContentHash, computeDiffStats, prepareProposalFinalization, sanitizeProposalPath } from '../src/server/proposals/proposalService';

async function runTests() {
  console.log('--- Starting FLOAT Phase 5 Code Proposal & Diff Review Test Suite ---');
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

  // 1. Path sanitization & traversal guard
  const traversalCheck = sanitizeProposalPath('../../etc/passwd');
  assert(!!traversalCheck.error && traversalCheck.error.includes('Path traversal'), 'Rejects path traversal (../../etc/passwd)');

  const sensitiveCheck = sanitizeProposalPath('.env.local');
  assert(!!sensitiveCheck.error && sensitiveCheck.error.includes('sensitive path'), 'Rejects sensitive path (.env.local)');

  const validPath = sanitizeProposalPath('src/utils/math.ts');
  assert(validPath.safePath === 'src/utils/math.ts', 'Accepts valid project-relative path');

  // 2. Hash computation and diff stats
  const hash1 = computeContentHash('console.log("hello");\n');
  const hash2 = computeContentHash('console.log("hello");\r\n');
  assert(hash1 === hash2, 'Content hash normalizes CRLF and LF identically');

  const diffStats = computeDiffStats('line1\nline2\n', 'line1\nline2_modified\nline3\n');
  assert(diffStats.additions >= 1 && diffStats.deletions >= 1, 'Diff stats compute additions and deletions');

  // 3. Create proposal without modifying original files
  const virtualFiles = new Map<string, { content?: string }>();
  virtualFiles.set('src/main.py', { content: 'print("original")\n' });
  virtualFiles.set('src/helper.py', { content: 'def help(): pass\n' });

  const originalContentBefore = virtualFiles.get('src/main.py')?.content;

  const createResult = ProposalService.createProposal({
    ownerId: 'user-123',
    projectId: 'proj-abc',
    description: 'Refactor main.py and add config.py',
    rawChanges: [
      {
        path: 'src/main.py',
        operation: 'modify',
        proposedContent: 'print("refactored")\n'
      },
      {
        path: 'src/config.py',
        operation: 'create',
        proposedContent: 'DEBUG = True\n'
      }
    ],
    virtualFiles
  });

  assert(!!createResult.proposal, 'Proposal created successfully');
  assert(virtualFiles.get('src/main.py')?.content === originalContentBefore, 'Creating proposal does NOT modify original files');

  const proposal = createResult.proposal!;
  assert(proposal.status === 'pending_review', 'Proposal initial status is pending_review');
  assert(proposal.changes.length === 2, 'Proposal contains 2 changes (1 modify, 1 create)');
  assert(proposal.changes[0].originalHash === computeContentHash(originalContentBefore), 'Proposal captures exact original file hash');
  assert(proposal.changes[1].operation === 'create', 'Identifies new file creation');

  // 4. Status can be finalized only after exact proposed content is in the saved snapshot.
  const unsavedCompletion = prepareProposalFinalization(proposal, {
    ownerId: 'user-123',
    projectId: 'proj-abc',
    approvedPaths: ['src/main.py'],
    currentFiles: [{ path: 'src/main.py', content: 'print("original")\n' }],
    projectData: { fileStorageVersion: 2, fileGeneration: 'generation-1' },
  });
  assert(!unsavedCompletion.result.success && unsavedCompletion.result.status === 'stale', 'Does not mark proposal applied before cloud content is saved');

  const savedCompletion = prepareProposalFinalization(proposal, {
    ownerId: 'user-123',
    projectId: 'proj-abc',
    approvedPaths: ['src/main.py'],
    currentFiles: [{ path: 'src/main.py', content: 'print("refactored")\n' }],
    projectData: { fileStorageVersion: 2, fileGeneration: 'generation-2' },
  });
  assert(savedCompletion.result.success, 'Confirms approved content from the saved workspace');
  assert(savedCompletion.result.status === 'partially_applied', 'Unselected changes remain available for later review');
  assert(proposal.status === 'pending_review', 'Preparing final status does not mutate the stored proposal');

  const duplicateCompletion = prepareProposalFinalization(savedCompletion.proposal!, {
    ownerId: 'user-123',
    projectId: 'proj-abc',
    approvedPaths: ['src/main.py'],
    currentFiles: [{ path: 'src/main.py', content: 'print("refactored")\n' }],
    projectData: { fileStorageVersion: 2, fileGeneration: 'generation-2' },
  });
  assert(duplicateCompletion.result.success, 'Retrying a confirmed path is idempotent');

  // 8. Rejection without file modification
  const rejectTestProposal = ProposalService.createProposal({
    ownerId: 'user-123',
    projectId: 'proj-abc',
    description: 'Dangerous patch to reject',
    rawChanges: [
      { path: 'src/main.py', operation: 'delete' }
    ],
    virtualFiles
  }).proposal!;

  const rejectResult = ProposalService.rejectProposal(rejectTestProposal.id, 'user-123');
  assert(rejectResult.success && rejectResult.status === 'rejected', 'Successfully marks proposal as rejected');
  assert(ProposalService.getProposal(rejectTestProposal.id)?.status === 'rejected', 'Rejected proposal status is persisted');

  // Finalizing a rejected proposal must fail
  const applyRejected = prepareProposalFinalization(rejectTestProposal, {
    ownerId: 'user-123',
    projectId: 'proj-abc',
    approvedPaths: ['src/main.py'],
    currentFiles: [],
    projectData: {},
  });
  assert(!applyRejected.result.success && applyRejected.result.status === 'rejected', 'Cannot finalize a rejected proposal');

  // 9. Unauthorized proposal access
  const unauthorizedReject = ProposalService.rejectProposal(rejectTestProposal.id, 'attacker-user');
  assert(!unauthorizedReject.success, 'Rejects unauthorized user modifying proposal');

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
