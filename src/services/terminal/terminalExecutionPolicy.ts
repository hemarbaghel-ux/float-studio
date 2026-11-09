/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Terminal Execution Policy & Sandbox Security Manager (Phase 7)
 *
 * Enforces command boundaries, detects dangerous or destructive shell patterns,
 * requires human approval for environment-altering operations, and permits safe
 * test and build verifications.
 */

export interface CommandPolicyEvaluation {
  readonly permitted: boolean;
  readonly requiresApproval: boolean;
  readonly isDangerous: boolean;
  readonly reason?: string;
  readonly category: 'safe_read' | 'verification' | 'dependency_install' | 'state_change' | 'dangerous';
}

const DESTRUCTIVE_PATTERNS = [
  /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r)\s+[\/\\](?:\s|$|\*)/i, // rm -rf /
  /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r)\s+~(?:\s|$|\/)/i,       // rm -rf ~
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,                               // Fork bomb :(){ :|:& };:
  /\bmkfs\b/i,                                                               // Filesystem format
  /\bdd\s+.*of=\/dev\/(?:sd[a-z]|nvme|hd[a-z]|null|zero)/i,                  // Raw disk write
  /(?:curl|wget)\s+[^\n\r|]+\|\s*(?:bash|sh|zsh)/i,                          // Piping web content into shell
  /\bchmod\s+(-R\s+)?777\s+[\/\\]/i,                                         // Unrestricted root chmod
  /\b(?:iptables\s+-F|ufw\s+disable)\b/i,                                     // Disabling security firewalls
];

const SAFE_VERIFICATION_PATTERNS = [
  /^npm\s+(?:test|run\s+test|run\s+lint|run\s+build)/i,
  /^npx\s+(?:vitest|jest|mocha|tsc|eslint)/i,
  /^pytest(?:\s|$)/i,
  /^python(?:3)?\s+-m\s+unittest(?:\s|$)/i,
  /^git\s+(?:status|diff|log|branch)/i,
  /^node\s+--check\b/i,
  /^ls(?:\s|$)/i,
  /^cat\s+[a-zA-Z0-9_./\\-]+/i,
  /^echo\s+/i,
];

export class TerminalExecutionPolicy {
  /**
   * Evaluates a command against safety, sandbox boundaries, and approval requirements.
   */
  public static evaluateCommand(rawCommand: string): CommandPolicyEvaluation {
    const command = (rawCommand || '').trim();

    if (!command) {
      return {
        permitted: false,
        requiresApproval: false,
        isDangerous: false,
        reason: 'Empty command string.',
        category: 'dangerous',
      };
    }

    // 1. Destructive pattern detection
    for (const pattern of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(command)) {
        return {
          permitted: false,
          requiresApproval: false,
          isDangerous: true,
          reason: `Command matches strictly forbidden destructive pattern: "${pattern.source}"`,
          category: 'dangerous',
        };
      }
    }

    // 2. Safe verification commands
    for (const safePattern of SAFE_VERIFICATION_PATTERNS) {
      if (safePattern.test(command)) {
        return {
          permitted: true,
          requiresApproval: false,
          isDangerous: false,
          category: 'verification',
        };
      }
    }

    // 3. Package installation commands (Require explicit human approval)
    if (/^(?:npm\s+i(?:nstall)?|yarn\s+add|pnpm\s+add|pip(?:3)?\s+install)\b/i.test(command)) {
      return {
        permitted: true,
        requiresApproval: true,
        isDangerous: false,
        reason: 'Installing dependencies modifies project dependencies and environment state.',
        category: 'dependency_install',
      };
    }

    // 4. Git mutate commands (Require explicit human approval)
    if (/^git\s+(?:push|commit|checkout|reset|rebase|merge)\b/i.test(command)) {
      return {
        permitted: true,
        requiresApproval: true,
        isDangerous: false,
        reason: 'Git repository state changes require explicit developer confirmation.',
        category: 'state_change',
      };
    }

    // 5. Default: requires approval for unclassified commands
    return {
      permitted: true,
      requiresApproval: true,
      isDangerous: false,
      reason: 'Unclassified shell command requires explicit human authorization.',
      category: 'state_change',
    };
  }
}
