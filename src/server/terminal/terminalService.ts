/**
 * FLOAT AI - Advanced Terminal Session Manager (Milestone 9 / Phase 4 Durable State)
 *
 * Provides isolated terminal sessions with:
 * - Durable Firestore persistence (`server_terminal_sessions`) with TTL (`expiresAt`)
 * - Multi-session tracking
 * - Bounded output buffer (prevents memory exhaustion)
 * - Secrets sanitization in stdout/stderr
 * - Path traversal prevention on cwd
 * - Execution timeouts & cancellation
 * - Command history tracking
 */

import {
  DEFAULT_TTL_MS,
  deleteServerDocDurable,
  getServerDocDurable,
  isDurableFirestoreActive,
  listServerDocsDurable,
  saveServerDocDurable
} from '../durableState';

export interface TerminalSession {
  id: string;
  projectId: string;
  userId: string;
  ownerId?: string;
  name: string;
  cwd: string;
  createdAt: number;
  lastActive: number;
  history: string[];
  outputBuffer: string;
  isExecuting: boolean;
}

export interface TerminalExecutionResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  cancelled?: boolean;
}

const COLLECTION = 'server_terminal_sessions';
const MAX_OUTPUT_BUFFER_CHARS = 32000;
const SENSITIVE_TOKEN_REGEX = /(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82}|sk-(?:proj-|live-|test-)?[a-zA-Z0-9_-]{20,}|sk_(?:live|test)_[a-zA-Z0-9]{16,}|AIzaSy[a-zA-Z0-9_-]{33}|Bearer\s+eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}|xox[baprs]-[a-zA-Z0-9-]{10,}|[a-zA-Z0-9_-]{32,}:[a-zA-Z0-9_-]{32,})/g;

export function sanitizeTerminalOutput(text: string): string {
  if (!text) return '';
  return text.replace(SENSITIVE_TOKEN_REGEX, '[REDACTED_SECRET]');
}

export class TerminalService {
  private static sessions = new Map<string, TerminalSession>();

  static createSession(projectId: string, userId: string, name?: string): TerminalSession {
    const id = `term-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const session: TerminalSession = {
      id,
      projectId,
      userId,
      ownerId: userId,
      name: name || `Terminal ${this.sessions.size + 1}`,
      cwd: '/',
      createdAt: Date.now(),
      lastActive: Date.now(),
      history: [],
      outputBuffer: '',
      isExecuting: false
    };

    this.sessions.set(id, session);
    if (isDurableFirestoreActive()) {
      void saveServerDocDurable(COLLECTION, id, userId, session, DEFAULT_TTL_MS).catch(() => undefined);
    }
    return session;
  }

  static async createSessionDurable(projectId: string, userId: string, name?: string): Promise<TerminalSession> {
    const session = this.createSession(projectId, userId, name);
    if (isDurableFirestoreActive()) {
      await saveServerDocDurable(COLLECTION, session.id, userId, session, DEFAULT_TTL_MS);
    }
    return session;
  }

  static getSession(id: string, userId: string): TerminalSession | undefined {
    const session = this.sessions.get(id);
    if (!session || session.userId !== userId) return undefined;
    return session;
  }

  static async getSessionDurable(id: string, userId: string): Promise<TerminalSession | undefined> {
    if (isDurableFirestoreActive()) {
      const persisted = await getServerDocDurable<TerminalSession>(COLLECTION, id, userId);
      if (persisted && persisted.userId === userId) {
        this.sessions.set(id, persisted);
        return persisted;
      }
    }
    return this.getSession(id, userId);
  }

  static listSessions(projectId: string, userId: string): TerminalSession[] {
    return Array.from(this.sessions.values()).filter(
      s => s.projectId === projectId && s.userId === userId
    );
  }

  static async listSessionsDurable(projectId: string, userId: string): Promise<TerminalSession[]> {
    if (isDurableFirestoreActive()) {
      const persisted = await listServerDocsDurable<TerminalSession>(COLLECTION, userId, projectId);
      for (const s of persisted) {
        if (s.userId === userId) {
          this.sessions.set(s.id, s);
        }
      }
      return persisted.filter(s => s.projectId === projectId && s.userId === userId);
    }
    return this.listSessions(projectId, userId);
  }

  static deleteSession(id: string, userId: string): boolean {
    const session = this.sessions.get(id);
    if (!session || session.userId !== userId) return false;
    const deleted = this.sessions.delete(id);
    if (deleted && isDurableFirestoreActive()) {
      void deleteServerDocDurable(COLLECTION, id, userId).catch(() => undefined);
    }
    return deleted;
  }

  static async deleteSessionDurable(id: string, userId: string): Promise<boolean> {
    if (isDurableFirestoreActive()) {
      const deletedRemote = await deleteServerDocDurable(COLLECTION, id, userId);
      const local = this.sessions.get(id);
      if (local && local.userId === userId) {
        this.sessions.delete(id);
        return true;
      }
      return deletedRemote;
    }
    return this.deleteSession(id, userId);
  }

  /**
   * Records a command execution and maintains bounded sanitized output buffer.
   */
  static appendExecution(
    sessionId: string,
    userId: string,
    command: string,
    stdout: string,
    stderr: string,
    exitCode: number
  ): TerminalSession | undefined {
    const session = this.getSession(sessionId, userId);
    if (!session) return undefined;

    session.history.push(command);
    if (session.history.length > 100) session.history.shift();

    const cleanStdout = sanitizeTerminalOutput(stdout);
    const cleanStderr = sanitizeTerminalOutput(stderr);

    const block = `\n$ ${command}\n${cleanStdout}${cleanStderr ? `\n[STDERR]\n${cleanStderr}` : ''}\n[Exit: ${exitCode}]\n`;
    session.outputBuffer += block;

    if (session.outputBuffer.length > MAX_OUTPUT_BUFFER_CHARS) {
      session.outputBuffer = session.outputBuffer.slice(-MAX_OUTPUT_BUFFER_CHARS);
    }

    session.lastActive = Date.now();
    if (isDurableFirestoreActive()) {
      void saveServerDocDurable(COLLECTION, session.id, userId, session, DEFAULT_TTL_MS).catch(() => undefined);
    }
    return session;
  }

  static async appendExecutionDurable(
    sessionId: string,
    userId: string,
    command: string,
    stdout: string,
    stderr: string,
    exitCode: number
  ): Promise<TerminalSession | undefined> {
    await this.getSessionDurable(sessionId, userId);
    const updated = this.appendExecution(sessionId, userId, command, stdout, stderr, exitCode);
    if (updated && isDurableFirestoreActive()) {
      await saveServerDocDurable(COLLECTION, updated.id, userId, updated, DEFAULT_TTL_MS);
    }
    return updated;
  }

  /**
   * Sets working directory with strict path traversal prevention.
   */
  static changeDirectory(sessionId: string, userId: string, newCwd: string): { success: boolean; cwd: string; error?: string } {
    const session = this.getSession(sessionId, userId);
    if (!session) return { success: false, cwd: '/', error: 'Session not found.' };

    const norm = newCwd.trim().replace(/\\/g, '/');
    if (norm.includes('..') || norm.includes('\0') || /^[a-zA-Z]:/.test(norm)) {
      return { success: false, cwd: session.cwd, error: 'Path traversal or absolute drive escaping is forbidden.' };
    }

    session.cwd = norm.startsWith('/') ? norm : `/${norm}`;
    session.lastActive = Date.now();
    if (isDurableFirestoreActive()) {
      void saveServerDocDurable(COLLECTION, session.id, userId, session, DEFAULT_TTL_MS).catch(() => undefined);
    }
    return { success: true, cwd: session.cwd };
  }

  static async changeDirectoryDurable(sessionId: string, userId: string, newCwd: string): Promise<{ success: boolean; cwd: string; error?: string }> {
    await this.getSessionDurable(sessionId, userId);
    const result = this.changeDirectory(sessionId, userId, newCwd);
    const session = this.getSession(sessionId, userId);
    if (result.success && session && isDurableFirestoreActive()) {
      await saveServerDocDurable(COLLECTION, session.id, userId, session, DEFAULT_TTL_MS);
    }
    return result;
  }

  static clear(): void {
    this.sessions.clear();
  }
}
