import assert from 'node:assert/strict';
import type { FileNode } from '../src/types';
import { buildChatContextItems } from '../src/features/float/chatContext';

const workspace: FileNode[] = [
  {
    id: 'auth',
    name: 'auth.ts',
    type: 'file',
    content: [
      'export function authenticateUser(token: string) {',
      '  if (!token) throw new Error("missing token");',
      '  return validateToken(token);',
      '}',
      'function validateToken(token: string) { return token.length > 10; }',
    ].join('\n'),
  },
  {
    id: 'formatter',
    name: 'formatter.ts',
    type: 'file',
    content: 'export function formatCurrency(value: number) { return `$${value.toFixed(2)}`; }',
  },
  {
    id: 'unrelated',
    name: 'private-notes.md',
    type: 'file',
    content: 'UNSELECTED_PRIVATE_MARKER_4921: a note unrelated to authentication.',
  },
  {
    id: 'env',
    name: '.env.local',
    type: 'file',
    content: 'OPENAI_API_KEY=must-never-leave-the-browser',
  },
];

const retrieved = buildChatContextItems(
  'Fix the bug in authenticateUser token validation',
  workspace,
  'chat-context-selection-regression',
);
assert.ok(retrieved.some((item) => item.path === 'auth.ts'), 'local retrieval includes the relevant source excerpt');
assert.ok(retrieved.every((item) => item.type === 'search_match'), 'automatic retrieval sends bounded excerpts instead of full files');
assert.ok(!retrieved.some((item) => item.content.includes('UNSELECTED_PRIVATE_MARKER_4921')), 'unrelated unselected file content is not sent');
assert.ok(!retrieved.some((item) => item.content.includes('OPENAI_API_KEY')), 'sensitive credential files are never sent');
assert.ok(retrieved.length <= 6, 'automatic retrieval is bounded to a small set of relevant files');

const greeting = buildChatContextItems('Hello', workspace, 'chat-context-greeting-regression');
assert.deepEqual(greeting, [], 'ordinary greetings send no workspace file contents');

const explicitlySelected = buildChatContextItems(
  'Please inspect @formatter.ts before changing the auth code.',
  workspace,
  'chat-context-explicit-regression',
);
assert.ok(explicitlySelected.some((item) => item.type === 'attachment' && item.path === 'formatter.ts'), 'an explicitly mentioned file is attached');
assert.ok(explicitlySelected.some((item) => item.path === 'auth.ts'), 'relevant source is still retrieved alongside explicit selection');
assert.ok(!explicitlySelected.some((item) => item.path === '.env.local'), 'a credential file cannot be explicitly selected for model context');

console.log('Chat context selection: 9 assertions passed.');
