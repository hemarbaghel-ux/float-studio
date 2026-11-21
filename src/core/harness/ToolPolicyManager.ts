/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type AgentMode = 'agent' | 'ask' | 'plan' | 'debug';

export interface ToolPolicy {
  readonly mode: AgentMode;
  readonly description: string;
  readonly allowsFileEdits: boolean;
  readonly allowsShellExecution: boolean;
  readonly requiresApprovalBeforeEdits: boolean;
  readonly runtimeEvidenceBias: boolean;
  readonly allowedToolNames: readonly string[];
}

export const CANONICAL_HARNESS_TOOL_NAMES = [
  'search_files',
  'semantic_search',
  'read_file',
  'edit_file',
  'run_shell',
  'browser',
  'web_search',
  'fetch_rules_or_skills',
  'generate_image',
  'ask_user',
  'invoke_subagent'
] as const;

export type CanonicalHarnessToolName = typeof CANONICAL_HARNESS_TOOL_NAMES[number];

const READ_ONLY_TOOLS: readonly string[] = [
  'search_files',
  'semantic_search',
  'read_file',
  'web_search',
  'fetch_rules_or_skills',
  'ask_user'
];

export const TOOL_POLICIES: Record<AgentMode, ToolPolicy> = {
  agent: {
    mode: 'agent',
    description: 'All tools enabled. Proposes and applies file edits immediately with diff review.',
    allowsFileEdits: true,
    allowsShellExecution: true,
    requiresApprovalBeforeEdits: false,
    runtimeEvidenceBias: false,
    allowedToolNames: [...CANONICAL_HARNESS_TOOL_NAMES]
  },
  ask: {
    mode: 'ask',
    description: 'Search and read-only inspection only. File modifications and shell execution are blocked.',
    allowsFileEdits: false,
    allowsShellExecution: false,
    requiresApprovalBeforeEdits: true,
    runtimeEvidenceBias: false,
    allowedToolNames: [...READ_ONLY_TOOLS]
  },
  plan: {
    mode: 'plan',
    description: 'Research and write structured implementation plans. Edits start only after explicit user approval.',
    allowsFileEdits: false,
    allowsShellExecution: false,
    requiresApprovalBeforeEdits: true,
    runtimeEvidenceBias: false,
    allowedToolNames: [...READ_ONLY_TOOLS, 'browser']
  },
  debug: {
    mode: 'debug',
    description: 'All tools enabled with a strong bias toward runtime evidence (logs, reproduction, test failures) before proposing fixes.',
    allowsFileEdits: true,
    allowsShellExecution: true,
    requiresApprovalBeforeEdits: false,
    runtimeEvidenceBias: true,
    allowedToolNames: [...CANONICAL_HARNESS_TOOL_NAMES]
  }
};

const MODE_CYCLE_ORDER: readonly AgentMode[] = ['agent', 'ask', 'plan', 'debug'];

export class ToolPolicyManager {
  private currentMode: AgentMode = 'agent';

  constructor(initialMode: AgentMode = 'agent') {
    this.currentMode = initialMode;
  }

  public getMode(): AgentMode {
    return this.currentMode;
  }

  public setMode(mode: AgentMode): void {
    if (TOOL_POLICIES[mode]) {
      this.currentMode = mode;
    }
  }

  /**
   * Cycles to the next mode on Shift+Tab shortcut.
   * Cycle: Agent -> Ask -> Plan -> Debug -> Agent
   */
  public cycleMode(): AgentMode {
    const currentIndex = MODE_CYCLE_ORDER.indexOf(this.currentMode);
    const nextIndex = (currentIndex + 1) % MODE_CYCLE_ORDER.length;
    this.currentMode = MODE_CYCLE_ORDER[nextIndex];
    return this.currentMode;
  }

  public getPolicy(mode?: AgentMode): ToolPolicy {
    return TOOL_POLICIES[mode || this.currentMode];
  }

  public isToolAllowed(toolName: string, mode?: AgentMode): boolean {
    const policy = this.getPolicy(mode);
    return policy.allowedToolNames.includes(toolName);
  }

  public getModeSystemInstruction(mode?: AgentMode): string {
    const activeMode = mode || this.currentMode;
    switch (activeMode) {
      case 'ask':
        return 'MODE: ASK (Read-Only). Answer queries by searching files, symbols, and documentation. You may NOT modify files or run shell commands.';
      case 'plan':
        return 'MODE: PLAN (Research & Plan Synthesis). Explore the workspace thoroughly, identify exact file paths and interfaces, and produce a structured, phased implementation plan artifact. Do NOT modify files until the user reviews and clicks Proceed.';
      case 'debug':
        return 'MODE: DEBUG (Runtime Evidence First). Gather reproduction evidence, test failures, or log output before touching source code. Trace root cause to exact lines, verify the hypothesis, and emit minimal, targeted fixes.';
      case 'agent':
      default:
        return 'MODE: AGENT (Full Capability). Inspect the workspace, make changes, run tests, and review diffs with the user.';
    }
  }
}
