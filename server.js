import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Delegate to compiled bundle or server.ts
const distBundle = path.join(process.cwd(), 'dist', 'server.cjs');
if (fs.existsSync(distBundle)) {
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  const mod = await import(pathToFileURL(distBundle).href);
  const start = mod.startServer || mod.default?.startServer;
  if (typeof start === 'function') {
    await start();
  } else {
    console.error('startServer is not a function in dist/server.cjs');
    process.exit(1);
  }
} else {
  await import('./server.ts');
}
