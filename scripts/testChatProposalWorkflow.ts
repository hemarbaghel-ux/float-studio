import { createAssistantProposal, prepareAssistantProposal } from '../src/features/proposals/proposalWorkflow';
import type { FileNode } from '../src/types';

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`[PASS] ${label}`);
    passed += 1;
  } else {
    console.error(`[FAIL] ${label}`);
    failed += 1;
  }
}

const files: FileNode[] = [
  { id: 'app', name: 'App.tsx', type: 'file', content: 'export default function App() { return <main>old</main>; }' },
  { id: 'src', name: 'src', type: 'folder', children: [] }
];
const originalFiles = JSON.stringify(files);
const generated = [
  'I prepared a reviewable change.',
  '```tsx path=App.tsx',
  'export default function App() { return <main>new</main>; }',
  '```',
  '```ts path=src/math.ts',
  'export const add = (a: number, b: number) => a + b;',
  '```',
  '```delete path=old.ts```'
].join('\n');

const draft = prepareAssistantProposal(generated, 'Build a calculator', files);
assert(draft?.changes.length === 3, 'Turns generated complete file blocks and delete blocks into one proposal draft');
assert(draft?.changes[0]?.operation === 'modify' && draft.changes[0].path === 'App.tsx', 'Classifies an existing file block as a modification');
assert(draft?.changes[1]?.operation === 'create' && draft.changes[1].path === 'src/math.ts', 'Classifies a missing file block as a creation');
assert(draft?.changes[2]?.operation === 'delete' && draft.virtualFiles.length === 1, 'Includes original content only for modified workspace files');
assert(JSON.stringify(files) === originalFiles, 'Proposal preparation leaves original workspace files unchanged');
assert(prepareAssistantProposal('A code example:\n```tsx\nconst x = 1;\n```', 'Explain', files) === null, 'Leaves ordinary snippets without explicit file paths out of the proposal workflow');

let incompleteRejected = false;
try {
  prepareAssistantProposal('```tsx path=App.tsx\npartial code', 'Build', files);
} catch {
  incompleteRejected = true;
}
assert(incompleteRejected, 'Refuses to create proposals from incomplete file blocks');

let duplicateRejected = false;
try {
  prepareAssistantProposal('```ts path=App.tsx\none\n```\n```ts path=App.tsx\ntwo\n```', 'Build', files);
} catch {
  duplicateRejected = true;
}
assert(duplicateRejected, 'Rejects ambiguous duplicate changes to one path');

const serverProposal = {
  id: 'proposal-123', ownerId: 'owner-1', projectId: 'project-1', conversationId: 'conversation-1',
  description: 'Build a calculator', status: 'pending_review', affectedFiles: ['App.tsx'],
  changes: [{ path: 'App.tsx', operation: 'modify', originalContent: 'old', proposedContent: 'new', originalHash: 'a', proposedHash: 'b', status: 'pending', diffStats: { additions: 1, deletions: 1 } }],
  createdAt: 1, updatedAt: 1
};
let requestUrl = '';
let requestInit: RequestInit | undefined;
const created = await createAssistantProposal({
  responseText: '```tsx path=App.tsx\nnew\n```', prompt: 'Build a calculator', projectId: 'project / 1',
  conversationId: 'conversation-1', files, token: 'test-token',
  fetcher: async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ proposal: serverProposal }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }
});
assert(requestUrl === '/api/projects/project%20%2F%201/proposals', 'Encodes project IDs in the authenticated proposal route');
assert(requestInit?.method === 'POST' && new Headers(requestInit.headers).get('authorization') === 'Bearer test-token', 'Posts the proposal with the current authenticated session');
const requestBody = JSON.parse(String(requestInit?.body));
assert(requestBody.conversationId === 'conversation-1' && requestBody.changes[0].proposedContent === 'new', 'Associates the proposal with its conversation and generated file content');
assert(created?.proposalId === 'proposal-123' && created.status === 'pending_review', 'Returns the server-created proposal as a pending review change set');

let serverErrorSurfaced = false;
try {
  await createAssistantProposal({
    responseText: '```tsx path=App.tsx\nnew\n```', prompt: 'Build', projectId: 'project-1',
    conversationId: 'conversation-1', files, token: 'test-token',
    fetcher: async () => new Response(JSON.stringify({ error: 'Workspace is not persisted.' }), { status: 503 })
  });
} catch (error) {
  serverErrorSurfaced = error instanceof Error && error.message === 'Workspace is not persisted.';
}
assert(serverErrorSurfaced, 'Surfaces server proposal creation failures without pretending edits were applied');

if (failed > 0) process.exit(1);
console.log(`Chat proposal workflow: ${passed} passed, ${failed} failed.`);
