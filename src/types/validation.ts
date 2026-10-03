export type ProjectValidationType = 'typecheck' | 'syntax' | 'build' | 'test' | 'eslint';

export type ValidationStatus = 'idle' | 'running' | 'passed' | 'failed' | 'cancelled' | 'unsupported';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface ValidationDiagnostic {
  id: string;
  checkType: ProjectValidationType;
  severity: DiagnosticSeverity;
  message: string;
  filePath?: string;
  line?: number;
  column?: number;
  codeSnippet?: string;
  source?: string;
  raw?: string;
}

export interface ValidationCheckResult {
  type: ProjectValidationType;
  name: string;
  status: ValidationStatus;
  durationMs: number;
  message?: string;
  diagnostics: ValidationDiagnostic[];
  unsupportedReason?: string;
}

export interface ValidationRun {
  id: string;
  projectId: string;
  userId: string;
  target: 'current_project' | 'proposal';
  proposalId?: string;
  status: ValidationStatus;
  startTime: number;
  completionTime?: number;
  durationMs?: number;
  checks: ValidationCheckResult[];
  errorCount: number;
  warningCount: number;
  summary: string;
}

export interface ErrorExplanationRequest {
  diagnostic: ValidationDiagnostic;
  targetFileContent?: string;
  projectId: string;
  modelId?: string;
}

export interface ErrorExplanationResponse {
  explanation: string;
  likelyCause: string;
  affectedCodeSection?: string;
  suggestedSteps: string[];
  proposedFix?: {
    path: string;
    description: string;
    proposedContent: string;
  };
}
