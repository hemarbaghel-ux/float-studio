import { ChangeSet } from './index';

export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Expert';

export type EvalCategory =
  | 'Coding'
  | 'Debugging'
  | 'Refactoring'
  | 'Testing'
  | 'UI'
  | 'Backend'
  | 'Database'
  | 'Security'
  | 'Performance'
  | 'Documentation'
  | 'Accessibility'
  | 'Reasoning'
  | 'Agentic'
  | 'Multi-file Editing'
  | 'Terminal Tasks'
  | 'Repository Understanding'
  | 'Code Generation'
  | 'Code Completion'
  | 'Code Understanding'
  | 'Architecture'
  | 'Instruction Following'
  | 'Tool Use'
  | 'Planning'
  | 'Git Operations'
  | 'Deployment'
  | 'Migration';

export type ValidationType =
  | 'Tests'
  | 'TypeScript'
  | 'Build'
  | 'Exact output'
  | 'Custom script'
  | 'Manual review';

export interface TaskFile {
  path: string;
  content: string;
}

export interface EvalTask {
  id: string;
  ownerId?: string;
  name: string;
  description: string;
  category: EvalCategory;
  difficulty: Difficulty;
  prompt: string;
  expectedBehavior?: string;
  validationMethod?: ValidationType;
  validationType?: string; // backwards compatibility
  projectId?: string;
  repository?: string;
  baseCommit?: string;
  workingDirectory?: string;
  files?: TaskFile[];
  validationCommands?: string[];
  testCommands?: string[];
  buildCommands?: string[];
  typecheckCommands?: string[];
  lintCommands?: string[];
  securityChecks?: string[];
  expectedFiles?: string[];
  forbiddenFiles?: string[];
  timeout?: number; // in milliseconds
  createdAt?: any;
  updatedAt?: any;
}

export interface TestResult {
  name: string;
  status: 'Passed' | 'Failed' | 'Skipped' | 'Error' | 'Timeout';
  durationMs: number;
  expectedResult?: string;
  actualResult?: string;
  failureReason?: string;
}

export interface ValidationResult {
  command: string;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  errorSummary?: string;
  status: 'Passed' | 'Failed' | 'Not Run';
}

export interface ScoreBreakdown {
  taskCompletion: number; // 0-100
  testSuccess: number; // 0-100
  buildSuccess: number; // 0-100
  typeSafety: number; // 0-100
  patchValidity: number; // 0-100
  codeQuality: number; // 0-100
  regressionSafety: number; // 0-100
  agentEfficiency: number; // 0-100
  toolEfficiency: number; // 0-100
  instructionFollowing: number; // 0-100
  rawScore: number;
  normalizedScore: number;
  weightedScore: number;
  finalScore: number;
  weights?: Record<string, number>;
}

export interface ToolCallTrace {
  id?: string;
  toolName: string;
  arguments: any;
  output?: any;
  durationMs: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

export interface AgentTraceStep {
  stepNumber: number;
  phase: string;
  message: string;
  timestamp: number;
  toolCalls?: ToolCallTrace[];
}

export type EvalRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout'
  | 'Queued'
  | 'Running'
  | 'Completed'
  | 'Failed'
  | 'Cancelled';

export interface EvalRun {
  id: string;
  ownerId?: string;
  taskId: string;
  taskName?: string;
  modelId: string;
  providerId: string;
  agentId: string;
  benchmarkId?: string;
  snapshotId?: string;
  status: EvalRunStatus;
  startedAt: number;
  completedAt?: number;
  duration?: number; // in seconds
  durationMs?: number; // in milliseconds
  score?: number; // 0-100
  
  // Real Token & Cost accounting
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  actualCost?: number;
  
  // Latency breakdown
  timeToFirstToken?: number;
  generationLatency?: number;
  
  // Privacy & Consent Governance
  dataSharingConsent?: boolean;
  isPrivate?: boolean;
  
  // Execution evidence
  agentSteps?: number;
  toolCalls?: number;
  filesRead?: number;
  filesChanged?: number;
  patchCreated?: boolean;
  patchValid?: boolean;
  buildPassed?: boolean;
  typecheckPassed?: boolean;
  lintPassed?: boolean;
  testsPassed?: boolean;
  securityPassed?: boolean;
  testCount?: number;
  testsPassedCount?: number;
  testsFailedCount?: number;
  regressionCount?: number;
  
  // Scoring
  humanReviewScore?: number;
  automatedScore?: number;
  finalScore?: number;
  scoreBreakdown?: ScoreBreakdown;
  
  // Errors & Output
  errorType?: string;
  errorMessage?: string;
  errors?: string[];
  outputText?: string;
  
  // Artifacts
  changeSet?: ChangeSet;
  validationResults?: {
    build?: ValidationResult;
    typecheck?: ValidationResult;
    lint?: ValidationResult;
    tests?: TestResult[];
    security?: ValidationResult;
  };
  toolTrace?: ToolCallTrace[];
  agentTrace?: AgentTraceStep[];
  activity?: any[];
  
  // Retries & metadata
  attemptNumber?: number;
  parentRunId?: string;
  retryReason?: string;
  environmentMetadata?: Record<string, any>;
  metrics?: {
    estimatedCost?: number;
    tokenUsage?: {
      total?: number;
      input?: number;
      output?: number;
    };
    latency?: number;
  };
  
  createdAt?: any;
  updatedAt?: any;
}

export interface Benchmark {
  id: string;
  ownerId?: string;
  name: string;
  description: string;
  version: string;
  taskCount: number;
  taskIds: string[];
  categories: EvalCategory[];
  difficulty: Difficulty;
  scoringConfig?: Record<string, number>;
  createdAt: number;
  updatedAt: number;
}

export interface HumanReview {
  id: string;
  runId: string;
  ownerId: string;
  reviewerId: string;
  reviewTimestamp: number;
  codeQualityScore: number; // 0-100
  architectureScore: number; // 0-100
  maintainabilityScore: number; // 0-100
  instructionFollowingScore: number; // 0-100
  uxScore?: number; // 0-100
  correctnessScore: number; // 0-100
  comments: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface LeaderboardEntry {
  rank: number;
  modelId: string;
  modelName: string;
  providerId: string;
  agentId?: string;
  overallScore: number;
  taskSuccessRate: number;
  testPassRate: number;
  buildSuccessRate: number;
  patchValidityRate: number;
  avgLatencyMs: number;
  avgTokens: number;
  avgCost: number;
  evaluationsCount: number;
  confidence: 'high' | 'medium' | 'limited';
}

export interface EvalBaseline {
  id: string;
  benchmarkId: string;
  modelId: string;
  score: number;
  testPassRate: number;
  buildSuccessRate: number;
  latency: number;
  tokens: number;
  cost: number;
  createdAt: number;
}

export interface ExternalBenchmarkResult {
  source: string;
  sourceUrl: string;
  publisher: string;
  benchmarkName: string;
  benchmarkVersion: string;
  modelId: string;
  score: number;
  metric: string;
  publishedAt: string;
  retrievedAt: string;
}
