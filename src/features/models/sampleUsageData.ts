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
    { provider: 'google', modelId: 'gemini-3.1-flash-lite', inputCostPer1M: 0.075, outputCostPer1M: 0.30, baseTokens: 35000 },
    { provider: 'google', modelId: 'gemini-3.8-flash', inputCostPer1M: 0.15, outputCostPer1M: 0.60, baseTokens: 48000 },
    { provider: 'openai', modelId: 'gpt-4o', inputCostPer1M: 2.50, outputCostPer1M: 10.00, baseTokens: 28000 },
    { provider: 'openai', modelId: 'o3-mini', inputCostPer1M: 1.10, outputCostPer1M: 4.40, baseTokens: 32000 },
    { provider: 'anthropic', modelId: 'claude-3-7-sonnet-20250219', inputCostPer1M: 3.00, outputCostPer1M: 15.00, baseTokens: 42000 },
    { provider: 'anthropic', modelId: 'claude-3-5-haiku-20241022', inputCostPer1M: 0.80, outputCostPer1M: 4.00, baseTokens: 22000 },
    { provider: 'xai', modelId: 'grok-2-1212', inputCostPer1M: 2.00, outputCostPer1M: 10.00, baseTokens: 25000 }
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
