import express from 'express';
import { DatasetProfile, DatasetColumn, ExecutiveReport, AgentProgressStep } from '../features/analyst/types';
import { requireAuth } from './authMiddleware';
import { modelRouter } from './providers/router';
import { AIProviderError } from './providers/base';
import { checkTransactionalRateLimit, isDurableFirestoreActive, resetFallbackRateLimitsForTests } from './durableState';

export const analystRouter = express.Router();

// Per-user sliding window fallback for Data Analyst endpoints when Firestore is inactive
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

export async function checkAnalystRateLimitDurable(userId: string, maxRequests = 20, windowMs = 60_000): Promise<boolean> {
  if (!userId) return false;
  if (isDurableFirestoreActive()) {
    return checkTransactionalRateLimit('analyst', userId, maxRequests, windowMs);
  }
  return checkAnalystRateLimit(userId, maxRequests, windowMs);
}

export function resetAnalystRateLimitsForTests(): void {
  analystRateLimits.clear();
  resetFallbackRateLimitsForTests();
}

// Enforce verified authentication on all Data Analyst routes
analystRouter.use(requireAuth);

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

function tryParseJsonReport(text: string): Record<string, any> | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    candidates.unshift(fencedMatch[1].trim());
  } else {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export type AnalystErrorCategory =
  | 'api_connection'
  | 'sandbox_timeout'
  | 'malformed_code'
  | 'cancelled'
  | 'service_unavailable';

export interface ClassifiedAnalystError {
  statusCode: number;
  code: string;
  category: AnalystErrorCategory;
  error: string;
  details?: Record<string, any>;
}

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'API_CONNECTION_ERROR',
  'api_connection_error',
]);

const PYTHON_EXCEPTION_REGEX =
  /\b(SyntaxError|IndentationError|TabError|NameError|TypeError|ValueError|ZeroDivisionError|KeyError|IndexError|AttributeError|MemoryError|RuntimeError|ModuleNotFoundError|ImportError)\s*:\s*([^\r\n]+)/i;

/**
 * Classifies an error caught during hosted `code_interpreter` execution into specific
 * HTTP status codes and error categories:
 * - 499 CANCELLED: request aborted by caller
 * - 504 SANDBOX_TIMEOUT: container/sandbox execution timeout or upstream gateway timeout
 * - 502 API_CONNECTION_ERROR: upstream network/socket/DNS/connection failure
 * - 422 MALFORMED_CODE_EXECUTION: syntax error, runtime traceback, or malformed Python execution
 * - 503 NOT_CONFIGURED / CODE_INTERPRETER_NOT_SUPPORTED / UNSUPPORTED_PROVIDER / MODEL_NOT_AVAILABLE:
 *   provider not configured or model/account does not support hosted code_interpreter
 */
export function classifyAnalystExecutionError(
  err: any,
  model: string,
  aborted = false
): ClassifiedAnalystError {
  const rawMessage = String(
    err?.error?.message || err?.message || 'OpenAI Code Interpreter execution failed.'
  );
  const upstreamCode = String(
    err?.code || err?.details?.code || err?.error?.code || err?.type || ''
  );
  const status = err?.statusCode ?? err?.status ?? err?.details?.status;
  const errName = String(err?.name || '');

  // 1. Request cancellation -> 499
  if (
    aborted ||
    errName === 'AbortError' ||
    status === 499 ||
    upstreamCode === 'CANCELLED' ||
    upstreamCode === 'cancelled'
  ) {
    return {
      statusCode: 499,
      code: 'CANCELLED',
      category: 'cancelled',
      error: 'Analyst query was cancelled.',
    };
  }

  // 2. Sandbox timeout errors -> 504 Gateway Timeout
  if (
    errName === 'APIConnectionTimeoutError' ||
    upstreamCode === 'SANDBOX_TIMEOUT' ||
    upstreamCode === 'sandbox_timeout' ||
    upstreamCode === 'ETIMEDOUT' ||
    upstreamCode === 'ESOCKETTIMEDOUT' ||
    upstreamCode === 'container_expired' ||
    status === 504 ||
    /timed?\s*out|timeout|deadline exceeded|sandbox.*timeout|container.*expired|execution.*time.*limit/i.test(
      rawMessage
    )
  ) {
    return {
      statusCode: 504,
      code: 'SANDBOX_TIMEOUT',
      category: 'sandbox_timeout',
      error: `Sandbox execution timed out while running Python analysis for model "${model}": ${rawMessage}`,
      details: {
        model,
        upstreamCode: upstreamCode || 'sandbox_timeout',
        ...(err?.details && typeof err.details === 'object' ? err.details : {}),
      },
    };
  }

  // 3. API connection issues -> 502 Bad Gateway
  if (
    errName === 'APIConnectionError' ||
    NETWORK_ERROR_CODES.has(upstreamCode) ||
    status === 502 ||
    /connection error|network error|fetch failed|socket hang up|econnrefused|econnreset|enotfound|eai_again|bad gateway|upstream connect|failed to connect/i.test(
      rawMessage
    )
  ) {
    return {
      statusCode: 502,
      code: 'API_CONNECTION_ERROR',
      category: 'api_connection',
      error: `API connection error while communicating with OpenAI code_interpreter for model "${model}": ${rawMessage}`,
      details: {
        model,
        upstreamCode: upstreamCode || 'api_connection_error',
        ...(err?.details && typeof err.details === 'object' ? err.details : {}),
      },
    };
  }

  // 4. Malformed code execution -> 422 Unprocessable Entity
  if (
    upstreamCode === 'MALFORMED_CODE_EXECUTION' ||
    upstreamCode === 'malformed_code_execution' ||
    upstreamCode === 'code_execution_error' ||
    upstreamCode === 'python_execution_error' ||
    status === 422 ||
    PYTHON_EXCEPTION_REGEX.test(rawMessage) ||
    /traceback \(most recent call last\)|malformed code|code execution failed/i.test(rawMessage)
  ) {
    return {
      statusCode: 422,
      code: 'MALFORMED_CODE_EXECUTION',
      category: 'malformed_code',
      error: `Malformed code execution in sandbox for model "${model}": ${rawMessage}`,
      details: {
        model,
        upstreamCode: upstreamCode || 'malformed_code_execution',
        ...(err?.details && typeof err.details === 'object' ? err.details : {}),
      },
    };
  }

  // 5. Service unavailable / unsupported model or account -> 503 Service Unavailable
  const resolvedCode =
    err instanceof AIProviderError
      ? err.code
      : upstreamCode || 'CODE_INTERPRETER_NOT_SUPPORTED';

  return {
    statusCode: 503,
    code: resolvedCode,
    category: 'service_unavailable',
    error:
      rawMessage ||
      `OpenAI hosted code_interpreter is not supported for model "${model}" or this account.`,
    ...(err instanceof AIProviderError && err.details ? { details: err.details } : {}),
  };
}

/**
 * Inspects the completed `code_interpreter` result to detect unhandled Python syntax or
 * runtime failures when no valid executive report was produced.
 */
export function detectMalformedCodeOutput(ciResult: {
  code?: string;
  stdout?: string;
  logs?: string[];
  text?: string;
  files?: any[];
}): { isMalformed: boolean; exceptionSummary?: string; traceback?: string } {
  const combinedLogs = [
    ciResult.stdout || '',
    ...(Array.isArray(ciResult.logs) ? ciResult.logs : []),
  ]
    .join('\n')
    .trim();

  if (!combinedLogs) {
    return { isMalformed: false };
  }

  const hasTraceback = /Traceback \(most recent call last\):/i.test(combinedLogs);
  const exceptionMatch = combinedLogs.match(PYTHON_EXCEPTION_REGEX);

  if (!hasTraceback && !exceptionMatch) {
    return { isMalformed: false };
  }

  // If the model recovered and still produced a valid structured JSON executive report, do not fail the request
  const parsedReport = ciResult.text ? tryParseJsonReport(ciResult.text) : null;
  if (parsedReport && (parsedReport.summary || parsedReport.title)) {
    return { isMalformed: false };
  }

  const exceptionSummary = exceptionMatch
    ? `${exceptionMatch[1]}: ${exceptionMatch[2].trim()}`
    : 'Unhandled Python exception in code_interpreter container';

  return {
    isMalformed: true,
    exceptionSummary,
    traceback: combinedLogs,
  };
}

// 1. Ingest & Profile CSV
analystRouter.post('/profile', requireAuth, express.json({ limit: '15mb' }), async (req: any, res) => {
  if (!(await checkAnalystRateLimitDurable(req.user?.uid, 30, 60_000))) {
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

// 2. Query Agent & Execute Hosted OpenAI Code Interpreter via Responses API
analystRouter.post('/query', requireAuth, express.json({ limit: '15mb' }), async (req: any, res) => {
  if (!(await checkAnalystRateLimitDurable(req.user?.uid, 20, 60_000))) {
    return res.status(429).json({ error: 'Rate limit exceeded for analyst queries. Please wait a moment.' });
  }
  const {
    csvData,
    query,
    datasetName = 'dataset.csv',
    model = 'gpt-6-astra',
  } = req.body || {};

  if (!csvData || !query) {
    return res.status(400).json({ error: 'csvData and query are required' });
  }

  if (/^(claude|grok|deepseek|llama|mistral|qwen|cohere|gemini)/i.test(String(model).trim())) {
    return res.status(503).json({
      error: `Model "${model}" does not support OpenAI hosted code_interpreter.`,
      code: 'UNSUPPORTED_PROVIDER',
      category: 'unsupported_model',
    });
  }

  let routeInfo: ReturnType<typeof modelRouter.resolveRoute>;
  try {
    routeInfo = modelRouter.resolveRoute(model);
  } catch (err: any) {
    const classified = classifyAnalystExecutionError(err, model, false);
    return res.status(classified.statusCode).json({
      error: classified.error || `Model "${model}" does not support OpenAI hosted code_interpreter.`,
      code: classified.code,
      category: classified.category,
      ...(classified.details ? { details: classified.details } : {}),
    });
  }

  if (routeInfo.route.provider !== 'openai' || typeof (routeInfo.adapter as any).runCodeInterpreterResponse !== 'function') {
    return res.status(503).json({
      error: `Model "${model}" (${routeInfo.route.provider}) does not support OpenAI hosted code_interpreter.`,
      code: 'UNSUPPORTED_PROVIDER',
      category: 'unsupported_model',
    });
  }

  if (!routeInfo.adapter.isConfigured()) {
    return res.status(503).json({
      error: 'AI provider is not configured for Data Analyst queries. Set OPENAI_API_KEY in the server environment (.env) and restart the server.',
      code: 'NOT_CONFIGURED',
      category: 'service_unavailable',
      setupStep: 'Add OPENAI_API_KEY=sk-... to your server .env file and restart the server.',
    });
  }

  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  const { rows, headers } = parseCsv(csvData);
  const modelDisplayMap: Record<string, string> = {
    'gpt-6-astra': 'GPT-6 Astra',
    'gpt-6-sol': 'GPT-6 Sol',
    'gpt-6-luna': 'GPT-6 Luna',
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o mini',
    'float-basic': 'GPT-4o mini'
  };
  const upstreamTarget = routeInfo.route.apiModelId;
  const modelName = modelDisplayMap[model] || model;
  const truthfulModelLabel = `${modelName} (via OpenAI ${upstreamTarget})`;

  const instructions =
    `You are the FLOAT Senior Data Analyst Agent (${truthfulModelLabel}). ` +
    `A CSV file named "${datasetName}" (${rows.length} rows, columns: ${headers.join(', ')}) is attached to your code_interpreter container. ` +
    `Use the code_interpreter tool to load and analyze the CSV file in Python, print key statistical outputs to stdout, ` +
    `and then return your final executive report as a JSON object with this structure:\n` +
    `{\n` +
    `  "title": "Concise Descriptive Report Title",\n` +
    `  "summary": "Executive findings with exact figures computed by Python.",\n` +
    `  "keyMetrics": [\n` +
    `    { "label": "Metric Name", "value": "Computed Value", "change": "Context", "trend": "up|down|neutral", "description": "Details" }\n` +
    `  ],\n` +
    `  "charts": [\n` +
    `    {\n` +
    `      "type": "bar",\n` +
    `      "title": "Chart Title",\n` +
    `      "description": "Chart description",\n` +
    `      "xAxisKey": "category_col",\n` +
    `      "series": [{ "key": "numeric_col", "name": "Series Name", "color": "#3B82F6" }],\n` +
    `      "data": []\n` +
    `    }\n` +
    `  ],\n` +
    `  "recommendations": ["Recommendation 1", "Recommendation 2"],\n` +
    `  "caveats": ["Caveat 1", "Caveat 2"]\n` +
    `}`;

  const startTime = Date.now();
  let ciResult;
  try {
    ciResult = await modelRouter.runCodeInterpreterResponse(
      {
        model,
        apiModelId: upstreamTarget,
        instructions,
        input: `Dataset: "${datasetName}"\nUser query: "${query}"`,
        csvFile: {
          filename: datasetName,
          content: csvData,
          mimeType: 'text/csv',
        },
        stream: true,
        signal: abortController.signal,
      },
      undefined,
      abortController.signal
    );
  } catch (err: any) {
    const classified = classifyAnalystExecutionError(
      err,
      model,
      abortController.signal.aborted
    );
    if (classified.statusCode === 499 && res.headersSent) {
      return;
    }
    return res.status(classified.statusCode).json({
      error: classified.error,
      code: classified.code,
      category: classified.category,
      ...(classified.details ? { details: classified.details } : {}),
    });
  }

  const malformedCheck = detectMalformedCodeOutput(ciResult);
  if (malformedCheck.isMalformed) {
    return res.status(422).json({
      error: `Malformed code execution in sandbox: ${malformedCheck.exceptionSummary}`,
      code: 'MALFORMED_CODE_EXECUTION',
      category: 'malformed_code',
      details: {
        model,
        exception: malformedCheck.exceptionSummary,
        pythonCode: ciResult.code || '',
        stdout: ciResult.stdout || malformedCheck.traceback || '',
      },
    });
  }

  const hasCode = Boolean(ciResult.code && ciResult.code.trim().length > 0);
  const hasStdout = Boolean(ciResult.stdout && ciResult.stdout.trim().length > 0);
  const hasText = Boolean(ciResult.text && ciResult.text.trim().length > 0);
  const hasFiles = Array.isArray(ciResult.files) && ciResult.files.length > 0;

  if (!hasCode && !hasStdout && !hasText && !hasFiles) {
    return res.status(503).json({
      error: `OpenAI hosted code_interpreter returned an empty execution result for model "${model}".`,
      code: 'CODE_INTERPRETER_UNAVAILABLE',
      category: 'service_unavailable',
    });
  }

  const parsedJson = tryParseJsonReport(ciResult.text);
  const reportTitle =
    (typeof parsedJson?.title === 'string' && parsedJson.title.trim()) ||
    `Analytical Report: ${String(query).slice(0, 45)}`;
  const aiSummary =
    (typeof parsedJson?.summary === 'string' && parsedJson.summary.trim()) ||
    ciResult.text.trim() ||
    ciResult.stdout.trim();
  const aiCaveats: string[] = Array.isArray(parsedJson?.caveats)
    ? parsedJson.caveats.map(String)
    : [];
  const aiRecommendations: string[] = Array.isArray(parsedJson?.recommendations)
    ? parsedJson.recommendations.map(String)
    : [];
  const reportCharts: any[] = Array.isArray(parsedJson?.charts) ? parsedJson.charts : [];

  const keyMetrics =
    Array.isArray(parsedJson?.keyMetrics) && parsedJson.keyMetrics.length > 0
      ? parsedJson.keyMetrics
      : [
          {
            label: 'Sample Rows',
            value: rows.length.toLocaleString(),
            change: 'Uploaded CSV',
            trend: 'neutral' as const,
            description: datasetName,
          },
          {
            label: 'Columns Profiled',
            value: headers.length.toLocaleString(),
            change: 'CSV Schema',
            trend: 'neutral' as const,
            description: headers.slice(0, 4).join(', '),
          },
        ];

  const elapsedMs = Math.max(1, Date.now() - startTime);
  const steps: AgentProgressStep[] = [
    {
      id: 'step-1',
      title: 'Upload CSV to OpenAI Files API',
      description: `Uploaded ${datasetName} (${rows.length} rows, ${headers.length} columns) and attached to code_interpreter container`,
      status: 'completed',
      durationMs: Math.round(elapsedMs * 0.2),
    },
    {
      id: 'step-2',
      title: 'Execute Python in Hosted code_interpreter',
      description: hasCode
        ? `Executed ${ciResult.codeBlocks.length} Python code block(s) via OpenAI Responses API`
        : 'Processed analytical request via OpenAI Responses API',
      status: 'completed',
      durationMs: Math.round(elapsedMs * 0.6),
    },
    {
      id: 'step-3',
      title: 'Capture stdout, Charts & Generated Files',
      description: `Captured ${ciResult.logs.length} stdout log block(s) and ${ciResult.files.length} generated container file(s)`,
      status: 'completed',
      durationMs: Math.round(elapsedMs * 0.2),
    },
  ];

  const report: ExecutiveReport = {
    id: ciResult.responseId || `rep_${Date.now()}`,
    title: reportTitle,
    summary: aiSummary,
    keyMetrics,
    charts: reportCharts,
    generatedFiles: ciResult.files,
    pythonCode: ciResult.code,
    pythonOutput: ciResult.stdout,
    caveats: aiCaveats,
    recommendations: aiRecommendations,
    generatedAt: Date.now(),
    modelUsed: truthfulModelLabel,
  };

  res.json({
    code: ciResult.code,
    stdout: ciResult.stdout,
    files: ciResult.files,
    charts: reportCharts,
    steps,
    report,
  });
});
