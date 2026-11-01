/**
 * FLOAT AI - Real Terminal WebSocket & PTY Docker Sandbox Manager (Phase 5)
 *
 * Exposes `/api/terminal/:sessionId` (WebSocket upgrade + HTTP status endpoint):
 * - Authenticates caller via Firebase ID token (`Authorization: Bearer` or `?token=`)
 * - Verifies session ownership (`TerminalService.getSessionDurable`) and project ownership (`verifyProjectOwnership`)
 * - Attaches an xterm.js client in `BottomPanel.tsx` to a real PTY (`node-pty`) running inside
 *   the isolated Docker sandbox from `processManager.ts` (network off, CPU/memory/pids limits,
 *   read-only root, workspace mounted)
 * - If Docker or `node-pty` is unavailable, returns a clear `"terminal not configured"` error
 *   (`TERMINAL_NOT_CONFIGURED`) with actionable setup steps
 * - Streams live output from agent `run_command` executions into connected terminal sessions
 * - Enforces idle timeouts, session cleanup, and output secret redaction (`sanitizeTerminalOutput`)
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { Duplex } from 'node:stream';
import { verifyFirebaseIdToken } from '../authMiddleware';
import { verifyProjectOwnership } from '../projectOwnership';
import { projectProcessManager, ExecutionEvent, ExecutionFile } from '../execution/processManager';
import { TerminalService, sanitizeTerminalOutput } from './terminalService';

export interface PtyProcessLike {
  pid?: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): { dispose?: () => void } | void;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose?: () => void } | void;
}

export type PtySpawnerFn = (
  file: string,
  args: string[],
  options: {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  }
) => Promise<PtyProcessLike> | PtyProcessLike;

export const TERMINAL_SETUP_STEPS: string[] = [
  'Install the native PTY driver on the server host: npm install node-pty',
  'Configure the isolated Docker sandbox environment variables: FLOAT_DOCKER_BIN, FLOAT_EXECUTION_IMAGE (pinned @sha256 digest), DOCKER_HOST (tcp://...), DOCKER_TLS_VERIFY=1, DOCKER_CERT_PATH, and FLOAT_EXECUTION_SHARED_DIR (0700 mode).',
  'Restart the FLOAT server to enable interactive sandboxed PTY sessions.'
];

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

let customPtySpawnerForTests: PtySpawnerFn | null = null;
let customIdleTimeoutMsForTests: number | null = null;

export function setPtySpawnerForTests(spawner: PtySpawnerFn | null): void {
  customPtySpawnerForTests = spawner;
}

export function setTerminalIdleTimeoutForTests(timeoutMs: number | null): void {
  customIdleTimeoutMsForTests = timeoutMs;
}

function getEffectiveIdleTimeoutMs(): number {
  if (typeof customIdleTimeoutMsForTests === 'number' && customIdleTimeoutMsForTests > 0) {
    return customIdleTimeoutMsForTests;
  }
  const envVal = Number(process.env.FLOAT_TERMINAL_IDLE_TIMEOUT_MS);
  if (Number.isFinite(envVal) && envVal >= 100) {
    return envVal;
  }
  return DEFAULT_IDLE_TIMEOUT_MS;
}

async function resolveNodePtySpawner(): Promise<PtySpawnerFn | null> {
  if (customPtySpawnerForTests) {
    return customPtySpawnerForTests;
  }
  try {
    const ptyModuleName = 'node-pty';
    const mod: any = await import(/* @vite-ignore */ ptyModuleName);
    const spawnPty = mod?.spawn || mod?.default?.spawn;
    if (typeof spawnPty === 'function') {
      return (file, args, options) => spawnPty(file, args, options);
    }
    return null;
  } catch {
    return null;
  }
}

export async function checkTerminalRuntimeStatus(): Promise<{
  configured: boolean;
  dockerSandboxAvailable: boolean;
  nodePtyAvailable: boolean;
  code?: 'TERMINAL_NOT_CONFIGURED';
  error?: string;
  setupSteps?: string[];
}> {
  const dockerSandboxAvailable = projectProcessManager.available;
  const ptySpawner = await resolveNodePtySpawner();
  const nodePtyAvailable = Boolean(ptySpawner);

  if (!dockerSandboxAvailable || !nodePtyAvailable) {
    const missingParts: string[] = [];
    if (!dockerSandboxAvailable) missingParts.push('Docker sandbox (processManager)');
    if (!nodePtyAvailable) missingParts.push('node-pty');
    return {
      configured: false,
      dockerSandboxAvailable,
      nodePtyAvailable,
      code: 'TERMINAL_NOT_CONFIGURED',
      error: `Terminal not configured: ${missingParts.join(' and ')} unavailable on this host.`,
      setupSteps: TERMINAL_SETUP_STEPS
    };
  }

  return {
    configured: true,
    dockerSandboxAvailable: true,
    nodePtyAvailable: true
  };
}

interface ConnectedTerminalClient {
  id: string;
  sessionId: string;
  userId: string;
  projectId: string;
  socket: Duplex;
  sendJson: (payload: Record<string, any>) => void;
  close: (code?: number, reason?: string) => void;
  cleanup: () => Promise<void>;
}

const activeClients = new Map<string, ConnectedTerminalClient>();

export function getActiveTerminalClientCount(): number {
  return activeClients.size;
}

export async function closeAllTerminalSessions(): Promise<void> {
  const clients = Array.from(activeClients.values());
  activeClients.clear();
  for (const client of clients) {
    await client.cleanup().catch(() => undefined);
    try {
      client.close(1001, 'Server shutting down');
    } catch {
      // Ignore socket close error
    }
  }
}

/**
 * Broadcasts live output from agent `run_command` or `projectProcessManager` executions
 * to any connected terminal WebSocket clients for `(ownerId, projectId)` and records
 * sanitized output in `TerminalService`.
 */
export function broadcastLiveExecutionToTerminals(info: {
  ownerId: string;
  projectId: string;
  command: string;
  event: ExecutionEvent;
}): void {
  const { ownerId, projectId, command, event } = info;
  for (const client of activeClients.values()) {
    if (client.userId !== ownerId || client.projectId !== projectId) continue;

    if (event.type === 'started') {
      const cleanCmd = sanitizeTerminalOutput(command);
      client.sendJson({
        type: 'agent_command_started',
        executionId: event.executionId,
        command: cleanCmd,
        data: `\r\n\x1b[36m[Agent run_command]\x1b[0m $ ${cleanCmd}\r\n`
      });
    } else if (event.type === 'output') {
      const sanitized = sanitizeTerminalOutput(event.text);
      client.sendJson({
        type: 'output',
        stream: event.stream,
        source: 'agent_run_command',
        data: sanitized
      });
    } else if (event.type === 'completed') {
      client.sendJson({
        type: 'agent_command_completed',
        status: event.status,
        exitCode: event.exitCode,
        durationMs: event.durationMs,
        data: `\r\n\x1b[90m[Agent command ${event.status} (exit: ${event.exitCode ?? 'null'}, ${event.durationMs}ms)]\x1b[0m\r\n`
      });
    } else if (event.type === 'error') {
      const sanitizedMsg = sanitizeTerminalOutput(event.message);
      client.sendJson({
        type: 'output',
        stream: 'stderr',
        source: 'agent_run_command',
        data: `\r\n\x1b[31m[Agent command error] ${sanitizedMsg}\x1b[0m\r\n`
      });
    }
  }
}

// Subscribe once to ProjectProcessManager live events so all sandboxed runs broadcast to UI
projectProcessManager.onLiveExecutionEvent(info => {
  broadcastLiveExecutionToTerminals(info);
});

/**
 * Encodes a UTF-8 text payload into an RFC 6455 unmasked server-to-client WebSocket text frame.
 */
function encodeWsTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.byteLength;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + opcode 1 (text)
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function encodeWsCloseFrame(code = 1000, reason = ''): Buffer {
  const reasonBuf = Buffer.from(reason.slice(0, 120), 'utf8');
  const payload = Buffer.alloc(2 + reasonBuf.byteLength);
  payload.writeUInt16BE(code, 0);
  reasonBuf.copy(payload, 2);
  const header = Buffer.from([0x88, payload.byteLength]);
  return Buffer.concat([header, payload]);
}

function encodeWsPongFrame(payload: Buffer = Buffer.alloc(0)): Buffer {
  const safePayload = payload.subarray(0, 125);
  const header = Buffer.from([0x8a, safePayload.byteLength]);
  return Buffer.concat([header, safePayload]);
}

/**
 * Decodes incoming RFC 6455 masked client-to-server frames from a buffer.
 */
function decodeWsFrames(buffer: Buffer): {
  frames: Array<{ opcode: number; payload: Buffer }>;
  remaining: Buffer;
} {
  const frames: Array<{ opcode: number; payload: Buffer }> = [];
  let offset = 0;

  while (offset + 2 <= buffer.byteLength) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const opcode = firstByte & 0x0f;
    const isMasked = (secondByte & 0x80) !== 0;
    let payloadLen = secondByte & 0x7f;
    let headerLen = 2;

    if (payloadLen === 126) {
      if (offset + 4 > buffer.byteLength) break;
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (offset + 10 > buffer.byteLength) break;
      const bigLen = buffer.readBigUInt64BE(offset + 2);
      if (bigLen > BigInt(2 * 1024 * 1024)) {
        throw new Error('WebSocket frame exceeds maximum allowed size.');
      }
      payloadLen = Number(bigLen);
      headerLen = 10;
    }

    const maskLen = isMasked ? 4 : 0;
    const totalFrameLen = headerLen + maskLen + payloadLen;
    if (offset + totalFrameLen > buffer.byteLength) break;

    const maskOffset = offset + headerLen;
    const dataOffset = maskOffset + maskLen;
    const payload = Buffer.alloc(payloadLen);
    buffer.copy(payload, 0, dataOffset, dataOffset + payloadLen);

    if (isMasked) {
      const mask = buffer.subarray(maskOffset, maskOffset + 4);
      for (let i = 0; i < payloadLen; i++) {
        payload[i] ^= mask[i & 3];
      }
    }

    frames.push({ opcode, payload });
    offset += totalFrameLen;
  }

  return {
    frames,
    remaining: buffer.subarray(offset)
  };
}

function extractBearerTokenFromUpgrade(req: http.IncomingMessage, parsedUrl: URL): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const queryToken = parsedUrl.searchParams.get('token');
  if (queryToken && queryToken.trim()) {
    return queryToken.trim();
  }
  const protoHeader = req.headers['sec-websocket-protocol'];
  if (typeof protoHeader === 'string') {
    const parts = protoHeader.split(',').map(p => p.trim());
    if (parts.length >= 2 && parts[0].toLowerCase() === 'bearer' && parts[1]) {
      return parts[1];
    }
  }
  return null;
}

function writeUpgradeHttpError(socket: Duplex, status: number, statusText: string, bodyObj: Record<string, any>): void {
  try {
    const body = JSON.stringify(bodyObj);
    const response =
      `HTTP/1.1 ${status} ${statusText}\r\n` +
      `Content-Type: application/json; charset=utf-8\r\n` +
      `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n` +
      `Connection: close\r\n\r\n` +
      body;
    socket.write(response);
  } catch {
    // Ignore write failure
  } finally {
    try {
      socket.destroy();
    } catch {
      // Ignore
    }
  }
}

/**
 * Attaches the `/api/terminal/:sessionId` WebSocket upgrade listener to a Node `http.Server`.
 */
export function attachTerminalWebSocketServer(server: http.Server): void {
  server.on('upgrade', async (req: http.IncomingMessage, socket: Duplex, _head: Buffer) => {
    try {
      const rawUrl = req.url || '/';
      const parsedUrl = new URL(rawUrl, 'http://localhost');
      const match = parsedUrl.pathname.match(/^\/api\/terminal\/([^/]+)\/?$/);
      if (!match) {
        return; // Let other upgrade handlers (if any) handle non-terminal paths
      }

      const sessionId = decodeURIComponent(match[1]);
      const wsKey = req.headers['sec-websocket-key'];
      if (!wsKey || typeof wsKey !== 'string') {
        writeUpgradeHttpError(socket, 400, 'Bad Request', { error: 'Missing Sec-WebSocket-Key header.' });
        return;
      }

      // 1. Authenticate user
      const token = extractBearerTokenFromUpgrade(req, parsedUrl);
      if (!token) {
        writeUpgradeHttpError(socket, 401, 'Unauthorized', { error: 'Authentication required. Missing Bearer token.' });
        return;
      }

      let user: { uid: string; email?: string } | null = null;
      try {
        user = await verifyFirebaseIdToken(token);
      } catch {
        writeUpgradeHttpError(socket, 503, 'Service Unavailable', { error: 'Authentication verification temporarily unavailable.' });
        return;
      }

      if (!user) {
        writeUpgradeHttpError(socket, 401, 'Unauthorized', { error: 'Invalid or expired authentication token.' });
        return;
      }

      // 2. Verify terminal session & project ownership
      const requestedProjectId = parsedUrl.searchParams.get('projectId')?.trim();
      let session = await TerminalService.getSessionDurable(sessionId, user.uid);

      if (!session && requestedProjectId) {
        // Check if another user owns a persisted project with this projectId
        const ownership = await verifyProjectOwnership(requestedProjectId, user.uid, { allowMissing: true });
        if (!ownership.allowed) {
          writeUpgradeHttpError(socket, ownership.status, 'Forbidden', { error: ownership.error || 'Forbidden project access.' });
          return;
        }
        session = await TerminalService.createSessionDurable(requestedProjectId, user.uid, `Terminal (${sessionId})`);
      }

      if (!session) {
        writeUpgradeHttpError(socket, 404, 'Not Found', { error: 'Terminal session not found or access denied.' });
        return;
      }

      const ownership = await verifyProjectOwnership(session.projectId, user.uid, { allowMissing: true });
      if (!ownership.allowed) {
        writeUpgradeHttpError(socket, ownership.status, 'Forbidden', { error: ownership.error || 'Unauthorized project access.' });
        return;
      }

      // 3. Complete RFC 6455 WebSocket Handshake
      const acceptKey = crypto.createHash('sha1').update(wsKey + WS_GUID).digest('base64');
      const handshakeHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        '\r\n'
      ].join('\r\n');
      socket.write(handshakeHeaders);

      const sendJson = (payload: Record<string, any>) => {
        if (socket.destroyed || !socket.writable) return;
        try {
          socket.write(encodeWsTextFrame(JSON.stringify(payload)));
        } catch {
          // Ignore write errors on closing sockets
        }
      };

      const closeWs = (code = 1000, reason = '') => {
        if (socket.destroyed) return;
        try {
          socket.write(encodeWsCloseFrame(code, reason));
          socket.end();
        } catch {
          socket.destroy();
        }
      };

      // 4. Check Docker sandbox + node-pty availability
      const runtimeStatus = await checkTerminalRuntimeStatus();
      if (!runtimeStatus.configured) {
        sendJson({
          type: 'error',
          code: 'TERMINAL_NOT_CONFIGURED',
          message: runtimeStatus.error || 'Terminal not configured: Docker sandbox or node-pty is unavailable.',
          setupSteps: runtimeStatus.setupSteps || TERMINAL_SETUP_STEPS
        });
        closeWs(1011, 'Terminal not configured');
        return;
      }

      // 5. Spawn isolated PTY inside Docker sandbox
      const ptySpawner = await resolveNodePtySpawner();
      if (!ptySpawner) {
        sendJson({
          type: 'error',
          code: 'TERMINAL_NOT_CONFIGURED',
          message: 'Terminal not configured: node-pty is unavailable.',
          setupSteps: TERMINAL_SETUP_STEPS
        });
        closeWs(1011, 'Terminal not configured');
        return;
      }

      const clientId = `ws-term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const containerName = `float-pty-${session.id.replace(/[^a-zA-Z0-9_-]/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
      let workspaceRoot = '';
      let ptyProcess: PtyProcessLike | null = null;
      let cleanedUp = false;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = async () => {
        if (cleanedUp) return;
        cleanedUp = true;
        activeClients.delete(clientId);
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
        if (ptyProcess) {
          try {
            ptyProcess.kill('SIGTERM');
          } catch {
            // Ignore
          }
          ptyProcess = null;
        }
        if (process.env.FLOAT_DOCKER_BIN) {
          try {
            const killer = spawn(process.env.FLOAT_DOCKER_BIN, ['kill', containerName], {
              stdio: 'ignore',
              windowsHide: true
            });
            killer.on('error', () => undefined);
            killer.unref?.();
          } catch {
            // Ignore
          }
        }
        if (workspaceRoot) {
          await rm(workspaceRoot, { recursive: true, force: true }).catch(() => undefined);
          workspaceRoot = '';
        }
      };

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        const timeoutMs = getEffectiveIdleTimeoutMs();
        idleTimer = setTimeout(() => {
          sendJson({
            type: 'error',
            code: 'IDLE_TIMEOUT',
            message: `Terminal session timed out after ${Math.round(timeoutMs / 1000)}s of inactivity.`
          });
          void cleanup().finally(() => closeWs(1000, 'Idle timeout'));
        }, timeoutMs);
        idleTimer.unref?.();
      };

      try {
        const projectFiles: ExecutionFile[] = Array.isArray(ownership.projectData?.files)
          ? ownership.projectData.files
              .filter((f: any) => f && f.type === 'file' && typeof f.path === 'string')
              .map((f: any) => ({ path: f.path, content: typeof f.content === 'string' ? f.content : '' }))
          : [];
        workspaceRoot = await projectProcessManager.prepareWorkspaceDirectory(projectFiles);
        const dockerSpec = projectProcessManager.buildInteractiveContainerArgs(containerName, workspaceRoot, session.cwd);

        ptyProcess = await ptySpawner(dockerSpec.dockerBin, dockerSpec.args, {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: workspaceRoot,
          env: dockerSpec.env
        });
      } catch (spawnErr: any) {
        await cleanup();
        sendJson({
          type: 'error',
          code: 'TERMINAL_NOT_CONFIGURED',
          message: `Terminal not configured or failed to start sandbox container: ${spawnErr?.message || String(spawnErr)}`,
          setupSteps: TERMINAL_SETUP_STEPS
        });
        closeWs(1011, 'Sandbox launch failed');
        return;
      }

      const clientRecord: ConnectedTerminalClient = {
        id: clientId,
        sessionId: session.id,
        userId: user.uid,
        projectId: session.projectId,
        socket,
        sendJson,
        close: closeWs,
        cleanup
      };
      activeClients.set(clientId, clientRecord);
      resetIdleTimer();

      sendJson({
        type: 'connected',
        sessionId: session.id,
        projectId: session.projectId,
        containerName,
        cwd: session.cwd
      });

      let commandBuffer = '';
      ptyProcess.onData((rawChunk: string) => {
        resetIdleTimer();
        const sanitized = sanitizeTerminalOutput(String(rawChunk || ''));
        sendJson({
          type: 'output',
          stream: 'stdout',
          data: sanitized
        });
        void TerminalService.appendExecutionDurable(
          session!.id,
          user!.uid,
          commandBuffer || 'pty',
          sanitized,
          '',
          0
        ).catch(() => undefined);
      });

      ptyProcess.onExit(({ exitCode }) => {
        sendJson({
          type: 'exit',
          exitCode: typeof exitCode === 'number' ? exitCode : 0
        });
        void cleanup().finally(() => closeWs(1000, 'PTY exited'));
      });

      let frameBuffer = Buffer.alloc(0);
      socket.on('data', (chunk: Buffer) => {
        resetIdleTimer();
        frameBuffer = Buffer.concat([frameBuffer, chunk]);
        try {
          const decoded = decodeWsFrames(frameBuffer);
          frameBuffer = decoded.remaining;
          for (const frame of decoded.frames) {
            if (frame.opcode === 0x08) {
              // Close frame
              void cleanup().finally(() => closeWs(1000, 'Client closed'));
              return;
            }
            if (frame.opcode === 0x09) {
              // Ping frame -> Pong
              if (!socket.destroyed && socket.writable) {
                socket.write(encodeWsPongFrame(frame.payload));
              }
              continue;
            }
            if (frame.opcode === 0x01) {
              const text = frame.payload.toString('utf8');
              let parsed: any = null;
              try {
                parsed = JSON.parse(text);
              } catch {
                parsed = { type: 'input', data: text };
              }

              if (parsed?.type === 'input' && typeof parsed.data === 'string') {
                if (parsed.data.includes('\r') || parsed.data.includes('\n')) {
                  commandBuffer = parsed.data.trim() || commandBuffer;
                } else {
                  commandBuffer += parsed.data;
                }
                ptyProcess?.write(parsed.data);
              } else if (parsed?.type === 'resize') {
                const cols = Math.max(20, Math.min(400, Number(parsed.cols) || 80));
                const rows = Math.max(5, Math.min(200, Number(parsed.rows) || 24));
                ptyProcess?.resize(cols, rows);
              } else if (parsed?.type === 'ping') {
                sendJson({ type: 'pong', timestamp: Date.now() });
              }
            }
          }
        } catch (err: any) {
          sendJson({ type: 'error', code: 'PROTOCOL_ERROR', message: err?.message || 'Invalid WebSocket frame.' });
          void cleanup().finally(() => closeWs(1002, 'Protocol error'));
        }
      });

      socket.on('end', () => {
        void cleanup();
      });
      socket.on('close', () => {
        void cleanup();
      });
      socket.on('error', () => {
        void cleanup();
      });
    } catch {
      try {
        socket.destroy();
      } catch {
        // Ignore
      }
    }
  });
}
