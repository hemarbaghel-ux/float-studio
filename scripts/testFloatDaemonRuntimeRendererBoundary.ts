import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function main(): Promise<void> {
  const source = await readFile(
    new URL('../desktop/src/vs/workbench/contrib/float/electron-sandbox/floatDaemonRuntimeService.ts', import.meta.url),
    'utf8'
  );

  for (const specifier of ['node:fs', 'node:net', 'node:os', 'node:path', "'fs'", "'net'", "'os'", "'path'", "'crypto'"]) {
    assert.equal(source.includes(`from ${specifier}`), false, `renderer runtime must not import Node module ${specifier}`);
  }
  assert.equal(source.includes("from '../common/daemon/floatDaemonClient.js'"), false, 'renderer must not import the Node socket client');
  assert.ok(source.includes('const call = <T>(method: string'), 'renderer-facing daemon API should be a MessagePort RPC facade');

  console.log('FLOAT daemon renderer boundary: no Node-only builtins or socket client imports.');
}

main().catch(error => {
  console.error('FLOAT daemon renderer boundary test failed:', error);
  process.exit(1);
});
