import { ModelUsageRecord } from '../../store/usageStore';

/**
 * Generates realistic sample API usage records across all 4 supported providers
 * (Google, OpenAI, Anthropic, xAI) for the past 14 days.
 * Strictly labeled as sample preview data in the UI per FLOAT principles.
 */
export function generateSampleUsageData(): ModelUsageRecord[] {
  const records: ModelUsageRecord[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const sampleModels = [
    { provider: 'openai', modelId: 'gpt-6-astra', inputCostPer1M: 3.00, outputCostPer1M: 12.00, baseTokens: 42000 },
    { provider: 'openai', modelId: 'gpt-6.1-sol', inputCostPer1M: 3.50, outputCostPer1M: 14.00, baseTokens: 38000 }
  ];

  // Distribute over the past 14 days
  for (let day = 13; day >= 0; day--) {
    const dayStart = now - day * dayMs;
    // 3 to 7 requests per day
    const requestsCount = Math.floor(4 + ((day * 7 + 3) % 4));

    for (let r = 0; r < requestsCount; r++) {
      const model = sampleModels[(day + r * 2) % sampleModels.length];
      const variance = 0.6 + (((day * 13 + r * 17) % 100) / 120);
      const inToks = Math.round(model.baseTokens * variance * 0.7);
      const outToks = Math.round(model.baseTokens * variance * 0.3);
      const totalToks = inToks + outToks;
      const cost = ((inToks / 1000000) * model.inputCostPer1M) + ((outToks / 1000000) * model.outputCostPer1M);
      const latency = Math.round(450 + (((day * 31 + r * 11) % 1200)));

      records.push({
        requestId: `sample-req-${day}-${r}-${Math.random().toString(36).substring(2, 7)}`,
        userId: 'preview-developer',
        provider: model.provider,
        modelId: model.modelId,
        agentId: 'coder',
        timestamp: dayStart + r * 3 * 3600 * 1000 + 15 * 60 * 1000,
        inputTokens: inToks,
        outputTokens: outToks,
        cachedTokens: Math.round(inToks * 0.2),
        totalTokens: totalToks,
        latency,
        timeToFirstToken: Math.round(latency * 0.3),
        estimatedCost: Number(cost.toFixed(5)),
        status: (day === 3 && r === 2) ? 'error' : 'success',
        errorType: (day === 3 && r === 2) ? 'RATE_LIMIT_EXCEEDED' : undefined
      });
    }
  }

  return records;
}
