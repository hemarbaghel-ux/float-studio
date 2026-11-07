import assert from 'node:assert/strict';
import { URI } from '../desktop/src/vs/base/common/uri.ts';
import { VSBuffer } from '../desktop/src/vs/base/common/buffer.ts';
import { IFileService, IFileStat } from '../desktop/src/vs/platform/files/common/files.ts';
import { FloatDaemonWorkspaceIndexSynchronizer } from '../desktop/src/vs/workbench/contrib/float/common/daemon/floatDaemonWorkspaceIndexSynchronizer.ts';

type FakeEntry = {
  resource: URI;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  size: number;
  content?: string;
  children?: FakeEntry[];
};

class FakeFileService {
  private readonly _entries = new Map<string, FakeEntry>();

  public add(entry: FakeEntry): void {
    this._entries.set(entry.resource.toString(), entry);
  }

  public async resolve(resource: URI): Promise<IFileStat> {
    const entry = this._entries.get(resource.toString());
    if (!entry) throw new Error('ENOENT: ' + resource.toString());
    return {
      resource: entry.resource,
      name: entry.resource.path.split('/').pop() || '',
      isFile: entry.isFile,
      isDirectory: entry.isDirectory,
      isSymbolicLink: entry.isSymbolicLink,
      size: entry.size,
      children: entry.children?.map(child => ({
        resource: child.resource,
        name: child.resource.path.split('/').pop() || '',
        isFile: child.isFile,
        isDirectory: child.isDirectory,
        isSymbolicLink: child.isSymbolicLink,
        size: child.size,
        children: undefined
      })) as IFileStat[] | undefined
    } as IFileStat;
  }

  public async stat(resource: URI): Promise<IFileStat> {
    return this.resolve(resource);
  }

  public async readFile(resource: URI): Promise<{ value: VSBuffer }> {
    const entry = this._entries.get(resource.toString());
    if (!entry || entry.content === undefined) throw new Error('ENOENT: ' + resource.toString());
    return { value: VSBuffer.fromString(entry.content) };
  }
}

async function main(): Promise<void> {
  const root = URI.file('/tmp/float-daemon-index-test');
  const secondRoot = URI.file('/tmp/float-daemon-index-test-2');
  const secondSrc = URI.file('/tmp/float-daemon-index-test-2/src');
  const secondApp = URI.file('/tmp/float-daemon-index-test-2/src/app.ts');
  const nestedRoot = URI.file('/tmp/float-daemon-index-test/src/nested');
  const nestedApp = URI.file('/tmp/float-daemon-index-test/src/nested/app.ts');
  const src = URI.file('/tmp/float-daemon-index-test/src');
  const app = URI.file('/tmp/float-daemon-index-test/src/app.ts');
  const env = URI.file('/tmp/float-daemon-index-test/.env');
  const dependency = URI.file('/tmp/float-daemon-index-test/node_modules/pkg/index.ts');
  const binary = URI.file('/tmp/float-daemon-index-test/src/image.ts');
  const fakeFs = new FakeFileService();
  const srcEntry: FakeEntry = { resource: src, isFile: false, isDirectory: true, isSymbolicLink: false, size: 0, children: [] };
  const rootEntry: FakeEntry = {
    resource: root, isFile: false, isDirectory: true, isSymbolicLink: false, size: 0,
    children: [srcEntry,
      { resource: env, isFile: true, isDirectory: false, isSymbolicLink: false, size: 20, content: 'SECRET=do-not-index' },
      { resource: dependency, isFile: true, isDirectory: false, isSymbolicLink: false, size: 50, content: 'export const dep = true;' }]
  };
  srcEntry.children!.push(
    { resource: app, isFile: true, isDirectory: false, isSymbolicLink: false, size: 42, content: 'export function resolveFloatDaemonIndex() { return true; }' },
    { resource: binary, isFile: true, isDirectory: false, isSymbolicLink: false, size: 3, content: '\u0000\u0001\u0002' },
    { resource: nestedRoot, isFile: false, isDirectory: true, isSymbolicLink: false, size: 0, children: [
      { resource: nestedApp, isFile: true, isDirectory: false, isSymbolicLink: false, size: 42, content: 'export function nestedWorkspaceResolver() { return true; }' }
    ] }
  );
  const secondSrcEntry: FakeEntry = {
    resource: secondSrc, isFile: false, isDirectory: true, isSymbolicLink: false, size: 0,
    children: [
      { resource: secondApp, isFile: true, isDirectory: false, isSymbolicLink: false, size: 40, content: 'export function resolveOtherWorkspaceApp() { return true; }' }
    ]
  };
  const secondRootEntry: FakeEntry = {
    resource: secondRoot, isFile: false, isDirectory: true, isSymbolicLink: false, size: 0,
    children: [secondSrcEntry]
  };
  fakeFs.add(secondRootEntry);
  fakeFs.add({ resource: nestedRoot, isFile: false, isDirectory: true, isSymbolicLink: false, size: 0, children: [
    { resource: nestedApp, isFile: true, isDirectory: false, isSymbolicLink: false, size: 42, content: 'export function nestedWorkspaceResolver() { return true; }' }
  ] });
  fakeFs.add({ resource: nestedApp, isFile: true, isDirectory: false, isSymbolicLink: false, size: 42, content: 'export function nestedWorkspaceResolver() { return true; }' });
  fakeFs.add(secondSrcEntry);
  fakeFs.add(secondSrcEntry.children![0]);
  fakeFs.add(rootEntry);
  fakeFs.add(srcEntry);
  for (const child of rootEntry.children!) fakeFs.add(child);
  for (const child of srcEntry.children!) fakeFs.add(child);

  const calls: Array<{ kind: 'index' | 'remove'; path: string; content?: string }> = [];
  const daemonIndexedPaths = new Set(['src/deleted-before-restart.ts']);
  let clientAvailable = true;
  const client = {
    call: async (method: string) => {
      assert.equal(method, 'semantic_list_indexed_files');
      return { files: Array.from(daemonIndexedPaths) };
    },
    indexFileSemantics: async (filePath: string, content: string) => {
      calls.push({ kind: 'index', path: filePath, content });
      daemonIndexedPaths.add(filePath);
    },
    removeFileSemantics: async (filePath: string) => {
      calls.push({ kind: 'remove', path: filePath });
      daemonIndexedPaths.delete(filePath);
    }
  };
  const synchronizer = new FloatDaemonWorkspaceIndexSynchronizer(
    fakeFs as unknown as IFileService,
    () => clientAvailable ? client as any : undefined
  );

  await synchronizer.setWorkspaceRoot(root);
  await synchronizer.scanWorkspace();
  assert.equal(synchronizer.indexedFileCount, 2);
  assert.ok(calls.some(call => call.kind === 'remove' && call.path === 'src/deleted-before-restart.ts'), 'startup scan must prune files deleted while FLOAT was stopped');
  assert.equal(daemonIndexedPaths.has('src/deleted-before-restart.ts'), false);
  assert.deepEqual(calls.filter(call => call.kind === 'index').map(call => call.path), ['src/app.ts', 'src/nested/app.ts']);
  assert.equal(calls.some(call => call.path === '.env' || call.path.includes('node_modules')), false);

  // File changes update existing daemon chunks and remove content that becomes non-indexable.
  fakeFs.add({ resource: app, isFile: true, isDirectory: false, isSymbolicLink: false, size: 20, content: 'export function refreshFloatDaemonIndex() { return 2; }' });
  await synchronizer.handleFileChanges({ updated: [app] });
  assert.equal(calls.filter(call => call.kind === 'index' && call.path === 'src/app.ts').length, 2);

  const newFile = URI.file('/tmp/float-daemon-index-test/src/new.ts');
  fakeFs.add({ resource: newFile, isFile: true, isDirectory: false, isSymbolicLink: false, size: 30, content: 'export const newFeature = 1;' });
  await synchronizer.handleFileChanges({ added: [newFile] });
  assert.equal(synchronizer.indexedFileCount, 3);
  assert.ok(calls.some(call => call.kind === 'index' && call.path === 'src/new.ts'));

  // A file that becomes a symlink must be evicted rather than left searchable.
  fakeFs.add({ resource: newFile, isFile: false, isDirectory: false, isSymbolicLink: true, size: 0 });
  await synchronizer.handleFileChanges({ updated: [newFile] });
  assert.equal(synchronizer.indexedFileCount, 2);
  assert.ok(calls.some(call => call.kind === 'remove' && call.path === 'src/new.ts'));

  const deletedDirectory = URI.file('/tmp/float-daemon-index-test/src');
  await synchronizer.handleFileChanges({ deleted: [deletedDirectory] });
  assert.equal(synchronizer.indexedFileCount, 0);
  assert.ok(calls.some(call => call.kind === 'remove' && call.path === 'src/app.ts'));
  assert.ok(calls.some(call => call.kind === 'remove' && call.path === 'src/new.ts'));
  assert.ok(calls.some(call => call.kind === 'remove' && call.path === 'src/nested/app.ts'));

  // Multi-root workspaces namespace same-relative-path files to prevent collisions.
  await synchronizer.setWorkspaceRoots([root, secondRoot, nestedRoot]);
  await synchronizer.scanWorkspace();
  assert.equal(synchronizer.workspaceRoots.length, 3);
  assert.equal(synchronizer.indexedFileCount, 3);
  assert.ok(calls.some(call => call.kind === 'index' && call.path === 'workspace-1/src/app.ts'));
  assert.ok(calls.some(call => call.kind === 'index' && call.path === 'workspace-2/src/app.ts'));
  assert.ok(calls.some(call => call.kind === 'index' && call.path === 'workspace-3/app.ts'));
  assert.equal(calls.some(call => call.kind === 'index' && call.path === 'workspace-1/src/nested/app.ts'), false, 'nested workspace root must not be indexed through its parent root');

  // Switching back to one root removes namespaced records and restores legacy unprefixed paths.
  await synchronizer.setWorkspaceRoots([secondRoot]);
  assert.equal(synchronizer.workspaceRoot?.toString(), secondRoot.toString());
  await synchronizer.scanWorkspace();
  assert.equal(synchronizer.indexedFileCount, 1);
  assert.ok(calls.some(call => call.kind === 'index' && call.path === 'src/app.ts'));

  clientAvailable = false;
  await synchronizer.scanWorkspace(); // An unavailable daemon leaves the last known local path set unchanged.
  assert.equal(synchronizer.indexedFileCount, 1);

  // Hitting the scan cap is an incomplete scan: cached paths beyond the cap
  // must not be pruned merely because they were not visited in this pass.
  const cappedRoot = URI.file('/tmp/float-daemon-index-cap');
  const cappedFirst = URI.file('/tmp/float-daemon-index-cap/src/first.ts');
  const cappedSecond = URI.file('/tmp/float-daemon-index-cap/src/second.ts');
  fakeFs.add({
    resource: cappedRoot,
    isFile: false,
    isDirectory: true,
    isSymbolicLink: false,
    size: 0,
    children: [
      { resource: cappedFirst, isFile: true, isDirectory: false, isSymbolicLink: false, size: 12, content: 'export const first = 1;' },
      { resource: cappedSecond, isFile: true, isDirectory: false, isSymbolicLink: false, size: 12, content: 'export const second = 2;' }
    ]
  });
  fakeFs.add({ resource: cappedFirst, isFile: true, isDirectory: false, isSymbolicLink: false, size: 12, content: 'export const first = 1;' });
  fakeFs.add({ resource: cappedSecond, isFile: true, isDirectory: false, isSymbolicLink: false, size: 12, content: 'export const second = 2;' });
  const cachedPaths = new Set(['src/cached-before-scan.ts']);
  const cappedClient = {
    call: async () => ({ files: Array.from(cachedPaths) }),
    indexFileSemantics: async (filePath: string) => { cachedPaths.add(filePath); },
    removeFileSemantics: async (filePath: string) => { cachedPaths.delete(filePath); }
  };
  const cappedSynchronizer = new FloatDaemonWorkspaceIndexSynchronizer(
    fakeFs as unknown as IFileService,
    () => cappedClient as any,
    () => undefined,
    { maxIndexedFiles: 1 }
  );
  await cappedSynchronizer.setWorkspaceRoot(cappedRoot);
  await cappedSynchronizer.scanWorkspace();
  assert.ok(cachedPaths.has('src/cached-before-scan.ts'), 'incomplete scan must preserve unvisited cached records');
  assert.ok(cachedPaths.has('src/first.ts'), 'first file within scan cap must be indexed');
  assert.equal(cachedPaths.has('src/second.ts'), false, 'files beyond the cap must not be indexed');

  console.log('FLOAT daemon workspace indexing: exclusions, incremental updates, symlink eviction, scan-cap reconciliation and multi-root behavior passed.');
}

main().catch(error => {
  console.error('FLOAT daemon workspace indexing test failed:', error);
  process.exit(1);
});
