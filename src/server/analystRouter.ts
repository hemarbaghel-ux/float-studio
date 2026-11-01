import express from 'express';
import { AIProviderError } from './providers/base';
import { ModelRouter } from './providers/router';
import { DatasetProfile, DatasetColumn, ExecutiveReport, AgentProgressStep } from '../features/analyst/types';
import { requireAuth } from './authMiddleware';
import { ServerPrivacyGuard } from './privacyGuard';

// Per-user sliding window rate limiter for Data Analyst endpoints
const analystRateLimits = new Map<string, number[]>();
const MAX_ANALYST_RATE_LIMIT_USERS = 5_000;

export function checkAnalystRateLimit(userId: string, maxRequests = 20, windowMs = 60_000): boolean {
  if (!userId) return false;
  const now = Date.now();
  const timestamps = (analystRateLimits.get(userId) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    return false;
  }
  timestamps.push(now);
  analystRateLimits.delete(userId);
  if (!analystRateLimits.has(userId) && analystRateLimits.size >= MAX_ANALYST_RATE_LIMIT_USERS) {
    const oldest = analystRateLimits.keys().next().value;
    if (oldest) analystRateLimits.delete(oldest);
  }
  analystRateLimits.set(userId, timestamps);
  return true;
}

export function resetAnalystRateLimitsForTests(): void {
  analystRateLimits.clear();
}

export function createAnalystRouter(modelRouter = new ModelRouter()) {
const router = express.Router();

// Enforce verified authentication on all Data Analyst routes
router.use(requireAuth);

/**
 * Robust CSV parser supporting quotes, commas, and linebreaks.
 */
function parseCsv(csvText: string, maxRows = 2000): { headers: string[]; rows: Record<string, any>[] } {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map((h) => h.replace(/^["']|["']$/g, '').trim());
  const rows: Record<string, any>[] = [];

  for (let i = 1; i < Math.min(lines.length, maxRows + 1); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseLine(line);
    const row: Record<string, any> = {};
    headers.forEach((h, idx) => {
      let val: any = values[idx] !== undefined ? values[idx].replace(/^["']|["']$/g, '').trim() : '';
      if (val !== '' && !isNaN(Number(val))) {
        val = Number(val);
      } else if (val.toLowerCase() === 'true') {
        val = true;
      } else if (val.toLowerCase() === 'false') {
        val = false;
      }
      row[h] = val;
    });
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Profile columns from parsed rows.
 */
function profileDataset(name: string, csvText: string): DatasetProfile {
  const { headers, rows } = parseCsv(csvText);
  const columns: DatasetColumn[] = headers.map((colName) => {
    const values = rows.map((r) => r[colName]);
    const nonNullValues = values.filter((v) => v !== null && v !== undefined && v !== '');
    const nullCount = values.length - nonNullValues.length;
    const uniqueValues = Array.from(new Set(nonNullValues));

    const numericValues = nonNullValues.filter((v) => typeof v === 'number') as number[];
    const isNumeric = numericValues.length > nonNullValues.length * 0.8 && numericValues.length > 0;

    let type: 'numeric' | 'string' | 'date' | 'boolean' = 'string';
    if (isNumeric) {
      type = 'numeric';
    } else if (nonNullValues.some((v) => typeof v === 'boolean')) {
      type = 'boolean';
    } else if (nonNullValues.some((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v))) {
      type = 'date';
    }

    let min: any = undefined;
    let max: any = undefined;
    let mean: any = undefined;

    if (type === 'numeric' && numericValues.length > 0) {
      min = Math.min(...numericValues);
      max = Math.max(...numericValues);
      mean = Number((numericValues.reduce((a, b) => a + b, 0) / numericValues.length).toFixed(2));
    }

    return {
      name: colName,
      type,
      nullCount,
      uniqueCount: uniqueValues.length,
      min,
      max,
      mean,
      sampleValues: nonNullValues.slice(0, 5).map(String),
    };
  });

  return {
    id: `ds_${Date.now()}`,
    name,
    rowCount: rows.length,
    columnCount: headers.length,
    columns,
    previewRows: rows.slice(0, 30),
    rawCsv: csvText,
    fileSizeBytes: new TextEncoder().encode(csvText).length,
  };
}

function computeDatasetStats(rows: Record<string, any>[]): Record<string, any> {
  const summaryStats: Record<string, any> = {
    rowCount: rows.length,
  };

  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    keys.forEach((key) => {
      const nums = rows.map((r) => r[key]).filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];
      if (nums.length > rows.length * 0.5) {
        const sum = nums.reduce((a, b) => a + b, 0);
        const mean = sum / nums.length;
        const sorted = [...nums].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0
          ? (sorted[middle - 1] + sorted[middle]) / 2
          : sorted[middle];
        summaryStats[key] = {
          sum: Number(sum.toFixed(2)),
          mean: Number(mean.toFixed(2)),
          median,
          min: sorted[0],
          max: sorted[sorted.length - 1],
        };
      }
    });
  }

  return summaryStats;
}

function parseAnalystNarrative(text: string): { summary: string; recommendations: string[]; caveats: string[] } {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: any;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new AIProviderError('The selected model returned an invalid analyst report. Please retry.', 'PROVIDER_ERROR', 'FLOAT', 502);
  }
  if (!parsed || typeof parsed.summary !== 'string' || !parsed.summary.trim() ||
      !Array.isArray(parsed.recommendations) || !parsed.recommendations.every((item: unknown) => typeof item === 'string') ||
      !Array.isArray(parsed.caveats) || !parsed.caveats.every((item: unknown) => typeof item === 'string')) {
    throw new AIProviderError('The selected model returned an incomplete analyst report. Please retry.', 'PROVIDER_ERROR', 'FLOAT', 502);
  }
  return {
    summary: parsed.summary.trim(),
    recommendations: parsed.recommendations.map((item: string) => item.trim()).filter(Boolean).slice(0, 12),
    caveats: parsed.caveats.map((item: string) => item.trim()).filter(Boolean).slice(0, 12),
  };
}

// 1. Ingest & Profile CSV
router.post('/profile', express.json({ limit: '15mb' }), (req: any, res) => {
  if (!checkAnalystRateLimit(req.user?.uid, 30, 60_000)) {
    return res.status(429).json({ error: 'Rate limit exceeded for dataset profiling. Please wait a moment.' });
  }
  const { name = 'dataset.csv', csvData } = req.body || {};
  if (!csvData || typeof csvData !== 'string') {
    return res.status(400).json({ error: 'csvData string is required' });
  }

  try {
    const profile = profileDataset(name, csvData);
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to profile CSV dataset' });
  }
});

// 2. Query the selected model using computed server-side CSV statistics.
router.post('/query', express.json({ limit: '15mb' }), async (req: any, res) => {
  if (!checkAnalystRateLimit(req.user?.uid, 20, 60_000)) {
    return res.status(429).json({ error: 'Rate limit exceeded for analyst queries. Please wait a moment.' });
  }
  const {
    csvData,
    query,
    datasetName = 'dataset.csv',
    model = 'gpt-6-astra',
    conversationHistory = [],
  } = req.body || {};

  if (typeof csvData !== 'string' || !csvData.trim() || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'csvData and query are required', code: 'INVALID_REQUEST' });
  }
  if (typeof model !== 'string' || !model.trim()) {
    return res.status(400).json({ error: 'A selected model ID is required.', code: 'INVALID_REQUEST' });
  }

  const { rows, headers } = parseCsv(csvData);
  if (!headers.length || !rows.length) {
    return res.status(400).json({ error: 'The CSV must contain a header row and at least one data row.', code: 'INVALID_REQUEST' });
  }

  let providerId = 'unknown';

  const steps: AgentProgressStep[] = [
    {
      id: 'step-1',
      title: 'Parse dataset',
      description: `Parsed ${rows.length} rows across ${headers.length} columns.`,
      status: 'pending',
    },
    {
      id: 'step-2',
      title: 'Compute dataset statistics',
      description: `Computed descriptive statistics from ${rows.length} parsed rows.`,
      status: 'pending',
    },
    {
      id: 'step-3',
      title: 'Build charts from dataset',
      description: 'Aggregated parsed rows for the report charts.',
      status: 'pending',
    },
    {
      id: 'step-4',
      title: 'Generate model-assisted findings',
      description: `Requested a report using the selected model ${model}.`,
      status: 'pending',
    },
    {
      id: 'step-5',
      title: 'Assemble report',
      description: 'Combined provider findings with computed dataset metrics.',
      status: 'pending',
    },
  ];

  const summaryStats = computeDatasetStats(rows);

  const charts: any[] = [];
  const numericKeys = headers.filter((h) => {
    const vals = rows.map((r) => r[h]).filter((v) => typeof v === 'number');
    return vals.length > rows.length * 0.5;
  });

  const categoryKeys = headers.filter((h) => !numericKeys.includes(h));
  const primaryCategory = categoryKeys[0];
  const primaryNumeric = numericKeys[0];
  const secondaryNumeric = numericKeys[1];

  if (primaryCategory && primaryNumeric) {
    const grouped: Record<string, { count: number; sum: number; sum2: number }> = {};
    rows.forEach((r) => {
      const cat = String(r[primaryCategory] || 'Other');
      if (!grouped[cat]) grouped[cat] = { count: 0, sum: 0, sum2: 0 };
      grouped[cat].count += 1;
      const val = Number(r[primaryNumeric]);
      if (!isNaN(val)) grouped[cat].sum += val;
      if (secondaryNumeric) {
        const val2 = Number(r[secondaryNumeric]);
        if (!isNaN(val2)) grouped[cat].sum2 += val2;
      }
    });

    const chartData = Object.entries(grouped)
      .slice(0, 10)
      .map(([cat, stats]) => ({
        [primaryCategory]: cat,
        [primaryNumeric]: Number((stats.sum / (stats.count || 1)).toFixed(2)),
        ...(secondaryNumeric ? { [secondaryNumeric]: Number((stats.sum2 / (stats.count || 1)).toFixed(2)) } : {}),
      }));

    charts.push({
      type: 'bar',
      title: `${primaryNumeric.replace(/_/g, ' ')} by ${primaryCategory.replace(/_/g, ' ')}`,
      description: `Aggregated average comparison across top ${primaryCategory.replace(/_/g, ' ')} categories.`,
      xAxisKey: primaryCategory,
      series: [
        { key: primaryNumeric, name: primaryNumeric.replace(/_/g, ' '), color: '#3B82F6' },
        ...(secondaryNumeric ? [{ key: secondaryNumeric, name: secondaryNumeric.replace(/_/g, ' '), color: '#10B981' }] : []),
      ],
      data: chartData,
    });

    const distributionData = Object.entries(grouped)
      .slice(0, 6)
      .map(([cat, stats]) => ({
        name: cat,
        count: stats.count,
        value: Number(stats.sum.toFixed(1)),
      }));

    charts.push({
      type: 'pie',
      title: `Category Volume Distribution (${primaryCategory.replace(/_/g, ' ')})`,
      description: `Proportional breakdown of total observations and cumulative metrics.`,
      xAxisKey: 'name',
      series: [{ key: 'value', name: 'Total Volume', color: '#8B5CF6' }],
      data: distributionData,
    });
  }

  const history = Array.isArray(conversationHistory)
    ? conversationHistory.slice(-10).filter((message: any) =>
      message && ['user', 'assistant', 'model'].includes(message.role) &&
      typeof message.content === 'string' && message.content.trim()
    ).map((message: any) => ({
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.content.slice(0, 12_000),
    }))
    : [];
  const narrativePrompt = [
    `Analyze the dataset statistics for the user's request. The CSV was parsed server-side; no Python sandbox was used.`,
    `Dataset: ${String(datasetName).slice(0, 200)}`,
    `Rows analyzed: ${rows.length}`,
    `Columns: ${headers.join(', ')}`,
    `User request: ${query}`,
    `Computed descriptive statistics (JSON): ${JSON.stringify(summaryStats)}`,
    'Use only supplied statistics and column metadata. Do not claim statistical significance, confidence, causation, tests, or calculations that are not represented in the supplied values.',
    'Return only JSON with this schema: {"summary":"...","recommendations":["..."],"caveats":["..."]}.',
  ].join('\n\n');
  let narrative: { summary: string; recommendations: string[]; caveats: string[] };
  try {
    const resolvedRoute = modelRouter.resolveRoute(model);
    providerId = resolvedRoute.route.provider;
    const response = await modelRouter.generateContent({
      model,
      messages: [...history, { role: 'user', content: narrativePrompt }],
      systemInstruction: 'You are FLOAT Data Analyst. Report only evidence supported by the supplied dataset statistics. Never invent metrics, execution, provider behavior, confidence scores, or causal claims.',
      dataSharingAllowed: ServerPrivacyGuard.evaluateConsent(req),
    });
    narrative = parseAnalystNarrative(response.text);
  } catch (error: any) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    const code = typeof error?.code === 'string' ? error.code : 'PROVIDER_ERROR';
    return res.status(statusCode).json({
      error: error?.message || 'The selected model could not generate the analyst report.',
      code,
      provider: error?.provider || providerId,
    });
  }

  const keyMetrics = [
    {
      label: 'Rows analyzed',
      value: rows.length.toLocaleString(),
      description: 'Parsed from the uploaded CSV',
    },
    ...(primaryNumeric && summaryStats[primaryNumeric]
      ? [
          {
            label: `Average ${primaryNumeric.replace(/_/g, ' ')}`,
            value: summaryStats[primaryNumeric].mean.toLocaleString(),
            description: `Median: ${summaryStats[primaryNumeric].median}`,
          },
          {
            label: `Maximum ${primaryNumeric.replace(/_/g, ' ')}`,
            value: summaryStats[primaryNumeric].max.toLocaleString(),
            description: `Minimum: ${summaryStats[primaryNumeric].min}`,
          },
        ]
      : []),
  ];

  const report: ExecutiveReport = {
    id: `rep_${Date.now()}`,
    title: `Analytical Report: ${String(query).slice(0, 45)}`,
    summary: narrative.summary,
    keyMetrics,
    charts,
    caveats: narrative.caveats,
    recommendations: narrative.recommendations,
    generatedAt: Date.now(),
    modelUsed: model,
    providerUsed: providerId,
    rowsAnalyzed: rows.length,
    computationMethod: 'server-side CSV parsing and TypeScript descriptive statistics',
  };

  const completedSteps = steps.map((step) => ({ ...step, status: 'completed' as const }));

  res.json({
    steps: completedSteps,
    report,
  });
});

return router;
}

export const analystRouter = createAnalystRouter();
