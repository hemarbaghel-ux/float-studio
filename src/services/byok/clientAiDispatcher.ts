/**
 * FLOAT Studio — Direct Browser Client-Side AI Dispatcher
 * 
 * Streams chat completions, inline edits, and code transformations directly from
 * OpenAI, Anthropic, Google Gemini, and DeepSeek via browser fetch with SSE.
 * Provides instant fallback simulation when no BYOK key is provided.
 */

import { getClientKey } from './clientKeyring';

export interface StreamChunkCallback {
  (chunk: {
    type: 'started' | 'delta' | 'done' | 'error';
    text?: string;
    modelId?: string;
    error?: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }): void;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'model' | 'system';
  content: string;
}

export interface DispatchOptions {
  modelId: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  signal?: AbortSignal;
  onChunk: StreamChunkCallback;
}

export async function dispatchClientAiStream(options: DispatchOptions): Promise<void> {
  const { modelId, messages, systemPrompt, signal, onChunk } = options;

  // Determine provider from modelId
  const provider = resolveProvider(modelId);
  const apiKey = getClientKey(provider);

  onChunk({ type: 'started', modelId });

  // If no user API key, run high-quality client simulation
  if (!apiKey) {
    await runSimulatedStream(options);
    return;
  }

  try {
    switch (provider) {
      case 'openai':
        await streamOpenAI(apiKey, modelId, messages, systemPrompt, signal, onChunk);
        break;
      case 'anthropic':
        await streamAnthropic(apiKey, modelId, messages, systemPrompt, signal, onChunk);
        break;
      case 'google':
        await streamGemini(apiKey, modelId, messages, systemPrompt, signal, onChunk);
        break;
      case 'deepseek':
        await streamDeepSeek(apiKey, modelId, messages, systemPrompt, signal, onChunk);
        break;
      default:
        await runSimulatedStream(options);
    }
  } catch (err: any) {
    if (signal?.aborted) return;
    console.warn(`[Client AI Dispatcher] Direct call failed for ${provider}, falling back to simulation:`, err);
    await runSimulatedStream(options, `*(Note: Provider direct call returned "${err.message || 'Error'}". Showing local intelligence output)*\n\n`);
  }
}

function resolveProvider(modelId: string): 'openai' | 'anthropic' | 'google' | 'deepseek' {
  const lower = modelId.toLowerCase();
  if (lower.includes('claude') || lower.includes('anthropic')) return 'anthropic';
  if (lower.includes('gemini') || lower.includes('google')) return 'google';
  if (lower.includes('deepseek')) return 'deepseek';
  return 'openai';
}

async function streamOpenAI(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string | undefined,
  signal: AbortSignal | undefined,
  onChunk: StreamChunkCallback
) {
  const formattedMessages: any[] = [];
  if (systemPrompt) {
    formattedMessages.push({ role: 'system', content: systemPrompt });
  }
  for (const m of messages) {
    formattedMessages.push({
      role: m.role === 'model' ? 'assistant' : m.role,
      content: m.content,
    });
  }

  const cleanModel = model.includes('gpt') || model.includes('o1') || model.includes('o3') ? model : 'gpt-4o';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: cleanModel,
      messages: formattedMessages,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenAI error HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response stream available');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') break;
      try {
        const parsed = JSON.parse(dataStr);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onChunk({ type: 'delta', text: delta });
        }
      } catch {}
    }
  }

  onChunk({ type: 'done', text: fullText });
}

async function streamAnthropic(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string | undefined,
  signal: AbortSignal | undefined,
  onChunk: StreamChunkCallback
) {
  const formattedMessages: any[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    formattedMessages.push({
      role: m.role === 'model' ? 'assistant' : m.role,
      content: m.content,
    });
  }

  const cleanModel = model.includes('claude') ? model : 'claude-3-5-sonnet-20241022';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cleanModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: formattedMessages,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Anthropic error HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response stream available');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullText += parsed.delta.text;
          onChunk({ type: 'delta', text: parsed.delta.text });
        }
      } catch {}
    }
  }

  onChunk({ type: 'done', text: fullText });
}

async function streamGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string | undefined,
  signal: AbortSignal | undefined,
  onChunk: StreamChunkCallback
) {
  const contents = messages.map(m => ({
    role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const cleanModel = model.includes('gemini') ? model : 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Google Gemini error HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response stream available');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      try {
        const parsed = JSON.parse(dataStr);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullText += text;
          onChunk({ type: 'delta', text });
        }
      } catch {}
    }
  }

  onChunk({ type: 'done', text: fullText });
}

async function streamDeepSeek(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string | undefined,
  signal: AbortSignal | undefined,
  onChunk: StreamChunkCallback
) {
  const formattedMessages: any[] = [];
  if (systemPrompt) formattedMessages.push({ role: 'system', content: systemPrompt });
  for (const m of messages) {
    formattedMessages.push({
      role: m.role === 'model' ? 'assistant' : m.role,
      content: m.content,
    });
  }

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.includes('deepseek') ? model : 'deepseek-chat',
      messages: formattedMessages,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `DeepSeek error HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response stream available');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') break;
      try {
        const parsed = JSON.parse(dataStr);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onChunk({ type: 'delta', text: delta });
        }
      } catch {}
    }
  }

  onChunk({ type: 'done', text: fullText });
}

async function runSimulatedStream(options: DispatchOptions, prefix = ''): Promise<void> {
  const lastUserMsg = options.messages.filter(m => m.role === 'user').pop()?.content || '';
  const lowerMsg = lastUserMsg.toLowerCase();
  const sys = (options.systemPrompt || '').toLowerCase();

  const isPython = lowerMsg.includes('python') || lowerMsg.includes('def ') || lowerMsg.includes('py') || lowerMsg.includes('pytest') || sys.includes('main.py');
  const isAsyncRefactor = lowerMsg.includes('async') || lowerMsg.includes('refactor');
  const isTestRequest = lowerMsg.includes('test') || lowerMsg.includes('unit test') || lowerMsg.includes('pytest') || lowerMsg.includes('spec');
  const isPayment = lowerMsg.includes('payment') || lowerMsg.includes('stripe') || lowerMsg.includes('checkout') || lowerMsg.includes('billing');
  const isPlanMode = sys.includes('plan mode') || lowerMsg.includes('plan');

  let generatedText = `${prefix}### FLOAT Intelligence Analysis\n\n`;

  if (isPlanMode) {
    generatedText += `#### Architectural Implementation Plan: ${lastUserMsg.slice(0, 50)}

1. **Analysis & Scope**:
   - Inspect existing module boundaries and state management.
   - Define type-safe contracts and runtime validation interfaces.

2. **Phase 1: Core Implementation**:
   - Create core service logic with error containment.
   - Implement asynchronous handlers and robust logging.

3. **Phase 2: Verification & Test Suite**:
   - Author unit tests covering standard execution, invalid inputs, and boundary conditions.
   - Verify isolated execution without breaking existing workspace modules.

4. **Phase 3: Integration & Review**:
   - Stage changes for developer review and diff acceptance.

*Status: Plan prepared in Free / Local Intelligence mode. Click Proceed or approve to stage code diffs.*`;
  } else if (isTestRequest && isPayment) {
    if (isPython) {
      generatedText += `Here is a complete, robust unit test suite for payment processing using \`unittest\` and mocks:

\`\`\`python file="test_payment.py"
# test_payment.py
import unittest
from unittest.mock import MagicMock, patch

class PaymentService:
    def __init__(self, api_client=None):
        self.api_client = api_client or MagicMock()

    async def process_payment(self, amount_cents: int, currency: str, customer_id: str) -> dict:
        if amount_cents <= 0:
            raise ValueError("Payment amount must be greater than zero.")
        if currency.lower() not in ["usd", "eur", "gbp"]:
            raise ValueError(f"Unsupported currency: {currency}")
        
        response = await self.api_client.charges.create(
            amount=amount_cents,
            currency=currency.lower(),
            customer=customer_id
        )
        return {"status": "succeeded", "charge_id": response.get("id", "ch_test_123")}

class TestPaymentProcessing(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.mock_client = MagicMock()
        self.service = PaymentService(api_client=self.mock_client)

    async def test_successful_charge(self):
        """Verifies successful payment execution with valid parameters."""
        self.mock_client.charges.create = MagicMock(return_value={"id": "ch_mock_success"})
        result = await self.service.process_payment(2500, "usd", "cust_999")
        
        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["charge_id"], "ch_mock_success")

    async def test_zero_or_negative_amount_raises_error(self):
        """Ensures non-positive amounts are rejected before charging."""
        with self.assertRaises(ValueError) as ctx:
            await self.service.process_payment(-500, "usd", "cust_999")
        self.assertIn("greater than zero", str(ctx.exception))

    async def test_unsupported_currency_raises_error(self):
        """Rejects transactions with unsupported currency codes."""
        with self.assertRaises(ValueError) as ctx:
            await self.service.process_payment(1000, "xyz", "cust_999")
        self.assertIn("Unsupported currency", str(ctx.exception))

if __name__ == "__main__":
    unittest.main()
\`\`\`

### Key Testing Invariants Covered:
- **Happy Path**: Successful charge creation with mocked gateway ID return.
- **Input Validation**: Negative and zero values rejected with explicit error message.
- **Currency Boundaries**: Supported currencies validated against gateway registry.`;
    } else {
      generatedText += `Here is a complete TypeScript unit test suite for payment processing with Vitest / Jest:

\`\`\`typescript file="payment.test.ts"
// payment.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'requires_action' | 'failed';
}

export class PaymentProcessor {
  constructor(private gateway: { createCharge: (params: any) => Promise<PaymentIntent> }) {}

  async processTransaction(amount: number, currency: string, customerId: string): Promise<PaymentIntent> {
    if (amount <= 0) throw new Error('Invalid payment amount: must be positive');
    return this.gateway.createCharge({ amount, currency, customerId });
  }
}

describe('PaymentProcessor Suite', () => {
  let mockGateway: { createCharge: any };
  let processor: PaymentProcessor;

  beforeEach(() => {
    mockGateway = {
      createCharge: vi.fn().mockResolvedValue({
        id: 'pi_test_abc123',
        amount: 5000,
        currency: 'usd',
        status: 'succeeded'
      })
    };
    processor = new PaymentProcessor(mockGateway);
  });

  it('successfully processes valid payment transactions', async () => {
    const result = await processor.processTransaction(5000, 'usd', 'cus_test');
    expect(result.status).toBe('succeeded');
    expect(result.id).toBe('pi_test_abc123');
    expect(mockGateway.createCharge).toHaveBeenCalledOnce();
  });

  it('throws an error for non-positive payment amounts', async () => {
    await expect(processor.processTransaction(0, 'usd', 'cus_test'))
      .rejects.toThrow('Invalid payment amount');
    expect(mockGateway.createCharge).not.toHaveBeenCalled();
  });
});
\`\`\``;
    }
  } else if (isAsyncRefactor) {
    if (isPython) {
      generatedText += `### Asynchronous Python Refactoring & Step-by-Step Explanation

#### 1. Why Refactor to Asynchronous?
- **Concurrency**: Allows Python's event loop to service other requests while waiting on network/disk I/O.
- **Resource Efficiency**: Replaces blocking threads with lightweight coroutines using \`asyncio\`.
- **Fault Tolerance**: Isolates timeouts with \`asyncio.wait_for\` and robust exception handling.

#### 2. Refactored Implementation:

\`\`\`python file="main.py"
# main.py - Asynchronous Refactoring
import asyncio
import logging
from typing import Any, Dict, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("workspace_engine")

async def fetch_remote_resource(endpoint: str, timeout_seconds: float = 5.0) -> Dict[str, Any]:
    """Simulates non-blocking asynchronous network resource acquisition."""
    logger.info(f"Initiating async request to {endpoint}...")
    await asyncio.sleep(0.1) # Non-blocking I/O yield to event loop
    return {"status": "ok", "endpoint": endpoint, "timestamp": asyncio.get_event_loop().time()}

async def process_data(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Asynchronously processes data payloads with error isolation and timeout protection.
    """
    try:
        logger.info("Processing data asynchronously...")
        # Concurrent background sub-tasks
        results = await asyncio.gather(
            fetch_remote_resource("https://api.example.com/v1/auth"),
            fetch_remote_resource("https://api.example.com/v1/data"),
            return_exceptions=False
        )
        return {
            "success": True,
            "processedCount": len(payload.keys()) if payload else 0,
            "subTaskResults": results
        }
    except asyncio.TimeoutError:
        logger.error("Async operation timed out.")
        raise
    except Exception as exc:
        logger.error(f"Async processing error: {exc}")
        raise

if __name__ == "__main__":
    test_payload = {"key": "sample_data", "version": 1}
    outcome = asyncio.run(process_data(test_payload))
    print("Async Execution Completed:", outcome)
\`\`\`

#### 3. Step-by-Step Refactoring Process:
1. **Keyword Transformation**: Replaced synchronous function declaration with \`async def\`.
2. **Non-Blocking Calls**: Replaced blocking system calls with coroutines awaited via \`await\`.
3. **Concurrent Execution**: Used \`asyncio.gather\` to execute independent network fetches in parallel.
4. **Structured Error Handling**: Encapsulated in \`try/except\` capturing timeouts and coroutine failures.`;
    } else {
      generatedText += `### Asynchronous TypeScript Refactoring & Step-by-Step Explanation

#### 1. Why Refactor to Asynchronous?
- **Non-blocking Event Loop**: Keeps the main UI/Node thread responsive while waiting on external operations.
- **Modern Promise Handling**: Replaces callback nesting with clean \`async/await\` syntax and unified error containment.

#### 2. Refactored Implementation:

\`\`\`typescript file="main.ts"
// main.ts - Asynchronous Refactoring
export interface ProcessResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  durationMs: number;
}

export async function processData<T extends Record<string, unknown>>(
  payload: T,
  options: { timeoutMs?: number } = {}
): Promise<ProcessResult<T>> {
  const start = performance.now();
  const { timeoutMs = 5000 } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Non-blocking asynchronous transformation
    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      success: true,
      data: payload,
      durationMs: Math.round(performance.now() - start)
    };
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError';
    return {
      success: false,
      error: isTimeout ? 'Operation timed out.' : (err.message || 'Processing failed'),
      durationMs: Math.round(performance.now() - start)
    };
  } finally {
    clearTimeout(timer);
  }
}
\`\`\`

#### 3. Step-by-Step Refactoring Process:
1. **Signature Update**: Returned \`Promise<ProcessResult<T>>\` with \`async\` keyword.
2. **Timeout Protection**: Integrated \`AbortController\` for deterministic lifecycle control.
3. **Type Safety**: Applied generic parameter constraint \`<T extends Record<string, unknown>>\`.`;
    }
  } else {
    // General context-aware coding response
    if (isPython) {
      generatedText += `Here is the clean, idiomatic Python solution for your workspace:

\`\`\`python file="main.py"
# main.py
from typing import List, Dict, Any, Optional

def process_data(data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Transforms workspace input data with type validation and structured return.
    """
    if data is None:
        data = {}
        
    sanitized = {k: str(v).strip() for k, v in data.items() if v is not None}
    return {
        "status": "success",
        "itemCount": len(sanitized),
        "data": sanitized
    }

if __name__ == "__main__":
    sample = {"name": "FLOAT AI", "env": "local"}
    print(process_data(sample))
\`\`\`

*Synthesized in Free Mode using FLOAT Local Intelligence.*`;
    } else {
      generatedText += `Here is the clean, type-safe TypeScript solution for your workspace:

\`\`\`typescript file="main.ts"
// main.ts
export interface OperationOutcome<T = unknown> {
  status: 'success' | 'failure';
  timestamp: number;
  payload: T;
}

export function executeTask<T extends Record<string, unknown>>(input: T): OperationOutcome<T> {
  return {
    status: 'success',
    timestamp: Date.now(),
    payload: input
  };
}
\`\`\`

*Synthesized in Free Mode using FLOAT Local Intelligence.*`;
    }
  }

  // Stream in 15ms words
  const words = generatedText.split(' ');
  let accumulated = '';

  for (let i = 0; i < words.length; i++) {
    if (options.signal?.aborted) return;
    const chunk = (i === 0 ? '' : ' ') + words[i];
    accumulated += chunk;
    options.onChunk({ type: 'delta', text: chunk });
    await new Promise(r => setTimeout(r, 10));
  }

  options.onChunk({ type: 'done', text: accumulated });
}
