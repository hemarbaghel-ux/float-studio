/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LocalFileSystemWorkspaceService } from '../src/services/indexing/localWorkspaceService';
import { ContextBuilder } from '../src/server/contextBuilder';

console.log('======================================================================');
console.log('FLOAT STUDIO — PHASE 4 WORKSPACE & CODEBASE INTELLIGENCE VERIFICATION');
console.log('======================================================================\n');

let passedAssertions = 0;

async function check(title: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${title}`);
    passedAssertions++;
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${title}`);
    console.error(`    ${err?.message || err}`);
    process.exit(1);
  }
}

async function runAllTests() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'float-phase4-test-'));
  const tempDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'float-phase4-root2-'));

  try {
    // Populate test files
    fs.mkdirSync(path.join(tempDir, 'src', 'utils'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.git', 'config'), 'secret git config');
    fs.writeFileSync(path.join(tempDir, '.env'), 'SECRET_API_KEY=12345');
    fs.writeFileSync(path.join(tempDir, 'src', 'app.ts'), `
export interface User {
  id: string;
  name: string;
}

export function calculateMetrics(data: number[]): number {
  return data.reduce((a, b) => a + b, 0);
}
`);
    fs.writeFileSync(path.join(tempDir, 'src', 'utils', 'math.ts'), `
export function computeDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}
`);
    fs.writeFileSync(path.join(tempDir2, 'extra.ts'), `
export const EXTRA_FEATURE = 'enabled';
`);

    // -----------------------------------------------------------------------
    // 1. Local Workspace Initialization & Multi-Root Support
    // -----------------------------------------------------------------------
    console.log('--- 1. Local Folder Opening & Multi-Root Workspace Support ---');

    const ws = new LocalFileSystemWorkspaceService(tempDir, [tempDir2]);

    await check('Opens workspace and resolves multi-root paths cleanly', async () => {
      assert.strictEqual(ws.getAllRoots().length, 2);
      assert.strictEqual(await ws.fileExists('src/app.ts'), true);
      assert.strictEqual(await ws.fileExists('extra.ts'), true);

      const appContent = await ws.readFile('src/app.ts');
      assert.ok(appContent.includes('calculateMetrics'));

      const extraContent = await ws.readFile('extra.ts');
      assert.ok(extraContent.includes('EXTRA_FEATURE'));
    });

    // -----------------------------------------------------------------------
    // 2. Secret & Sensitive File Exclusion
    // -----------------------------------------------------------------------
    console.log('\n--- 2. Secret & Sensitive File Exclusion ---');

    await check('Excluded paths are omitted from file listings', async () => {
      const files = await ws.listFiles({ recursive: true });
      const paths = files.map((f) => f.path);

      assert.ok(paths.includes('src/app.ts'));
      assert.ok(paths.includes('src/utils/math.ts'));
      assert.ok(paths.includes('extra.ts'));

      // Secrets must NEVER appear
      assert.strictEqual(paths.includes('.env'), false, '.env must be excluded');
      assert.strictEqual(paths.includes('.git/config'), false, '.git must be excluded');
    });

    // -----------------------------------------------------------------------
    // 3. Automatic & Incremental Indexing
    // -----------------------------------------------------------------------
    console.log('\n--- 3. Automatic & Incremental Indexing ---');

    await check('Initializes index and extracts code symbols with source positions', async () => {
      const initStats = await ws.initializeIndex();
      assert.ok(initStats.totalIndexed >= 2, `Expected at least 2 indexed files, got ${initStats.totalIndexed}`);

      const symbols = ws.index.findSymbols('calculateMetrics');
      assert.ok(symbols.length > 0, 'Symbol calculateMetrics must be found in index');
      assert.strictEqual(symbols[0].symbol.name, 'calculateMetrics');
      assert.strictEqual(symbols[0].path, 'src/app.ts');
    });

    await check('Incrementally indexes new file and makes it searchable', async () => {
      await ws.writeFile(
        'src/utils/crypto.ts',
        `export function generateToken(): string { return "token_" + Date.now(); }`
      );

      const found = ws.index.findSymbols('generateToken');
      assert.ok(found.length > 0, 'New symbol generateToken must be indexed incrementally');
      assert.strictEqual(found[0].path, 'src/utils/crypto.ts');
    });

    await check('Deleting a file prunes it from index and search results', async () => {
      await ws.deleteFile('src/utils/crypto.ts');

      const foundAfter = ws.index.findSymbols('generateToken');
      assert.strictEqual(foundAfter.length, 0, 'Deleted symbol must not exist in index');
      assert.strictEqual(await ws.fileExists('src/utils/crypto.ts'), false);
    });

    // -----------------------------------------------------------------------
    // 4. Lexical Retrieval with Exact Source Locations
    // -----------------------------------------------------------------------
    console.log('\n--- 4. Lexical & Semantic Retrieval ---');

    await check('Retrieves relevant code snippet with exact file path and line numbers', async () => {
      const results = ws.index.search('computeDistance', { maxResults: 5 });
      assert.ok(results.length > 0, 'Search must return relevant math snippet');
      assert.strictEqual(results[0].filePath, 'src/utils/math.ts');
      assert.ok(results[0].contentExcerpt.includes('computeDistance'));
      assert.ok(results[0].startLine >= 1);
    });

    // -----------------------------------------------------------------------
    // 5. ContextBuilder Integration
    // -----------------------------------------------------------------------
    console.log('\n--- 5. ContextBuilder Whole-Codebase Context Assembly ---');

    await check('ContextBuilder attaches exact file provenance and bounds character limits', async () => {
      const assembled = ContextBuilder.build(
        'How does calculateMetrics work?',
        [
          {
            id: 'item-1',
            name: 'src/app.ts',
            type: 'file',
            content: `export function calculateMetrics(data: number[]): number { return data.reduce((a, b) => a + b, 0); }`,
          },
        ],
        {
          projectName: 'Phase4Test',
          modelId: 'gpt-6.1-sol',
          maxTotalChars: 5000,
        }
      );

      assert.strictEqual(assembled.includedCount, 1);
      assert.ok(assembled.formattedPrompt.includes('calculateMetrics'));
      assert.ok(assembled.formattedPrompt.includes('src/app.ts'));
      assert.ok(assembled.totalContextChars <= 5000);
    });

    console.log('\n======================================================================');
    console.log(`ALL PHASE 4 WORKSPACE INTELLIGENCE TESTS PASSED (${passedAssertions} checks)!`);
    console.log('======================================================================\n');
  } finally {
    // Cleanup temp dirs
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(tempDir2, { recursive: true, force: true });
    } catch {}
  }
}

runAllTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
