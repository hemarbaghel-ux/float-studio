/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type BenchmarkExecutionMode = 'deterministic_mock_contract' | 'live_provider_verified';

export interface BenchmarkTaskResult {
  readonly taskId: string;
  readonly category: 'bug_fix' | 'multi_file_refactor' | 'failing_test_repair' | 'git_conflict' | 'security_guard';
  readonly executionMode: BenchmarkExecutionMode;
  readonly completed: boolean;
  readonly testsPassed: boolean;
  readonly introducedRegression: boolean;
  readonly patchAccepted: boolean;
  readonly latencyMs: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number;
  readonly toolErrorCount: number;
  readonly humanInterventions: number;
}

export interface BenchmarkSuiteSummary {
  readonly suiteName: string;
  readonly executionMode: BenchmarkExecutionMode;
  readonly isLiveProviderVerified: boolean;
  readonly totalTasks: number;
  readonly taskCompletionRate: number;
  readonly testPassRate: number;
  readonly regressionRate: number;
  readonly patchAcceptanceRate: number;
  readonly averageLatencyMs: number;
  readonly totalTokens: number;
  readonly totalEstimatedCostUsd: number;
  readonly toolErrorRate: number;
  readonly humanInterventionRate: number;
  readonly results: readonly BenchmarkTaskResult[];
}

export function summarizeBenchmarkSuite(
  suiteName: string,
  executionMode: BenchmarkExecutionMode,
  results: readonly BenchmarkTaskResult[]
): BenchmarkSuiteSummary {
  const total = results.length;
  if (total === 0) {
    return {
      suiteName,
      executionMode,
      isLiveProviderVerified: executionMode === 'live_provider_verified',
      totalTasks: 0,
      taskCompletionRate: 0,
      testPassRate: 0,
      regressionRate: 0,
      patchAcceptanceRate: 0,
      averageLatencyMs: 0,
      totalTokens: 0,
      totalEstimatedCostUsd: 0,
      toolErrorRate: 0,
      humanInterventionRate: 0,
      results: [],
    };
  }

  for (const r of results) {
    if (r.executionMode !== executionMode) {
      throw new Error(
        `Benchmark integrity violation: cannot mix "${r.executionMode}" task "${r.taskId}" into "${executionMode}" suite.`
      );
    }
  }

  const completed = results.filter(r => r.completed).length;
  const passed = results.filter(r => r.testsPassed).length;
  const regressions = results.filter(r => r.introducedRegression).length;
  const accepted = results.filter(r => r.patchAccepted).length;
  const totalLatency = results.reduce((acc, r) => acc + r.latencyMs, 0);
  const totalTokens = results.reduce((acc, r) => acc + r.totalTokens, 0);
  const totalCost = results.reduce((acc, r) => acc + r.estimatedCostUsd, 0);
  const tasksWithToolErrors = results.filter(r => r.toolErrorCount > 0).length;
  const tasksWithHumanIntervention = results.filter(r => r.humanInterventions > 0).length;

  return {
    suiteName,
    executionMode,
    isLiveProviderVerified: executionMode === 'live_provider_verified',
    totalTasks: total,
    taskCompletionRate: Number((completed / total).toFixed(4)),
    testPassRate: Number((passed / total).toFixed(4)),
    regressionRate: Number((regressions / total).toFixed(4)),
    patchAcceptanceRate: Number((accepted / total).toFixed(4)),
    averageLatencyMs: Math.round(totalLatency / total),
    totalTokens,
    totalEstimatedCostUsd: Number(totalCost.toFixed(6)),
    toolErrorRate: Number((tasksWithToolErrors / total).toFixed(4)),
    humanInterventionRate: Number((tasksWithHumanIntervention / total).toFixed(4)),
    results,
  };
}
