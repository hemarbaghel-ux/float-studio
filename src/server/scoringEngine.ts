import { ScoreBreakdown, TestResult, ValidationResult } from '../types/evals';

export interface ScoringEvidence {
  taskCompleted: boolean;
  tests?: TestResult[];
  buildResult?: ValidationResult;
  typecheckResult?: ValidationResult;
  lintResult?: ValidationResult;
  securityResult?: ValidationResult;
  patchValid: boolean;
  expectedFilesFound: boolean;
  forbiddenFilesTouched: boolean;
  syntaxValid: boolean;
  regressionsCount?: number;
  agentSteps?: number;
  toolErrors?: number;
  toolCalls?: number;
  instructionViolations?: string[];
  customWeights?: Record<string, number>;
}

export const DEFAULT_WEIGHTS: Record<string, number> = {
  taskCompletion: 0.25,
  testSuccess: 0.25,
  buildSuccess: 0.15,
  typeSafety: 0.10,
  patchValidity: 0.10,
  codeQuality: 0.05,
  regressionSafety: 0.05,
  agentEfficiency: 0.05,
};

export class ScoringEngine {
  /**
   * Calculates evidence-based score breakdown from real execution results.
   */
  static calculateScore(evidence: ScoringEvidence): ScoreBreakdown {
    // 1. Task Completion (0-100)
    let taskCompletion = evidence.taskCompleted ? 100 : 0;
    if (evidence.instructionViolations && evidence.instructionViolations.length > 0) {
      taskCompletion = Math.max(0, taskCompletion - evidence.instructionViolations.length * 20);
    }

    // 2. Test Success (0-100)
    let testSuccess = 0;
    if (evidence.tests && evidence.tests.length > 0) {
      const passedCount = evidence.tests.filter((t) => t.status === 'Passed').length;
      testSuccess = Math.round((passedCount / evidence.tests.length) * 100);
    } else if (evidence.taskCompleted) {
      // If no explicit tests defined, test success defaults to task completion state
      testSuccess = evidence.taskCompleted ? 100 : 0;
    }

    // 3. Build Success (0-100)
    let buildSuccess = 100;
    if (evidence.buildResult) {
      buildSuccess = evidence.buildResult.exitCode === 0 && evidence.buildResult.status === 'Passed' ? 100 : 0;
    }

    // 4. Type Safety (0-100)
    let typeSafety = 100;
    if (evidence.typecheckResult) {
      typeSafety = evidence.typecheckResult.exitCode === 0 && evidence.typecheckResult.status === 'Passed' ? 100 : 0;
    }

    // 5. Patch Validity (0-100)
    let patchValidity = 100;
    if (!evidence.patchValid || !evidence.syntaxValid) {
      patchValidity = 0;
    } else {
      if (!evidence.expectedFilesFound) patchValidity -= 30;
      if (evidence.forbiddenFilesTouched) patchValidity -= 50;
      patchValidity = Math.max(0, patchValidity);
    }

    // 6. Code Quality (0-100)
    let codeQuality = 100;
    if (evidence.lintResult && evidence.lintResult.exitCode !== 0) {
      codeQuality -= 40;
    }
    if (evidence.securityResult && evidence.securityResult.exitCode !== 0) {
      codeQuality -= 60;
    }
    codeQuality = Math.max(0, codeQuality);

    // 7. Regression Safety (0-100)
    const regressions = evidence.regressionsCount || 0;
    const regressionSafety = Math.max(0, 100 - regressions * 25);

    // 8. Agent Efficiency (0-100)
    const toolErrors = evidence.toolErrors || 0;
    const steps = evidence.agentSteps || 1;
    let agentEfficiency = 100;
    agentEfficiency -= toolErrors * 15;
    if (steps > 10) {
      agentEfficiency -= (steps - 10) * 3;
    }
    agentEfficiency = Math.max(0, Math.min(100, agentEfficiency));

    // 9. Tool Efficiency (0-100)
    const totalTools = evidence.toolCalls || 0;
    const toolEfficiency = totalTools > 0 
      ? Math.round(Math.max(0, 100 - (toolErrors / totalTools) * 100))
      : 100;

    // 10. Instruction Following (0-100)
    const violations = evidence.instructionViolations?.length || 0;
    const instructionFollowing = Math.max(0, 100 - violations * 25);

    // Calculate Raw and Weighted Score using weights
    const weights = { ...DEFAULT_WEIGHTS, ...(evidence.customWeights || {}) };
    
    // Normalize weights so sum is 1.0
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const normalizedWeights: Record<string, number> = {};
    for (const [k, v] of Object.entries(weights)) {
      normalizedWeights[k] = totalWeight > 0 ? v / totalWeight : 1 / 8;
    }

    const weightedScore = Math.round(
      taskCompletion * (normalizedWeights.taskCompletion || 0.25) +
      testSuccess * (normalizedWeights.testSuccess || 0.25) +
      buildSuccess * (normalizedWeights.buildSuccess || 0.15) +
      typeSafety * (normalizedWeights.typeSafety || 0.10) +
      patchValidity * (normalizedWeights.patchValidity || 0.10) +
      codeQuality * (normalizedWeights.codeQuality || 0.05) +
      regressionSafety * (normalizedWeights.regressionSafety || 0.05) +
      agentEfficiency * (normalizedWeights.agentEfficiency || 0.05)
    );

    const rawScore = Math.round(
      (taskCompletion + testSuccess + buildSuccess + typeSafety + patchValidity + codeQuality + regressionSafety + agentEfficiency) / 8
    );

    const finalScore = Math.max(0, Math.min(100, weightedScore));

    return {
      taskCompletion,
      testSuccess,
      buildSuccess,
      typeSafety,
      patchValidity,
      codeQuality,
      regressionSafety,
      agentEfficiency,
      toolEfficiency,
      instructionFollowing,
      rawScore,
      normalizedScore: finalScore,
      weightedScore,
      finalScore,
      weights: normalizedWeights
    };
  }
}
