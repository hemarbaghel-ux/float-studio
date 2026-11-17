/**
 * FLOAT Studio — Core Logic Type Definitions
 * 
 * Defines the unified domain model and interface contracts for the whole Float Logic engine,
 * spanning workspace virtualization, codebase intelligence, autonomous composer execution,
 * predictive editor assistance, model routing, and sandboxed terminal execution.
 */

export interface WorkspaceFile {
  path: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  content?: string;
  children?: WorkspaceFile[];
}

export interface WorkspaceCheckpoint {
  id: string;
  projectId: string;
  timestamp: number;
  description: string;
  files: Record<string, string>;
}

export interface ShadowDiff {
  filePath: string;
  originalContent: string;
  proposedContent: string;
  unifiedDiff: string;
  additions: number;
  deletions: number;
}

export interface CodeSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'method' | 'enum' | 'module';
  filePath: string;
  line: number;
  character: number;
  docstring?: string;
}

export interface CodebaseSearchResult {
  filePath: string;
  line: number;
  text: string;
  score: number;
  matchType: 'lexical' | 'semantic' | 'symbol';
}

export interface ContextSource {
  type: 'file' | 'folder' | 'codebase' | 'git' | 'docs' | 'web' | 'symbol';
  uri: string;
  label: string;
  contentSnippet: string;
  tokensEstimated: number;
}

export interface ResolvedContext {
  formattedPrompt: string;
  totalTokensEstimated: number;
  sources: ContextSource[];
}

export interface ComposerPlanTask {
  id: string;
  title: string;
  description: string;
  dependencies: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'approval_required' | 'cancelled';
  toolCalls?: Array<{
    toolName: string;
    params: Record<string, unknown>;
    result?: unknown;
    error?: string;
  }>;
}

export interface PendingToolApproval {
  actionId: string;
  toolName: string;
  params: Record<string, unknown>;
  reason: string;
  userId: string;
  projectId: string;
  timestamp: number;
}

export interface ComposerGoalExecution {
  goalId: string;
  projectId: string;
  status: 'planning' | 'executing' | 'approval_required' | 'completed' | 'failed' | 'rolled_back' | 'cancelled';
  tasks: ComposerPlanTask[];
  diffs: ShadowDiff[];
  checkpointId?: string;
  pendingApproval?: PendingToolApproval;
  error?: string;
}

export interface CursorTabRequest {
  filePath: string;
  prefix: string;
  suffix: string;
  languageId?: string;
  model?: string;
}

export interface CursorTabCompletion {
  completion: string;
  prefix: string;
  suffix: string;
  isMultiLine: boolean;
  firstWordAcceptance: string;
  firstLineAcceptance: string;
  cacheHit: boolean;
  latencyMs: number;
}

export interface NextEditPrediction {
  targetFilePath: string;
  targetLine: number;
  confidence: number;
  suggestedAction: string;
  codeSnippet?: string;
}

export interface InlineEditHunk {
  id: string;
  originalStart: number;
  originalLength: number;
  proposedStart: number;
  proposedLength: number;
  originalLines: string[];
  proposedLines: string[];
  accepted?: boolean;
}

export interface InlineEditResult {
  filePath: string;
  prompt: string;
  hunks: InlineEditHunk[];
  fullProposedContent: string;
}

export interface ModelGatewayRequest {
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: unknown[];
  userId?: string;
  byokKey?: string;
  stream?: boolean;
}

export interface ModelGatewayResponse {
  model: string;
  provider: string;
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs: number;
}

export interface TerminalExecutionOptions {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  projectId: string;
  userId: string;
  approvalToken?: string;
}

export interface TerminalExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  redactedSecretsCount: number;
}

export interface FloatEngineConfig {
  workspaceRoot?: string;
  projectId?: string;
  userId?: string;
  nodeEnv?: string;
  approvalSecret?: string;
  byokEncryptionKey?: string;
}
