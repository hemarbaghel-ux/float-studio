import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { FloatWorkspaceIndexer } from '../desktop/src/vs/workbench/contrib/float/common/workspace/floatWorkspaceIndexer';

async function run(): Promise<void> {
  const originalRequire = (globalThis as any).require;
  (globalThis as any).require = createRequire(import.meta.url);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'float-index-metadata-'));
  const metadataPath = path.join(tempDir, 'index', 'workspace.json');

  try {
    const source = [
      'export function verifyCredential(token: string): boolean {',
      '  // Verify credential signature and expiration before accepting the token.',
      '  return verifySignature(token) && !isExpired(token);',
      '}'
    ].join('\n');

    const beforeRestart = new FloatWorkspaceIndexer();
    assert.equal(beforeRestart.indexFile('src/auth.ts', source), true);
    const originalStats = beforeRestart.getStats();
    const originalFileHash = beforeRestart.merkleTree.getFileHash('src/auth.ts');
    assert.ok(originalFileHash);
    assert.ok(originalStats.chunkCount > 0);

    await beforeRestart.saveIndexMetadata(metadataPath);
    assert.equal(fs.existsSync(metadataPath), true);

    const afterRestart = new FloatWorkspaceIndexer();
    assert.equal(await afterRestart.loadIndexMetadata(metadataPath), true);
    assert.equal(afterRestart.getStats().fileCount, originalStats.fileCount);
    assert.equal(afterRestart.getStats().chunkCount, originalStats.chunkCount);
    assert.equal(afterRestart.getStats().rootHash, originalStats.rootHash);
    assert.equal(afterRestart.merkleTree.getFileHash('src/auth.ts'), originalFileHash);

    // A file unchanged since the saved snapshot must not be re-chunked.
    assert.equal(afterRestart.indexFile('src/auth.ts', source), false);

    const changedSource = source.replace('isExpired(token)', 'isRevoked(token)');
    assert.equal(afterRestart.indexFile('src/auth.ts', changedSource), true);
    assert.notEqual(afterRestart.getStats().rootHash, originalStats.rootHash);
    assert.ok(afterRestart.searchCodebase('revoked credential').length > 0);

    // Malformed or unsafe metadata must fail closed rather than restore an
    // index entry for a path outside the workspace.
    const payload = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    payload.files[0].relativePath = '../outside.ts';
    fs.writeFileSync(metadataPath, JSON.stringify(payload), 'utf8');
    const unsafeRestore = new FloatWorkspaceIndexer();
    assert.equal(await unsafeRestore.loadIndexMetadata(metadataPath), false);
    assert.equal(unsafeRestore.getStats().fileCount, 0);

    console.log('FLOAT workspace index persistence: restart, unchanged-file skip, update and unsafe-path rejection passed.');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalRequire === undefined) delete (globalThis as any).require;
    else (globalThis as any).require = originalRequire;
  }
}

run().catch(error => {
  console.error('FLOAT workspace index persistence test failed:', error);
  process.exitCode = 1;
});
