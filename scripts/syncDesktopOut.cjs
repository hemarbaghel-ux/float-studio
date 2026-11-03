const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const srcDir = path.resolve(__dirname, '../desktop/src/vs/workbench/contrib/float');
const outDir = path.resolve(__dirname, '../desktop/out/vs/workbench/contrib/float');

function compileDir(currentSrc, currentOut) {
  if (!fs.existsSync(currentOut)) {
    fs.mkdirSync(currentOut, { recursive: true });
  }

  const entries = fs.readdirSync(currentSrc, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(currentSrc, entry.name);
    if (entry.isDirectory()) {
      compileDir(srcPath, path.join(currentOut, entry.name));
    } else if (entry.name.endsWith('.ts')) {
      const outPath = path.join(currentOut, entry.name.replace(/\.ts$/, '.js'));
      const code = fs.readFileSync(srcPath, 'utf8');
      try {
        const transformed = esbuild.transformSync(code, {
          loader: 'ts',
          format: 'esm',
          target: 'es2022',
          tsconfigRaw: {
            compilerOptions: {
              experimentalDecorators: true
            }
          }
        });
        fs.writeFileSync(outPath, transformed.code, 'utf8');
        console.log(`Compiled: ${path.relative(srcDir, srcPath)} -> ${path.relative(outDir, outPath)}`);
      } catch (err) {
        console.error(`Failed to compile ${srcPath}:`, err);
      }
    }
  }
}

console.log('Synchronizing desktop/src/vs/workbench/contrib/float to desktop/out/...');
compileDir(srcDir, outDir);
console.log('All desktop float modules synchronized.');
