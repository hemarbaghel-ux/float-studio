export type AIErrorCode =
  | 'NOT_CONFIGURED'
  | 'AUTH_ERROR'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_NOT_AVAILABLE'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED_PROVIDER'
  | 'CODE_INTERPRETER_NOT_SUPPORTED'
  | 'CODE_INTERPRETER_UNAVAILABLE'
  | 'API_CONNECTION_ERROR'
  | 'SANDBOX_TIMEOUT'
  | 'MALFORMED_CODE_EXECUTION';

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
  allowFallback?: boolean;
  demoMode?: boolean;
}

export interface AIProviderResponse {
  text: string;
  toolCalls?: ExecutedToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  isSimulated?: boolean;
}

export interface CodeInterpreterFileAttachment {
  filename: string;
  content: string | Buffer;
  mimeType?: string;
}

export interface CodeInterpreterGeneratedFile {
  fileId?: string;
  containerId?: string;
  filename?: string;
  url?: string;
  type: 'image' | 'file';
}

export interface CodeInterpreterStreamEvent {
  type:
    | 'code_delta'
    | 'code_done'
    | 'interpreting'
    | 'completed'
    | 'text_delta'
    | 'file_annotation';
  delta?: string;
  code?: string;
  itemId?: string;
  file?: CodeInterpreterGeneratedFile;
}

export interface CodeInterpreterResponseRequest {
  model: string;
  apiModelId?: string;
  input: string;
  instructions?: string;
  csvFile?: CodeInterpreterFileAttachment;
  stream?: boolean;
  onEvent?: (event: CodeInterpreterStreamEvent) => void;
  onChunk?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface CodeInterpreterResponseResult {
  responseId?: string;
  model: string;
  text: string;
  code: string;
  codeBlocks: string[];
  stdout: string;
  logs: string[];
  files: CodeInterpreterGeneratedFile[];
  uploadedFileId?: string;
  containerId?: string;
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
  accessibleModelIds?: string[];
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
  runCodeInterpreterResponse?(
    request: CodeInterpreterResponseRequest,
    onEvent?: (event: CodeInterpreterStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<CodeInterpreterResponseResult>;
  runAgentLoop?(
    req: any,
    res: any,
    model: string,
    prompt: string,
    virtualFiles: any[]
  ): Promise<void>;
}
