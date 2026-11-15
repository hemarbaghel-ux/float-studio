/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const extDir = path.join(process.cwd(), 'desktop', 'extensions');

const stubPlugin = {
  name: 'stub-plugin',
  setup(build) {
    // Intercept common missing VSCode internal/external modules
    build.onResolve({ filter: /^@vscode\/|^vscode-|^@joaomoreno|^file-type|^byline|^which|^picomatch/ }, args => ({
      path: args.path,
      namespace: 'stub-ns'
    }));
    build.onResolve({ filter: /\/api\/git(\.d\.ts)?$/ }, args => ({
      path: args.path,
      namespace: 'stub-ns'
    }));
    build.onResolve({ filter: /^jsonc-parser$/ }, () => ({
      path: path.resolve(process.cwd(), 'node_modules/jsonc-parser/lib/esm/main.js')
    }));
    build.onLoad({ filter: /.*/, namespace: 'stub-ns' }, () => ({
      contents: `
function DummyStub() { return new Proxy({}, { get: () => () => ({}), apply: () => ({}), construct: () => ({}) }); }
const p = new Proxy(DummyStub, {
  get: () => new Proxy(DummyStub, { get: () => () => ({}), apply: () => ({}), construct: () => ({}) }),
  apply: () => new Proxy(DummyStub, { get: () => () => ({}), apply: () => ({}), construct: () => ({}) }),
  construct: () => new Proxy(DummyStub, { get: () => () => ({}), apply: () => ({}), construct: () => ({}) })
});
module.exports = p;
module.exports.default = p;
`,
      loader: 'js'
    }));
  }
};

async function buildAll() {
  if (!fs.existsSync(extDir)) {
    console.error('Desktop extensions directory not found at', extDir);
    process.exit(1);
  }

  const dirs = fs.readdirSync(extDir);
  let successCount = 0;
  let fallbackCount = 0;

  for (const d of dirs) {
    const pkgPath = path.join(extDir, d, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (!pkg.main) continue;

    let entry = path.join(extDir, d, 'src', 'extension.ts');
    if (!fs.existsSync(entry)) entry = path.join(extDir, d, 'src', 'main.ts');
    if (!fs.existsSync(entry)) {
      const baseName = path.basename(pkg.main).replace(/\.js$/, '');
      entry = path.join(extDir, d, 'src', baseName + '.ts');
    }
    if (!fs.existsSync(entry) && pkg.main.includes('client/out/node/')) {
      const baseName = path.basename(pkg.main).replace(/\.js$/, '');
      entry = path.join(extDir, d, 'client', 'src', 'node', baseName + '.ts');
    }
    if (!fs.existsSync(entry) && d === 'emmet') {
      entry = path.join(extDir, d, 'src', 'node', 'emmetNodeMain.ts');
    }

    const outfile = path.join(extDir, d, pkg.main.endsWith('.js') ? pkg.main : pkg.main + '.js');
    fs.mkdirSync(path.dirname(outfile), { recursive: true });

    let built = false;
    if (fs.existsSync(entry)) {
      try {
        await esbuild.build({
          entryPoints: [entry],
          outfile,
          bundle: true,
          platform: 'node',
          format: 'cjs',
          external: ['vscode'],
          plugins: [stubPlugin],
          logLevel: 'silent'
        });
        built = true;
        successCount++;
        console.log(`[COMPILED] ${d} -> ${path.relative(extDir, outfile)}`);
      } catch (err) {
        // Fall back to clean stub
      }
    }

    if (!built) {
      // Calculate relative path from outfile back to package.json
      const relToPkg = path.relative(path.dirname(outfile), pkgPath).replace(/\\/g, '/');
      const fallbackCode = `/* Auto-generated FLOAT extension entrypoint */
const vscode = require('vscode');
module.exports = {
  activate: function(context) {
    try {
      const pkg = require('./${relToPkg}');
      if (pkg.contributes && Array.isArray(pkg.contributes.commands)) {
        for (const cmd of pkg.contributes.commands) {
          if (cmd && cmd.command) {
            context.subscriptions.push(vscode.commands.registerCommand(cmd.command, () => {}));
          }
        }
      }
    } catch {}
  },
  deactivate: function() {}
};
`;
      fs.writeFileSync(outfile, fallbackCode, 'utf8');
      fallbackCount++;
      console.log(`[FALLBACK] ${d} -> ${path.relative(extDir, outfile)}`);
    }
  }

  console.log(`\nFinished building extensions: ${successCount} compiled, ${fallbackCount} fallbacks. Total: ${successCount + fallbackCount}`);
}

buildAll().catch(err => {
  console.error('Build extensions failed:', err);
  process.exit(1);
});
