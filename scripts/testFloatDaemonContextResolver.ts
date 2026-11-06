import assert from 'node:assert/strict';
import { FloatDaemonContextResolver } from '../desktop/src/vs/workbench/contrib/float/browser/context/floatDaemonContextResolver.ts';
import { IFloatService } from '../desktop/src/vs/workbench/contrib/float/common/floatService.ts';
import { IFloatDaemonRuntimeService, IFloatDaemonRuntimeClient } from '../desktop/src/vs/workbench/contrib/float/common/daemon/floatDaemonRuntimeService.ts';
import { FloatWorkspaceIndexer } from '../desktop/src/vs/workbench/contrib/float/common/workspace/floatWorkspaceIndexer.ts';

async function main(): Promise<void> {
  const calls: Array<{ query: string; topK: number }> = [];
  const client = {
    ping: async () => ({ status: 'ok' }),
    call: async () => ({}),
    indexFileSemantics: async () => ({}),
    removeFileSemantics: async () => ({}),
    getSymbols: async () => ({}),
    searchSemantics: async (query: string, topK = 5) => {
      calls.push({ query, topK });
      return {
        totalChunksIndexed: 3,
        matches: [
          { filePath: 'src/auth/tokenVerifier.ts', startLine: 12, endLine: 18, snippet: 'export function verifyToken(token: string) { return validate(token); }' },
          { filePath: 'src/auth/session.ts', startLine: 4, endLine: 9, snippet: 'export function createSession() { return true; }' }
        ]
      };
    }
  } as unknown as IFloatDaemonRuntimeClient;

  const runtime = {
    getClient: () => client,
    state: 'running',
    onDidChangeState: () => ({ dispose() {} }),
    start: async () => undefined,
    stop: async () => undefined
  } as unknown as IFloatDaemonRuntimeService;

  const workspaceIndexer = new FloatWorkspaceIndexer();
  const floatService = {
    getWorkspaceIndexer: () => workspaceIndexer,
    getBrainService: () => ({ findSymbols: () => [] })
  } as unknown as IFloatService;

  const resolver = new FloatDaemonContextResolver(floatService, runtime);
  const codebaseContext = await resolver.resolveContext('Where is token validation implemented? @codebase', 'src/main.ts');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query, 'Where is token validation implemented?');
  assert.equal(calls[0].topK, 8);
  assert.ok(codebaseContext.files.some(file => file.path === 'src/auth/tokenVerifier.ts'));
  assert.ok(codebaseContext.files.some(file => file.path === 'src/main.ts'));
  assert.ok(codebaseContext.files[0].excerpt.includes('L12-L18'));

  const symbolContext = await resolver.resolveContext('Explain @symbol:verifyToken');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].query, 'verifyToken');
  assert.equal(calls[1].topK, 4);
  assert.ok(symbolContext.files.length > 0);

  console.log('FLOAT daemon context resolver: @codebase and @symbol snippets reach bounded prompt context.');
}

main().catch(error => {
  console.error('FLOAT daemon context resolver test failed:', error);
  process.exit(1);
});
