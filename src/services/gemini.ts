/**
 * Compatibility exports for callers migrating from the retired Gemini-only
 * endpoint. Gemini is not registered in the active FLOAT model router, so this
 * module fails explicitly and never manufactures a response or changes models.
 */

export type GeminiModelId = string;

export interface GeminiStreamStatus {
  stage: 'connecting' | 'thinking' | 'streaming' | 'completed' | 'error';
  message: string;
  detail?: string;
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

export function resolveGeminiModel(model?: string): string {
  return model || '';
}

function unavailable(model?: string): Error {
  const error = new Error(
    `Gemini model "${model || '(unspecified)'}" is unavailable: Gemini is not registered in FLOAT's active model router.`
  ) as Error & { code: string; statusCode: number };
  error.code = 'UNSUPPORTED_PROVIDER';
  error.statusCode = 400;
  return error;
}

export async function streamGeminiContent(options: GeminiStreamOptions): Promise<string> {
  const error = unavailable(options.model);
  options.onStatus?.({ stage: 'error', message: error.message });
  throw error;
}

export async function generateGeminiContent(options: GeminiGenerateOptions): Promise<string> {
  throw unavailable(options.model);
}
