import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

  originalConsoleError('Uncaught Exception:', err);
});

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
