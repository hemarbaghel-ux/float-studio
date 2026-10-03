import { AIProviderAdapter, ModelRequest, ModelResponse, AIModel } from '../../types/ai';
import { GoogleGenAI, Type } from '@google/genai';

export class GoogleGeminiAdapter implements AIProviderAdapter {
  id = 'google';
  name = 'Google';
  
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
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    
    // Transform tools to Gemini format
    const tools = request.tools ? [{
      functionDeclarations: request.tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: {
          type: Type.OBJECT,
          properties: t.parameters.properties as any,
          required: t.parameters.required
        }
      }))
    }] : undefined;

    const response = await ai.models.generateContent({
      model: request.modelId,
      contents: request.messages.map(m => ({
        role: m.role,
        parts: m.parts || (m.content ? [{ text: m.content }] : [])
      })),
      config: {
        systemInstruction: request.systemInstruction,
        tools,
      }
    });
    
    const functionCalls = response.functionCalls?.map(call => ({
      name: call.name,
      args: call.args
    }));

    const usage = response.usageMetadata ? {
      inputTokens: response.usageMetadata.promptTokenCount || 0,
      outputTokens: response.usageMetadata.candidatesTokenCount || 0
    } : undefined;

    return {
      text: response.text || '',
      functionCalls,
      usage
    };
  }
  
  async stream(request: ModelRequest, onEvent: (event: any) => void): Promise<void> {
     throw new Error('Streaming not fully implemented');
  }
}
