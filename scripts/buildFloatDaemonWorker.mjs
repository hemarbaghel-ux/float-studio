import { build } from 'esbuild';
import { mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const entryPoint = path.join(repositoryRoot, 'daemon', 'src', 'floatDaemonWorkerMain.ts');
const outputFile = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repositoryRoot, 'desktop', 'out', 'vs', 'workbench', 'contrib', 'float', 'electron-sandbox', 'floatDaemonWorkerMain.js');

await mkdir(path.dirname(outputFile), { recursive: true });
await build({
  entryPoints: [entryPoint],
  outfile: outputFile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info'
});

// Copy Tree-Sitter WASM engine into the sandbox distribution directory
const wasmSourceDir = path.join(repositoryRoot, 'daemon', 'wasm');
const wasmTargetDir = path.join(path.dirname(outputFile), 'wasm');
await cp(wasmSourceDir, wasmTargetDir, { recursive: true });

console.log('[FLOAT] Built Electron daemon worker:', outputFile);
