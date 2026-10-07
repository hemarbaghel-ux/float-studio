/**
 * FLOAT AI - Advanced Agent Modes Engine (Milestone 9)
 *
 * Implements authoritative workflow policies and constraints for:
 * - chat: Conversational assistance, explanations, context inspection (cannot modify files)
 * - ask: Read-only assistant (search, inspect, explain; strictly no write/apply/git mutations)
 * - plan: Structured plan generation requiring explicit human approval
 * - agent: Multi-step proposal-based editing with validation loop
 * - debug: Root-cause diagnostic pipeline (diagnostics, symbol tracing, fix proposal, evidence)
 */

export type FloatAgentWorkflowMode = 'chat' | 'ask' | 'plan' | 'agent' | 'debug';

export interface WorkflowModeCapabilities {
  canReadFiles: boolean;
  canSearchCodebase: boolean;
  canInspectGit: boolean;
  canInspectDiagnostics: boolean;
  canProposeChanges: boolean;
  canApplyProposals: boolean;
  canExecuteCommands: boolean;
  requiresHumanApproval: boolean;
  modeDescription: string;
}

export const WORKFLOW_MODE_POLICIES: Record<FloatAgentWorkflowMode, WorkflowModeCapabilities> = {
  chat: {
    canReadFiles: true,
    canSearchCodebase: true,
    canInspectGit: true,
    canInspectDiagnostics: true,
    canProposeChanges: false,
    canApplyProposals: false,
    canExecuteCommands: false,
    requiresHumanApproval: false,
    modeDescription: 'Conversational coding assistance and architecture Q&A. Does not modify files.'
  },
  ask: {
    canReadFiles: true,
    canSearchCodebase: true,
    canInspectGit: true,
    canInspectDiagnostics: true,
    canProposeChanges: false,
    canApplyProposals: false,
    canExecuteCommands: false,
    requiresHumanApproval: false,
    modeDescription: 'Strictly read-only coding assistant. Explores code and explains concepts with no mutation capabilities.'
  },
  plan: {
    canReadFiles: true,
    canSearchCodebase: true,
    canInspectGit: true,
    canInspectDiagnostics: true,
    canProposeChanges: true, // generates plan/proposal for review
    canApplyProposals: false, // requires explicit human approval
    canExecuteCommands: false,
    requiresHumanApproval: true,
    modeDescription: 'Analyzes requirements, inspects dependencies, and proposes a structured plan requiring explicit user approval.'
  },
  agent: {
    canReadFiles: true,
    canSearchCodebase: true,
    canInspectGit: true,
    canInspectDiagnostics: true,
    canProposeChanges: true,
    canApplyProposals: false, // human-in-the-loop gate preserved
    canExecuteCommands: false, // direct shell execution strictly denied in agent loop
    requiresHumanApproval: true,
    modeDescription: 'Autonomous multi-step investigation, multi-file reasoning, and safe proposal generation.'
  },
  debug: {
    canReadFiles: true,
    canSearchCodebase: true,
    canInspectGit: true,
    canInspectDiagnostics: true,
    canProposeChanges: true,
    canApplyProposals: false,
    canExecuteCommands: false,
    requiresHumanApproval: true,
    modeDescription: 'Targeted root-cause analysis: analyzes diagnostics, traces call sites, inspects git changes, and proposes verified fixes.'
  }
};

/**
 * Validates whether an agent action is permitted under the active workflow mode.
 */
export function validateModePermission(
  mode: FloatAgentWorkflowMode,
  action: 'read' | 'search' | 'git_inspect' | 'diagnostics_inspect' | 'propose' | 'apply' | 'execute_command'
): { allowed: boolean; reason?: string } {
  const policy = WORKFLOW_MODE_POLICIES[mode] || WORKFLOW_MODE_POLICIES.chat;

  switch (action) {
    case 'read':
      return { allowed: policy.canReadFiles };
    case 'search':
      return { allowed: policy.canSearchCodebase };
    case 'git_inspect':
      return { allowed: policy.canInspectGit };
    case 'diagnostics_inspect':
      return { allowed: policy.canInspectDiagnostics };
    case 'propose':
      if (!policy.canProposeChanges) {
        return {
          allowed: false,
          reason: `Action "propose" is strictly forbidden in ${mode.toUpperCase()} mode. Use Plan or Agent mode to propose file changes.`
        };
      }
      return { allowed: true };
    case 'apply':
      if (!policy.canApplyProposals) {
        return {
          allowed: false,
          reason: `Automatic proposal application is forbidden in ${mode.toUpperCase()} mode. All changes require explicit human review.`
        };
      }
      return { allowed: true };
    case 'execute_command':
      if (!policy.canExecuteCommands) {
        return {
          allowed: false,
          reason: `Direct command execution is forbidden in ${mode.toUpperCase()} mode to ensure sandbox safety.`
        };
      }
      return { allowed: true };
    default:
      return { allowed: false, reason: `Unknown action "${action}"` };
  }
}

export interface DebugDiagnosisResult {
  symptom: string;
  identifiedCauses: string[];
  affectedFiles: string[];
  recommendedFix: string;
  validationSteps: string[];
  evidenceFound: string[];
}

/**
 * Formats structured prompt instructions tailored to the selected workflow mode.
 */
export function getWorkflowModeInstructions(mode: FloatAgentWorkflowMode): string {
  switch (mode) {
    case 'ask':
      return `[Workflow Mode: ASK / READ-ONLY]
You are operating in strictly READ-ONLY Ask mode.
- You can explain code, examine architecture, find symbols, and analyze questions.
- You must NOT propose file edits or write tool calls that modify files or commit changes.
- Provide clear, direct answers with file references and code snippets for the user to review.`;

    case 'plan':
      return `[Workflow Mode: PLAN MODE]
You are operating in PLAN MODE.
- Analyze the requirements thoroughly and inspect relevant project files.
- Produce a clear, structured implementation plan listing:
  1. Overview and objectives
  2. Affected files and dependency implications
  3. Ordered implementation steps
  4. Testing and verification criteria
- Do NOT make direct file changes. The user must review and approve this plan before execution proceeds.`;

    case 'debug':
      return `[Workflow Mode: DEBUG MODE]
You are operating in DEBUG MODE. Follow the systematic 4-step diagnostic protocol:
1. Inspect the reported error, stack trace, and any active compiler/runtime diagnostics.
2. Trace the relevant symbol definitions, call sites, and recent git changes.
3. Identify the underlying root cause with concrete evidence from the files (do NOT fabricate findings).
4. Propose a targeted, minimal fix with exact before/after code blocks and verification instructions.`;

    case 'agent':
      return `[Workflow Mode: AGENT MODE]
You are operating in MULTI-STEP AGENT MODE.
- Reason over multiple files and dependency relationships.
- Generate precise proposals via the propose_changes tool.
- Every modification will be presented to the user for review before being applied.`;

    case 'chat':
    default:
      return `[Workflow Mode: CHAT]
You are in conversational coding assistant mode. Help the user understand code, answer architectural questions, and suggest improvements.`;
  }
}
