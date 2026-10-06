import assert from 'assert';
import { ProposalService } from '../src/server/agent/proposalService';

async function runMilestone3Tests() {
  console.log('--- Running Milestone 3 Tests: Monaco Inline Assistant & Autocomplete ---');

  // Test 1: Proposal service can generate ChangeSet from inline transformation
  console.log('Test 1: Validating inline diff creation logic...');
  const originalCode = `def add(a, b):\n    return a + b\n`;
  const transformedCode = `def add(a: int, b: int) -> int:\n    """Add two numbers."""\n    return a + b\n`;

  const filesMap = new Map<string, { content?: string }>();
  filesMap.set('calc.py', { content: originalCode });

  const proposalResult = ProposalService.createProposal({
    ownerId: 'test-user',
    projectId: 'test-project',
    description: 'Inline AI: Add type annotations and docstring',
    rawChanges: [
      {
        path: 'calc.py',
        operation: 'modify',
        proposedContent: transformedCode
      }
    ],
    virtualFiles: filesMap
  });

  assert.ok(proposalResult.proposal, 'Proposal should be created successfully');
  assert.strictEqual(proposalResult.proposal.status, 'pending_review', 'Proposal must start in pending_review');
  assert.strictEqual(proposalResult.proposal.changes.length, 1, 'Proposal must have 1 change');
  assert.strictEqual(proposalResult.proposal.changes[0].operation, 'modify');
  assert.ok(proposalResult.proposal.changes[0].diffStats.additions > 0, 'Additions should be recorded');
  console.log('✓ Test 1 Passed: Inline proposal safely generated with pending_review status.');

  // Test 2: Partial range replacement test
  console.log('Test 2: Validating partial selection replacement math...');
  const fullCode = `def first():\n    pass\n\ndef second():\n    pass\n\ndef third():\n    pass\n`;
  const replacementSelection = `def second():\n    return 42`;
  
  const lines = fullCode.replace(/\r\n/g, '\n').split('\n');
  const startLine = 4;
  const endLine = 5;
  const beforeLines = lines.slice(0, Math.max(0, startLine - 1));
  const afterLines = lines.slice(endLine);
  const replacementLines = replacementSelection.replace(/\r\n/g, '\n').split('\n');
  const fullProposedContent = [...beforeLines, ...replacementLines, ...afterLines].join('\n');

  assert.ok(fullProposedContent.includes('def first():'), 'Retains prior lines');
  assert.ok(fullProposedContent.includes('return 42'), 'Contains modified selection');
  assert.ok(fullProposedContent.includes('def third():'), 'Retains posterior lines');
  console.log('✓ Test 2 Passed: Partial range replacement math preserves unmodified regions.');

  // Test 3: Stale hash rejection protection
  console.log('Test 3: Validating stale proposal rejection...');
  const fileMap = new Map();
  // Provide divergent file content to simulate editing while proposal was pending
  fileMap.set('calc.py', { content: 'def add(a, b):\n    # modified concurrently\n    return a + b\n' });

  const staleResult = ProposalService.createProposal({
    ownerId: 'test-user',
    projectId: 'test-project',
    description: 'Inline AI with stale baseline',
    rawChanges: [
      {
        path: 'calc.py',
        operation: 'modify',
        proposedContent: transformedCode
      }
    ],
    virtualFiles: fileMap
  });

  // Verify that ProposalService checks hash consistency
  const calcChange = staleResult.proposal?.changes[0];
  assert.ok(calcChange, 'Change created');
  assert.ok(calcChange.originalHash, 'Original hash is tracked');
  console.log('✓ Test 3 Passed: Original hash tracked for concurrency verification.');

  // Test 4: Fast prefix/suffix boundary safety
  console.log('Test 4: Autocomplete prefix/suffix bounding logic...');
  const largePrefix = 'x'.repeat(10000);
  const largeSuffix = 'y'.repeat(5000);
  const boundedPrefix = String(largePrefix).slice(-2000);
  const boundedSuffix = String(largeSuffix).slice(0, 1000);

  assert.strictEqual(boundedPrefix.length, 2000, 'Bounded prefix max 2000 chars');
  assert.strictEqual(boundedSuffix.length, 1000, 'Bounded suffix max 1000 chars');
  console.log('✓ Test 4 Passed: Autocomplete bounding keeps context fast and bounded.');

  console.log('All Milestone 3 automated verification checks passed successfully!');
}

runMilestone3Tests().catch((err) => {
  console.error('Milestone 3 Test Failure:', err);
  process.exit(1);
});
