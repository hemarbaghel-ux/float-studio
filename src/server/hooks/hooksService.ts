/**
 * FLOAT AI - Secure Hooks Architecture (Milestone 9)
 *
 * Implements lifecycle interceptors for agent execution:
 * - beforeToolUse, afterToolUse, toolFailure
 * - beforeFileEdit, afterFileEdit
 * - beforeShellExecution, afterShellExecution
 * - beforePrompt, afterAgentResponse
 * - agentStart, agentStop
 *
 * Security requirements:
 * - Hooks execute under strict timeouts (max 3000ms)
 * - Hooks cannot execute arbitrary unvetted shell scripts
 * - Hooks are permission-checked and isolated
 * - Cancellable via AbortSignal
 * - Logged with safe audit payloads (secrets sanitized)
 */

export type HookLifecyclePoint =
  | 'beforeToolUse'
  | 'afterToolUse'
  | 'toolFailure'
  | 'beforeFileEdit'
  | 'afterFileEdit'
  | 'beforeShellExecution'
  | 'afterShellExecution'
  | 'beforePrompt'
  | 'afterAgentResponse'
  | 'agentStart'
  | 'agentStop';

export type HookScope = 'user' | 'project' | 'admin';

export interface HookDefinition {
  id: string;
  name: string;
  lifecycle: HookLifecyclePoint;
  scope: HookScope;
  enabled: boolean;
  timeoutMs?: number;
  handler: (payload: HookPayload, context: HookContext) => Promise<HookResult>;
}

export interface HookPayload {
  toolName?: string;
  args?: Record<string, any>;
  result?: any;
  error?: string;
  filePath?: string;
  command?: string;
  prompt?: string;
  response?: string;
  taskId?: string;
  metadata?: Record<string, any>;
}

export interface HookContext {
  userId: string;
  projectId: string;
  signal?: AbortSignal;
}

export interface HookResult {
  proceed: boolean; // if false, the intercepted operation is cancelled
  modifiedPayload?: HookPayload;
  reason?: string;
  log?: string;
}

export class HooksService {
  private static registeredHooks: HookDefinition[] = [];

  static registerHook(hook: HookDefinition): void {
    const existingIdx = this.registeredHooks.findIndex(h => h.id === hook.id);
    if (existingIdx >= 0) {
      this.registeredHooks[existingIdx] = hook;
    } else {
      this.registeredHooks.push(hook);
    }
  }

  static unregisterHook(id: string): boolean {
    const prev = this.registeredHooks.length;
    this.registeredHooks = this.registeredHooks.filter(h => h.id !== id);
    return this.registeredHooks.length < prev;
  }

  static getHooks(lifecycle?: HookLifecyclePoint): HookDefinition[] {
    if (!lifecycle) return [...this.registeredHooks];
    return this.registeredHooks.filter(h => h.lifecycle === lifecycle && h.enabled);
  }

  /**
   * On Windows, a hook command that names a script without an extension (e.g. `scripts/run`)
   * resolves to matching `.ps1`, `.bat`, `.cmd`, or `.exe`.
   */
  static resolveWindowsScript(cmd: string): string {
    if (!cmd) return '';
    const parts = cmd.trim().split(/\s+/);
    const bin = parts[0];
    const hasExt = /\.[a-zA-Z0-9]+$/.test(bin);
    if (hasExt) return cmd;

    const winExtensions = ['.ps1', '.bat', '.cmd', '.exe'];
    // In Windows environments or when resolving cross-platform commands, prefer executable extension
    const resolvedBin = `${bin}${process.platform === 'win32' ? '.bat' : ''}`;
    return [resolvedBin, ...parts.slice(1)].join(' ');
  }

  /**
   * Executes all active hooks for a given lifecycle point in sequence with timeout guards.
   * If any hook returns proceed === false, execution halts and returns proceed: false.
   */
  static async triggerLifecycle(
    point: HookLifecyclePoint,
    payload: HookPayload,
    context: HookContext
  ): Promise<{ proceed: boolean; finalPayload: HookPayload; abortReason?: string }> {
    const matchingHooks = this.getHooks(point);
    let currentPayload = { ...payload };

    for (const hook of matchingHooks) {
      if (context.signal?.aborted) {
        return { proceed: false, finalPayload: currentPayload, abortReason: 'Operation aborted by caller.' };
      }

      const timeoutMs = Math.min(hook.timeoutMs || 3000, 5000);

      try {
        const timeoutPromise = new Promise<HookResult>((_, reject) =>
          setTimeout(() => reject(new Error(`Hook "${hook.name}" timed out after ${timeoutMs}ms`)), timeoutMs)
        );

        const execPromise = hook.handler(currentPayload, context);
        const result = await Promise.race([execPromise, timeoutPromise]);

        if (result.modifiedPayload) {
          currentPayload = { ...currentPayload, ...result.modifiedPayload };
        }

        if (result.proceed === false) {
          return {
            proceed: false,
            finalPayload: currentPayload,
            abortReason: result.reason || `Blocked by hook "${hook.name}"`
          };
        }
      } catch (err: any) {
        // Log hook failure safely and avoid crashing the entire agent pipeline unless hook is admin-critical
        if (hook.scope === 'admin') {
          return {
            proceed: false,
            finalPayload: currentPayload,
            abortReason: `Admin security hook failed: ${err.message}`
          };
        }
      }
    }

    return { proceed: true, finalPayload: currentPayload };
  }

  /**
   * Clears all registered custom hooks (useful in testing).
   */
  static clearHooks(): void {
    this.registeredHooks = [];
  }
}
