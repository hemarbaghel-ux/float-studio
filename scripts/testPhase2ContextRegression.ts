import assert from 'node:assert/strict';
import type { FileNode } from '../src/types';
import {
  buildChatContextItems,
  buildChatContextResult,
  MAX_EXPLICIT_FILE_CHARS,
  MAX_FOLDER_TOTAL_CHARS,
  MAX_FOLDER_PER_FILE_CHARS,
  MAX_SYMBOL_CHARS
} from '../src/features/float/chatContext';
import {
  sanitizePath,
  isPathTraversal,
  isSensitivePath,
  isBinaryFile,
  parseIgnorePatterns,
  matchesIgnorePattern
} from '../src/services/indexing/fileFilter';
import { workspaceIndexManager } from '../src/services/indexing/workspaceIndexManager';
import { ContextBuilder } from '../src/server/contextBuilder';

console.log('--- Phase 2: Context Engine & Indexing Test Suite ---');

// Workspace fixture with files, folders, symbols, secrets, and ignore files
const workspace: FileNode[] = [
  {
    id: 'f-comp-btn',
    name: 'Button.tsx',
    path: 'src/components/Button.tsx',
    type: 'file',
    content: [
      'import React from "react";',
      'export interface ButtonProps { label: string; onClick: () => void; }',
      'export function Button({ label, onClick }: ButtonProps) {',
      '  return <button onClick={onClick}>{label}</button>;',
      '}',
      'export default Button;'
    ].join('\n')
  },
  {
    id: 'f-comp-card',
    name: 'Card.tsx',
    path: 'src/components/Card.tsx',
    type: 'file',
    content: [
      'import React from "react";',
      'export class CardComponent extends React.Component {',
      '  render() { return <div className="card">Card Content</div>; }',
      '}'
    ].join('\n')
  },
  {
    id: 'f-comp-modal',
    name: 'Modal.tsx',
    path: 'src/components/Modal.tsx',
    type: 'file',
    content: [
      'export function showModal(title: string) {',
      '  console.log("Modal opened: " + title);',
      '}'
    ].join('\n')
  },
  {
    id: 'f-utils-math',
    name: 'math.ts',
    path: 'src/utils/math.ts',
    type: 'file',
    content: [
      'export function calculateTax(amount: number, rate: number): number {',
      '  if (amount < 0 || rate < 0) throw new Error("Invalid negative arguments");',
      '  return amount * rate;',
      '}',
      'export function formatCurrency(amount: number): string {',
      '  return "$" + amount.toFixed(2);',
      '}'
    ].join('\n')
  },
  {
    id: 'f-large',
    name: 'LargeDataset.ts',
    path: 'src/data/LargeDataset.ts',
    type: 'file',
    content: 'export const data = [' + Array.from({ length: 300 }, (_, i) => `"${i}: sample record data line"`).join(',\n') + '];'
  },
  {
    id: 'f-secret-env',
    name: '.env.local',
    path: '.env.local',
    type: 'file',
    content: 'DATABASE_PASSWORD=super-secret-production-password-12345'
  },
  {
    id: 'f-secret-ssh',
    name: '.ssh/id_rsa',
    path: '.ssh/id_rsa',
    type: 'file',
    content: '-----BEGIN OPENSSH PRIVATE KEY-----\nMOCK_KEY_DATA\n-----END OPENSSH PRIVATE KEY-----'
  },
  {
    id: 'f-binary-img',
    name: 'logo.png',
    path: 'assets/logo.png',
    type: 'file',
    content: '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
  },
  {
    id: 'f-gitignore',
    name: '.gitignore',
    path: '.gitignore',
    type: 'file',
    content: [
      '# Comments are ignored',
      '*.log',
      'temp/',
      'coverage/',
      '.cache'
    ].join('\n')
  },
  {
    id: 'f-ignored-log',
    name: 'server.log',
    path: 'server.log',
    type: 'file',
    content: '2026-11-02 12:00:00 [INFO] Server started on port 3000'
  },
  {
    id: 'f-ignored-temp',
    name: 'temp/cache.json',
    path: 'temp/cache.json',
    type: 'file',
    content: '{"cached": true}'
  }
];

// Test 1: Explicit file mentions (@file:path and @path)
console.log('1. Testing explicit file mention parsing and bounding...');
{
  const result = buildChatContextResult(
    'Please inspect @src/utils/math.ts and @file:src/components/Button.tsx',
    workspace,
    'proj-test-1'
  );

  const explicitItems = result.items.filter(i => i.provenance === 'explicit');
  assert.equal(explicitItems.length, 2, 'Should include exactly the 2 explicitly mentioned files');
  assert.ok(explicitItems.some(i => i.path === 'src/utils/math.ts'), 'Should include math.ts');
  assert.ok(explicitItems.some(i => i.path === 'src/components/Button.tsx'), 'Should include Button.tsx');
  assert.ok(explicitItems.every(i => i.type === 'attachment'), 'Explicit files have type attachment');

  // Verify bounded character truncation on oversized file
  const largeResult = buildChatContextResult(
    'Review @src/data/LargeDataset.ts',
    workspace,
    'proj-test-1'
  );
  const largeItem = largeResult.items.find(i => i.path === 'src/data/LargeDataset.ts');
  assert.ok(largeItem, 'Should include LargeDataset.ts');
  assert.ok(largeItem.content.length <= MAX_EXPLICIT_FILE_CHARS + 150, 'File content must be strictly capped');
  assert.ok(largeItem.isTruncated, 'Item should be flagged as truncated');
  assert.ok(largeResult.diagnostics.isTruncated, 'Diagnostics should report truncation');
}

// Test 2: Folder expansion (@folder:path and @path/)
console.log('2. Testing @folder expansion and budget bounds...');
{
  const folderResult = buildChatContextResult(
    'Refactor the components in @folder:src/components',
    workspace,
    'proj-test-1'
  );

  const folderItems = folderResult.items.filter(i => i.provenance === 'folder');
  assert.ok(folderItems.length >= 3, 'Should expand all 3 components under src/components');
  assert.ok(folderItems.some(i => i.path === 'src/components/Button.tsx'), 'Includes Button.tsx');
  assert.ok(folderItems.some(i => i.path === 'src/components/Card.tsx'), 'Includes Card.tsx');
  assert.ok(folderItems.some(i => i.path === 'src/components/Modal.tsx'), 'Includes Modal.tsx');

  // Non-existent folder reports warning
  const missingFolderResult = buildChatContextResult(
    'Look at @folder:src/nonexistent',
    workspace,
    'proj-test-1'
  );
  const missingFolderItems = missingFolderResult.items.filter(i => i.provenance === 'folder');
  assert.equal(missingFolderItems.length, 0, 'No folder items for non-existent folder');
  assert.ok(missingFolderResult.explanation.excludedItems.some(ex => ex.name === 'src/nonexistent' && ex.reason === 'not_found'), 'Excluded as not_found');
}

// Test 3: Symbol extraction (@symbol:name and @symbol name)
console.log('3. Testing @symbol extraction with WorkspaceIndex...');
{
  const symResult = buildChatContextResult(
    'How does @symbol:calculateTax work?',
    workspace,
    'proj-test-1'
  );

  const symItem = symResult.items.find(i => i.provenance === 'symbol' && i.name.includes('calculateTax'));
  assert.ok(symItem, 'Symbol item should be present in results with provenance symbol');
  assert.ok(symItem?.startLine && symItem?.endLine, 'Should specify startLine and endLine excerpt');
  assert.ok(symItem?.content.includes('Invalid negative arguments'), 'Excerpt should contain function body');

  // Missing symbol reports warning
  const missingSymResult = buildChatContextResult(
    'Where is @symbol:unrealSymbolXYZ?',
    workspace,
    'proj-test-1'
  );
  assert.ok(missingSymResult.explanation.excludedItems.some(ex => ex.name === 'unrealSymbolXYZ' && ex.reason === 'not_found'), 'Missing symbol marked as not_found');
}

// Test 4: Security - Sensitive files, secrets, binaries, path traversal
console.log('4. Testing security boundary enforcement...');
{
  // Path traversal
  assert.ok(isPathTraversal('../secret.txt'), 'isPathTraversal rejects ../');
  assert.ok(isPathTraversal('foo/../../bar'), 'isPathTraversal rejects nested traversal');
  assert.ok(isPathTraversal('C:/Windows/System32'), 'isPathTraversal rejects drive letters');
  assert.ok(isPathTraversal('test\0.js'), 'isPathTraversal rejects null bytes');

  // Sensitive paths
  assert.ok(isSensitivePath('.env'), 'Rejects .env');
  assert.ok(isSensitivePath('.env.local'), 'Rejects .env.local');
  assert.ok(isSensitivePath('config/.env.production'), 'Rejects nested .env');
  assert.ok(isSensitivePath('.git/HEAD'), 'Rejects .git');
  assert.ok(isSensitivePath('.ssh/id_rsa'), 'Rejects .ssh credentials');
  assert.ok(isSensitivePath('keys/server.key'), 'Rejects .key private keys');
  assert.ok(isSensitivePath('cert.pem'), 'Rejects .pem certificates');

  // Binary file detection
  assert.ok(isBinaryFile('assets/logo.png'), 'Detects png extension');
  assert.ok(isBinaryFile('archive.zip'), 'Detects zip extension');
  assert.ok(isBinaryFile('binary.wasm'), 'Detects wasm extension');
  assert.ok(isBinaryFile('sample.txt', '\x00\x01\x02\x03\x04'), 'Detects null byte content');

  // Explicit attempt to access .env.local in chatContext
  const secretResult = buildChatContextResult(
    'Print @.env.local and @.ssh/id_rsa and @assets/logo.png and @../etc/passwd',
    workspace,
    'proj-test-1'
  );
  assert.equal(secretResult.items.length, 0, 'No sensitive, binary, or traversal files must ever be returned');
  assert.ok(secretResult.explanation.excludedItems.some(ex => ex.name === '.env.local' && ex.reason === 'sensitive_file'), 'Excluded .env.local as sensitive');
  assert.ok(secretResult.explanation.excludedItems.some(ex => ex.name === 'assets/logo.png' && ex.reason === 'binary_file'), 'Excluded logo.png as binary');
  assert.ok(secretResult.explanation.excludedItems.some(ex => ex.name === '../etc/passwd' && ex.reason === 'path_traversal'), 'Excluded traversal');
}

// Test 5: .gitignore pattern matching and filtering
console.log('5. Testing .gitignore pattern parsing and exclusion...');
{
  const gitignorePatterns = parseIgnorePatterns(workspace.find(f => f.name === '.gitignore')?.content || '');
  assert.ok(gitignorePatterns.includes('*.log'), 'Parses *.log pattern');
  assert.ok(gitignorePatterns.includes('temp/'), 'Parses temp/ directory pattern');

  assert.ok(matchesIgnorePattern('server.log', gitignorePatterns), 'server.log matches *.log');
  assert.ok(matchesIgnorePattern('temp/cache.json', gitignorePatterns), 'temp/cache.json matches temp/');
  assert.ok(!matchesIgnorePattern('src/components/Button.tsx', gitignorePatterns), 'Button.tsx does not match ignore');

  // In chatContextResult with gitignore in workspace
  const ignoredResult = buildChatContextResult(
    'Inspect @server.log and @temp/cache.json',
    workspace,
    'proj-test-1'
  );
  assert.equal(ignoredResult.items.length, 0, 'Ignored files must not be included');
  assert.ok(ignoredResult.explanation.excludedItems.some(ex => ex.name === 'server.log' && ex.reason === 'ignored'), 'Excluded server.log as ignored');
}

// Test 6: Cross-project isolation
console.log('6. Testing strict multi-project isolation in WorkspaceIndexManager...');
{
  const projectA = [
    { path: 'src/secretModuleA.ts', name: 'secretModuleA.ts', content: 'export function moduleAlphaSpecific() { return 42; }', type: 'file' }
  ];
  const projectB = [
    { path: 'src/moduleB.ts', name: 'moduleB.ts', content: 'export function moduleBetaSpecific() { return 99; }', type: 'file' }
  ];

  const indexA = workspaceIndexManager.syncProject('project-alpha', projectA);
  const indexB = workspaceIndexManager.syncProject('project-beta', projectB);

  // Search project A for Alpha
  const searchA = indexA.search('moduleAlphaSpecific');
  assert.equal(searchA.length, 1, 'Project A index finds moduleAlphaSpecific');

  // Search project B for Alpha — MUST BE EMPTY
  const searchB = indexB.search('moduleAlphaSpecific');
  assert.equal(searchB.length, 0, 'Project B index MUST NOT contain Project A symbols or files');

  // Symbols in B
  const symbolsB = indexB.getAllSymbols();
  assert.ok(!symbolsB.some(s => s.symbol.name.includes('Alpha')), 'Project B must have zero Project A symbols');
}

// Test 7: Server-side ContextBuilder integration with folder & symbol provenance
console.log('7. Testing server-side ContextBuilder provenance and security...');
{
  const clientContextItems = [
    {
      id: 'folder-src/components-src/components/Button.tsx',
      type: 'attachment' as const,
      name: 'src/components/Button.tsx [folder: src/components]',
      path: 'src/components/Button.tsx',
      content: 'export function Button() {}',
      provenance: 'folder' as const,
      reason: 'Expanded from @folder:src/components'
    },
    {
      id: 'symbol-src/utils/math.ts-calculateTax',
      type: 'search_match' as const,
      name: 'src/utils/math.ts [function calculateTax]',
      path: 'src/utils/math.ts',
      content: 'export function calculateTax() {}',
      startLine: 1,
      endLine: 5,
      provenance: 'symbol' as const,
      reason: 'Symbol match for @symbol:calculateTax'
    },
    {
      id: 'malicious-traversal',
      type: 'file' as const,
      name: '../../etc/shadow',
      path: '../../etc/shadow',
      content: 'root:xyz',
      reason: 'attack'
    }
  ];

  const assembled = ContextBuilder.build(
    'How do I use the Button and calculateTax?',
    clientContextItems,
    { projectName: 'Test Workspace', projectId: 'proj-builder-1' }
  );

  assert.equal(assembled.omittedCount, 1, 'Server ContextBuilder must omit malicious traversal');
  assert.ok(assembled.excludedItems.some(ex => ex.reason === 'path_traversal'), 'Recorded path_traversal exclusion');
  assert.equal(assembled.includedCount, 2, 'Should include exactly the 2 valid items');

  const folderCand = assembled.includedItems.find(i => i.id.startsWith('folder-'));
  assert.ok(folderCand, 'Folder candidate should be included');
  assert.equal(folderCand?.source, 'folder', 'Folder candidate source must be folder');

  const symbolCand = assembled.includedItems.find(i => i.id.startsWith('symbol-'));
  assert.ok(symbolCand, 'Symbol candidate should be included');
  assert.equal(symbolCand?.source, 'symbol', 'Symbol candidate source must be symbol');

  assert.ok(assembled.formattedPrompt.includes('Button.tsx'), 'Prompt must contain Button.tsx');
  assert.ok(assembled.formattedPrompt.includes('calculateTax'), 'Prompt must contain calculateTax');
  assert.ok(!assembled.formattedPrompt.includes('root:xyz'), 'Prompt must never contain leaked secret');
}

// Test 8: Explainable provenance and edge cases
console.log('8. Testing edge case reporting (no results, truncation, provenance)...');
{
  const emptyResult = buildChatContextResult('Hello there, how are you?', workspace, 'proj-test-1');
  assert.equal(emptyResult.items.length, 0, 'Generic greeting includes no files');
  assert.equal(emptyResult.diagnostics.noResults, false, 'No search was performed, so noResults is false');

  const unresolvableResult = buildChatContextResult('@codebase findNonExistentFunctionalityX99', workspace, 'proj-test-1');
  assert.ok(unresolvableResult.items.length > 0, '@codebase provides bounded fallback entry files when query has no direct match');
}

console.log('--- All Phase 2 Context Engine & Indexing tests passed successfully! ---');
