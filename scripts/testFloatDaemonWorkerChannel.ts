import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  FloatDaemonWorkerChannel,
  IFloatDaemonWorkerClient,
  IFloatDaemonWorkerServer
} from '../daemon/src/server/floatDaemonWorkerChannel.ts';

class FakeDaemonServer implements IFloatDaemonWorkerServer {
  public startCount = 0;
  public stopCount = 0;
  constructor(private readonly _pipePath: string) {}
  public async start(): Promise<void> { this.startCount++; }
  public async stop(): Promise<void> { this.stopCount++; }
  public getPipePath(): string { return this._pipePath; }
}

class FakeDaemonClient implements IFloatDaemonWorkerClient {
  public connected = false;
  public disposed = false;
  public calls: Array<{ method: string; params: unknown; timeoutMs: number }> = [];
  public async connect(): Promise<void> { this.connected = true; }
  public async ping(): Promise<{ status: string }> { return { status: 'ok' }; }
  public async call<T>(method: string, params: unknown = {}, timeoutMs = 30_000): Promise<T> {
    this.calls.push({ method, params, timeoutMs });
    return { method, params } as T;
  }
  public dispose(): void { this.disposed = true; this.connected = false; }
}

async function main(): Promise<void> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'float-worker-tests-'));
  try {
    const servers: FakeDaemonServer[] = [];
    const clients: FakeDaemonClient[] = [];
    let sandboxExecutionEnabled: boolean | undefined;
    const channel = new FloatDaemonWorkerChannel(
      options => {
        sandboxExecutionEnabled = options.allowSandboxExecution;
        const server = new FakeDaemonServer(options.pipeName || '');
        servers.push(server);
        return server;
      },
      () => {
        const client = new FakeDaemonClient();
        clients.push(client);
        return client;
      }
    );

    const started = await channel.call<{ status: string; pid: number }>('test-window', 'start', {
      workspaceId: 'test-workspace-identity',
      instanceId: '12345678-abcd-1234-abcd-123456789012'
    });
    assert.equal(started.status, 'running');
    assert.equal(started.pid, process.pid);
    assert.equal(servers.length, 1);
    assert.equal(servers[0].startCount, 1);
    assert.equal(clients.length, 1);
    assert.equal(clients[0].connected, true);
    assert.equal(sandboxExecutionEnabled, false, 'managed runtime must not enable legacy shadow/toolchain execution');

    const status = await channel.call<{ status: string; pid: number }>('test-window', 'status');
    assert.equal(status.status, 'running');
    assert.equal(status.pid, process.pid);

    const removeResult = await channel.call<{ method: string }>('test-window', 'callDaemon', {
      method: 'semantic_remove_file',
      params: { filePath: 'src/old.ts' }
    });
    assert.equal(removeResult.method, 'semantic_remove_file');

    const listResult = await channel.call<{ method: string }>('test-window', 'callDaemon', {
      method: 'semantic_list_indexed_files',
      params: {}
    });
    assert.equal(listResult.method, 'semantic_list_indexed_files');

    const callResult = await channel.call<{ method: string }>('test-window', 'callDaemon', {
      method: 'semantic_search',
      params: { query: 'workspace resolver', topK: 8 },
      timeoutMs: 10_000
    });
    assert.equal(callResult.method, 'semantic_search');
    assert.equal(clients[0].calls.find(call => call.method === 'semantic_search')?.timeoutMs, 10_000);

    for (const blockedMethod of ['run_shadow_toolchain', 'semantic_persist_index', 'semantic_load_index', 'shadow_create_cow_workspace']) {
      await assert.rejects(
        () => channel.call('test-window', 'callDaemon', { method: blockedMethod, params: {} }),
        /not available/
      );
    }
    await assert.rejects(
      () => channel.call('test-window', 'callDaemon', { method: 'semantic_search', params: {}, timeoutMs: 999_999 }),
      /timeoutMs/
    );

    const idempotent = await channel.call<{ status: string }>('test-window', 'start', {
      workspaceId: 'test-workspace-identity',
      instanceId: '12345678-abcd-1234-abcd-123456789012'
    });
    assert.equal(idempotent.status, 'running');
    assert.equal(servers.length, 1);
    assert.equal(servers[0].startCount, 1);

    const restarted = await channel.call<{ pid: number }>('test-window', 'start', {
      workspaceId: 'another-workspace',
      instanceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    });
    assert.equal(servers[0].stopCount, 1, 'switching workspaces stops the previous daemon');
    assert.equal(clients[0].disposed, true);
    assert.equal(servers.length, 2);
    assert.equal(restarted.pid, process.pid);

    await channel.call('test-window', 'stop');
    assert.equal(servers[1].stopCount, 1);
    assert.equal(clients[1].disposed, true);
    assert.equal((await channel.call<{ status: string }>('test-window', 'status')).status, 'stopped');

    await channel.call('test-window', 'stop');
    await assert.rejects(
      () => channel.call('test-window', 'start', { workspaceId: '', instanceId: '12345678-abcd' }),
      /workspaceId/
    );
    await assert.rejects(
      () => channel.call('test-window', 'start', { workspaceId: 'workspace', instanceId: 'bad' }),
      /instanceId/
    );
    await assert.rejects(
      () => channel.call('test-window', 'unsupported-command'),
      /Unknown FLOAT daemon worker command/
    );

    console.log('FLOAT daemon worker channel: worker-owned pipes, health, RPC allowlist, workspace persistence identity and lifecycle passed.');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error('FLOAT daemon worker channel test failed:', error);
  process.exit(1);
});
