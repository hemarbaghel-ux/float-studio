import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

process.env.FLOAT_WORKER_PROCESS = 'true';

import { orchestrator } from './src/server/agentOrchestrator';
import { hasAdminCredentials } from './src/server/adminFirebase';
import { isDurableFirestoreActive } from './src/server/durableState';

export interface WorkerLoopHandle {
  workerId: string;
  stop: () => Promise<{ requeuedTaskIds: string[] }>;
}

/**
 * Starts the FLOAT background agent worker loop.
 * Claims queued tasks transactionally (`claimQueuedAgentTask`), maintains project leases
 * and heartbeats (`heartbeatAgentTask`), and executes agent tasks outside the web request cycle.
 */
export function startBackgroundAgentWorkerLoop(options: {
  pollIntervalMs?: number;
  recoveryIntervalMs?: number;
} = {}): WorkerLoopHandle {
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const recoveryIntervalMs = options.recoveryIntervalMs ?? 30_000;

  let stopped = false;
  let pollInFlight = false;

  const tick = async () => {
    if (stopped || pollInFlight) return;
    if (!hasAdminCredentials() && !isDurableFirestoreActive()) return;
    pollInFlight = true;
    try {
      await orchestrator.pollQueuedTasksOnce();
    } catch (err: any) {
      console.error('[FLOAT Worker] Error polling queued tasks:', err?.message || err);
    } finally {
      pollInFlight = false;
    }
  };

  const recover = async () => {
    if (stopped) return;
    if (!hasAdminCredentials() && !isDurableFirestoreActive()) return;
    try {
      await orchestrator.recoverDurableTasks();
    } catch (err: any) {
      console.error('[FLOAT Worker] Error recovering interrupted tasks:', err?.message || err);
    }
  };

  void recover();
  void tick();

  const pollTimer = setInterval(() => {
    void tick();
  }, pollIntervalMs);
  pollTimer.unref?.();

  const recoveryTimer = setInterval(() => {
    void recover();
  }, recoveryIntervalMs);
  recoveryTimer.unref?.();

  return {
    workerId: orchestrator.getWorkerId(),
    stop: async () => {
      stopped = true;
      clearInterval(pollTimer);
      clearInterval(recoveryTimer);
      return orchestrator.gracefulShutdownWorker();
    }
  };
}

const isMainModule = Boolean(
  process.argv[1] && /(?:^|[\\/])(worker\.ts|worker\.cjs)$/.test(process.argv[1])
);

if (isMainModule) {
  console.log(`[FLOAT Worker] Starting background agent worker (workerId=${orchestrator.getWorkerId()})...`);
  const handle = startBackgroundAgentWorkerLoop();

  const shutdown = async (signal: string) => {
    console.log(`[FLOAT Worker] Received ${signal}. Requeuing active tasks and shutting down gracefully...`);
    const { requeuedTaskIds } = await handle.stop();
    if (requeuedTaskIds.length > 0) {
      console.log(`[FLOAT Worker] Requeued ${requeuedTaskIds.length} active task(s): ${requeuedTaskIds.join(', ')}`);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
