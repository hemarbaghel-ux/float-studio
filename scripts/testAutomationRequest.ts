import assert from 'node:assert/strict';
import type { FileNode } from '../src/types';
import { buildAutomationChatRequest } from '../src/features/float/automationRequest';

const files: FileNode[] = [
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
  { id: 'private', name: 'private-notes.md', type: 'file', content: 'AUTOMATION_UNRELATED_SECRET_MARKER' },
  { id: 'env', name: '.env.local', type: 'file', content: 'OPENAI_API_KEY=must-never-leave-the-browser' },
];

const request = buildAutomationChatRequest({
  automation: { prompt: 'Review authenticateUser for a bug', includeWorkspace: true },
  files,
  projectId: 'project-123',
  projectName: 'Sample project',
  model: 'gpt-6.1-sol',
});

assert.equal(request.model, 'gpt-6.1-sol', 'automation preserves the selected model');
assert.equal(request.projectId, 'project-123', 'automation associates context with the active project');
assert.equal(request.messages[0].parts[0].text, 'Review authenticateUser for a bug', 'raw prompt is sent without concatenating the workspace');
assert.equal(request.contextItems.length, 1, 'only relevant bounded context is attached');
assert.equal(request.contextItems[0].path, 'auth.ts', 'relevant project source is selected');
assert.equal(request.contextItems[0].type, 'search_match', 'workspace context is a bounded excerpt');
assert.ok(!JSON.stringify(request).includes('AUTOMATION_UNRELATED_SECRET_MARKER'), 'unrelated unselected files are not sent');
assert.ok(!JSON.stringify(request).includes('OPENAI_API_KEY'), 'credential files are never sent');
assert.match(request.systemInstruction, /Do not claim to have edited files/);

const promptOnlyRequest = buildAutomationChatRequest({
  automation: { prompt: 'Summarize this release', includeWorkspace: false },
  files,
  projectId: null,
  projectName: null,
  model: 'gpt-6-astra',
});
assert.deepEqual(promptOnlyRequest.contextItems, [], 'prompt-only automations attach no workspace context');
assert.equal(promptOnlyRequest.projectName, 'Project Workspace', 'missing project names use the normal workspace label');
assert.equal('projectId' in promptOnlyRequest, false, 'ephemeral workspaces omit a persisted project ID');

console.log('Automation chat request context: 12 assertions passed.');
