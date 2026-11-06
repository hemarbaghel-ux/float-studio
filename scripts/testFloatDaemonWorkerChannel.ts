import assert from 'node:assert/strict';
import { FloatDaemonWorkerChannel, IFloatDaemonWorkerServer } from '../daemon/src/server/floatDaemonWorkerChannel.ts';

class FakeDaemonServer implements IFloatDaemonWorkerServer {
  public startCount = 0;
  public stopCount = 0;
  constructor(private readonly _pipePath: string) {}
  public async start(): Promise<void> { this.startCount++; }
  public async stop(): Promise<void> { this.stopCount++; }
  public getPipePath(): string { return this._pipePath; }
}

async function main(): Promise<void> {
  const servers: FakeDaemonServer[] = [];
  const channel = new FloatDaemonWorkerChannel(options => {
    const server = new FakeDaemonServer(options.pipeName || '');
    servers.push(server);
    return server;
  });

  const started = await channel.call<{ status: string; pipeName: string }>('test-window', 'start', {
    pipeName: '/tmp/float-worker-test.sock',
    storageDir: '/tmp/float-index-test'
  });
  assert.equal(started.status, 'running');
  assert.equal(started.pipeName, '/tmp/float-worker-test.sock');
  assert.equal(servers.length, 1);
  assert.equal(servers[0].startCount, 1);

  await channel.call('test-window', 'start', {
    pipeName: '/tmp/float-worker-test.sock',
    storageDir: '/tmp/float-index-test'
  });
  assert.equal(servers.length, 1, 'same configuration must be idempotent');
  assert.equal(servers[0].startCount, 1);

  const status = await channel.call<{ status: string; pid: number }>('test-window', 'status');
  assert.equal(status.status, 'running');
  assert.equal(status.pid, process.pid);

  const restarted = await channel.call<{ pipeName: string }>('test-window', 'start', {
    pipeName: '/tmp/float-worker-next.sock',
    storageDir: '/tmp/float-index-next'
  });
  assert.equal(servers[0].stopCount, 1, 'changing runtime paths stops the previous daemon');
  assert.equal(servers.length, 2);
  assert.equal(restarted.pipeName, '/tmp/float-worker-next.sock');

  await channel.call('test-window', 'stop');
  assert.equal(servers[1].stopCount, 1);
  assert.equal((await channel.call<{ status: string }>('test-window', 'status')).status, 'stopped');

  await channel.call('test-window', 'stop');
  await assert.rejects(() => channel.call('test-window', 'unsupported-command'), /Unknown FLOAT daemon worker command/);
  await assert.rejects(() => channel.call('test-window', 'start', { pipeName: '' }), /pipeName/);
  await assert.rejects(() => channel.call('test-window', 'start', { pipeName: '/tmp/valid.sock', storageDir: '../bad\\0path' }), /storageDir/);

  console.log('FLOAT daemon worker channel: start, idempotency, status, restart, stop and validation passed.');
}

main().catch(error => {
  console.error('FLOAT daemon worker channel test failed:', error);
  process.exit(1);
});
