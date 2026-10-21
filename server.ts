import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

// Load environment variables from .env.local and .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

// Server-wide resilience: intercept benign client cancellation signals
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const msg = args.map(a => typeof a === 'string' ? a : (a?.message || a?.msg || JSON.stringify(a || ''))).join(' ');
  if (
    msg.includes('operation is manually canceled') ||
    msg.includes('cancelation') ||
    msg.includes('Disconnecting idle stream') ||
    msg.includes('Timed out waiting for new targets') ||
    msg.includes("GrpcConnection RPC 'Listen' stream")
  ) {
    return;
  }
  originalConsoleError.apply(console, args);
};

process.on('unhandledRejection', (reason: any) => {
  const reasonStr = typeof reason === 'string'
    ? reason
    : (reason?.message || reason?.msg || JSON.stringify(reason || ''));

  const isCancellation =
    reason?.type === 'cancelation' ||
    reason?.type === 'cancelled' ||
    reason?.name === 'AbortError' ||
    reasonStr.includes('operation is manually canceled') ||
    reasonStr.includes('cancelation') ||
    /cancel/i.test(reasonStr);

  if (isCancellation) {
    return;
  }

  originalConsoleError('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err: any) => {
  const errStr = typeof err === 'string'
    ? err
    : (err?.message || err?.msg || JSON.stringify(err || ''));

  const isCancellation =
    err?.type === 'cancelation' ||
    err?.type === 'cancelled' ||
    err?.name === 'AbortError' ||
    errStr.includes('operation is manually canceled') ||
    errStr.includes('cancelation') ||
    /cancel/i.test(errStr);

  if (isCancellation) {
    return;
  }

  // Allow EADDRINUSE retry logic in server.listen to recover without crashing process
  if (err?.code === 'EADDRINUSE') {
    console.warn('EADDRINUSE encountered, allowing retry handler to recover.');
    return;
  }

  originalConsoleError('Uncaught Exception:', err);
});

let isShuttingDown = false;
function handleGracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n  🛑 Received ${signal}. Shutting down FLOAT AI Studio gracefully...`);
  setTimeout(() => {
    process.exit(0);
  }, 250).unref();
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

async function bootstrap() {
  console.log('\n  🚀 Starting FLOAT AI Studio...');
  const distBundle = path.join(process.cwd(), 'dist', 'server.cjs');
  const isRunningWithTsx = process.execArgv.some(arg => arg.includes('tsx')) || process.argv.some(arg => arg.includes('tsx'));

  // Load compiled CJS bundle in production deployment (when dist bundle exists and not running under tsx)
  if (!isRunningWithTsx) {
    if (!fs.existsSync(distBundle)) {
      try {
        console.log('  📦 Pre-compiling server bundle (dist/server.cjs)...');
        const { execSync } = await import('node:child_process');
        execSync('npx esbuild src/server/app.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs', { stdio: 'inherit' });
      } catch (buildErr) {
        console.warn('  ⚠️ On-the-fly server bundle build failed, falling back to source import:', buildErr);
      }
    }

    if (fs.existsSync(distBundle)) {
      console.log('  📦 Loading production bundle (dist/server.cjs)...');
      process.env.NODE_ENV = process.env.NODE_ENV || 'production';
      const mod = await import(pathToFileURL(distBundle).href);
      const start = mod.startServer || mod.default?.startServer;
      if (typeof start === 'function') {
        await start();
        return;
      }
    }
  }

  const { startServer } = await import('./src/server/app.ts');
  await startServer();
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
