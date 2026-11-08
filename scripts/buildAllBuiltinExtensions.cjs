/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function buildAllExtensions() {
  console.log('=== Building All FLOAT Built-in Core Language Extensions ===');
  const baseDir = path.resolve(__dirname, '../extensions');

  const extensionDirs = fs.readdirSync(baseDir).filter(item => {
    const full = path.join(baseDir, item);
    return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'src/extension.ts'));
  });

  console.log(`Discovered ${extensionDirs.length} extensions to bundle.`);

  for (const ext of extensionDirs) {
    const extDir = path.join(baseDir, ext);
    const entryPoint = path.join(extDir, 'src/extension.ts');
    const outdir = path.join(extDir, 'dist');
    const outfile = path.join(outdir, 'extension.js');

    if (!fs.existsSync(outdir)) {
      fs.mkdirSync(outdir, { recursive: true });
    }

    try {
      await esbuild.build({
        entryPoints: [entryPoint],
        bundle: true,
        outfile,
        platform: 'node',
        target: 'node20',
        format: 'cjs',
        external: ['vscode'],
        sourcemap: true,
        logLevel: 'error',
      });
      const stat = fs.statSync(outfile);
      console.log(`[PASS] Built ${ext} -> dist/extension.js (${stat.size} bytes)`);
    } catch (err) {
      console.error(`[FAIL] Error bundling ${ext}:`, err);
      process.exit(1);
    }
  }

  console.log(`=== All ${extensionDirs.length} Built-in Core Language Extensions Built Successfully ===`);
}

buildAllExtensions();
