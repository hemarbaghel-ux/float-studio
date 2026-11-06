import assert from 'node:assert/strict';
import { FloatSemanticChunker } from '../desktop/src/vs/workbench/contrib/float/common/workspace/floatSemanticChunker.ts';

const source = `
// Exported React-style component and multiple declarations on one line.
export const NebulaButton = (label: string) => <button>{label}</button>;
export const calculateOrbitTax = (amount: number) => amount * 0.1,
  calculateOrbitNet = (amount: number) => amount * 0.9;

export default function () {
  return 'default-export';
}

export class SessionVault {
  constructor(private readonly key: string) {}
  get activeToken(): string { return this.key; }
  set activeToken(value: string) { void value; }
  refreshSession() { return true; }
  handleEvent = (event: string) => event.length > 0;
}

namespace InternalJobs {
  export function resolveQueueJob(id: string) { return id; }
}
`;

const chunks = FloatSemanticChunker.chunkFile('src/components/NebulaButton.tsx', source);
const find = (name: string) => chunks.find(chunk => chunk.symbolName === name);

assert.equal(find('NebulaButton')?.symbolKind, 'function', 'arrow component should be indexed as a function');
assert.equal(find('calculateOrbitTax')?.symbolKind, 'function', 'first declarator should be indexed');
assert.equal(find('calculateOrbitNet')?.symbolKind, 'function', 'later declarators in the same statement must not be lost');
assert.equal(find('default')?.symbolKind, 'function', 'anonymous default function exports should be indexed');
assert.equal(find('SessionVault')?.symbolKind, 'class');
assert.equal(find('constructor')?.containerName, 'SessionVault');
assert.equal(find('activeToken')?.symbolKind, 'method');
assert.equal(find('refreshSession')?.containerName, 'SessionVault');
assert.equal(find('handleEvent')?.symbolKind, 'function', 'class arrow properties should be callable symbols');
assert.equal(find('InternalJobs')?.symbolKind, 'module');
assert.equal(find('resolveQueueJob')?.containerName, 'InternalJobs');

for (const expected of [
  'NebulaButton',
  'calculateOrbitTax',
  'calculateOrbitNet',
  'SessionVault',
  'InternalJobs',
  'resolveQueueJob'
]) {
  const chunk = find(expected);
  assert.ok(chunk, 'Expected symbol chunk: ' + expected);
  assert.ok(chunk.startLine > 0 && chunk.endLine >= chunk.startLine, 'Valid source line range for ' + expected);
}

console.log('Semantic AST precision: arrow functions, multi-declarators, default exports, class members and namespaces passed.');
