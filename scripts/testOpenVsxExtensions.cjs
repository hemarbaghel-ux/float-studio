const https = require('https');

const EXTENSIONS_TO_VERIFY = [
  { id: 'ms-python.python', role: 'Python language support & execution' },
  { id: 'ms-pyright.pyright', role: 'Python type checker & LSP' },
  { id: 'charliermarsh.ruff', role: 'Fast Python linter & formatter' },
  { id: 'rust-lang.rust-analyzer', role: 'Rust Language Server & completion' },
  { id: 'golang.Go', role: 'Go Language Server & tooling' },
  { id: 'llvm-vs-code-extensions.vscode-clangd', role: 'C/C++ AST LSP (Clangd)' },
  { id: 'dbaeumer.vscode-eslint', role: 'JavaScript/TypeScript ESLint' },
  { id: 'esbenp.prettier-vscode', role: 'Prettier code formatter' },
  { id: 'mhutchie.git-graph', role: 'Git branch visualization' },
  { id: 'redhat.vscode-yaml', role: 'YAML Language Server' }
];

function fetchExtensionInfo(extId) {
  return new Promise((resolve) => {
    const [namespace, name] = extId.split('.');
    const url = `https://open-vsx.org/api/${namespace}/${name}`;
    
    const req = https.get(url, { headers: { 'User-Agent': 'FLOAT-IDE-Marketplace-Audit/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            resolve({
              id: extId,
              status: 'AVAILABLE',
              version: parsed.version,
              displayName: parsed.displayName || parsed.name,
              downloadCount: parsed.downloadCount,
              verified: parsed.verified,
              license: parsed.license || 'N/A'
            });
          } catch (e) {
            resolve({ id: extId, status: 'PARSE_ERROR', error: e.message });
          }
        } else {
          resolve({ id: extId, status: 'NOT_FOUND', statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ id: extId, status: 'NETWORK_ERROR', error: err.message });
    });

    req.setTimeout(8000, () => {
      req.abort();
      resolve({ id: extId, status: 'TIMEOUT' });
    });
  });
}

async function auditMarketplace() {
  console.log('=== OPEN VSX MARKETPLACE COMPATIBILITY AUDIT ===\n');
  console.log(`Auditing ${EXTENSIONS_TO_VERIFY.length} mission-critical developer extensions on open-vsx.org...\n`);

  const results = [];
  for (const item of EXTENSIONS_TO_VERIFY) {
    process.stdout.write(`Checking ${item.id} (${item.role})... `);
    const info = await fetchExtensionInfo(item.id);
    console.log(info.status === 'AVAILABLE' ? `[OK] v${info.version}` : `[${info.status}]`);
    results.push({ ...item, ...info });
  }

  console.log('\n--- AUDIT RESULTS TABLE ---');
  console.log('| Extension ID | Role | Open VSX Status | Latest Version | License |');
  console.log('| :--- | :--- | :--- | :--- | :--- |');
  for (const r of results) {
    console.log(`| \`${r.id}\` | ${r.role} | **${r.status}** | ${r.version || 'N/A'} | ${r.license || 'N/A'} |`);
  }

  // Also check Microsoft proprietary extension caveat:
  console.log('\n--- CRITICAL MARKETPLACE COMPATIBILITY NOTE ---');
  console.log('1. Microsoft proprietary extensions (ms-vscode.cpptools, ms-toolsai.jupyter, and Pylance closed-source core) have Microsoft Marketplace-only licenses and are NOT licensed for third-party forks.');
  console.log('2. Standard VSCodium & Cursor open alternatives:');
  console.log('   - C/C++: llvm-vs-code-extensions.vscode-clangd (superior performance, Apache 2.0)');
  console.log('   - Python LSP: ms-pyright.pyright (MIT, official open-source core of Pylance)');
  console.log('   - Linting: charliermarsh.ruff (MIT, high-speed Rust-based linter)');
}

auditMarketplace();
