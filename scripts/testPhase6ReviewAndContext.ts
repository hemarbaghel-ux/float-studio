import assert from 'node:assert';
import { computeDiffHunks, applySelectedHunks } from '../src/lib/diffHunks';
import { ProposalService } from '../src/server/agent/proposalService';
import { CheckpointService } from '../src/server/agent/checkpointService';
import { RulesService } from '../src/server/rules/rulesService';
import { ContextBuilder } from '../src/server/contextBuilder';
import { MODEL_CONFIG } from '../src/data/verifiedModels';

async function runPhase6Tests() {
  console.log('=== Phase 6 Verification: Cursor-Style Review UX & Context ===');

  // 1. Test computeDiffHunks & applySelectedHunks
  const originalCode = [
    'line 1',
    'line 2',
    'line 3',
    'line 4',
    'line 5',
    'line 6',
    'line 7',
    'line 8',
    'line 9',
    'line 10',
    'line 11',
    'line 12'
  ].join('\n');

  const proposedCode = [
    'line 1',
    'line 2 modified A',
    'line 3',
    'line 4',
    'line 5',
    'line 6',
    'line 7',
    'line 8',
    'line 9',
    'line 10',
    'line 11 modified B',
    'line 12'
  ].join('\n');

  const hunks = computeDiffHunks(originalCode, proposedCode, 1);
  assert.strictEqual(hunks.length, 2, `Expected 2 distinct hunks, got ${hunks.length}`);
  assert.strictEqual(hunks[0].id, 'hunk-1');
  assert.strictEqual(hunks[1].id, 'hunk-2');

  // Apply only hunk-1 (accept hunk 1, reject hunk 2)
  const onlyHunk1 = applySelectedHunks(originalCode, proposedCode, ['hunk-1'], hunks);
  assert.ok(onlyHunk1.includes('line 2 modified A'), 'Hunk 1 should be applied');
  assert.ok(onlyHunk1.includes('line 11\n'), 'Hunk 2 should NOT be applied');
  assert.ok(!onlyHunk1.includes('line 11 modified B'), 'Hunk 2 should be rejected');

  // Apply only hunk-2 (reject hunk 1, accept hunk 2)
  const onlyHunk2 = applySelectedHunks(originalCode, proposedCode, ['hunk-2'], hunks);
  assert.ok(onlyHunk2.includes('line 2\n'), 'Hunk 1 should NOT be applied');
  assert.ok(onlyHunk2.includes('line 11 modified B'), 'Hunk 2 should be applied');
  console.log('✓ 1. computeDiffHunks & applySelectedHunks verified (partial hunk application)');

  // 2. Test ProposalService.createProposalDurable + applyProposalDurable with selectedHunksByPath + SHA-256 conflict check
  const ownerId = 'test-user-phase6';
  const projectId = `proj-phase6-${Date.now()}`;
  const virtualFiles = new Map<string, { content?: string }>([
    ['src/index.ts', { content: originalCode }]
  ]);

  const created = await ProposalService.createProposalDurable({
    ownerId,
    projectId,
    description: 'Two-hunk update',
    rawChanges: [
      {
        path: 'src/index.ts',
        operation: 'modify',
        proposedContent: proposedCode
      }
    ],
    virtualFiles
  });

  assert.ok(created.proposal, 'Proposal should be created');
  assert.strictEqual(created.proposal!.changes[0].hunks?.length, 2, 'Proposal should include 2 computed hunks');

  // Apply only hunk-1 via ProposalService
  const applied = await ProposalService.applyProposalDurable(created.proposal!.id, ownerId, {
    userId: ownerId,
    approvedPaths: ['src/index.ts'],
    selectedHunksByPath: { 'src/index.ts': ['hunk-1'] },
    currentFiles: [{ path: 'src/index.ts', content: originalCode }]
  });
  assert.strictEqual(applied.success, true, 'Proposal apply with selectedHunksByPath should succeed');
  assert.strictEqual(applied.status, 'partially_applied', 'Partial hunk selection should mark proposal partially_applied');
  assert.ok(applied.patchedContents?.['src/index.ts']?.includes('line 2 modified A'), 'Patched content should include hunk-1');
  assert.ok(!applied.patchedContents?.['src/index.ts']?.includes('line 11 modified B'), 'Patched content should exclude hunk-2');

  // Test SHA-256 stale-file conflict detection
  const createdStale = await ProposalService.createProposalDurable({
    ownerId,
    projectId,
    description: 'Stale test proposal',
    rawChanges: [
      {
        path: 'src/index.ts',
        operation: 'modify',
        proposedContent: proposedCode
      }
    ],
    virtualFiles
  });

  const staleAttempt = await ProposalService.applyProposalDurable(createdStale.proposal!.id, ownerId, {
    userId: ownerId,
    approvedPaths: ['src/index.ts'],
    currentFiles: [{ path: 'src/index.ts', content: originalCode + '\n// concurrent edit by user' }]
  });
  assert.strictEqual(staleAttempt.success, false, 'Stale file should fail to apply');
  assert.strictEqual(staleAttempt.status, 'stale', 'Conflict status should be stale');
  assert.strictEqual(staleAttempt.conflicts?.length, 1, 'Should report 1 SHA-256 hash conflict');
  console.log('✓ 2. ProposalService per-hunk apply & SHA-256 stale conflict check verified');

  // 3. Test CheckpointService create, list, and restore
  const initialWorkspace = [
    { path: 'src/app.ts', content: 'export const v = 1;' },
    { path: 'README.md', content: '# Initial' }
  ];
  const cp = await CheckpointService.createCheckpoint({
    ownerId,
    projectId,
    files: initialWorkspace,
    prompt: 'Refactor app.ts',
    label: 'Before refactor'
  });
  assert.ok(cp.id.startsWith('cp_'), 'Checkpoint ID should start with cp_');
  assert.strictEqual(cp.fileCount, 2, 'Checkpoint should record 2 files');

  const cpList = await CheckpointService.listCheckpoints(projectId, ownerId);
  assert.ok(cpList.some(item => item.id === cp.id), 'Checkpoint should appear in listCheckpoints');

  const restored = await CheckpointService.restoreCheckpoint(cp.id, ownerId, projectId);
  assert.strictEqual(restored.success, true, 'Checkpoint restore should succeed');
  assert.strictEqual(restored.checkpoint?.files.length, 2, 'Restored checkpoint should contain 2 files');
  assert.strictEqual(
    restored.checkpoint?.files.find(f => f.path === 'src/app.ts')?.content,
    'export const v = 1;',
    'Restored file content must match snapshot'
  );
  console.log('✓ 3. CheckpointService snapshot creation, listing, and restoration verified');

  // 4. Test AGENTS.md and .cursorrules discovery & ContextBuilder integration
  const workspaceWithRules = [
    { path: 'AGENTS.md', content: 'Always write unit tests for new endpoints.' },
    { path: '.cursorrules', content: 'Prefer functional React components and Zustand.' },
    { path: '.cursor/rules/security.md', content: 'Validate ownership on all project routes.' }
  ];
  const discoveredRules = RulesService.discoverRepositoryRules(workspaceWithRules);
  assert.strictEqual(discoveredRules.length, 3, 'Should discover AGENTS.md, .cursorrules, and .cursor/rules/security.md');

  const builtContext = ContextBuilder.build('Add a new endpoint', [], {
    userId: ownerId,
    projectId,
    projectName: 'Phase6Test',
    workspaceFiles: workspaceWithRules,
    includeWorkspaceRules: true
  });
  assert.ok(builtContext.appliedRules && builtContext.appliedRules.length >= 3, 'ContextBuilder should report appliedRules');
  assert.ok(
    builtContext.formattedPrompt.includes('Always write unit tests for new endpoints.'),
    'Formatted prompt should include AGENTS.md content'
  );
  assert.ok(
    builtContext.formattedPrompt.includes('Prefer functional React components and Zustand.'),
    'Formatted prompt should include .cursorrules content'
  );
  console.log('✓ 4. AGENTS.md, .cursorrules, and .cursor/rules/* discovery & ContextBuilder injection verified');

  // 5. Verify MODEL_CONFIG pricing calculation
  const solSpec = MODEL_CONFIG.models['gpt-6-sol'];
  assert.ok(solSpec && typeof solSpec.inputCostPer1M === 'number', 'gpt-6-sol should have pricing metadata');
  const cost = ((solSpec.inputCostPer1M! / 1_000_000) * 2000) + ((solSpec.outputCostPer1M! / 1_000_000) * 1000);
  assert.ok(cost > 0, 'Calculated token cost should be positive');
  console.log(`✓ 5. Real token cost calculation verified ($${cost.toFixed(6)} for 2k in / 1k out on gpt-6-sol)`);

  console.log('=== All Phase 6 checks passed! ===');
}

runPhase6Tests().catch((err) => {
  console.error('Phase 6 verification failed:', err);
  process.exit(1);
});
