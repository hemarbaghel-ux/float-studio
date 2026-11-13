import assert from 'node:assert/strict';
import {
  normalizeComposerWorkspaceSnapshot,
  MAX_COMPOSER_WORKSPACE_FILE_BYTES,
  MAX_COMPOSER_WORKSPACE_FILES
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

console.log('Composer workspace snapshot validation: 7 scenarios passed.');
