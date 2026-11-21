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

  let generatedText = `${prefix}I have analyzed your workspace and prompt: "${lastUserMsg}".\n\n`;

  if (lastUserMsg.toLowerCase().includes('prime')) {
    generatedText += `Here is an efficient Python function to check whether an integer is prime:

\`\`\`python
# prime_checker.py
import math

def is_prime(n: int) -> bool:
    """Return True if n is a prime number, False otherwise."""
    if n <= 1:
        return False
    if n <= 3:
        return True
    if n % 2 == 0 or n % 3 == 0:
        return False
    
    # Check divisors up to sqrt(n) with 6k +/- 1 step
    limit = int(math.isqrt(n))
    for i in range(5, limit + 1, 6):
        if n % i == 0 or n % (i + 2) == 0:
            return False
            
    return True

if __name__ == "__main__":
    primes = [n for n in range(2, 50) if is_prime(n)]
    print("Primes under 50:", primes)
\`\`\`

### Complexity
- **Time Complexity**: $O(\\sqrt{n})$
- **Space Complexity**: $O(1)$`;
  } else {
    generatedText += `Here is the structured solution for your workspace:

\`\`\`typescript
export function executeTask() {
  console.log("Task executed in FLOAT AI Studio");
  return { status: "success", timestamp: Date.now() };
}
\`\`\`

To connect live production models (OpenAI, Anthropic Claude 3.5 Sonnet, or Gemini 2.0), open **Settings > AI & Models** and add your BYOK API key.`;
  }

  // Stream in 15ms words
  const words = generatedText.split(' ');
  let accumulated = '';

  for (let i = 0; i < words.length; i++) {
    if (options.signal?.aborted) return;
    const chunk = (i === 0 ? '' : ' ') + words[i];
    accumulated += chunk;
    options.onChunk({ type: 'delta', text: chunk });
    await new Promise(r => setTimeout(r, 12));
  }

  options.onChunk({ type: 'done', text: accumulated });
}
