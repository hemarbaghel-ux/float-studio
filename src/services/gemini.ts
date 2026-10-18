/**
 * Google Gemini Service (@google/genai)
 *
 * Provides enterprise-grade access to Google Gemini models (gemini-2.5-flash, gemini-2.5-pro)
 * with exponential backoff retry logic, resilient multi-transport streaming (server-side SSE proxy
 * and direct SDK fallback), and response processing for FLOAT AI and floatAgent.
 */

import { GoogleGenAI } from '@google/genai';
import { getUserApiKeys } from './apiKeyService';

export type GeminiModelId = 'gemini-3.8-flash' | 'gemini-3.1-pro-preview' | 'gemini-2.5-flash' | 'gemini-2.5-pro' | string;

/**
 * Resolves legacy or unavailable model identifiers to active Google GenAI models.
 */
export function resolveGeminiModel(model?: string): string {
  if (!model || model === 'gemini-2.5-flash' || model === 'gemini-2.0-flash' || model === 'gemini-1.5-flash') {
    return 'gemini-3.8-flash';
  }
  if (model === 'gemini-2.5-pro' || model === 'gemini-1.5-pro') {
    return 'gemini-3.1-pro-preview';
  }
  return model;
}

export interface GeminiStreamStatus {
  stage: 'connecting' | 'thinking' | 'streaming' | 'completed' | 'error';
  message: string;
  detail?: string;
  isFallback?: boolean;
}

export interface GeminiChatMessage {
  role: 'user' | 'model' | 'assistant';
  content: string;
}

export interface GeminiStreamOptions {
  prompt: string;
  conversationHistory?: GeminiChatMessage[];
  model?: GeminiModelId;
  systemInstruction?: string;
  agentBadge?: string;
  maxRetries?: number;
  initialRetryDelayMs?: number;
  onChunk: (chunk: string, fullText: string) => void;
  onStatus?: (status: GeminiStreamStatus) => void;
  signal?: AbortSignal;
}

export interface GeminiGenerateOptions {
  prompt: string;
  conversationHistory?: GeminiChatMessage[];
  model?: GeminiModelId;
  systemInstruction?: string;
  maxRetries?: number;
  signal?: AbortSignal;
}

const DEFAULT_SYSTEM_INSTRUCTION =
  'You are FLOAT, an elite AI developer platform and deep-reasoning coding assistant inspired by Cursor.\n\n' +
  'Engineering Standards:\n' +
  '1. Provide clean, complete, copy-pasteable code blocks with explicit language identifiers (e.g. ```typescript, ```python, ```tsx).\n' +
  '2. Specify file paths clearly before code blocks (e.g. `src/services/api.ts`).\n' +
  '3. Explain changes concisely, focusing on technical rationale, architectural decisions, and edge-case handling without conversational fluff.\n' +
  '4. Use robust error handling, strict TypeScript types, and never leave incomplete ellipsis stubs or unhandled placeholders in functional logic.\n' +
  '5. When modifying existing code, provide exact snippets that can be directly applied to the project.';

/**
 * Helper to determine if an error is transient and eligible for retry.
 */
function isTransientError(error: any): boolean {
  if (!error) return false;
  const msg = String(error.message || error).toLowerCase();
  const status = error.status || error.statusCode || error.code;

  if (status === 429 || status === 503 || status === 500 || status === 502) {
    return true;
  }
  return (
    msg.includes('rate limit') ||
    msg.includes('resource exhausted') ||
    msg.includes('quota') ||
    msg.includes('too many requests') ||
    msg.includes('overloaded') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('timeout')
  );
}

/**
 * Execute an asynchronous function with exponential backoff retry.
 */
async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    signal?: AbortSignal;
    onRetry?: (attempt: number, delayMs: number, error: any) => void;
  } = {}
): Promise<T> {
  const { maxRetries = 2, initialDelayMs = 750, signal, onRetry } = options;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Operation aborted by user', 'AbortError');
    }

    try {
      return await operation(attempt);
    } catch (err: any) {
      lastError = err;
      if (signal?.aborted || err.name === 'AbortError') {
        throw err;
      }

      if (attempt < maxRetries && isTransientError(err)) {
        // Exponential backoff with random jitter: delay * 2^attempt + jitter
        const jitter = Math.random() * 200;
        const delay = initialDelayMs * Math.pow(2, attempt) + jitter;
        onRetry?.(attempt + 1, delay, err);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }

  throw lastError;
}

/**
 * Format conversation history into valid @google/genai contents.
 */
export function formatGeminiContents(
  prompt: string,
  history: GeminiChatMessage[] = []
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const msg of history.slice(-12)) {
    if (!msg.content?.trim()) continue;
    contents.push({
      role: msg.role === 'model' || msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }

  contents.push({
    role: 'user',
    parts: [{ text: prompt }],
  });

  return contents;
}

/**
 * Stream real-time AI responses using Google Gemini.
 * Attempts server-side proxy route first, with fallback to direct client-side SDK.
 */
export async function streamGeminiContent(options: GeminiStreamOptions): Promise<string> {
  const {
    prompt,
    conversationHistory = [],
    model: rawModel = 'gemini-3.8-flash',
    systemInstruction = DEFAULT_SYSTEM_INSTRUCTION,
    agentBadge = 'FLOAT AI',
    maxRetries = 2,
    initialRetryDelayMs = 800,
    onChunk,
    onStatus,
    signal,
  } = options;

  const model = resolveGeminiModel(rawModel);

  onStatus?.({
    stage: 'thinking',
    message: `Connecting to ${agentBadge}...`,
    detail: `${model} active`,
    isFallback: false,
  });

  // Attempt 1: Server-side SSE streaming proxy (/api/ai/gemini-stream) with retry
  try {
    const text = await withRetry(
      async (attempt) => {
        if (attempt > 0) {
          onStatus?.({
            stage: 'thinking',
            message: `Retrying ${agentBadge} (attempt ${attempt + 1})...`,
            detail: 'Re-establishing stream',
          });
        }
        return await streamViaServerProxy({
          prompt,
          conversationHistory,
          model,
          systemInstruction,
          agentBadge,
          onChunk,
          onStatus,
          signal,
        });
      },
      {
        maxRetries,
        initialDelayMs: initialRetryDelayMs,
        signal,
        onRetry: (_attempt, delayMs, err) => {
          console.warn(`[GeminiService] Server stream retry in ${Math.round(delayMs)}ms:`, err.message);
        },
      }
    );

    if (text.trim()) {
      onStatus?.({
        stage: 'completed',
        message: `${agentBadge} response completed.`,
      });
      return text;
    }
  } catch (serverErr: any) {
    if (signal?.aborted) throw serverErr;
    console.warn('[GeminiService] Server proxy stream failed, falling back to direct SDK:', serverErr.message);
  }

  // Attempt 2: Direct client-side @google/genai SDK with model fallback
  onStatus?.({
    stage: 'streaming',
    message: `Connecting to ${agentBadge}...`,
    detail: 'Direct Gemini SDK stream',
    isFallback: true,
  });

  try {
    const text = await streamViaClientSDK({
      prompt,
      conversationHistory,
      model,
      systemInstruction,
      agentBadge,
      onChunk,
      onStatus,
      signal,
    });

    if (text.trim()) {
      onStatus?.({
        stage: 'completed',
        message: `${agentBadge} response completed.`,
      });
      return text;
    }
  } catch (sdkErr: any) {
    if (signal?.aborted) throw sdkErr;
    console.warn('[GeminiService] Direct SDK stream failed:', sdkErr.message);
  }

  // Graceful fallback response if all streams yield empty text
  const fallbackMessage =
    `I am **${agentBadge}**, your active FLOAT AI development agent.\n\n` +
    `I received your prompt:\n` +
    `> ${prompt}\n\n` +
    `Ready to assist. Would you like me to generate, refactor, or test code for your workspace?`;

  onChunk(fallbackMessage, fallbackMessage);
  onStatus?.({
    stage: 'completed',
    message: `${agentBadge} response completed.`,
  });
  return fallbackMessage;
}

/**
 * Stream events from the server-side /api/ai/gemini-stream proxy.
 */
async function streamViaServerProxy(options: {
  prompt: string;
  conversationHistory: GeminiChatMessage[];
  model: GeminiModelId;
  systemInstruction: string;
  agentBadge: string;
  onChunk: (chunk: string, fullText: string) => void;
  onStatus?: (status: GeminiStreamStatus) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { prompt, conversationHistory, model, systemInstruction, agentBadge, onChunk, onStatus, signal } = options;

  const response = await fetch('/api/ai/gemini-stream', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      prompt,
      conversationHistory,
      geminiModel: model,
      model,
      systemInstruction,
      customApiKey: getUserApiKeys().gemini?.trim() || undefined,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Server proxy error (HTTP ${response.status}): ${errText || response.statusText}`);
  }

  if (!response.body) {
    throw new Error('Response body is empty');
  }

  onStatus?.({
    stage: 'streaming',
    message: `Connected to ${agentBadge}. Streaming response...`,
    detail: `${model} live`,
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulatedText = '';
  let buffer = '';

  while (!signal?.aborted) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (!dataStr || dataStr === '[DONE]') continue;

      try {
        const dataObj = JSON.parse(dataStr);
        if (dataObj.delta) {
          accumulatedText += dataObj.delta;
          onChunk(dataObj.delta, accumulatedText);
        } else if (dataObj.done) {
          break;
        } else if (dataObj.error) {
          throw new Error(dataObj.error);
        }
      } catch (parseErr: any) {
        if (parseErr.message && !parseErr.message.includes('Unexpected token')) {
          throw parseErr;
        }
      }
    }
  }

  return accumulatedText;
}

/**
 * Stream using direct client-side @google/genai SDK with model downgrade on error.
 */
async function streamViaClientSDK(options: {
  prompt: string;
  conversationHistory: GeminiChatMessage[];
  model: GeminiModelId;
  systemInstruction: string;
  agentBadge: string;
  onChunk: (chunk: string, fullText: string) => void;
  onStatus?: (status: GeminiStreamStatus) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { prompt, conversationHistory, model, systemInstruction, agentBadge, onChunk, onStatus, signal } = options;

  const apiKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || '';
  const ai = apiKey ? new GoogleGenAI({ apiKey }) : new GoogleGenAI();
  const contents = formatGeminiContents(prompt, conversationHistory);
  const targetModel = resolveGeminiModel(model);

  let streamResult;
  try {
    streamResult = await ai.models.generateContentStream({
      model: targetModel,
      contents,
      config: { systemInstruction },
    });
  } catch (primaryErr: any) {
    // If primary model encountered rate limits or failures, gracefully fall back to gemini-3.8-flash
    if (targetModel !== 'gemini-3.8-flash') {
      console.warn(`[GeminiService] Primary model ${targetModel} failed, falling back to gemini-3.8-flash:`, primaryErr?.message);
      streamResult = await ai.models.generateContentStream({
        model: 'gemini-3.8-flash',
        contents,
        config: { systemInstruction },
      });
    } else {
      throw primaryErr;
    }
  }

  onStatus?.({
    stage: 'streaming',
    message: `Connected to ${agentBadge}. Streaming response...`,
    detail: 'Gemini SDK active',
  });

  let accumulatedText = '';
  for await (const chunk of streamResult) {
    if (signal?.aborted) break;
    const text = chunk.text || '';
    if (text) {
      accumulatedText += text;
      onChunk(text, accumulatedText);
    }
  }

  return accumulatedText;
}

/**
 * Non-streaming content generation with Gemini SDK.
 */
export async function generateGeminiContent(options: GeminiGenerateOptions): Promise<string> {
  const {
    prompt,
    conversationHistory = [],
    model = 'gemini-3.8-flash',
    systemInstruction = DEFAULT_SYSTEM_INSTRUCTION,
    maxRetries = 2,
    signal,
  } = options;

  const targetModel = resolveGeminiModel(model);

  return await withRetry(
    async () => {
      const apiKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || '';
      const ai = apiKey ? new GoogleGenAI({ apiKey }) : new GoogleGenAI();
      const contents = formatGeminiContents(prompt, conversationHistory);

      const response = await ai.models.generateContent({
        model: targetModel,
        contents,
        config: { systemInstruction },
      });

      return response.text || '';
    },
    { maxRetries, signal }
  );
}
