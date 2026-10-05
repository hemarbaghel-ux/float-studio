export type AIErrorCode =
  | 'AUTH_ERROR'
  | 'MODEL_NOT_FOUND'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'INVALID_REQUEST';

export class AIProviderError extends Error {
  public code: AIErrorCode;
  public provider: string;
  public statusCode: number;
  public details?: any;

  constructor(message: string, code: AIErrorCode, provider: string, statusCode = 500, details?: any) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.provider = provider;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AIProviderError.prototype);
  }
}

export interface ToolCallDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ExecutedToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface AIProviderRequest {
  model: string;
  apiModelId?: string;
  messages: any[];
  systemInstruction?: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  speed?: 'fast' | 'balanced' | 'slow';
  tools?: ToolCallDefinition[];
  dataSharingConsent?: boolean;
  dataSharingAllowed?: boolean;
}

export interface AIProviderResponse {
  text: string;
  toolCalls?: ExecutedToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ProviderHealthCheckResult {
  provider: string;
  configured: boolean;
  authenticated: boolean;
  modelAvailable: boolean;
  defaultModel?: string;
  error?: string;
}

export interface AIProviderAdapter {
  id: string;
  name: string;
  isConfigured(): boolean;
  checkHealth?(): Promise<ProviderHealthCheckResult>;
  generateContent(request: AIProviderRequest): Promise<AIProviderResponse>;
  generateContentStream?(
    request: AIProviderRequest,
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<AIProviderResponse>;
  runAgentLoop?(
    req: any,
    res: any,
    model: string,
    prompt: string,
    virtualFiles: any[]
  ): Promise<void>;
}
