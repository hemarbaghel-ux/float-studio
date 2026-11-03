const esbuild = require('esbuild');
const path = require('path');

async function buildExtension() {
  console.log('=== Building FLOAT VSCodium Extension ===');
  const entryPoint = path.resolve(__dirname, '../extensions/float-vscodium-poc/src/extension.ts');
  const outfile = path.resolve(__dirname, '../extensions/float-vscodium-poc/dist/extension.js');

  try {
    const result = await esbuild.build({
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

    console.log(`[PASS] Extension bundle built successfully -> ${outfile}`);
  } catch (err) {
    console.error('[FAIL] Error bundling extension:', err);
    process.exit(1);
  }
}

buildExtension();
