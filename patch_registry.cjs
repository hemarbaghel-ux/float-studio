const fs = require('fs');

const p = 'src/features/ai/registry.ts';
let content = fs.readFileSync(p, 'utf8');

// I will just prepend new models into INITIAL_MODELS if they are not there.
// Instead of that, I can just replace the whole INITIAL_MODELS with a larger one.

const extraOpenAI = `
  { id: 'gpt-4', providerId: 'openai', displayName: 'GPT-4', family: 'gpt', description: 'Highly capable model for complex coding tasks.', capabilities: { coding: true, reasoning: true, vision: false, tools: true, structuredOutput: true, streaming: true }, contextWindow: 8192, status: 'AVAILABLE', speed: 'slow', pricing: { inputCost: 30.0, outputCost: 60.0, currency: 'USD', effectiveDate: '2023-03-14' }, modalities: ['text'], limits: { maxOutputTokens: 8192 } },
  { id: 'gpt-3.5-turbo', providerId: 'openai', displayName: 'GPT-3.5 Turbo', family: 'gpt', description: 'Fast, inexpensive model for simple tasks.', capabilities: { coding: true, reasoning: false, vision: false, tools: true, structuredOutput: true, streaming: true }, contextWindow: 16385, status: 'AVAILABLE', speed: 'fast', pricing: { inputCost: 0.5, outputCost: 1.5, currency: 'USD', effectiveDate: '2024-02-16' }, modalities: ['text'], limits: { maxOutputTokens: 4096 } },
  { id: 'o3-mini', providerId: 'openai', displayName: 'o3-mini', family: 'gpt', description: 'Next generation fast reasoning model optimized for coding.', capabilities: { coding: true, reasoning: true, vision: false, tools: true, structuredOutput: true, streaming: true }, contextWindow: 200000, status: 'AVAILABLE', speed: 'fast', pricing: { inputCost: 1.10, outputCost: 4.40, currency: 'USD', effectiveDate: '2025-01-31' }, modalities: ['text'], limits: { maxOutputTokens: 100000 } },
  { id: 'gpt-4o-2024-11-20', providerId: 'openai', displayName: 'GPT-4o (2024-11-20)', family: 'gpt', description: 'Latest GPT-4o snapshot with improved creative writing and coding.', capabilities: { coding: true, reasoning: true, vision: true, tools: true, structuredOutput: true, streaming: true }, contextWindow: 128000, status: 'AVAILABLE', speed: 'balanced', pricing: { inputCost: 2.5, outputCost: 10.0, currency: 'USD', effectiveDate: '2024-11-20' }, modalities: ['text', 'vision'], limits: { maxOutputTokens: 16384 } },
`;

content = content.replace("export const INITIAL_MODELS: AIModel[] = [", "export const INITIAL_MODELS: AIModel[] = [\n" + extraOpenAI);

fs.writeFileSync(p, content);
