import assert from 'node:assert/strict';
import type { FileNode } from '../src/types';
import { findProposalWorkspaceConflicts } from '../src/features/proposals/proposalWorkflow';

const before: FileNode[] = [
  { id: 'target', name: 'App.tsx', type: 'file', content: 'const value = 1;' },
  { id: 'other', name: 'notes.md', type: 'file', content: 'Initial unrelated file.' },
];
const proposalChanges = [{ path: 'App.tsx', operation: 'modify' as const }];

assert.deepEqual(findProposalWorkspaceConflicts({
  expectedProjectId: 'project-a',
  activeProjectId: 'project-b',
  changes: proposalChanges,
  approvedPaths: ['App.tsx'],
  beforeFiles: before,
  currentFiles: before,
}), ['The active project changed'], 'a late response cannot target another project');

const targetChanged = before.map((file) => file.id === 'target' ? { ...file, content: 'const value = 2;' } : file);
assert.deepEqual(findProposalWorkspaceConflicts({
  expectedProjectId: 'project-a',
  activeProjectId: 'project-a',
  changes: proposalChanges,
  approvedPaths: ['App.tsx'],
  beforeFiles: before,
  currentFiles: targetChanged,
}), ['App.tsx'], 'a target edited while the request was in flight is not overwritten');

const unrelatedChanged = before.map((file) => file.id === 'other' ? { ...file, content: 'A new unrelated edit.' } : file);
assert.deepEqual(findProposalWorkspaceConflicts({
  expectedProjectId: 'project-a',
  activeProjectId: 'project-a',
  changes: proposalChanges,
  approvedPaths: ['App.tsx'],
  beforeFiles: before,
  currentFiles: unrelatedChanged,
}), [], 'unrelated edits do not block a safe target update');

const create = [{ path: 'New.tsx', operation: 'create' as const }];
assert.deepEqual(findProposalWorkspaceConflicts({
  expectedProjectId: 'project-a',
  activeProjectId: 'project-a',
  changes: create,
  approvedPaths: ['New.tsx'],
  beforeFiles: before,
  currentFiles: [...before, { id: 'new', name: 'New.tsx', type: 'file', content: 'Concurrent file.' }],
}), ['New.tsx'], 'a concurrently created target is not replaced');

console.log('Proposal workspace isolation: 4 assertions passed.');
