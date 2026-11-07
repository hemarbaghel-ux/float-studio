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
  assert.ok(codebaseContext.files.some(file => file.excerpt.includes('L12-L18')));

  const symbolContext = await resolver.resolveContext('Explain @symbol:verifyToken');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].query, 'verifyToken');
  assert.equal(calls[1].topK, 4);
  assert.ok(symbolContext.files.length > 0);

  // Multi-root context must filter the active file by its namespaced index path
  // without hiding another root's file that has the same relative path.
  const multiRootClient = {
    searchSemantics: async () => ({
      totalChunksIndexed: 3,
      matches: [
        { filePath: 'workspace-1/src/auth/tokenVerifier.ts', startLine: 2, endLine: 8, snippet: 'export function tokenVerifierFromFirstRoot() {}' },
        { filePath: 'workspace-2/src/auth/tokenVerifier.ts', startLine: 2, endLine: 8, snippet: 'export function activeTokenVerifier() {}' },
        { filePath: 'workspace-2/src/auth/session.ts', startLine: 4, endLine: 9, snippet: 'export function createSession() {}' }
      ]
    })
  };
  const multiRootRuntime = {
    getClient: () => multiRootClient
  } as unknown as IFloatDaemonRuntimeService;
  const workspaceContext = {
    getWorkspace: () => ({
      folders: [
        { uri: { scheme: 'file', path: '/workspace/one' } },
        { uri: { scheme: 'file', path: '/workspace/two' } }
      ]
    })
  } as any;
  const multiRootResolver = new FloatDaemonContextResolver(floatService, multiRootRuntime, workspaceContext);
  const multiRootContext = await multiRootResolver.resolveContext(
    'Explain token verification. @codebase',
    '/workspace/two/src/auth/tokenVerifier.ts'
  );
  assert.ok(
    multiRootContext.files.some(file => file.path === 'workspace-1/src/auth/tokenVerifier.ts'),
    'same-relative-path source from workspace-1 must remain eligible'
  );
  assert.ok(
    !multiRootContext.files.some(file => file.path === 'workspace-2/src/auth/tokenVerifier.ts'),
    'the exact active file in workspace-2 must not be included as retrieved context'
  );
  assert.ok(multiRootContext.files.some(file => file.path === 'workspace-2/src/auth/session.ts'));

  console.log('FLOAT daemon context resolver: mentions and exact active-file filtering across multi-root workspaces passed.');
}

main().catch(error => {
  console.error('FLOAT daemon context resolver test failed:', error);
  process.exit(1);
});
