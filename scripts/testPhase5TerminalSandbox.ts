/**
 * FLOAT AI - Phase 5 Verification: Real Terminal (xterm.js + node-pty in Docker Sandbox) & Agent Command Execution
 *
 * Verifies:
 * 1. Authentication & project ownership enforcement on HTTP and WebSocket `/api/terminal/:sessionId`
 * 2. Clear "terminal not configured" (`TERMINAL_NOT_CONFIGURED`) error with `setupSteps` when Docker or node-pty is unavailable
 * 3. Real PTY session spawning inside the Docker sandbox (`--network=none`, `--memory=512m`, `--cpus=1`, `--pids-limit=128`, `--read-only`, workspace mounted)
 * 4. Secret redaction (`sanitizeTerminalOutput`) on PTY output and agent command output
 * 5. Idle timeout and session/container cleanup
 * 6. Agent `run_command`:
 *    - `FLOAT_ENABLE_AGENT_COMMAND_EXECUTION` default off
 *    - Per-command approval required unless user chose Auto mode (`executionPolicy: 'auto'`)
 *    - Live output streaming to connected `/api/terminal/:sessionId` WebSocket clients
 */

import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdir, chmod, rm } from 'node:fs/promises';
import firebaseConfig from '../firebase-applet-config.json';
import { setGooglePublicKeysForTests } from '../src/server/authMiddleware';
import { setProjectLookupForTests } from '../src/server/projectOwnership';
import { createApp, resetEndpointRateLimitsForTests } from '../src/server/app';
import {
  attachTerminalWebSocketServer,
  setPtySpawnerForTests,
  setTerminalIdleTimeoutForTests,
  closeAllTerminalSessions,
  getActiveTerminalClientCount
} from '../src/server/terminal/terminalWsServer';
import { TerminalService } from '../src/server/terminal/terminalService';
import { ToolRegistry } from '../src/server/agent/toolRegistry';
import { ExecutionPolicyManager } from '../src/server/policy/executionPolicy';

function createSignedJwt(
  header: Record<string, any>,
  payload: Record<string, any>,
  privateKeyPem: string
): string {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${h}.${p}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  return `${data}.${signer.sign(privateKeyPem, 'base64url')}`;
}

function encodeClientTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const mask = crypto.randomBytes(4);
  const len = payload.byteLength;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.from([0x81, 0x80 | len]);
  } else {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  }
  const maskedPayload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    maskedPayload[i] = payload[i] ^ mask[i & 3];
  }
  return Buffer.concat([header, mask, maskedPayload]);
}

function decodeServerFrames(buffer: Buffer): { messages: any[]; closed: boolean; remaining: Buffer } {
  const messages: any[] = [];
  let closed = false;
  let offset = 0;
  while (offset + 2 <= buffer.byteLength) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    let len = second & 0x7f;
    let headerLen = 2;
    if (len === 126) {
      if (offset + 4 > buffer.byteLength) break;
      len = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (len === 127) {
      if (offset + 10 > buffer.byteLength) break;
      len = Number(buffer.readBigUInt64BE(offset + 2));
      headerLen = 10;
    }
    if (offset + headerLen + len > buffer.byteLength) break;
    const payload = buffer.subarray(offset + headerLen, offset + headerLen + len);
    if (opcode === 0x01) {
      try {
        messages.push(JSON.parse(payload.toString('utf8')));
      } catch {
        messages.push({ raw: payload.toString('utf8') });
      }
    } else if (opcode === 0x08) {
      closed = true;
    }
    offset += headerLen + len;
  }
  return { messages, closed, remaining: buffer.subarray(offset) };
}

async function openWsClient(
  port: number,
  urlPath: string,
  headers: Record<string, string> = {}
): Promise<{
  statusCode: number;
  socket: net.Socket;
  messages: any[];
  waitForMessage: (predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<any>;
  sendJson: (obj: any) => void;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    const wsKey = crypto.randomBytes(16).toString('base64');
    const messages: any[] = [];
    const waiters: Array<{ predicate: (m: any) => boolean; resolve: (m: any) => void }> = [];
    let upgraded = false;
    let rawBuf = Buffer.alloc(0);

    socket.once('connect', () => {
      const hdrLines = [
        `GET ${urlPath} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${wsKey}`,
        'Sec-WebSocket-Version: 13',
        ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
        '\r\n'
      ];
      socket.write(hdrLines.join('\r\n'));
    });

    const dispatchMessages = (newMsgs: any[]) => {
      for (const m of newMsgs) {
        messages.push(m);
        for (let i = waiters.length - 1; i >= 0; i--) {
          if (waiters[i].predicate(m)) {
            const w = waiters.splice(i, 1)[0];
            w.resolve(m);
          }
        }
      }
    };

    socket.on('data', (chunk: Buffer) => {
      rawBuf = Buffer.concat([rawBuf, chunk]);
      if (!upgraded) {
        const sepIdx = rawBuf.indexOf('\r\n\r\n');
        if (sepIdx === -1) return;
        const headerStr = rawBuf.subarray(0, sepIdx).toString('utf8');
        const statusMatch = headerStr.match(/^HTTP\/1\.1\s+(\d+)/);
        const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;
        rawBuf = rawBuf.subarray(sepIdx + 4);
        upgraded = true;

        if (statusCode !== 101) {
          resolve({
            statusCode,
            socket,
            messages,
            waitForMessage: async () => null,
            sendJson: () => {},
            close: () => socket.destroy()
          });
          return;
        }

        const decoded = decodeServerFrames(rawBuf);
        rawBuf = decoded.remaining;
        dispatchMessages(decoded.messages);

        resolve({
          statusCode: 101,
          socket,
          messages,
          waitForMessage: (predicate, timeoutMs = 4000) => {
            const existing = messages.find(predicate);
            if (existing) return Promise.resolve(existing);
            return new Promise((resWait, rejWait) => {
              const timer = setTimeout(() => rejWait(new Error('Timed out waiting for WebSocket message')), timeoutMs);
              waiters.push({
                predicate,
                resolve: (m) => {
                  clearTimeout(timer);
                  resWait(m);
                }
              });
            });
          },
          sendJson: (obj: any) => {
            socket.write(encodeClientTextFrame(JSON.stringify(obj)));
          },
          close: () => {
            try {
              socket.destroy();
            } catch {}
          }
        });
      } else {
        const decoded = decodeServerFrames(rawBuf);
        rawBuf = decoded.remaining;
        dispatchMessages(decoded.messages);
      }
    });

    socket.once('error', reject);
  });
}

async function runPhase5Tests() {
  console.log('=== FLOAT AI Phase 5 Verification: Real Terminal & Sandboxed Execution ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: unknown, name: string) {
    if (condition) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name}`);
      failed++;
    }
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const kid = 'phase5-terminal-kid';
  setGooglePublicKeysForTests({ [kid]: publicKey });
  setProjectLookupForTests(async (projId: string) => {
    if (projId === 'proj-alice-p5') {
      return {
        exists: true,
        data: {
          ownerId: 'user_alice_p5',
          name: 'Alice Project',
          files: [{ path: 'src/index.ts', type: 'file', content: 'console.log("hello");\n' }]
        }
      };
    }
    if (projId === 'proj-bob-p5') {
      return {
        exists: true,
        data: {
          ownerId: 'user_bob_p5',
          name: 'Bob Project',
          files: []
        }
      };
    }
    return { exists: false };
  });
  resetEndpointRateLimitsForTests();
  TerminalService.clear();

  const nowSec = Math.floor(Date.now() / 1000);
  const projectId = firebaseConfig.projectId;
  const issuer = `https://securetoken.google.com/${projectId}`;

  const aliceToken = createSignedJwt(
    { alg: 'RS256', kid, typ: 'JWT' },
    {
      iss: issuer,
      aud: projectId,
      sub: 'user_alice_p5',
      user_id: 'user_alice_p5',
      email: 'alice@float.dev',
      iat: nowSec - 60,
      exp: nowSec + 3600
    },
    privateKey
  );

  const bobToken = createSignedJwt(
    { alg: 'RS256', kid, typ: 'JWT' },
    {
      iss: issuer,
      aud: projectId,
      sub: 'user_bob_p5',
      user_id: 'user_bob_p5',
      email: 'bob@float.dev',
      iat: nowSec - 60,
      exp: nowSec + 3600
    },
    privateKey
  );

  const app = await createApp({ skipVite: true });
  const server: http.Server = await new Promise(resolve => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  attachTerminalWebSocketServer(server);
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const origEnv = {
    FLOAT_DOCKER_BIN: process.env.FLOAT_DOCKER_BIN,
    FLOAT_EXECUTION_IMAGE: process.env.FLOAT_EXECUTION_IMAGE,
    DOCKER_HOST: process.env.DOCKER_HOST,
    DOCKER_TLS_VERIFY: process.env.DOCKER_TLS_VERIFY,
    DOCKER_CERT_PATH: process.env.DOCKER_CERT_PATH,
    FLOAT_EXECUTION_SHARED_DIR: process.env.FLOAT_EXECUTION_SHARED_DIR,
    FLOAT_ENABLE_AGENT_COMMAND_EXECUTION: process.env.FLOAT_ENABLE_AGENT_COMMAND_EXECUTION
  };

  let tempSharedDir = '';

  try {
    // 1. Create a session for Alice
    console.log('--- 1. Authentication, Session Ownership & Unconfigured Terminal Error ---');
    const aliceSession = await TerminalService.createSessionDurable('proj-alice-p5', 'user_alice_p5', 'Alice Terminal');

    // Unauthenticated HTTP request -> 401
    const unauthHttp = await fetch(`${baseUrl}/api/terminal/${aliceSession.id}`);
    assert(unauthHttp.status === 401, 'GET /api/terminal/:sessionId rejects unauthenticated request with 401');

    // Cross-tenant HTTP request (Bob accessing Alice's terminal) -> 404
    const bobHttp = await fetch(`${baseUrl}/api/terminal/${aliceSession.id}`, {
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    assert(bobHttp.status === 404, 'GET /api/terminal/:sessionId blocks cross-tenant access (Bob cannot access Alice session)');

    // Unauthenticated WebSocket upgrade -> 401
    const unauthWs = await openWsClient(port, `/api/terminal/${aliceSession.id}`);
    assert(unauthWs.statusCode === 401, 'WebSocket /api/terminal/:sessionId rejects unauthenticated upgrade with 401');
    unauthWs.close();

    // Cross-tenant WebSocket upgrade -> 404
    const bobWs = await openWsClient(port, `/api/terminal/${aliceSession.id}`, {
      Authorization: `Bearer ${bobToken}`
    });
    assert(bobWs.statusCode === 404, 'WebSocket /api/terminal/:sessionId rejects cross-tenant upgrade with 404');
    bobWs.close();

    // Ensure Docker & node-pty are unconfigured -> HTTP 503 + WebSocket TERMINAL_NOT_CONFIGURED with setupSteps
    delete process.env.FLOAT_DOCKER_BIN;
    delete process.env.FLOAT_EXECUTION_IMAGE;
    setPtySpawnerForTests(null);

    const unconfHttp = await fetch(`${baseUrl}/api/terminal/${aliceSession.id}`, {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    const unconfJson = await unconfHttp.json();
    assert(
      unconfHttp.status === 503 &&
        unconfJson.configured === false &&
        unconfJson.code === 'TERMINAL_NOT_CONFIGURED' &&
        Array.isArray(unconfJson.setupSteps) &&
        unconfJson.setupSteps.length >= 2,
      'GET /api/terminal/:sessionId returns 503 TERMINAL_NOT_CONFIGURED with setupSteps when Docker/node-pty unavailable'
    );

    const unconfWs = await openWsClient(port, `/api/terminal/${aliceSession.id}?token=${encodeURIComponent(aliceToken)}`);
    assert(unconfWs.statusCode === 101, 'WebSocket handshake succeeds for authenticated owner');
    const errFrame = await unconfWs.waitForMessage(m => m.type === 'error');
    assert(
      errFrame &&
        errFrame.code === 'TERMINAL_NOT_CONFIGURED' &&
        /terminal not configured/i.test(errFrame.message) &&
        Array.isArray(errFrame.setupSteps) &&
        errFrame.setupSteps.length >= 2,
      'WebSocket /api/terminal/:sessionId emits TERMINAL_NOT_CONFIGURED frame with setupSteps when runtime unavailable'
    );
    unconfWs.close();

    // 2. Configure Docker sandbox environment + PTY spawner and test interactive PTY session & secret redaction
    console.log('\n--- 2. Real PTY inside Docker Sandbox, Secret Redaction & Session Cleanup ---');
    tempSharedDir = path.join(os.tmpdir(), `float-p5-shared-${Date.now()}`);
    await mkdir(tempSharedDir, { recursive: true, mode: 0o700 });
    await chmod(tempSharedDir, 0o700);

    process.env.FLOAT_DOCKER_BIN = '/usr/bin/docker';
    process.env.FLOAT_EXECUTION_IMAGE = 'node:20-alpine@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.DOCKER_HOST = 'tcp://127.0.0.1:2376';
    process.env.DOCKER_TLS_VERIFY = '1';
    process.env.DOCKER_CERT_PATH = tempSharedDir;
    process.env.FLOAT_EXECUTION_SHARED_DIR = tempSharedDir;

    let capturedDockerBin = '';
    let capturedDockerArgs: string[] = [];
    let ptyKilled = false;
    let dataListener: ((data: string) => void) | null = null;

    setPtySpawnerForTests((file, args) => {
      capturedDockerBin = file;
      capturedDockerArgs = args;
      return {
        pid: 4242,
        write(input: string) {
          if (input.includes('echo test')) {
            // Emit output containing a secret token to test redaction
            dataListener?.('Hello from sandbox! Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz\r\n');
          }
        },
        resize() {},
        kill() {
          ptyKilled = true;
        },
        onData(cb) {
          dataListener = cb;
        },
        onExit() {}
      };
    });

    const confHttp = await fetch(`${baseUrl}/api/terminal/${aliceSession.id}`, {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    const confJson = await confHttp.json();
    assert(confHttp.status === 200 && confJson.configured === true, 'GET /api/terminal/:sessionId returns 200 configured:true when Docker sandbox + node-pty are ready');

    const ptyWs = await openWsClient(port, `/api/terminal/${aliceSession.id}?token=${encodeURIComponent(aliceToken)}`);
    const connectedMsg = await ptyWs.waitForMessage(m => m.type === 'connected');
    assert(Boolean(connectedMsg && connectedMsg.sessionId === aliceSession.id), 'WebSocket emits connected event with sessionId');
    assert(
      capturedDockerBin === '/usr/bin/docker' &&
        capturedDockerArgs.includes('--network=none') &&
        capturedDockerArgs.includes('--memory=512m') &&
        capturedDockerArgs.includes('--cpus=1') &&
        capturedDockerArgs.includes('--pids-limit=128') &&
        capturedDockerArgs.includes('--read-only') &&
        capturedDockerArgs.some(a => a.includes('type=bind,') && a.includes(',dst=/workspace')),
      'PTY spawns inside Docker sandbox with network=none, memory/CPU/PID limits, read-only root, and mounted workspace'
    );

    ptyWs.sendJson({ type: 'input', data: 'echo test\n' });
    const outMsg = await ptyWs.waitForMessage(m => m.type === 'output');
    assert(
      outMsg &&
        outMsg.data.includes('Hello from sandbox!') &&
        outMsg.data.includes('[REDACTED_SECRET]') &&
        !outMsg.data.includes('ghp_1234567890abcdefghijklmnopqrstuvwxyz'),
      'PTY output redacts sensitive tokens before sending to browser'
    );

    // 3. Agent run_command: default off, per-command approval vs Auto mode, and live output streaming to terminal WebSocket
    console.log('\n--- 3. Agent run_command: Default Off, Per-Command Approval vs Auto Mode & Live Terminal Streaming ---');
    delete process.env.FLOAT_ENABLE_AGENT_COMMAND_EXECUTION;
    const virtualFiles = new Map<string, { path: string; name?: string; content?: string; type: string }>();
    virtualFiles.set('src/index.ts', { path: 'src/index.ts', content: 'export const ok = true;\n', type: 'file' });

    const defaultOffRes = await ToolRegistry.execute('run_command', { command: 'npm test' }, {
      userId: 'user_alice_p5',
      projectId: 'proj-alice-p5',
      projectName: 'Alice Project',
      virtualFiles
    });
    assert(
      !defaultOffRes.success && defaultOffRes.output?.outcome === 'command_unavailable',
      'Agent run_command keeps FLOAT_ENABLE_AGENT_COMMAND_EXECUTION default off'
    );

    // Enable FLOAT_ENABLE_AGENT_COMMAND_EXECUTION
    process.env.FLOAT_ENABLE_AGENT_COMMAND_EXECUTION = 'true';

    // Non-auto mode requires per-command user approval when requireCommandApproval is set or command is custom
    const needsApprovalRes = await ToolRegistry.execute('run_command', { command: 'node custom-script.js' }, {
      userId: 'user_alice_p5',
      projectId: 'proj-alice-p5',
      projectName: 'Alice Project',
      virtualFiles,
      sandboxExecutor: async () => ({ status: 'succeeded', exitCode: 0, durationMs: 12, stdout: 'ok', stderr: '' })
    });
    assert(
      !needsApprovalRes.success && needsApprovalRes.output?.outcome === 'requires_approval',
      'Agent run_command requires per-command user approval when not in Auto mode'
    );

    // Auto mode executes without per-command prompt and streams live output to connected terminal WebSocket!
    ExecutionPolicyManager.setPolicyMode('user_alice_p5', 'auto');
    const autoModeRes = await ToolRegistry.execute('run_command', { command: 'node custom-script.js' }, {
      userId: 'user_alice_p5',
      projectId: 'proj-alice-p5',
      projectName: 'Alice Project',
      virtualFiles,
      sandboxExecutor: async () => ({
        status: 'succeeded',
        exitCode: 0,
        durationMs: 25,
        stdout: 'Live agent output with secret sk-proj-1234567890abcdefghijklmnopqrstuv\n',
        stderr: ''
      })
    });
    assert(
      autoModeRes.success && autoModeRes.output?.outcome === 'sandbox_passed',
      'Agent run_command executes automatically in sandbox when user chose Auto mode'
    );

    const liveAgentStart = await ptyWs.waitForMessage(m => m.type === 'agent_command_started');
    const liveAgentOut = await ptyWs.waitForMessage(m => m.type === 'output' && m.source === 'agent_run_command');
    const liveAgentDone = await ptyWs.waitForMessage(m => m.type === 'agent_command_completed');
    assert(
      Boolean(liveAgentStart && liveAgentOut && liveAgentDone) &&
        liveAgentOut.data.includes('Live agent output') &&
        liveAgentOut.data.includes('[REDACTED_SECRET]') &&
        !liveAgentOut.data.includes('sk-proj-1234567890abcdefghijklmnopqrstuv'),
      'Agent run_command streams live started/output/completed events (with secret redaction) to connected terminal UI'
    );

    ptyWs.close();
    await new Promise(r => setTimeout(r, 80));
    assert(ptyKilled && getActiveTerminalClientCount() === 0, 'Closing WebSocket kills PTY process and cleans up active session');

    // 4. Idle timeout enforcement
    console.log('\n--- 4. Idle Timeout & Automatic Cleanup ---');
    setTerminalIdleTimeoutForTests(180);
    const idleWs = await openWsClient(port, `/api/terminal/${aliceSession.id}?token=${encodeURIComponent(aliceToken)}`);
    await idleWs.waitForMessage(m => m.type === 'connected');
    const timeoutMsg = await idleWs.waitForMessage(m => m.type === 'error' && m.code === 'IDLE_TIMEOUT', 2000);
    assert(
      Boolean(timeoutMsg && timeoutMsg.code === 'IDLE_TIMEOUT'),
      'Terminal WebSocket automatically emits IDLE_TIMEOUT and cleans up after inactivity'
    );
    idleWs.close();
  } finally {
    setTerminalIdleTimeoutForTests(null);
    setPtySpawnerForTests(null);
    setProjectLookupForTests(null);
    ExecutionPolicyManager.clearCacheForTests();
    await closeAllTerminalSessions();
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (tempSharedDir) {
      await rm(tempSharedDir, { recursive: true, force: true }).catch(() => undefined);
    }
    setGooglePublicKeysForTests(null);
    await new Promise<void>(resolve => server.close(() => resolve()));
  }

  console.log('\n==================================================');
  console.log(`Phase 5 Summary: ${passed} passed, ${failed} failed.`);
  console.log('==================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runPhase5Tests().catch(err => {
  console.error('Fatal error in Phase 5 tests:', err);
  process.exit(1);
});
