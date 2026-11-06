import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FloatWorkspaceIndexer } from '../desktop/src/vs/workbench/contrib/float/common/workspace/floatWorkspaceIndexer.ts';
import { FloatWorkspaceIndexLifecycle } from '../desktop/src/vs/workbench/contrib/float/common/workspace/floatWorkspaceIndexLifecycle.ts';

function hasFile(indexer: FloatWorkspaceIndexer, relativePath: string): boolean {
  return indexer.getIndexedFiles().some(file => file.relativePath === relativePath);
}

async function main(): Promise<void> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'float-workspace-lifecycle-'));
  const workspace = path.join(tempRoot, 'workspace-a');
  const secondWorkspace = path.join(tempRoot, 'workspace-b');
  const sourceDir = path.join(workspace, 'src');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(secondWorkspace, { recursive: true });

  try {
    const authPath = path.join(sourceDir, 'auth.ts');
    const initialSource = 'export function initializeNebulaSession() { return "nebula"; }';
    await fs.writeFile(authPath, initialSource, 'utf8');
    await fs.writeFile(path.join(workspace, '.env'), 'FLOAT_API_KEY=must-not-index', 'utf8');
    await fs.mkdir(path.join(workspace, '.aws'), { recursive: true });
    await fs.writeFile(path.join(workspace, '.aws', 'credentials'), 'aws_access_key_id=must-not-index', 'utf8');
    await fs.writeFile(path.join(workspace, '.npmrc'), '//registry.example/:_authToken=must-not-index', 'utf8');

    const indexer = new FloatWorkspaceIndexer();
    const lifecycle = new FloatWorkspaceIndexLifecycle(indexer, { saveDebounceMs: 60 });

    await lifecycle.activateWorkspace(workspace);
    assert.equal(lifecycle.workspaceRoot, workspace);
    assert.equal(hasFile(indexer, 'src/auth.ts'), true);
    assert.equal(hasFile(indexer, '.env'), false);
    assert.equal(hasFile(indexer, '.aws/credentials'), false);
    assert.equal(hasFile(indexer, '.npmrc'), false);
    assert.ok(indexer.searchCodebase('initializeNebulaSession', 5).some(result => result.chunk.filePath === 'src/auth.ts'));

    // File update events replace old chunks and persist the new index.
    const updatedSource = 'export function refreshCometSessionIndex() { return "comet"; }';
    await fs.writeFile(authPath, updatedSource, 'utf8');
    await lifecycle.handleFileChanges({ updated: [authPath] });
    assert.ok(indexer.searchCodebase('refreshCometSessionIndex', 5).some(result => result.chunk.filePath === 'src/auth.ts'));

    // New file events index only files inside the active workspace.
    const addedPath = path.join(sourceDir, 'billing.ts');
    await fs.writeFile(addedPath, 'export function calculateOrbitInvoice() { return 42; }', 'utf8');
    await lifecycle.handleFileChanges({ added: [addedPath, path.join(tempRoot, 'outside.ts')] });
    assert.equal(hasFile(indexer, 'src/billing.ts'), true);
    assert.equal(hasFile(indexer, '../outside.ts'), false);

    // Added directory events trigger a bounded full rescan; deleted directory events remove descendants.
    const nestedDir = path.join(sourceDir, 'generated');
    await fs.mkdir(nestedDir, { recursive: true });
    const nestedFile = path.join(nestedDir, 'worker.ts');
    await fs.writeFile(nestedFile, 'export function startQuasarWorker() { return true; }', 'utf8');
    await lifecycle.handleFileChanges({ added: [nestedDir] });
    assert.equal(hasFile(indexer, 'src/generated/worker.ts'), true);
    await fs.rm(nestedDir, { recursive: true, force: true });
    await lifecycle.handleFileChanges({ deleted: [nestedDir] });
    assert.equal(hasFile(indexer, 'src/generated/worker.ts'), false);

    // Delete events remove the file's chunks and Merkle entry.
    await fs.rm(addedPath);
    await lifecycle.handleFileChanges({ deleted: [addedPath] });
    assert.equal(hasFile(indexer, 'src/billing.ts'), false);
    assert.equal(indexer.searchCodebase('calculateOrbitInvoice', 10).some(result => result.chunk.filePath === 'src/billing.ts'), false);

    await lifecycle.flush();
    const metadataPath = path.join(workspace, '.float', 'index-meta.json');
    await fs.access(metadataPath);

    // A fresh indexer restores persisted chunks, then validates them against a workspace scan.
    const restoredIndexer = new FloatWorkspaceIndexer();
    const restoredLifecycle = new FloatWorkspaceIndexLifecycle(restoredIndexer);
    await restoredLifecycle.activateWorkspace(workspace);
    assert.ok(restoredIndexer.searchCodebase('refreshCometSessionIndex', 5).some(result => result.chunk.filePath === 'src/auth.ts'));
    assert.equal(hasFile(restoredIndexer, 'src/billing.ts'), false);

    // Switching active workspace clears the previous workspace index and loads the new root.
    const secondFile = path.join(secondWorkspace, 'worker.ts');
    await fs.writeFile(secondFile, 'export function launchAuroraWorker() { return true; }', 'utf8');
    await restoredLifecycle.activateWorkspace(secondWorkspace);
    assert.equal(hasFile(restoredIndexer, 'worker.ts'), true);
    assert.equal(hasFile(restoredIndexer, 'src/auth.ts'), false);
    assert.ok(restoredIndexer.searchCodebase('launchAuroraWorker', 5).some(result => result.chunk.filePath === 'worker.ts'));

    lifecycle.dispose();
    restoredLifecycle.dispose();
    console.log('Workspace index lifecycle: initial scan, updates, additions, deletions, secret exclusions, persistence restore and workspace switching passed.');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error('Workspace index lifecycle test failed:', error);
  process.exit(1);
});
