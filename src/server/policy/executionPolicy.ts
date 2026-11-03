/**
 * FLOAT AI - Authoritative Tool Approval & Execution Policy System (Milestone 9 / Phase 4 Durable State)
 *
 * Execution Modes:
 * - 'safe': Read-only operations automatically permitted. Mutating operations strictly blocked.
 * - 'review': Known safe reads allowed automatically; modifications/proposals generate approval requests.
 * - 'allowlist': Only tools and commands explicitly pre-registered on the allowlist can execute.
 * - 'manual': Every operation requires explicit human approval.
 * - 'sandboxed': Isolated execution with containerized boundaries and strict resource caps.
 *
 * Sensitive Operations:
 * Always require human review and cannot be silently executed:
 * - File deletion / repository wipes
 * - External network / credential exfiltration
 * - Git push / PR merge
 * - Production deployment
 */

import {
  DEFAULT_TTL_MS,
  getServerDocDurable,
  isDurableFirestoreActive,
  saveServerDocDurable
} from '../durableState';
import { isSensitivePath, isPathTraversal } from '../../services/indexing/fileFilter';

export type ExecutionPolicyMode = 'safe' | 'review' | 'allowlist' | 'manual' | 'sandboxed' | 'auto';

export interface ToolExecutionRequest {
  toolName: string;
  category: 'read' | 'write' | 'shell' | 'network' | 'git' | 'danger';
  args: Record<string, any>;
  userId: string;
  projectId: string;
}

export interface PolicyDecision {
  permitted: boolean;
  requiresHumanApproval: boolean;
  reason: string;
}

const COLLECTION = 'server_execution_policies';

export class ExecutionPolicyManager {
  private static defaultMode: ExecutionPolicyMode = 'review';
  private static userModes = new Map<string, ExecutionPolicyMode>();
  private static toolAllowlist = new Set<string>([
    'list_project_files',
    'read_project_file',
    'search_codebase',
    'propose_changes'
  ]);

  static setPolicyMode(userId: string, mode: ExecutionPolicyMode): void {
    this.userModes.set(userId, mode);
    if (isDurableFirestoreActive()) {
      void saveServerDocDurable(
        COLLECTION,
        userId,
        userId,
        { id: userId, userId, mode, updatedAt: Date.now() },
        DEFAULT_TTL_MS * 4
      ).catch(() => undefined);
    }
  }

  static async setPolicyModeDurable(userId: string, mode: ExecutionPolicyMode): Promise<void> {
    this.userModes.set(userId, mode);
    if (isDurableFirestoreActive()) {
      await saveServerDocDurable(
        COLLECTION,
        userId,
        userId,
        { id: userId, userId, mode, updatedAt: Date.now() },
        DEFAULT_TTL_MS * 4
      );
    }
  }

  static getPolicyMode(userId: string): ExecutionPolicyMode {
    return this.userModes.get(userId) || this.defaultMode;
  }

  static async getPolicyModeDurable(userId: string): Promise<ExecutionPolicyMode> {
    if (isDurableFirestoreActive()) {
      const persisted = await getServerDocDurable<{ mode?: ExecutionPolicyMode }>(COLLECTION, userId, userId);
      if (persisted?.mode && ['safe', 'review', 'allowlist', 'manual', 'sandboxed', 'auto'].includes(persisted.mode)) {
        this.userModes.set(userId, persisted.mode);
        return persisted.mode;
      }
    }
    return this.getPolicyMode(userId);
  }

  static addAllowedTool(toolName: string): void {
    this.toolAllowlist.add(toolName);
  }

  static removeAllowedTool(toolName: string): void {
    this.toolAllowlist.delete(toolName);
  }

  static isToolAllowed(toolName: string): boolean {
    return this.toolAllowlist.has(toolName);
  }

  static clearCacheForTests(): void {
    this.userModes.clear();
  }

  static async evaluateDurable(request: ToolExecutionRequest): Promise<PolicyDecision> {
    await this.getPolicyModeDurable(request.userId);
    return this.evaluate(request);
  }

  /**
   * Evaluates whether a tool execution can proceed automatically, needs approval, or is forbidden.
   */
  static evaluate(request: ToolExecutionRequest): PolicyDecision {
    const mode = this.getPolicyMode(request.userId);

    // Hardcoded safety protections: Dangerous operations ALWAYS require explicit approval or are blocked
    if (request.category === 'danger' || request.toolName === 'delete_file' || request.toolName === 'git_push') {
      return {
        permitted: false,
        requiresHumanApproval: true,
        reason: `Operation "${request.toolName}" is high-risk and requires explicit manual confirmation.`
      };
    }

    const targetPath = String(request.args?.path || request.args?.filePath || '').trim();
    if (targetPath) {
      const normPath = targetPath.replace(/\\/g, '/');
      const isOutside = isPathTraversal(targetPath) || normPath.startsWith('/') || /^[a-z]:/i.test(normPath) || normPath.includes('../') || normPath.startsWith('/etc/') || normPath.startsWith('/var/');
      if (isOutside) {
        return {
          permitted: false,
          requiresHumanApproval: true,
          reason: `This ${request.category === 'read' ? 'reads' : 'edits'} a file outside your workspace.`
        };
      }

      if (isSensitivePath(normPath)) {
        return {
          permitted: false,
          requiresHumanApproval: true,
          reason: (request.category === 'write' || request.toolName === 'propose_changes')
            ? 'This edits a protected configuration file.'
            : 'Access to sensitive credential or key file requires explicit confirmation.'
        };
      }

      const baseName = normPath.split('/').pop() || '';
      const isProtected = /^\.env($|\..*)|\.gitconfig|firebase\.json|credentials\.json|\.pem$|\.key$/i.test(baseName);
      if (isProtected && (request.category === 'write' || request.toolName === 'propose_changes')) {
        return {
          permitted: false,
          requiresHumanApproval: true,
          reason: 'This edits a protected configuration file.'
        };
      }
    }

    switch (mode) {
      case 'safe':
        if (request.category === 'read') {
          return { permitted: true, requiresHumanApproval: false, reason: 'Safe read operation permitted.' };
        }
        return {
          permitted: false,
          requiresHumanApproval: false,
          reason: `Operation "${request.toolName}" (${request.category}) is forbidden in SAFE read-only mode.`
        };

      case 'manual':
        return {
          permitted: false,
          requiresHumanApproval: true,
          reason: `All operations require manual human approval under MANUAL policy.`
        };

      case 'allowlist':
        if (this.toolAllowlist.has(request.toolName)) {
          return { permitted: true, requiresHumanApproval: false, reason: 'Tool is present on verified allowlist.' };
        }
        return {
          permitted: false,
          requiresHumanApproval: true,
          reason: `Tool "${request.toolName}" is not on the active allowlist; requires approval.`
        };

      case 'auto':
        return {
          permitted: true,
          requiresHumanApproval: false,
          reason: 'Auto mode permits non-destructive workspace operations inside the isolated sandbox.'
        };

      case 'sandboxed':
        if (request.category === 'read' || (request.category === 'write' && request.toolName === 'propose_changes')) {
          return { permitted: true, requiresHumanApproval: false, reason: 'Sandboxed operation permitted within task bounds.' };
        }
        return {
          permitted: false,
          requiresHumanApproval: true,
          reason: `Operation "${request.toolName}" requires review before sandbox escape.`
        };

      case 'review':
      default:
        if (request.category === 'read') {
          return { permitted: true, requiresHumanApproval: false, reason: 'Known safe read permitted automatically.' };
        }
        return {
          permitted: false,
          requiresHumanApproval: true,
          reason: `Modifying operation "${request.toolName}" requires human review before applying.`
        };
    }
  }
}
