import assert from 'node:assert/strict';
import { normalizeGitPath, validateBranch } from '../src/server/github/gitRouter';
import { isImportablePath, buildFileTreeFromMap } from '../src/services/repoImporter';
import { ContextBuilder } from '../src/server/contextBuilder';

console.log('Running GitHub integration & IDE workflow verification tests...');

// 1. Git path normalization & traversal protection
assert.equal(normalizeGitPath('src\\components\\Editor.tsx'), 'src/components/Editor.tsx');
assert.equal(normalizeGitPath('index.js'), 'index.js');
assert.equal(normalizeGitPath('../root.key'), null, 'Directory traversal path must be rejected');
assert.equal(normalizeGitPath('C:\\Windows\\system32'), null, 'Absolute Windows path must be rejected');
assert.equal(normalizeGitPath('/etc/passwd'), null, 'Absolute Unix path must be rejected');
assert.equal(normalizeGitPath('src/../secret'), null, 'Relative parent path must be rejected');

// 2. Branch name validation
assert.equal(validateBranch('main'), 'main');
assert.equal(validateBranch('feat/user-auth'), 'feat/user-auth');
assert.equal(validateBranch('v1.0.0-beta.1'), 'v1.0.0-beta.1');
assert.throws(() => validateBranch('../main'), /Branch name is invalid/);
assert.throws(() => validateBranch('main..feature'), /Branch name is invalid/);
assert.throws(() => validateBranch('feature//double-slash'), /Branch name is invalid/);
assert.throws(() => validateBranch('feat/.hidden'), /Branch name is invalid/);

// 3. Importer path filtering
assert.equal(isImportablePath('src/index.ts'), true);
assert.equal(isImportablePath('README.md'), true);
assert.equal(isImportablePath('.env'), false, '.env files must be skipped');
assert.equal(isImportablePath('.env.production'), false, '.env variants must be skipped');
assert.equal(isImportablePath('node_modules/pkg/index.js'), false, 'node_modules must be skipped');
assert.equal(isImportablePath('dist/bundle.js'), false, 'dist artifacts must be skipped');
assert.equal(isImportablePath('.git/config'), false, '.git directory must be skipped');
assert.equal(isImportablePath('assets/logo.png'), false, 'binary image files must be skipped');
assert.equal(isImportablePath('secrets/id_rsa'), false, 'private keys must be skipped');

// 4. File tree reconstruction from map
const testMap = new Map<string, string>([
  ['src/index.ts', 'console.log("hello");'],
  ['src/utils/math.ts', 'export const add = (a, b) => a + b;'],
  ['package.json', '{"name": "test"}']
]);
const tree = buildFileTreeFromMap(testMap);
assert.equal(tree.length, 2, 'Top level should have src and package.json');
const srcFolder = tree.find(n => n.name === 'src');
assert.ok(srcFolder && srcFolder.type === 'folder');
assert.equal(srcFolder?.children?.length, 2);
const pkgFile = tree.find(n => n.name === 'package.json');
assert.ok(pkgFile && pkgFile.type === 'file' && pkgFile.content === '{"name": "test"}');

// 5. ContextBuilder with Git repository metadata
const ctx = ContextBuilder.build('Refactor the database queries', [
  { id: '1', type: 'file', name: 'db.ts', path: 'src/db.ts', content: 'export function query() {}' }
], {
  projectName: 'float-studio',
  gitRepository: 'float-team/float-studio',
  gitBranch: 'feat/production-github-integration'
});
assert.ok(ctx.formattedPrompt.includes('[Project Context: float-studio (Linked: float-team/float-studio@feat/production-github-integration)]'), 'Project context must include linked GitHub repository and branch info');
assert.ok(ctx.formattedPrompt.includes('--- File: src/db.ts ---'));
assert.ok(ctx.formattedPrompt.includes('Refactor the database queries'));

console.log('GitHub integration verification tests: 22 passed, 0 failed.');
