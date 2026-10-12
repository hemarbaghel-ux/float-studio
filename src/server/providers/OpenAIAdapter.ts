import { AIProviderAdapter, ModelRequest, ModelResponse, AIModel } from '../../types/ai';
import { OpenAIAdapter as RealOpenAIAdapter } from './openai';

export class OpenAIAdapter implements AIProviderAdapter {
  id = 'openai';
  name = 'OpenAI';
  private realAdapter = new RealOpenAIAdapter();

  async listModels(): Promise<AIModel[]> {
    return [];
  }

  supportsTools(): boolean {
    return true;
  }

  supportsStructuredOutput(): boolean {
    return true;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const res = await this.realAdapter.generateContent({
      model: request.modelId,
      messages: request.messages || [],
      systemInstruction: request.systemInstruction,
      dataSharingAllowed: request.dataSharingAllowed
    });
    return {
      text: res.text,
      usage: res.usage
    };
  }

  async stream(request: ModelRequest, onEvent: (event: any) => void): Promise<void> {
    const res = await this.realAdapter.generateContentStream({
      model: request.modelId,
      messages: request.messages || [],
      systemInstruction: request.systemInstruction,
      dataSharingAllowed: request.dataSharingAllowed
    }, (chunk) => {
      onEvent({ type: 'delta', text: chunk });
    });
    onEvent({ type: 'done', text: res.text, usage: res.usage });
  }
}
