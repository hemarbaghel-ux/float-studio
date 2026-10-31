import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import firebaseConfig from '../firebase-applet-config.json';
import { setGooglePublicKeysForTests } from '../src/server/authMiddleware';
import { resetAnalystRateLimitsForTests } from '../src/server/analystRouter';
import { createApp, resetEndpointRateLimitsForTests } from '../src/server/app';
import { modelRouter } from '../src/server/providers/router';
import { VERIFIED_MODELS, MODEL_PRICING_CONFIG } from '../src/data/verifiedModels';

function createSignedJwt(
  header: Record<string, any>,
  payload: Record<string, any>,
  privateKeyPem: string
): string {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${h}.${p}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  return `${data}.${signer.sign(privateKeyPem, 'base64url')}`;
}

async function runPhase0And1TruthfulnessTests() {
  console.log('=== FLOAT Studio — Phase 0/1 Truthfulness & Provider Routing Verification ===\n');
  let passed = 0;
  let failed = 0;

  function check(condition: unknown, message: string): void {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const kid = 'truthfulness-kid-2026';
  setGooglePublicKeysForTests({ [kid]: publicKey });
  resetAnalystRateLimitsForTests();
  resetEndpointRateLimitsForTests();

  const nowSec = Math.floor(Date.now() / 1000);
  const projectId = firebaseConfig.projectId;
  const issuer = `https://securetoken.google.com/${projectId}`;

  const validToken = createSignedJwt(
    { alg: 'RS256', kid, typ: 'JWT' },
    {
      iss: issuer,
      aud: projectId,
      sub: 'user_truthfulness_test',
      user_id: 'user_truthfulness_test',
      email: 'truth@float.dev',
      iat: nowSec - 60,
      exp: nowSec + 3600,
    },
    privateKey
  );

  // 1. Model Registry, Direct GPT-6 Routing & Firebase Project Alignment
  console.log('--- 1. Model Registry, Direct GPT-6 Routing & Firebase Project Alignment ---');
  check(
    firebaseConfig.projectId === 'float-ai-82239' && firebaseConfig.messagingSenderId === '114963491696',
    'firebase-applet-config.json is aligned with projectId="float-ai-82239" and project number="114963491696"'
  );
  const astraRoute = modelRouter.resolveRoute('gpt-6-astra');
  check(
    astraRoute.route.apiModelId === 'gpt-6-astra' && (astraRoute.route as any).upstreamModelId === undefined,
    'gpt-6-astra routes directly to apiModelId="gpt-6-astra" without gpt-4o alias mapping'
  );

  const solRoute = modelRouter.resolveRoute('gpt-6-sol');
  check(
    solRoute.route.apiModelId === 'gpt-6-sol' && (solRoute.route as any).upstreamModelId === undefined,
    'gpt-6-sol routes directly to apiModelId="gpt-6-sol" without gpt-4o alias mapping'
  );

  const lunaRoute = modelRouter.resolveRoute('gpt-6-luna');
  check(
    lunaRoute.route.apiModelId === 'gpt-6-luna' && (lunaRoute.route as any).upstreamModelId === undefined,
    'gpt-6-luna routes directly to apiModelId="gpt-6-luna" without gpt-4o alias mapping'
  );

  const verifiedLuna = VERIFIED_MODELS.find((m) => m.id === 'gpt-6-luna');
  const verifiedSol = VERIFIED_MODELS.find((m) => m.id === 'gpt-6-sol');
  check(
    Boolean(MODEL_PRICING_CONFIG.effectiveDate) &&
      verifiedLuna?.pricing.inputCostPer1M === 0.10 &&
      verifiedLuna?.pricing.outputCostPer1M === 0.50 &&
      verifiedSol?.pricing.inputCostPer1M === 2.00 &&
      verifiedSol?.pricing.outputCostPer1M === 10.00,
    'VERIFIED_MODELS uses single MODEL_PRICING_CONFIG with effectiveDate (Luna $0.10/$0.50, Sol $2/$10)'
  );

  // 2. HTTP Verification on /api/analyst/query & /api/ai/gemini-stream
  console.log('\n--- 2. HTTP Verification: Hosted OpenAI code_interpreter & 503 Error Integrity ---');
  const fs = await import('node:fs');
  const analystSource = fs.readFileSync(new URL('../src/server/analystRouter.ts', import.meta.url), 'utf-8');
  check(
    !analystSource.includes('runSandboxPython') &&
      !analystSource.includes('[FLOAT Deterministic Statistical Engine'),
    'Simulated runSandboxPython runner and hardcoded Python template are completely deleted from analystRouter.ts'
  );

  const app = await createApp({ skipVite: true });
  const server: http.Server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const origOpenAIKey = process.env.OPENAI_API_KEY;
  const origCodexKey = process.env.CODEX_API_KEY;
  const origEnvKey = process.env.OPENAI_ENVIRONMENT_KEY;
  const origGeminiKey = process.env.GEMINI_API_KEY;

  try {
    // 2A. Unconfigured OpenAI -> /api/analyst/query must return 503 NOT_CONFIGURED with setupStep
    delete process.env.OPENAI_API_KEY;
    delete process.env.CODEX_API_KEY;
    delete process.env.OPENAI_ENVIRONMENT_KEY;

    const sampleCsv = 'region,revenue,orders\nNorth,1200,12\nSouth,800,8\nEast,1500,15';
    const unconfResp = await fetch(`${baseUrl}/api/analyst/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        csvData: sampleCsv,
        datasetName: 'sales.csv',
        query: 'Summarize regional revenue performance',
        model: 'gpt-6-astra',
      }),
    });
    const unconfJson = await unconfResp.json();
    check(
      unconfResp.status === 503 &&
        unconfJson.code === 'NOT_CONFIGURED' &&
        typeof unconfJson.setupStep === 'string' &&
        unconfJson.setupStep.includes('OPENAI_API_KEY'),
      'POST /api/analyst/query without credentials returns 503 NOT_CONFIGURED with exact setupStep (no fabricated report)'
    );

    // 2B. Unsupported provider model on /api/analyst/query -> 503 with clear code
    const unsupportedResp = await fetch(`${baseUrl}/api/analyst/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        csvData: sampleCsv,
        datasetName: 'sales.csv',
        query: 'Summarize regional revenue performance',
        model: 'claude-3-5-sonnet',
      }),
    });
    const unsupportedJson = await unsupportedResp.json();
    check(
      unsupportedResp.status === 503 && unsupportedJson.code === 'UNSUPPORTED_PROVIDER',
      'POST /api/analyst/query rejects unsupported model with 503 UNSUPPORTED_PROVIDER (never fabricated)'
    );

    // 2C. Account/model does not support code_interpreter -> 503 CODE_INTERPRETER_NOT_SUPPORTED
    process.env.OPENAI_API_KEY = 'sk-test-truthfulness-key';
    const openaiAdapter = modelRouter.getAdapter('openai') as any;
    const origGetClient = openaiAdapter.getClient.bind(openaiAdapter);

    openaiAdapter.getClient = () => ({
      files: {
        create: async () => ({ id: 'file_csv_unsupported_test' }),
        delete: async () => ({ id: 'file_csv_unsupported_test', deleted: true }),
      },
      responses: {
        create: async () => {
          const err: any = new Error("Tool 'code_interpreter' is not supported with this model or account.");
          err.status = 400;
          err.code = 'invalid_request_error';
          throw err;
        },
      },
    });

    try {
      const noCiResp = await fetch(`${baseUrl}/api/analyst/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvData: sampleCsv,
          datasetName: 'sales.csv',
          query: 'Summarize regional revenue performance',
          model: 'gpt-6-astra',
        }),
      });
      const noCiJson = await noCiResp.json();
      check(
        noCiResp.status === 503 &&
          noCiJson.code === 'CODE_INTERPRETER_NOT_SUPPORTED' &&
          !noCiJson.report,
        'POST /api/analyst/query returns 503 CODE_INTERPRETER_NOT_SUPPORTED when model/account does not support code_interpreter'
      );
    } finally {
      openaiAdapter.getClient = origGetClient;
    }

    // 2D. Configured adapter with Responses API code_interpreter -> uploads CSV, attaches to container, returns stdout, files/charts, and executed Python code
    let uploadedFilename = '';
    let attachedFileIds: string[] = [];
    openaiAdapter.getClient = () => ({
      files: {
        create: async (params: any) => {
          uploadedFilename = params.file?.name || 'sales.csv';
          return { id: 'file_sales_csv_123' };
        },
        delete: async () => ({ id: 'file_sales_csv_123', deleted: true }),
      },
      responses: {
        create: async (params: any) => {
          const ciTool = (params.tools || []).find((t: any) => t.type === 'code_interpreter');
          attachedFileIds = ciTool?.container?.file_ids || [];
          const executedCode = "import pandas as pd\ndf = pd.read_csv('/mnt/data/sales.csv')\nprint(df['revenue'].sum())";
          const reportPayload = JSON.stringify({
            title: 'Regional Revenue Breakdown',
            summary: 'Total revenue across 3 regions is 3500.',
            keyMetrics: [{ label: 'Total Revenue', value: '$3,500', change: '+12%', trend: 'up', description: 'Sum of 3 regions' }],
            charts: [
              {
                type: 'bar',
                title: 'Revenue by Region',
                xAxisKey: 'region',
                series: [{ key: 'revenue', name: 'Revenue', color: '#3B82F6' }],
                data: [{ region: 'North', revenue: 1200 }, { region: 'South', revenue: 800 }, { region: 'East', revenue: 1500 }],
              },
            ],
            recommendations: ['Expand East region inventory'],
            caveats: ['Sample size is 3 rows'],
          });

          return (async function* () {
            yield {
              type: 'response.code_interpreter_call_code.delta',
              item_id: 'ci_call_1',
              output_index: 0,
              sequence_number: 1,
              delta: executedCode,
            };
            yield {
              type: 'response.code_interpreter_call_code.done',
              item_id: 'ci_call_1',
              output_index: 0,
              sequence_number: 2,
              code: executedCode,
            };
            yield {
              type: 'response.output_text.delta',
              item_id: 'msg_1',
              output_index: 1,
              content_index: 0,
              sequence_number: 3,
              delta: reportPayload,
            };
            yield {
              type: 'response.completed',
              sequence_number: 4,
              response: {
                id: 'resp_analyst_123',
                output: [
                  {
                    id: 'ci_call_1',
                    type: 'code_interpreter_call',
                    container_id: 'cntr_abc123',
                    status: 'completed',
                    code: executedCode,
                    outputs: [
                      { type: 'logs', logs: '3500\n' },
                      { type: 'image', url: 'https://files.openai.com/chart_revenue.png' },
                    ],
                  },
                  {
                    id: 'msg_1',
                    type: 'message',
                    role: 'assistant',
                    status: 'completed',
                    content: [
                      {
                        type: 'output_text',
                        text: reportPayload,
                        annotations: [
                          {
                            type: 'container_file_citation',
                            container_id: 'cntr_abc123',
                            file_id: 'cfile_chart_1',
                            filename: 'revenue_chart.png',
                            start_index: 0,
                            end_index: 10,
                          },
                        ],
                      },
                    ],
                  },
                ],
                usage: { input_tokens: 110, output_tokens: 95 },
              },
            };
          })();
        },
      },
    });

    try {
      const confResp = await fetch(`${baseUrl}/api/analyst/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvData: sampleCsv,
          datasetName: 'sales.csv',
          query: 'Summarize regional revenue performance',
          model: 'gpt-6-astra',
        }),
      });
      const confJson = await confResp.json();
      check(confResp.status === 200 && Boolean(confJson.report), 'POST /api/analyst/query succeeds via OpenAI Responses API code_interpreter');
      check(
        uploadedFilename === 'sales.csv' && attachedFileIds.includes('file_sales_csv_123'),
        'CSV file is uploaded and attached to the code_interpreter container file_ids'
      );
      check(
        confJson.code.includes("pd.read_csv('/mnt/data/sales.csv')") &&
          confJson.report.pythonCode === confJson.code,
        'Response returns the exact Python code that ran in code_interpreter'
      );
      check(
        confJson.stdout.trim() === '3500' && confJson.report.pythonOutput.trim() === '3500',
        'Response returns the real stdout logs from code_interpreter'
      );
      check(
        Array.isArray(confJson.files) &&
          confJson.files.length === 2 &&
          confJson.files.some((f: any) => f.filename === 'revenue_chart.png') &&
          Array.isArray(confJson.charts) &&
          confJson.charts.length === 1,
        'Response returns generated container files/charts and structured chart series'
      );
      check(
        confJson.report.modelUsed === 'GPT-6 Astra (via OpenAI gpt-6-astra)',
        'Report modelUsed truthfully identifies direct OpenAI gpt-6-astra target'
      );
    } finally {
      openaiAdapter.getClient = origGetClient;
    }

    // 2E-1. API connection error -> 502 API_CONNECTION_ERROR
    openaiAdapter.getClient = () => ({
      files: {
        create: async () => ({ id: 'file_conn_err' }),
        delete: async () => ({ id: 'file_conn_err', deleted: true }),
      },
      responses: {
        create: async () => {
          const err: any = new Error('Connection error: fetch failed (ECONNRESET)');
          err.name = 'APIConnectionError';
          err.code = 'ECONNRESET';
          throw err;
        },
      },
    });
    try {
      const connResp = await fetch(`${baseUrl}/api/analyst/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvData: sampleCsv,
          datasetName: 'sales.csv',
          query: 'Summarize regional revenue performance',
          model: 'gpt-6-astra',
        }),
      });
      const connJson = await connResp.json();
      check(
        connResp.status === 502 &&
          connJson.code === 'API_CONNECTION_ERROR' &&
          connJson.category === 'api_connection',
        'POST /api/analyst/query differentiates API connection issues with 502 API_CONNECTION_ERROR'
      );
    } finally {
      openaiAdapter.getClient = origGetClient;
    }

    // 2E-2. Sandbox timeout error -> 504 SANDBOX_TIMEOUT
    openaiAdapter.getClient = () => ({
      files: {
        create: async () => ({ id: 'file_timeout_err' }),
        delete: async () => ({ id: 'file_timeout_err', deleted: true }),
      },
      responses: {
        create: async () => {
          const err: any = new Error('Code interpreter sandbox execution timed out after 120s.');
          err.name = 'APIConnectionTimeoutError';
          err.code = 'ETIMEDOUT';
          throw err;
        },
      },
    });
    try {
      const timeoutResp = await fetch(`${baseUrl}/api/analyst/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvData: sampleCsv,
          datasetName: 'sales.csv',
          query: 'Run complex Monte Carlo simulation',
          model: 'gpt-6-astra',
        }),
      });
      const timeoutJson = await timeoutResp.json();
      check(
        timeoutResp.status === 504 &&
          timeoutJson.code === 'SANDBOX_TIMEOUT' &&
          timeoutJson.category === 'sandbox_timeout',
        'POST /api/analyst/query differentiates sandbox timeout errors with 504 SANDBOX_TIMEOUT'
      );
    } finally {
      openaiAdapter.getClient = origGetClient;
    }

    // 2E-3. Malformed code execution (unhandled Python SyntaxError/Traceback in sandbox) -> 422 MALFORMED_CODE_EXECUTION
    openaiAdapter.getClient = () => ({
      files: {
        create: async () => ({ id: 'file_malformed_err' }),
        delete: async () => ({ id: 'file_malformed_err', deleted: true }),
      },
      responses: {
        create: async () => ({
          id: 'resp_malformed_1',
          output: [
            {
              id: 'ci_bad_1',
              type: 'code_interpreter_call',
              container_id: 'cntr_bad',
              status: 'completed',
              code: 'import pandas as pd\ndf = pd.read_csv(\n',
              outputs: [
                {
                  type: 'logs',
                  logs: 'Traceback (most recent call last):\n  File "<stdin>", line 2\n    df = pd.read_csv(\n                    ^\nSyntaxError: unexpected EOF while parsing\n',
                },
              ],
            },
          ],
          output_text: '',
        }),
      },
    });
    try {
      const malformedResp = await fetch(`${baseUrl}/api/analyst/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvData: sampleCsv,
          datasetName: 'sales.csv',
          query: 'Run broken script',
          model: 'gpt-6-astra',
        }),
      });
      const malformedJson = await malformedResp.json();
      check(
        malformedResp.status === 422 &&
          malformedJson.code === 'MALFORMED_CODE_EXECUTION' &&
          malformedJson.category === 'malformed_code' &&
          String(malformedJson.error).includes('SyntaxError'),
        'POST /api/analyst/query differentiates malformed code execution with 422 MALFORMED_CODE_EXECUTION'
      );
    } finally {
      openaiAdapter.getClient = origGetClient;
    }

    // 2E. Unconfigured GEMINI_API_KEY on /api/ai/gemini-stream -> explicit error event
    delete process.env.GEMINI_API_KEY;
    const geminiStreamResp = await fetch(`${baseUrl}/api/ai/gemini-stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'Hello Gemini' }),
    });
    const geminiStreamText = await geminiStreamResp.text();
    check(
      geminiStreamText.includes('GEMINI_API_KEY is not configured on the server'),
      'POST /api/ai/gemini-stream without GEMINI_API_KEY returns explicit not-configured error message'
    );
  } finally {
    if (origOpenAIKey !== undefined) process.env.OPENAI_API_KEY = origOpenAIKey;
    else delete process.env.OPENAI_API_KEY;
    if (origCodexKey !== undefined) process.env.CODEX_API_KEY = origCodexKey;
    else delete process.env.CODEX_API_KEY;
    if (origEnvKey !== undefined) process.env.OPENAI_ENVIRONMENT_KEY = origEnvKey;
    else delete process.env.OPENAI_ENVIRONMENT_KEY;
    if (origGeminiKey !== undefined) process.env.GEMINI_API_KEY = origGeminiKey;
    else delete process.env.GEMINI_API_KEY;

    setGooglePublicKeysForTests(null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log(`\n======================================================================`);
  console.log(`Phase 0/1 Truthfulness Summary: ${passed} passed, ${failed} failed.`);
  console.log(`======================================================================`);
  if (failed > 0) {
    process.exit(1);
  }
}

void runPhase0And1TruthfulnessTests();
