/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface TabCompletionPolicy {
  readonly enabled: boolean;
  readonly privacyModeRedaction: boolean;
  readonly disabledLanguages: readonly string[];
  readonly maxLatencyMs: number;
}

export interface TabCompletionPrediction {
  readonly completionText: string;
  readonly isMultiLine: boolean;
  readonly partialWordAcceptText: string;
  readonly partialLineAcceptText: string;
  readonly nextEditJump?: {
    readonly filePath: string;
    readonly targetLine: number;
    readonly reason: string;
  };
  readonly cacheHit: boolean;
  readonly latencyMs: number;
}

export interface TabCompletionMetrics {
  readonly totalRequests: number;
  readonly cacheHits: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly cancelledCount: number;
  readonly averageLatencyMs: number;
}

export class TabCompletionCoordinator {
  private readonly cache = new Map<string, { prediction: TabCompletionPrediction; expiresAt: number }>();
  private readonly maxCacheEntries = 128;
  private policy: TabCompletionPolicy = {
    enabled: true,
    privacyModeRedaction: true,
    disabledLanguages: [],
    maxLatencyMs: 1500,
  };
  private totalRequests = 0;
  private cacheHits = 0;
  private acceptedCount = 0;
  private rejectedCount = 0;
  private cancelledCount = 0;
  private cumulativeLatencyMs = 0;

  public setPolicy(partial: Partial<TabCompletionPolicy>): TabCompletionPolicy {
    this.policy = { ...this.policy, ...partial };
    return this.policy;
  }

  public getPolicy(): TabCompletionPolicy {
    return this.policy;
  }

  public isAllowedForLanguage(language: string): boolean {
    if (!this.policy.enabled) return false;
    const norm = language.trim().toLowerCase();
    return !this.policy.disabledLanguages.some(l => l.toLowerCase() === norm);
  }

  public buildCacheKey(filePath: string, language: string, prefix: string, suffix: string): string {
    return `${filePath}::${language}::${prefix.slice(-240)}::${suffix.slice(0, 120)}`;
  }

  public getCached(key: string): TabCompletionPrediction | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    this.totalRequests++;
    this.cacheHits++;
    return { ...entry.prediction, cacheHit: true, latencyMs: 0 };
  }

  public recordCompletion(
    key: string,
    completionText: string,
    filePath: string,
    suffix: string,
    latencyMs: number
  ): TabCompletionPrediction {
    this.totalRequests++;
    this.cumulativeLatencyMs += Math.max(0, latencyMs);

    const lines = completionText.split('\n');
    const firstLine = lines[0] || '';
    const firstWordMatch = firstLine.match(/^\s*\S+/);
    const partialWordAcceptText = firstWordMatch ? firstWordMatch[0] : firstLine;

    let nextEditJump: TabCompletionPrediction['nextEditJump'];
    const todoIndex = suffix.indexOf('TODO');
    if (todoIndex !== -1) {
      const linesUntilTodo = suffix.slice(0, todoIndex).split('\n').length;
      nextEditJump = {
        filePath,
        targetLine: linesUntilTodo + 1,
        reason: 'Follow-up TODO marker detected in file suffix',
      };
    }

    const prediction: TabCompletionPrediction = {
      completionText,
      isMultiLine: lines.length > 1,
      partialWordAcceptText,
      partialLineAcceptText: firstLine,
      nextEditJump,
      cacheHit: false,
      latencyMs,
    };

    if (this.cache.size >= this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { prediction, expiresAt: Date.now() + 30_000 });
    return prediction;
  }

  public recordAcceptance(accepted: boolean): void {
    if (accepted) this.acceptedCount++;
    else this.rejectedCount++;
  }

  public recordCancellation(): void {
    this.cancelledCount++;
  }

  public getMetrics(): TabCompletionMetrics {
    return {
      totalRequests: this.totalRequests,
      cacheHits: this.cacheHits,
      acceptedCount: this.acceptedCount,
      rejectedCount: this.rejectedCount,
      cancelledCount: this.cancelledCount,
      averageLatencyMs: this.totalRequests > 0 ? Math.round(this.cumulativeLatencyMs / this.totalRequests) : 0,
    };
  }
}

export const defaultTabCoordinator = new TabCompletionCoordinator();
