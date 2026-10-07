import assert from 'node:assert/strict';
import { WorkspaceIndex } from '../src/services/indexing/workspaceIndex';
import { WorkspaceIndexManager } from '../src/services/indexing/workspaceIndexManager';
import { extractSymbols } from '../src/services/indexing/symbolExtractor';
import { shouldIndexFile, isSensitivePath, isBinaryFile, sanitizePath } from '../src/services/indexing/fileFilter';

console.log('--- Running Milestone 5 Tests: Workspace Indexing & Semantic Retrieval ---');

// ==========================================
// Test 1: Initial Indexing
// ==========================================
console.log('Test 1: Initial indexing of multi-file project...');
const index = new WorkspaceIndex('test-project-1');

const sampleFiles = [
  {
    path: 'src/auth/authService.ts',
    name: 'authService.ts',
    content: `import { TokenValidator } from './tokenValidator';

export interface AuthSession {
  userId: string;
  roles: string[];
}

export class AuthService {
  async authenticateUser(token: string): Promise<AuthSession> {
    const validator = new TokenValidator();
    return validator.validate(token);
  }
}
`
  },
  {
    path: 'src/auth/tokenValidator.ts',
    name: 'tokenValidator.ts',
    content: `export class TokenValidator {
  validate(token: string) {
    if (!token) throw new Error("Empty token");
    return { userId: "user-1", roles: ["admin"] };
  }
}
`
  },
  {
    path: 'src/utils/math.py',
    name: 'math.py',
    content: `import math

class Calculator:
    def add(self, a, b):
        return a + b

def calculate_average(items):
    return sum(items) / len(items)
`
  }
];

index.indexProject(sampleFiles);
const stats = index.getStats();
assert.equal(stats.totalFiles, 3, 'All 3 valid source files should be indexed');
assert.ok(stats.totalSymbols >= 5, 'Extracted at least 5 symbols across TS and Python files');
assert.ok(stats.totalTokens > 10, 'Token index has tokens populated');
assert.ok(stats.totalTrigrams > 20, 'Trigram index populated');
console.log('✓ Test 1 Passed: Initial workspace indexing builds complete indices and stats.');

// ==========================================
// Test 2: Incremental File Changes
// ==========================================
console.log('Test 2: Incremental file changes...');
// Re-updating with unchanged content should be a no-op
const unchangedUpdated = index.updateFile('src/auth/tokenValidator.ts', sampleFiles[1].content);
assert.equal(unchangedUpdated, false, 'Unchanged content should skip re-indexing');

// Updating with new content should update symbols and tokens
const updatedValidatorContent = `export class TokenValidator {
  validate(token: string) {
    return { userId: "user-1", roles: ["admin"] };
  }
  verifySignature(sig: string): boolean {
    return sig.length > 10;
  }
}
`;
const changedUpdated = index.updateFile('src/auth/tokenValidator.ts', updatedValidatorContent);
assert.equal(changedUpdated, true, 'Changed content should trigger re-indexing');

const symbolsAfterUpdate = index.getSymbolsForFile('src/auth/tokenValidator.ts');
assert.ok(symbolsAfterUpdate.some(s => s.name === 'verifySignature' && s.kind === 'method'), 'New method verifySignature indexed');
console.log('✓ Test 2 Passed: Incremental updates efficiently update only changed files and symbols.');

// ==========================================
// Test 3: File Deletion and Rename
// ==========================================
console.log('Test 3: File deletion and atomic rename...');
// Rename
const renamed = index.renameFile('src/utils/math.py', 'src/math/calculator.py');
assert.equal(renamed, true, 'File successfully renamed in index');
assert.equal(index.getSymbolsForFile('src/utils/math.py').length, 0, 'Old path symbols cleared');
assert.ok(index.getSymbolsForFile('src/math/calculator.py').some(s => s.name === 'Calculator'), 'New path symbols available');

// Deletion
const deleted = index.removeFile('src/math/calculator.py');
assert.equal(deleted, true, 'File successfully removed from index');
assert.equal(index.getSymbolsForFile('src/math/calculator.py').length, 0, 'Deleted file symbols empty');
const searchDeleted = index.search('calculate_average');
assert.equal(searchDeleted.length, 0, 'Deleted file no longer appears in search');
console.log('✓ Test 3 Passed: File deletion and atomic rename maintain clean index state.');

// ==========================================
// Test 4: Symbol Extraction (TS/JS/Python) & Plaintext Fallback
// ==========================================
console.log('Test 4: Language-aware symbol extraction and plain text fallback...');
const tsCode = `export type UserRole = 'admin' | 'user';
export interface ConfigOptions<T> {
  timeout: number;
}
export enum Status {
  Active = 1,
  Inactive = 0
}
export const calculateTax = (amount: number) => amount * 0.2;
`;
const extractedTS = extractSymbols('src/types.ts', tsCode);
assert.ok(extractedTS.symbols.some(s => s.name === 'UserRole' && s.kind === 'type'), 'Extracts TypeScript type alias');
assert.ok(extractedTS.symbols.some(s => s.name === 'ConfigOptions' && s.kind === 'interface'), 'Extracts TypeScript interface');
assert.ok(extractedTS.symbols.some(s => s.name === 'Status' && s.kind === 'enum'), 'Extracts TypeScript enum');
assert.ok(extractedTS.symbols.some(s => s.name === 'calculateTax' && s.kind === 'function'), 'Extracts arrow function');

// Plain text fallback (e.g. JSON or Markdown)
const jsonCode = '{\n  "version": "1.0.0",\n  "name": "float-studio"\n}';
const extractedJSON = extractSymbols('package.json', jsonCode);
assert.equal(extractedJSON.symbols.length, 0, 'No fabricated symbols for plain JSON');
console.log('✓ Test 4 Passed: Language-aware symbol extraction parses valid AST constructs without fabricating symbols.');

// ==========================================
// Test 5: Multi-Signal Ranking
// ==========================================
console.log('Test 5: Multi-signal ranking...');
// Search for 'authenticateUser'
const results = index.search('authenticateUser');
assert.ok(results.length > 0, 'Finds match for authenticateUser');
const topMatch = results[0];
assert.equal(topMatch.filePath, 'src/auth/authService.ts', 'Ranks exact symbol match at top');
assert.equal(topMatch.matchType, 'symbol', 'Match type marked as symbol');
assert.ok(topMatch.signals.some(s => s.startsWith('symbol:')), 'Signals indicate symbol match');

// Search for exact filename 'authService.ts'
const pathResults = index.search('authService.ts');
assert.equal(pathResults[0]?.filePath, 'src/auth/authService.ts', 'Exact filename match ranked highest');
assert.equal(pathResults[0]?.matchType, 'path', 'Exact filename match type is path');

// Search with active file boost
const boostedResults = index.search('validate', {
  activeFilePath: 'src/auth/tokenValidator.ts'
});
assert.equal(boostedResults[0]?.filePath, 'src/auth/tokenValidator.ts', 'Active file receives ranking boost');
assert.ok(boostedResults[0]?.signals.includes('active-file'), 'Signals include active-file');

// Search with Git diff boost
const gitDiffResults = index.search('validate', {
  gitDiffPaths: ['src/auth/authService.ts']
});
assert.ok(gitDiffResults.some(r => r.signals.includes('git-diff')), 'Signals include git-diff for modified files');
console.log('✓ Test 5 Passed: Multi-signal ranking incorporates symbols, filenames, active file, and git diff.');

// ==========================================
// Test 6: Import Relationships (Dependency Graph)
// ==========================================
console.log('Test 6: Import relationship and dependency graph...');
const authDeps = index.getDependencies('src/auth/authService.ts');
assert.ok(authDeps.imports.includes('src/auth/tokenValidator.ts'), 'AuthService imports tokenValidator');

const tokenDeps = index.getDependencies('src/auth/tokenValidator.ts');
assert.ok(tokenDeps.importedBy.includes('src/auth/authService.ts'), 'tokenValidator is imported by AuthService');
console.log('✓ Test 6 Passed: Dependency graph correctly tracks imports and reverse importers.');

// ==========================================
// Test 7: Ignored Files Exclusion
// ==========================================
console.log('Test 7: Ignored build and dependency artifacts...');
const ignoredPaths = [
  'node_modules/express/index.js',
  'dist/server.cjs',
  'build/bundle.js',
  '.git/HEAD',
  '.next/static/chunks/app.js',
  'coverage/lcov.info',
  'venv/bin/python',
  '__pycache__/math.cpython-310.pyc'
];

for (const ignored of ignoredPaths) {
  assert.equal(shouldIndexFile(ignored), false, `Should exclude ignored path: ${ignored}`);
}
console.log('✓ Test 7 Passed: Build artifacts, dependencies, and VCS files are excluded.');

// ==========================================
// Test 8: Sensitive & Binary Files Exclusion
// ==========================================
console.log('Test 8: Sensitive files, credentials, and binary files exclusion...');
const sensitivePaths = [
  '.env',
  '.env.local',
  '.env.production',
  'src/keys/server.pem',
  'certs/private.key',
  'id_rsa',
  'id_ed25519',
  '.aws/credentials',
  '.ssh/id_rsa'
];

for (const sensitive of sensitivePaths) {
  assert.equal(isSensitivePath(sensitive), true, `Must detect sensitive path: ${sensitive}`);
  assert.equal(shouldIndexFile(sensitive), false, `Must refuse to index sensitive path: ${sensitive}`);
  assert.ok(sanitizePath(sensitive).error, `sanitizePath must reject sensitive path: ${sensitive}`);
}

const binaryPaths = [
  'assets/logo.png',
  'docs/manual.pdf',
  'build/app.wasm',
  'archive.zip',
  'bin/tool.exe'
];

for (const bin of binaryPaths) {
  assert.equal(isBinaryFile(bin), true, `Must detect binary extension: ${bin}`);
  assert.equal(shouldIndexFile(bin), false, `Must refuse to index binary path: ${bin}`);
}

// Binary content check with null byte
const nullByteContent = 'hello\0world binary stream';
assert.equal(isBinaryFile('data.txt', nullByteContent), true, 'Detects binary content with null bytes');
console.log('✓ Test 8 Passed: Sensitive credentials and binary files are strictly excluded.');

// ==========================================
// Test 9: Cross-Project Isolation
// ==========================================
console.log('Test 9: Cross-project isolation...');
const manager = new WorkspaceIndexManager();
const projectA = manager.getIndex('project-alpha');
const projectB = manager.getIndex('project-beta');

projectA.updateFile('src/secretAlpha.ts', 'export const ALPHA_SECRET = "123";');
projectB.updateFile('src/secretBeta.ts', 'export const BETA_SECRET = "456";');

const searchInAlpha = projectA.search('BETA_SECRET');
assert.equal(searchInAlpha.length, 0, 'Project Alpha cannot see Project Beta files');

const searchInBeta = projectB.search('ALPHA_SECRET');
assert.equal(searchInBeta.length, 0, 'Project Beta cannot see Project Alpha files');
console.log('✓ Test 9 Passed: Cross-project isolation strictly verified between tenant workspaces.');

// ==========================================
// Test 10: Stale Index Recovery
// ==========================================
console.log('Test 10: Stale index recovery and synchronization...');
const recoveryManager = new WorkspaceIndexManager();
const proj = recoveryManager.syncProject('stale-test', [
  { path: 'src/app.ts', content: 'export function startApp() { return 1; }' }
]);

assert.ok(proj.search('startApp').length > 0, 'Initial file indexed');

// Sync updated files: change function name and add another file
const refreshed = recoveryManager.syncProject('stale-test', [
  { path: 'src/app.ts', content: 'export function bootApp() { return 2; }' },
  { path: 'src/router.ts', content: 'export class AppRouter {}' }
]);

assert.equal(refreshed.search('startApp').length, 0, 'Stale symbol cleanly invalidated');
assert.ok(refreshed.search('bootApp').length > 0, 'Updated symbol indexed');
assert.ok(refreshed.search('AppRouter').length > 0, 'Newly added file indexed');
console.log('✓ Test 10 Passed: Stale index recovery cleanly updates on version or content drift.');

// ==========================================
// Test 11: Bounded Context Generation
// ==========================================
console.log('Test 11: Bounded context generation...');
const bounded = index.retrieveBoundedContext('authenticate token session', {
  maxTotalChars: 1500
});

assert.ok(bounded.totalChars <= 1500, `Context must be strictly under 1500 chars (actual: ${bounded.totalChars})`);
assert.ok(bounded.formattedContext.includes('[Relevant Codebase Symbols & Context]'), 'Includes structured context header');
assert.ok(bounded.items.length > 0, 'Includes relevant matches');
assert.ok(bounded.includedFiles.includes('src/auth/authService.ts'), 'Includes relevant file');

// Context should NOT send the entire repository
assert.ok(bounded.formattedContext.length < sampleFiles.reduce((s, f) => s + f.content.length, 0) + 500, 'Context is bounded and doesn not send whole repo');
console.log('✓ Test 11 Passed: Bounded context generation respects character budgets and avoids full repo dump.');

console.log('All 11 Milestone 5 automated verification tests passed successfully!');
