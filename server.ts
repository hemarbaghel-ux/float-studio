import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function bootstrap() {
  const distBundle = path.join(process.cwd(), 'dist', 'server.cjs');
  const isRunningWithTsx = process.execArgv.some(arg => arg.includes('tsx'));

  if (!isRunningWithTsx && fs.existsSync(distBundle)) {
    const mod = await import(pathToFileURL(distBundle).href);
    if (typeof mod.startServer === 'function') {
      await mod.startServer();
    }
  } else {
    const { startServer } = await import('./src/server/app.ts');
    await startServer();
  }
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
