import assert from 'node:assert/strict';
import { validateAgentStepPayload, validateAgentToolCalls } from '../src/server/agent/agentStepProtocol';

const tools = [{
  name: 'read_file',
  description: 'Read a workspace source file.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Relative file path.' } },
    required: ['path']
  }
}];
const payload = {
  model: 'gpt-6-astra',
  projectId: 'project-1',
  systemInstruction: 'Use tools when needed.',
  messages: [{ role: 'user', content: 'Inspect the project.' }],
  tools
};

const valid = validateAgentStepPayload(payload);
assert.equal(valid.ok, true);
if (!valid.ok) throw new Error(valid.error);
assert.equal(valid.value.tools[0].name, 'read_file');

const invalidPayloads = [
  null,
  {},
  { ...payload, messages: [] },
  { ...payload, messages: [{ role: 'system', content: 'invalid' }] },
  { ...payload, messages: [{ role: 'assistant', content: 'wrong final role' }] },
  { ...payload, messages: [{ role: 'user', content: 'x'.repeat(130_000) }] },
  { ...payload, tools: [] },
  { ...payload, tools: [{ ...tools[0], name: 'bad tool name!' }] },
  { ...payload, tools: [{ ...tools[0], parameters: { type: 'array', properties: {}, required: [] } }] },
  { ...payload, tools: [{ ...tools[0], parameters: { ...tools[0].parameters, required: ['missing'] } }] },
  { ...payload, tools: [tools[0], tools[0]] },
  { ...payload, reasoningEffort: 'extreme' }
];
for (const invalid of invalidPayloads) assert.equal(validateAgentStepPayload(invalid).ok, false);

const validCalls = validateAgentToolCalls(tools, [
  { id: 'call-1', name: 'read_file', arguments: { path: 'src/app.ts' } }
]);
assert.equal(validCalls.ok, true);
if (validCalls.ok) assert.equal(validCalls.toolCalls[0].name, 'read_file');

for (const invalidCalls of [
  [{ name: 'delete_everything', arguments: {} }],
  [{ name: 'read_file', arguments: {} }],
  [{ name: 'read_file', arguments: { path: 'src/app.ts', unexpected: true } }],
  [{ name: 'read_file', arguments: { path: 42 } }],
  'not-an-array'
]) assert.equal(validateAgentToolCalls(tools, invalidCalls).ok, false);

console.log('[PASS] Structured Composer request schema, size bounds, tool allowlist and argument validation');
