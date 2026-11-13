import assert from 'node:assert/strict';
import {
  normalizeComposerWorkspaceSnapshot,
  MAX_COMPOSER_WORKSPACE_FILE_BYTES,
  MAX_COMPOSER_WORKSPACE_FILES,
  mergeApprovedComposerChanges
} from '../src/server/agent/composerWorkspaceSnapshot';

const normal = normalizeComposerWorkspaceSnapshot([
  { path: 'src/index.ts', content: 'export const answer = 42;\n' },
  { path: 'src/lib/math.ts', content: 'export const add = (a: number, b: number) => a + b;\n' },
  { path: 'README.md', content: '# Fixture\n' }
]);
assert.equal(normal.fileCount, 3);
assert.ok(normal.totalBytes > 0);
assert.equal(normal.files.find(node => node.name === 'src')?.type, 'folder');
const src = normal.files.find(node => node.name === 'src');
assert.equal(src?.children?.find(node => node.name === 'index.ts')?.content, 'export const answer = 42;\n');

assert.throws(
  () => normalizeComposerWorkspaceSnapshot([{ path: '../outside.txt', content: 'no' }]),
  /path rejected/i
);
assert.throws(
  () => normalizeComposerWorkspaceSnapshot([{ path: '.env', content: 'SECRET=not-in-context' }]),
  /sensitive path/i
);
assert.throws(
  () => normalizeComposerWorkspaceSnapshot([
    { path: 'src/index.ts', content: 'one' },
    { path: 'src/index.ts', content: 'two' }
  ]),
  /duplicate path/i
);
assert.throws(
  () => normalizeComposerWorkspaceSnapshot([
    { path: 'src', content: 'file' },
    { path: 'src/index.ts', content: 'child' }
  ]),
  /collision/i
);
assert.throws(
  () => normalizeComposerWorkspaceSnapshot([
    { path: 'large.txt', content: 'x'.repeat(MAX_COMPOSER_WORKSPACE_FILE_BYTES + 1) }
  ]),
  /500 KB/i
);
assert.throws(
  () => normalizeComposerWorkspaceSnapshot(
    Array.from({ length: MAX_COMPOSER_WORKSPACE_FILES + 1 }, (_, index) => ({
      path: `file-${index}.txt`,
      content: 'x'
    }))
  ),
  /limited to 500 files/i
);

const savedCloud = normalizeComposerWorkspaceSnapshot([
  { path: 'src/index.ts', content: 'export const answer = 42;\n' },
  { path: 'README.md', content: '# Saved cloud version\n' }
]);
const submittedAfterApply = normalizeComposerWorkspaceSnapshot([
  { path: 'src/index.ts', content: 'export const answer = 43;\n' },
  { path: 'README.md', content: '# Unsynced local edit\n' },
  { path: 'src/new.ts', content: 'export const created = true;\n' }
]);
const merged = mergeApprovedComposerChanges(
  savedCloud.files,
  submittedAfterApply.files,
  [
    {
      path: 'src/index.ts',
      operation: 'modify',
      originalContent: 'export const answer = 42;\n',
      proposedContent: 'export const answer = 43;\n'
    },
    {
      path: 'src/new.ts',
      operation: 'create',
      originalContent: '',
      proposedContent: 'export const created = true;\n'
    }
  ],
  ['src/index.ts', 'src/new.ts']
);
const mergedFiles = new Map<string, string>();
const flatten = (nodes: any[], prefix = '') => {
  for (const node of nodes) {
    const fullPath = prefix ? prefix + '/' + node.name : node.name;
    if (node.type === 'file') mergedFiles.set(fullPath, node.content || '');
    else flatten(node.children || [], fullPath);
  }
};
flatten(merged.files);
assert.equal(mergedFiles.get('src/index.ts'), 'export const answer = 43;\n');
assert.equal(mergedFiles.get('src/new.ts'), 'export const created = true;\n');
// An unrelated local edit is not silently uploaded by proposal application.
assert.equal(mergedFiles.get('README.md'), '# Saved cloud version\n');

assert.throws(
  () => mergeApprovedComposerChanges(
    savedCloud.files,
    submittedAfterApply.files,
    [{
      path: 'src/index.ts',
      operation: 'modify',
      originalContent: 'stale version',
      proposedContent: 'export const answer = 43;\n'
    }],
    ['src/index.ts']
  ),
  /changed in cloud storage/i
);
assert.throws(
  () => mergeApprovedComposerChanges(
    savedCloud.files,
    submittedAfterApply.files,
    [{
      path: 'src/index.ts',
      operation: 'delete',
      originalContent: 'export const answer = 42;\n',
      proposedContent: ''
    }],
    ['src/index.ts']
  ),
  /cannot automatically apply/i
);

console.log('Composer workspace snapshot validation: 10 scenarios passed.');
