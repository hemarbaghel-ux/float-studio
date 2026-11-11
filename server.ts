import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

// Load environment variables from .env.local and .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

import { initSentry, captureException } from './src/services/telemetry/sentry';

// Initialize Sentry error tracking if SENTRY_DSN is configured (zero overhead if unset)
initSentry();

/**
 * Checks whether an error is a known client request AbortError from an aborted HTTP/SSE stream.
 */
export function isKnownRequestAbortError(err: any): boolean {
  if (!err || typeof err !== 'object') return false;
  return (
    err.name === 'AbortError' &&
    (err.code === 'ABORT_ERR' ||
      typeof err.message === 'string' &&
      (err.message.includes('The operation was aborted') ||
        err.message.includes('This operation was aborted') ||
        err.message.includes('Request aborted')))
  );
}

process.on('unhandledRejection', (reason: any) => {
  if (isKnownRequestAbortError(reason)) {
    return;
  }
  console.error('[FLOAT Server] Unhandled Rejection:', reason);
  captureException(reason, { source: 'process.unhandledRejection' });
});

process.on('uncaughtException', (err: any) => {
  if (isKnownRequestAbortError(err)) {
    return;
  }
  // Allow EADDRINUSE retry logic in server.listen to recover without crashing process
  if (err?.code === 'EADDRINUSE') {
    console.warn('[FLOAT Server] EADDRINUSE encountered, allowing retry handler to recover.');
    return;
  }
  console.error('[FLOAT Server] Uncaught Exception:', err);
  captureException(err, { source: 'process.uncaughtException' });
});

let activeServer: any = null;
let activeShutdownFn: ((server?: any) => Promise<any>) | null = null;
let isShuttingDown = false;

export async function handleGracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n  🛑 Received ${signal}. Closing HTTP server and stopping active executions...`);

  const forceExitTimer = setTimeout(() => {
    process.exit(0);
  }, 5000);
  forceExitTimer.unref?.();

  try {
    if (activeShutdownFn) {
      const result = await activeShutdownFn(activeServer);
      console.log(
        `  ✓ Graceful shutdown complete (stoppedProcesses=${result?.stoppedProcesses ?? 0}).`
      );
    } else if (activeServer && typeof activeServer.close === 'function') {
      await new Promise<void>((resolve) => activeServer.close(() => resolve()));
    }
  } catch (shutdownErr) {
    console.error('[FLOAT Server] Error during graceful shutdown:', shutdownErr);
  } finally {
    clearTimeout(forceExitTimer);
    process.exit(0);
  }
}

process.on('SIGTERM', () => {
  void handleGracefulShutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void handleGracefulShutdown('SIGINT');
});

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
      activeShutdownFn = mod.gracefulShutdownServer || mod.default?.gracefulShutdownServer || null;
      if (typeof start === 'function') {
        activeServer = await start();
        return;
      }
    }
  }

  const appMod = await import('./src/server/app.ts');
  activeShutdownFn = appMod.gracefulShutdownServer;
  activeServer = await appMod.startServer();
}

if (process.argv[1] && /(?:^|[\\/])server\.ts$/.test(process.argv[1])) {
  bootstrap().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
