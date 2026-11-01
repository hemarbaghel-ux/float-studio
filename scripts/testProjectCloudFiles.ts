import { readFileSync } from 'node:fs';
import {
  MAX_PROJECT_CONTENT_CHUNK_BYTES,
  joinProjectFileTreeChunks,
  projectCloudSaveErrorMessage,
  serializeProjectFileTree
} from '../src/services/projectCloudFiles';
import { runSerialProjectCloudWrite } from '../src/services/projectCloudRepository';
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

const smallTree: FileNode[] = [{ id: 'root', name: 'src', type: 'folder', children: [
  { id: 'file', name: 'main.ts', type: 'file', content: 'const answer = 42;\n' }
] }];
const small = serializeProjectFileTree(smallTree);
assert(small.ok && JSON.parse(small.serialized)[0].children[0].content === 'const answer = 42;\n', 'Serializes a normal nested project tree without changing content');
assert(small.ok && small.byteLength === new TextEncoder().encode(small.serialized).byteLength, 'Measures serialized UTF-8 bytes');

const oversized: FileNode[] = [{ id: 'large', name: 'large.txt', type: 'file', content: '😀'.repeat(210_000) }];
const tooLarge = serializeProjectFileTree(oversized);
assert(tooLarge.ok && tooLarge.byteLength > 800 * 1024, 'Supports a project tree larger than the former single-document limit');
assert(tooLarge.ok && tooLarge.chunks.every(chunk => new TextEncoder().encode(chunk).byteLength <= MAX_PROJECT_CONTENT_CHUNK_BYTES), 'Keeps every content document below the Firestore-safe chunk budget');
const generation = '123e4567-e89b-12d3-a456-426614174000';
const manifest = {
  fileStorageVersion: 2 as const,
  fileGeneration: generation,
  fileChunkCount: tooLarge.ok ? tooLarge.chunks.length : 0,
  fileBytes: tooLarge.ok ? tooLarge.byteLength : 0,
  fileSnapshotComplete: true
};
const contentChunks = tooLarge.ok ? tooLarge.chunks.map((content, index) => ({ generation, index, content })) : [];
const reconstructed = joinProjectFileTreeChunks(contentChunks, manifest);
assert(JSON.stringify(reconstructed) === JSON.stringify(oversized), 'Reconstructs a large Unicode project tree without changing bytes or structure');
assert(tooLarge.ok && tooLarge.chunks.every(chunk => !/[\uD800-\uDBFF]$/.test(chunk) && !/^[\uDC00-\uDFFF]/.test(chunk)), 'Does not split surrogate pairs between content documents');

let incompleteSnapshotRejected = false;
try {
  joinProjectFileTreeChunks(contentChunks.slice(1), manifest);
} catch {
  incompleteSnapshotRejected = true;
}
assert(incompleteSnapshotRejected, 'Rejects incomplete generations instead of returning partial project content');

let invalidTreeRejected = false;
try {
  joinProjectFileTreeChunks([{
    generation,
    index: 0,
    content: JSON.stringify([
      { id: 'duplicate', name: 'one.txt', type: 'file', content: 'one' },
      { id: 'duplicate', name: 'two.txt', type: 'file', content: 'two' }
    ])
  }], {
    fileStorageVersion: 2,
    fileGeneration: generation,
    fileChunkCount: 1,
    fileBytes: new TextEncoder().encode(JSON.stringify([
      { id: 'duplicate', name: 'one.txt', type: 'file', content: 'one' },
      { id: 'duplicate', name: 'two.txt', type: 'file', content: 'two' }
    ])).byteLength,
    fileSnapshotComplete: true
  });
} catch {
  invalidTreeRejected = true;
}
assert(invalidTreeRejected, 'Rejects malformed trees and duplicate file IDs');

const cyclic: FileNode = { id: 'cycle', name: 'cycle', type: 'folder', children: [] };
cyclic.children!.push(cyclic);
const unserializable = serializeProjectFileTree([cyclic]);
assert(unserializable.ok === false && unserializable.reason === 'unserializable', 'Rejects cyclic project data without throwing');

assert(projectCloudSaveErrorMessage({ code: 'permission-denied' }).includes('denied'), 'Maps permission failure to a clear cloud save error');
assert(projectCloudSaveErrorMessage({ code: 'unavailable' }).includes('temporarily unavailable'), 'Maps unavailable storage to a retryable error');

async function testSerializedProjectWrites() {
  const order: string[] = [];
  let releaseFirst!: () => void;
  const gate = new Promise<void>(resolve => { releaseFirst = resolve; });
  const first = runSerialProjectCloudWrite('owner:project', async () => {
    order.push('first-start');
    await gate;
    order.push('first-finish');
  });
  const second = runSerialProjectCloudWrite('owner:project', async () => {
    order.push('second-start');
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  const secondWaited = order.join(',') === 'first-start';
  releaseFirst();
  await Promise.all([first, second]);
  assert(secondWaited && order.join(',') === 'first-start,first-finish,second-start', 'Serializes saves per owner/project so stale snapshots cannot publish last');

  await runSerialProjectCloudWrite('owner:project', async () => { throw new Error('expected failure'); }).catch(() => undefined);
  const afterFailure = await runSerialProjectCloudWrite('owner:project', async () => 'recovered');
  assert(afterFailure === 'recovered', 'Releases the project save queue after a failed write');
}

await testSerializedProjectWrites();

const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const projectCloudRepository = readFileSync(new URL('../src/services/projectCloudRepository.ts', import.meta.url), 'utf8');
assert(firestoreRules.includes("match /projectContent/{contentId}"), 'Defines a dedicated project content subcollection rule');
assert(firestoreRules.includes(".data.ownerId == request.auth.uid"), 'Restricts project content access to the parent project owner');
assert(firestoreRules.includes('incoming().content.size() <= 614400'), 'Enforces a per-document size bound in Firestore rules');
assert(firestoreRules.includes("data.fileStorageVersion == 2") && firestoreRules.includes('data.fileSnapshotComplete is bool'), 'Validates versioned project snapshot manifests');
assert((projectCloudRepository.match(/limit\(PROJECT_CONTENT_BATCH_SIZE\)/g) || []).length === 2, 'Bounds both full-project and per-generation cleanup reads to one Firestore batch');
assert((projectCloudRepository.match(/where\('ownerId', '==', ownerId\)/g) || []).length === 3, 'Constrains all chunk read and cleanup queries to the authenticated project owner');

if (failed > 0) process.exit(1);
console.log(`Project cloud file safeguards: ${passed} passed, ${failed} failed.`);
