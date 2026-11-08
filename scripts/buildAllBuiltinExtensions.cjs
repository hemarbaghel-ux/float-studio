/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const EXTENSIONS = [
  'typescript-language-features',
  'json-language-features',
  'markdown-language-features',
  'html-language-features',
  'css-language-features',
  'git',
  'configuration-editing'
];

async function buildAllExtensions() {
  console.log('=== Building FLOAT Built-in Core Language Extensions ===');
  const baseDir = path.resolve(__dirname, '../extensions');

  for (const ext of EXTENSIONS) {
    const extDir = path.join(baseDir, ext);
    const entryPoint = path.join(extDir, 'src/extension.ts');
    const outdir = path.join(extDir, 'dist');
    const outfile = path.join(outdir, 'extension.js');

    if (!fs.existsSync(entryPoint)) {
      console.warn(`[SKIP] Entrypoint not found: ${entryPoint}`);
      continue;
    }

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
        logLevel: 'info',
      });
      const stat = fs.statSync(outfile);
      console.log(`[PASS] Built ${ext} -> dist/extension.js (${stat.size} bytes)`);
    } catch (err) {
      console.error(`[FAIL] Error bundling ${ext}:`, err);
      process.exit(1);
    }
  }

  console.log('=== All Built-in Core Language Extensions Built Successfully ===');
}

buildAllExtensions();
