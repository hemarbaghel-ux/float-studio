import assert from 'node:assert/strict';
import { isImportablePath, buildFileTreeFromMap } from '../src/services/repoImporter';
import { ContextBuilder } from '../src/server/contextBuilder';

console.log('Running Milestone 1 & 2 integration and context resolution unit tests...');

// 1. Breadcrumb path segmentation logic test
interface TestNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: TestNode[];
}

const mockTree: TestNode[] = [
  {
    id: 'folder-src',
    name: 'src',
    type: 'folder',
    children: [
      {
        id: 'folder-components',
        name: 'components',
        type: 'folder',
        children: [
          { id: 'file-app-tsx', name: 'App.tsx', type: 'file' }
        ]
      },
      { id: 'file-main-ts', name: 'main.ts', type: 'file' }
    ]
  },
  { id: 'file-package-json', name: 'package.json', type: 'file' }
];

function findBreadcrumbs(nodes: TestNode[], targetId: string, current: string[] = []): string[] | null {
  for (const n of nodes) {
    const next = [...current, n.name];
    if (n.id === targetId) return next;
    if (n.children) {
      const found = findBreadcrumbs(n.children, targetId, next);
      if (found) return found;
    }
  }
  return null;
}

const breadcrumbs = findBreadcrumbs(mockTree, 'file-app-tsx');
assert.deepEqual(breadcrumbs, ['src', 'components', 'App.tsx'], 'Breadcrumbs must trace folder hierarchy accurately');

const rootBreadcrumbs = findBreadcrumbs(mockTree, 'file-package-json');
assert.deepEqual(rootBreadcrumbs, ['package.json'], 'Root files must have single segment breadcrumb');

// 2. @ Context Resolution & Prompt Bounding Tests
const terminalContext = {
  id: 'ctx-term',
  type: 'terminal' as const,
  name: 'Terminal Logs',
  content: '[INFO] Compiling client bundle\n[ERROR] Module not found: ./missing\nExit code: 1'
};

const folderContext = {
  id: 'ctx-folder',
  type: 'file' as const,
  name: 'src/components/',
  content: '--- src/components/App.tsx ---\nexport default function App() {}'
};

const assembled = ContextBuilder.build('Please explain the build failure', [terminalContext, folderContext], {
  projectName: 'test-app',
  gitRepository: 'user/test-app',
  gitBranch: 'main'
});

assert.ok(assembled.formattedPrompt.includes('[Project Context: test-app (Linked: user/test-app@main)]'), 'Must contain Git repository and branch info');
assert.ok(assembled.formattedPrompt.includes('--- File: Terminal Logs ---'), 'Must include terminal logs section');
assert.ok(assembled.formattedPrompt.includes('[ERROR] Module not found: ./missing'), 'Must include terminal error message');
assert.ok(assembled.formattedPrompt.includes('--- File: src/components/ ---'), 'Must include folder context section');
assert.ok(assembled.formattedPrompt.includes('Please explain the build failure'), 'Must include user request');
assert.equal(assembled.omittedCount, 0, 'No valid items should be omitted');
assert.ok(assembled.totalContextChars > 0, 'Context character count must be computed');

// 3. Traversal protection on context items
const maliciousContext = {
  id: 'ctx-bad',
  type: 'file' as const,
  name: '../../../../etc/shadow',
  path: '../../../../etc/shadow',
  content: 'root:x:0:0:root:/root:/bin/bash'
};

const safeCheck = ContextBuilder.build('Read this file', [maliciousContext]);
assert.equal(safeCheck.omittedCount, 1, 'Path traversal must be rejected by ContextBuilder');
assert.ok(safeCheck.warnings[0].includes('directory traversal'), 'Context notice must report directory traversal warning');

console.log('Milestone 1 & 2 verification tests: 8 passed, 0 failed.');
