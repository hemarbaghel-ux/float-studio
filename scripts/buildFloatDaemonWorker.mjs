import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import fs from 'node:fs';
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

// Ensure default NLS metadata files exist in desktop/out for dev startup
const outDir = path.join(repositoryRoot, 'desktop', 'out');
for (const nlsFile of ['nls.messages.json', 'nls.keys.json', 'nls.metadata.json']) {
  const filePath = path.join(outDir, nlsFile);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '{}', 'utf8');
  }
}

// Ensure WASM files are copied to the daemon worker bundle directory
const daemonWasm = path.join(repositoryRoot, 'daemon', 'wasm');
const targetWasm = path.join(path.dirname(outputFile), 'wasm');
if (fs.existsSync(daemonWasm)) {
  await fs.promises.cp(daemonWasm, targetWasm, { recursive: true });
}

console.log('[FLOAT] Built Electron daemon worker:', outputFile);
