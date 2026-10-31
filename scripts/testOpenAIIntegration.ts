import { ModelRouter } from '../src/server/providers/router';
import { OpenAIAdapter, normalizeOpenAIError, normalizeCodeInterpreterError } from '../src/server/providers/openai';
import { AIProviderError } from '../src/server/providers/base';
import { GPT6_ASTRA_CLOUD_CONFIG } from '../src/server/providers/cloudAgentConfig';
import { INITIAL_MODELS, INITIAL_AGENTS } from '../src/features/ai/registry';
import { VERIFIED_MODELS, MODEL_PRICING_CONFIG } from '../src/data/verifiedModels';
import { DASHBOARD_MODELS } from '../src/features/dashboard/dashboardModels';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, extra?: any) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}`, extra || '');
    failed++;
  }
}

async function runOpenAIIntegrationTests() {
  console.log('\n======================================================');
  console.log('FLOAT AI — REAL OPENAI INTEGRATION & ROUTING TEST SUITE');
  console.log('======================================================\n');

  const router = new ModelRouter();

  // Test Suite 1: Verified Model Routing (Real GPT-6 IDs + Standard OpenAI Models)
  console.log('--- Test Suite 1: Verified Model Routing ---');
  const verifiedModelsToTest = [
    { input: 'gpt-6-astra', expectedApiId: 'gpt-6-astra' },
    { input: 'gpt-6-sol', expectedApiId: 'gpt-6-sol' },
    { input: 'gpt-6-luna', expectedApiId: 'gpt-6-luna' },
    { input: 'gpt-4o', expectedApiId: 'gpt-4o' },
    { input: 'gpt-4o-mini', expectedApiId: 'gpt-4o-mini' },
    { input: 'o1', expectedApiId: 'o1' },
    { input: 'o1-mini', expectedApiId: 'o1-mini' },
    { input: 'o3-mini', expectedApiId: 'o3-mini' },
    { input: 'gpt-4.5-preview', expectedApiId: 'gpt-4.5-preview' },
    { input: 'gpt-4-turbo', expectedApiId: 'gpt-4-turbo' },
    { input: 'gpt-3.5-turbo', expectedApiId: 'gpt-3.5-turbo' },
    { input: 'auto', expectedApiId: 'gpt-6-astra' },
    { input: 'float-basic', expectedApiId: 'gpt-4o-mini' }
  ];

  for (const { input, expectedApiId } of verifiedModelsToTest) {
    const route = router.resolveRoute(input);
    assert(route.route.provider === 'openai', `Model "${input}" routes exclusively to OpenAI provider`);
    assert(route.route.apiModelId === expectedApiId, `Model "${input}" resolves to upstream API ID "${expectedApiId}"`);
    assert((route.route as any).upstreamModelId === undefined, `Model "${input}" has no gpt-4o alias override`);
  }

  // Test Suite 2: Rejection of Unsupported Providers & Models
  console.log('\n--- Test Suite 2: Strict Rejection of Unsupported Providers ---');
  const unsupportedModels = [
    'gemini-1.5-pro',
    'gemini-2.0-flash',
    'claude-3-5-sonnet',
    'claude-opus-5',
    'grok-2',
    'deepseek-chat',
    'llama-3.1-70b',
    'mistral-large',
    'qwen-2.5-coder'
  ];

  for (const unsupp of unsupportedModels) {
    let err: any = null;
    try {
      router.resolveRoute(unsupp);
    } catch (e: any) {
      err = e;
    }
    assert(err instanceof AIProviderError, `Unsupported model "${unsupp}" throws AIProviderError`);
    assert(err?.code === 'UNSUPPORTED_PROVIDER', `Unsupported model "${unsupp}" has code UNSUPPORTED_PROVIDER`);
    assert(err?.statusCode === 400, `Unsupported model "${unsupp}" has HTTP 400 status`);
  }

  // Test Suite 3: Unknown Models throw 404 MODEL_NOT_AVAILABLE (No silent fallback)
  console.log('\n--- Test Suite 3: No Silent Fallback for Unknown Models ---');
  const unknownModels = ['gpt-random-fake-99', 'non-existent-model', 'custom-float-xyz', 'gpt-6.1-sol'];
  for (const unk of unknownModels) {
    let err: any = null;
    try {
      router.resolveRoute(unk);
    } catch (e: any) {
      err = e;
    }
    assert(err instanceof AIProviderError, `Unknown model "${unk}" throws AIProviderError`);
    assert((err?.code as string) === 'MODEL_NOT_AVAILABLE', `Unknown model "${unk}" has code MODEL_NOT_AVAILABLE`);
    assert(err?.statusCode === 404, `Unknown model "${unk}" has HTTP 404 status`);
  }

  // Test Suite 4: Error Normalization (NOT_CONFIGURED / AUTH_ERROR / MODEL_NOT_AVAILABLE / RATE_LIMITED)
  console.log('\n--- Test Suite 4: OpenAI Upstream Error Normalization ---');
  const authErr = normalizeOpenAIError({ status: 401, code: 'invalid_api_key', message: 'Incorrect API key provided' });
  assert(authErr.code === 'AUTH_ERROR', '401 normalized to AUTH_ERROR');
  assert(authErr.statusCode === 401, 'AUTH_ERROR has status 401');

  const quotaErr = normalizeOpenAIError({ status: 429, code: 'insufficient_quota', message: 'You exceeded your current quota, please check your plan and billing details.' });
  assert(quotaErr.code === 'RATE_LIMITED', 'Insufficient quota normalized to RATE_LIMITED');
  assert(quotaErr.statusCode === 429, 'RATE_LIMITED has status 429');

  const rateErr = normalizeOpenAIError({ status: 429, code: 'rate_limit_exceeded', message: 'Rate limit reached for requests' });
  assert(rateErr.code === 'RATE_LIMITED', 'Rate limit normalized to RATE_LIMITED');
  assert(rateErr.statusCode === 429, 'RATE_LIMITED has status 429');

  const notFoundErr = normalizeOpenAIError({ status: 404, code: 'model_not_found', message: 'The model `gpt-6-astra` does not exist or you do not have access to it.' });
  assert((notFoundErr.code as string) === 'MODEL_NOT_AVAILABLE', '404 model not found normalized to MODEL_NOT_AVAILABLE');
  assert(notFoundErr.statusCode === 404, 'MODEL_NOT_AVAILABLE has status 404');

  const abortErr = normalizeOpenAIError({ name: 'AbortError', message: 'Request was aborted' });
  assert(abortErr.name === 'AbortError', 'AbortError preserves abort name for cancellation');

  // Test Suite 5: Mocked OpenAI HTTP Layer - Verifying Direct GPT-6 Model Preservation & No Silent gpt-4o Retry
  console.log('\n--- Test Suite 5: Mocked OpenAI Layer (Direct GPT-6 Model & No Silent Fallback) ---');
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-dummy-key-for-mock';

  const capturedModels: string[] = [];
  let capturedStreamOptions: any = null;
  let capturedReasoningEffort: any = null;
  let capturedMaxCompletionTokens: any = null;

  const mockAdapter = new OpenAIAdapter();
  (mockAdapter as any).getClient = () => {
    return {
      chat: {
        completions: {
          create: async (params: any) => {
            capturedModels.push(params.model);
            capturedStreamOptions = params.stream_options;
            capturedReasoningEffort = params.reasoning_effort;
            capturedMaxCompletionTokens = params.max_completion_tokens;

            if (params.stream) {
              return (async function* () {
                yield { choices: [{ delta: { content: 'Mocked ' } }] };
                yield { choices: [{ delta: { content: 'response' } }], usage: { prompt_tokens: 15, completion_tokens: 25 } };
              })();
            }

            return {
              choices: [{ message: { content: 'Mocked response' } }],
              usage: { prompt_tokens: 10, completion_tokens: 20 }
            };
          }
        }
      }
    };
  };

  // Test that gpt-6-astra, gpt-6-sol, gpt-6-luna reach upstream unchanged
  for (const gpt6Model of ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna']) {
    capturedModels.length = 0;
    await mockAdapter.generateContent({
      model: gpt6Model,
      messages: [{ role: 'user', content: 'Test prompt' }],
      reasoningEffort: 'high',
      ...({ maxCompletionTokens: 128 } as any)
    });
    assert(capturedModels.length === 1 && capturedModels[0] === gpt6Model, `Model "${gpt6Model}" reached upstream OpenAI call unchanged (got: "${capturedModels[0]}")`);
    assert(capturedReasoningEffort === 'high', `Reasoning effort "high" passed for ${gpt6Model}`);
    assert(capturedMaxCompletionTokens === 128, `max_completion_tokens passed for ${gpt6Model}`);
  }

  // Verify NO silent fallback to gpt-4o when gpt-6-astra returns 404
  const failingModelsCalled: string[] = [];
  const failingAdapter = new OpenAIAdapter();
  (failingAdapter as any).getClient = () => ({
    chat: {
      completions: {
        create: async (params: any) => {
          failingModelsCalled.push(params.model);
          const err: any = new Error(`The model '${params.model}' does not exist or you do not have access to it.`);
          err.status = 404;
          err.code = 'model_not_found';
          throw err;
        }
      }
    }
  });

  let gpt6FailError: any = null;
  try {
    await failingAdapter.generateContent({
      model: 'gpt-6-astra',
      messages: [{ role: 'user', content: 'Hello' }]
    });
  } catch (e: any) {
    gpt6FailError = e;
  }
  assert(failingModelsCalled.length === 1 && failingModelsCalled[0] === 'gpt-6-astra', 'Failed gpt-6-astra call did NOT silently retry with gpt-4o');
  assert((gpt6FailError?.code as string) === 'MODEL_NOT_AVAILABLE', 'Failed gpt-6-astra 404 returns MODEL_NOT_AVAILABLE');

  // Test streaming and stream_options: { include_usage: true }
  capturedModels.length = 0;
  let streamedText = '';
  const streamRes = await mockAdapter.generateContentStream(
    {
      model: 'gpt-6-luna',
      messages: [{ role: 'user', content: 'Stream test' }]
    },
    (delta) => { streamedText += delta; }
  );
  assert(capturedModels[0] === 'gpt-6-luna', 'Streaming reached upstream with model "gpt-6-luna"');
  assert(capturedStreamOptions?.include_usage === true, 'Stream options include_usage is set to true');
  assert(streamedText === 'Mocked response', 'Streaming correctly accumulated chunk text');
  assert(streamRes.usage?.inputTokens === 15, 'Streaming captured real upstream prompt tokens');
  assert(streamRes.usage?.outputTokens === 25, 'Streaming captured real upstream completion tokens');

  // Test health check sends 1-token request to each configured model
  capturedModels.length = 0;
  const healthRes = await mockAdapter.checkHealth();
  assert(healthRes.authenticated === true, 'Health check authenticates successfully with client');
  assert(healthRes.modelAvailable === true, 'Health check detects operational models');
  assert(capturedModels.includes('gpt-6-astra') && capturedModels.includes('gpt-6-sol') && capturedModels.includes('gpt-6-luna'), 'Health check probed gpt-6-astra, gpt-6-sol, and gpt-6-luna with 1-token request');
  assert(healthRes.models['gpt-6-astra']?.status === 'ok', 'Health check reports ok for gpt-6-astra in mock');

  // Restore env key
  if (originalKey !== undefined) {
    process.env.OPENAI_API_KEY = originalKey;
  } else {
    delete process.env.OPENAI_API_KEY;
  }

  // Test Suite 6: Missing Credentials Behavior (NOT_CONFIGURED)
  console.log('\n--- Test Suite 6: Missing Credentials Handling ---');
  const tempKey = process.env.OPENAI_API_KEY;
  const tempCodexKey = process.env.CODEX_API_KEY;
  const tempEnvKey = process.env.OPENAI_ENVIRONMENT_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.CODEX_API_KEY;
  delete process.env.OPENAI_ENVIRONMENT_KEY;
  const unconfiguredAdapter = new OpenAIAdapter();
  assert(unconfiguredAdapter.isConfigured() === false, 'isConfigured() returns false when OPENAI_API_KEY is not set');

  let missingKeyError: any = null;
  try {
    await unconfiguredAdapter.generateContent({
      model: 'gpt-6-astra',
      messages: [{ role: 'user', content: 'Hello' }]
    });
  } catch (e: any) {
    missingKeyError = e;
  }
  assert(missingKeyError instanceof AIProviderError, 'generateContent without key throws AIProviderError');
  assert((missingKeyError?.code as string) === 'NOT_CONFIGURED', 'Missing key throws NOT_CONFIGURED');
  assert(missingKeyError?.statusCode === 503, 'Missing key throws HTTP 503');

  // Restore keys
  if (tempKey !== undefined) process.env.OPENAI_API_KEY = tempKey;
  if (tempCodexKey !== undefined) process.env.CODEX_API_KEY = tempCodexKey;
  if (tempEnvKey !== undefined) process.env.OPENAI_ENVIRONMENT_KEY = tempEnvKey;

  // Test Suite 7: Pricing & Verified Models Verification
  console.log('\n--- Test Suite 7: Verified Models & Pricing Configuration ---');
  assert(MODEL_PRICING_CONFIG.effectiveDate === '2025-05-01', 'Single pricing config has effectiveDate');
  const lunaVerified = VERIFIED_MODELS.find(m => m.id === 'gpt-6-luna');
  const solVerified = VERIFIED_MODELS.find(m => m.id === 'gpt-6-sol');
  const astraVerified = VERIFIED_MODELS.find(m => m.id === 'gpt-6-astra');
  const basicVerified = VERIFIED_MODELS.find(m => m.id === 'float-basic');
  assert(lunaVerified?.pricing.inputCostPer1M === 0.10 && lunaVerified?.pricing.outputCostPer1M === 0.50, 'Luna pricing is $0.10/$0.50 per 1M tokens');
  assert(solVerified?.pricing.inputCostPer1M === 2.00 && solVerified?.pricing.outputCostPer1M === 10.00, 'Sol pricing is $2.00/$10.00 per 1M tokens');
  assert(astraVerified?.pricing.inputCostPer1M === null && astraVerified?.pricing.outputCostPer1M === null, 'Astra unknown pricing is null');
  assert(basicVerified?.displayName === 'GPT-4o mini' && basicVerified?.exactModelId === 'gpt-4o-mini', 'float-basic is labeled with its real model GPT-4o mini');
  assert(!JSON.stringify(basicVerified).toLowerCase().includes('free tier'), 'Removed "FLOAT Basic = free" claim from verifiedModels.ts');

  // Test Suite 8: GPT-6 Astra Cloud Agent & Registry Metadata
  console.log('\n--- Test Suite 8: GPT-6 Astra Cloud Agent & Registry Verification ---');
  assert(GPT6_ASTRA_CLOUD_CONFIG.modelId === 'gpt-6-astra', 'GPT-6 Astra config has modelId');
  const routerAstra = router.resolveRoute('gpt-6-astra');
  assert(routerAstra.route.provider === 'openai', 'Router routes gpt-6-astra to OpenAI adapter');
  assert(routerAstra.route.apiModelId === 'gpt-6-astra', 'Router resolves gpt-6-astra to apiModelId gpt-6-astra');

  const inInitial = INITIAL_MODELS.find(m => m.id === 'gpt-6-astra');
  assert(Boolean(inInitial), 'gpt-6-astra is present in INITIAL_MODELS catalog');
  const inDashboard = DASHBOARD_MODELS.find(m => m.id === 'gpt-6-astra');
  assert(Boolean(inDashboard), 'gpt-6-astra is featured in DASHBOARD_MODELS');
  const astraAgent = INITIAL_AGENTS.find(a => a.id === 'astra-agent');
  assert(Boolean(astraAgent), 'Astra Cloud Agent is registered in INITIAL_AGENTS');

  // Test Suite 9: Responses API Hosted code_interpreter (CSV Upload, Container Attachment, Streaming & AbortSignal)
  console.log('\n--- Test Suite 9: OpenAI Responses API Hosted code_interpreter ---');
  const prevKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-test-responses-key';

  let uploadedPurpose = '';
  let deletedFileId = '';
  let capturedResponsesParams: any = null;
  let capturedSignal: AbortSignal | undefined;
  const streamedEventTypes: string[] = [];

  const ciAdapter = new OpenAIAdapter();
  (ciAdapter as any).getClient = () => ({
    files: {
      create: async (params: any) => {
        uploadedPurpose = params.purpose;
        return { id: 'file_csv_test_999' };
      },
      delete: async (fileId: string) => {
        deletedFileId = fileId;
        return { id: fileId, deleted: true };
      }
    },
    responses: {
      create: async (params: any, options?: { signal?: AbortSignal }) => {
        capturedResponsesParams = params;
        capturedSignal = options?.signal;
        return (async function* () {
          yield {
            type: 'response.code_interpreter_call.in_progress',
            item_id: 'ci_1',
            output_index: 0,
            sequence_number: 1
          };
          yield {
            type: 'response.code_interpreter_call_code.delta',
            item_id: 'ci_1',
            output_index: 0,
            sequence_number: 2,
            delta: 'import pandas as pd\n'
          };
          yield {
            type: 'response.code_interpreter_call_code.done',
            item_id: 'ci_1',
            output_index: 0,
            sequence_number: 3,
            code: "import pandas as pd\ndf = pd.read_csv('data.csv')\nprint(len(df))"
          };
          yield {
            type: 'response.code_interpreter_call.interpreting',
            item_id: 'ci_1',
            output_index: 0,
            sequence_number: 4
          };
          yield {
            type: 'response.code_interpreter_call.completed',
            item_id: 'ci_1',
            output_index: 0,
            sequence_number: 5
          };
          yield {
            type: 'response.output_text.delta',
            item_id: 'msg_1',
            output_index: 1,
            content_index: 0,
            sequence_number: 6,
            delta: '{"title":"Row Count","summary":"3 rows processed."}'
          };
          yield {
            type: 'response.output_text.annotation.added',
            item_id: 'msg_1',
            output_index: 1,
            content_index: 0,
            annotation_index: 0,
            sequence_number: 7,
            annotation: {
              type: 'container_file_citation',
              container_id: 'cntr_999',
              file_id: 'cfile_plot_999',
              filename: 'plot.png',
              start_index: 0,
              end_index: 5
            }
          };
          yield {
            type: 'response.completed',
            sequence_number: 8,
            response: {
              id: 'resp_ci_999',
              output: [
                {
                  id: 'ci_1',
                  type: 'code_interpreter_call',
                  container_id: 'cntr_999',
                  status: 'completed',
                  code: "import pandas as pd\ndf = pd.read_csv('data.csv')\nprint(len(df))",
                  outputs: [
                    { type: 'logs', logs: '3\n' }
                  ]
                }
              ],
              usage: { input_tokens: 45, output_tokens: 30 }
            }
          };
        })();
      }
    }
  });

  const controller = new AbortController();
  const ciResult = await ciAdapter.runCodeInterpreterResponse(
    {
      model: 'gpt-6-astra',
      input: 'Count rows in data.csv',
      csvFile: {
        filename: 'data.csv',
        content: 'a,b\n1,2\n3,4\n5,6',
        mimeType: 'text/csv'
      },
      stream: true
    },
    (ev) => {
      streamedEventTypes.push(ev.type);
    },
    controller.signal
  );

  assert(uploadedPurpose === 'assistants', 'CSV uploaded via Files API with purpose="assistants"');
  assert(
    capturedResponsesParams?.tools?.[0]?.type === 'code_interpreter' &&
      capturedResponsesParams?.tools?.[0]?.container?.file_ids?.[0] === 'file_csv_test_999',
    'Uploaded CSV file_id attached to code_interpreter container'
  );
  assert(
    Array.isArray(capturedResponsesParams?.include) &&
      capturedResponsesParams.include.includes('code_interpreter_call.outputs'),
    'Responses API request includes code_interpreter_call.outputs'
  );
  assert(capturedSignal === controller.signal, 'AbortSignal passed through to client.responses.create');
  assert(
    streamedEventTypes.includes('code_delta') &&
      streamedEventTypes.includes('code_done') &&
      streamedEventTypes.includes('interpreting') &&
      streamedEventTypes.includes('completed') &&
      streamedEventTypes.includes('text_delta') &&
      streamedEventTypes.includes('file_annotation'),
    'Streaming emitted code_delta, code_done, interpreting, completed, text_delta, and file_annotation events'
  );
  assert(
    ciResult.code.includes("pd.read_csv('data.csv')") && ciResult.stdout.trim() === '3',
    'runCodeInterpreterResponse returned executed Python code and stdout logs'
  );
  assert(
    ciResult.files.length === 1 && ciResult.files[0].filename === 'plot.png',
    'runCodeInterpreterResponse returned generated container file/chart'
  );
  assert(deletedFileId === 'file_csv_test_999', 'Temporary uploaded CSV file cleaned up after execution');

  // Verify AbortSignal cancellation stops execution and throws AbortError
  const preAborted = new AbortController();
  preAborted.abort();
  let abortCaught: any = null;
  try {
    await ciAdapter.runCodeInterpreterResponse(
      {
        model: 'gpt-6-astra',
        input: 'Should abort immediately'
      },
      undefined,
      preAborted.signal
    );
  } catch (e: any) {
    abortCaught = e;
  }
  assert(abortCaught?.name === 'AbortError' && abortCaught?.statusCode === 499, 'Aborted signal throws AbortError (499)');

  // Verify unsupported model/account returns 503 with clear code
  const unsupportedCiAdapter = new OpenAIAdapter();
  (unsupportedCiAdapter as any).getClient = () => ({
    responses: {
      create: async () => {
        const err: any = new Error('The model `gpt-6-astra` does not support `code_interpreter` on this account.');
        err.status = 400;
        err.code = 'invalid_request_error';
        throw err;
      }
    }
  });
  let unsuppCiErr: any = null;
  try {
    await unsupportedCiAdapter.runCodeInterpreterResponse({
      model: 'gpt-6-astra',
      input: 'Run python'
    });
  } catch (e: any) {
    unsuppCiErr = e;
  }
  assert(
    unsuppCiErr instanceof AIProviderError &&
      unsuppCiErr.statusCode === 503 &&
      (unsuppCiErr.code as string) === 'CODE_INTERPRETER_NOT_SUPPORTED',
    'Unsupported model/account for code_interpreter throws 503 CODE_INTERPRETER_NOT_SUPPORTED'
  );

  // Verify API connection issues -> 502 API_CONNECTION_ERROR
  const connErrNormalized = normalizeCodeInterpreterError(
    { name: 'APIConnectionError', code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:443' },
    'gpt-6-astra'
  );
  assert(
    connErrNormalized.statusCode === 502 && connErrNormalized.code === 'API_CONNECTION_ERROR',
    'normalizeCodeInterpreterError maps network/connection errors to 502 API_CONNECTION_ERROR'
  );

  // Verify sandbox timeout -> 504 SANDBOX_TIMEOUT
  const timeoutErrNormalized = normalizeCodeInterpreterError(
    { name: 'APIConnectionTimeoutError', code: 'ETIMEDOUT', message: 'Sandbox execution timed out' },
    'gpt-6-astra'
  );
  assert(
    timeoutErrNormalized.statusCode === 504 && timeoutErrNormalized.code === 'SANDBOX_TIMEOUT',
    'normalizeCodeInterpreterError maps sandbox timeout errors to 504 SANDBOX_TIMEOUT'
  );

  // Verify malformed code execution -> 422 MALFORMED_CODE_EXECUTION
  const malformedErrNormalized = normalizeCodeInterpreterError(
    { code: 'code_execution_error', message: 'SyntaxError: invalid syntax in line 1' },
    'gpt-6-astra'
  );
  assert(
    malformedErrNormalized.statusCode === 422 && malformedErrNormalized.code === 'MALFORMED_CODE_EXECUTION',
    'normalizeCodeInterpreterError maps Python code execution errors to 422 MALFORMED_CODE_EXECUTION'
  );

  if (prevKey !== undefined) process.env.OPENAI_API_KEY = prevKey;
  else delete process.env.OPENAI_API_KEY;

  console.log(`\n======================================================`);
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runOpenAIIntegrationTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
