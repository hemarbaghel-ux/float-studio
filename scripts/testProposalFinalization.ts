import assert from 'node:assert/strict';
import { ProposalService, prepareProposalFinalization } from '../src/server/proposals/proposalService';

const created = ProposalService.createProposal({
  ownerId: 'alice',
  projectId: 'project-1',
  description: 'Add two modules and remove an obsolete one',
  rawChanges: [
    { path: 'src/a.ts', operation: 'modify', proposedContent: 'export const a = 2;' },
    { path: 'src/b.ts', operation: 'create', proposedContent: 'export const b = 3;' },
    { path: 'src/old.ts', operation: 'delete' },
  ],
  virtualFiles: new Map([
    ['src/a.ts', { content: 'export const a = 1;' }],
    ['src/old.ts', { content: 'export const old = true;' }],
  ]),
});
assert.ok(created.proposal, 'proposal fixture is created');
const proposal = created.proposal!;

const unsaved = prepareProposalFinalization(proposal, {
  ownerId: 'alice',
  projectId: 'project-1',
  approvedPaths: ['src/a.ts'],
  currentFiles: [{ path: 'src/a.ts', content: 'export const a = 1;' }],
  projectData: { fileStorageVersion: 2, fileGeneration: 'generation-2' },
});
assert.equal(unsaved.result.success, false, 'unpublished proposal content cannot be marked applied');
assert.equal(proposal.status, 'pending_review', 'failed confirmation does not mutate the stored proposal');

const partial = prepareProposalFinalization(proposal, {
  ownerId: 'alice',
  projectId: 'project-1',
  approvedPaths: ['src/a.ts'],
  currentFiles: [{ path: 'src/a.ts', content: 'export const a = 2;' }],
  projectData: { fileStorageVersion: 2, fileGeneration: 'generation-2' },
});
assert.equal(partial.result.success, true, 'saved content matching the proposal can be confirmed');
assert.equal(partial.proposal?.status, 'partially_applied', 'unselected changes remain available for later review');
assert.equal(partial.proposal?.changes[0].status, 'applied', 'confirmed change is marked applied');
assert.equal(partial.proposal?.changes[1].status, 'pending', 'unselected create remains pending');
assert.equal(partial.proposal?.appliedFileGeneration, 'generation-2', 'proposal records the cloud generation that was confirmed');
assert.equal(proposal.status, 'pending_review', 'prepare step is side-effect free');

const completed = prepareProposalFinalization(partial.proposal!, {
  ownerId: 'alice',
  projectId: 'project-1',
  approvedPaths: ['src/b.ts', 'src/old.ts'],
  currentFiles: [
    { path: 'src/a.ts', content: 'export const a = 2;' },
    { path: 'src/b.ts', content: 'export const b = 3;' },
  ],
  projectData: { fileStorageVersion: 2, fileGeneration: 'generation-3' },
});
assert.equal(completed.result.success, true, 'multiple saved changes can be finalized together');
assert.equal(completed.proposal?.status, 'applied', 'all confirmed changes complete the proposal');
assert.deepEqual(completed.proposal?.appliedFiles, ['src/a.ts', 'src/b.ts', 'src/old.ts'], 'cumulative applied paths are retained');
assert.equal(completed.proposal?.appliedFileGeneration, 'generation-3', 'latest confirmation generation is recorded');

const unauthorized = prepareProposalFinalization(proposal, {
  ownerId: 'bob',
  projectId: 'project-1',
  approvedPaths: ['src/a.ts'],
  currentFiles: [{ path: 'src/a.ts', content: 'export const a = 2;' }],
  projectData: {},
});
assert.equal(unauthorized.result.success, false, 'a different owner cannot finalize the proposal');

console.log('Proposal finalization: 11 assertions passed.');
