import { AIProviderAdapter, ModelRequest, ModelResponse, AIModel } from '../../types/ai';

export class AnthropicAdapter implements AIProviderAdapter {
  id = 'anthropic';
  name = 'Anthropic';
  
  async listModels(): Promise<AIModel[]> { return []; }
  supportsTools(): boolean { return true; }
  supportsStructuredOutput(): boolean { return false; }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    throw new Error('Anthropic Adapter not fully implemented yet');
  }
  async stream(request: ModelRequest, onEvent: (event: any) => void): Promise<void> {
    throw new Error('Streaming not fully implemented');
  }
}
