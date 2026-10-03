export interface AIProviderRequest {
  model: string;
  messages: any[];
  systemInstruction?: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  speed?: 'fast' | 'balanced' | 'slow';
  dataSharingConsent?: boolean;
  dataSharingAllowed?: boolean;
}

export interface AIProviderResponse {
  text: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface AIProviderAdapter {
  id: string;
  name: string;
  isConfigured(): boolean;
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
