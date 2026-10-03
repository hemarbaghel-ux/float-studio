import { AIProviderAdapter, ModelRequest, ModelResponse, AIModel } from '../../types/ai';

export class OpenAIAdapter implements AIProviderAdapter {
  id = 'openai';
  name = 'OpenAI';
  
  async listModels(): Promise<AIModel[]> { return []; }
  supportsTools(): boolean { return true; }
  supportsStructuredOutput(): boolean { return true; }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    throw new Error('OpenAI Adapter not fully implemented yet');
  }
  async stream(request: ModelRequest, onEvent: (event: any) => void): Promise<void> {
    throw new Error('Streaming not fully implemented');
  }
}
