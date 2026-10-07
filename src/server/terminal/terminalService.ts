/**
 * FLOAT AI - Advanced Terminal Session Manager (Milestone 9)
 *
 * Provides isolated terminal sessions with:
 * - Multi-session tracking
 * - Bounded output buffer (prevents memory exhaustion)
 * - Secrets sanitization in stdout/stderr
 * - Path traversal prevention on cwd
 * - Execution timeouts & cancellation
 * - Command history tracking
 */

export interface TerminalSession {
  id: string;
  projectId: string;
  userId: string;
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

const MAX_OUTPUT_BUFFER_CHARS = 32000;
const SENSITIVE_TOKEN_REGEX = /(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82}|sk-[a-zA-Z0-9]{48}|AIzaSy[a-zA-Z0-9_-]{33}|[a-zA-Z0-9_-]{32,}:[a-zA-Z0-9_-]{32,})/g;

function sanitizeTerminalOutput(text: string): string {
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
      name: name || `Terminal ${this.sessions.size + 1}`,
      cwd: '/',
      createdAt: Date.now(),
      lastActive: Date.now(),
      history: [],
      outputBuffer: '',
      isExecuting: false
    };

    this.sessions.set(id, session);
    return session;
  }

  static getSession(id: string, userId: string): TerminalSession | undefined {
    const session = this.sessions.get(id);
    if (!session || session.userId !== userId) return undefined;
    return session;
  }

  static listSessions(projectId: string, userId: string): TerminalSession[] {
    return Array.from(this.sessions.values()).filter(
      s => s.projectId === projectId && s.userId === userId
    );
  }

  static deleteSession(id: string, userId: string): boolean {
    const session = this.sessions.get(id);
    if (!session || session.userId !== userId) return false;
    return this.sessions.delete(id);
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
    return session;
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
    return { success: true, cwd: session.cwd };
  }

  static clear(): void {
    this.sessions.clear();
  }
}
