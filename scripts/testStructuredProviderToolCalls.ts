import assert from 'node:assert/strict';
import { OpenAIAdapter } from '../src/server/providers/openai';
import { AnthropicAdapter } from '../src/server/providers/anthropic';

const tool = {
  name: 'read_file',
  description: 'Read a source file from the current workspace.',
  parameters: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Workspace-relative file path.' }
    },
    required: ['path']
  }
};

async function run(): Promise<void> {
  const previousOpenAIKey = process.env.OPENAI_API_KEY;
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

  try {
    const openAI = new OpenAIAdapter();
    const openAIEvents = [
      { type: 'response.output_text.delta', delta: 'I will inspect the file.' },
      {
        type: 'response.completed',
        response: {
          output_text: 'I will inspect the file.',
          output: [{
            type: 'function_call',
            id: 'fc_openai_1',
            call_id: 'call_openai_1',
            name: 'read_file',
            arguments: JSON.stringify({ path: 'src/index.ts' })
          }],
          usage: { input_tokens: 31, output_tokens: 8 }
        }
      }
    ];
    (openAI as any).getClient = () => ({
      responses: {
        create: async () => ({
          async *[Symbol.asyncIterator]() {
            for (const event of openAIEvents) yield event;
          }
        })
      }
    });

    const openAIDeltas: string[] = [];
    const openAIResult = await openAI.generateContentStream({
      model: 'gpt-6-astra',
      apiModelId: 'gpt-6-astra',
      messages: [{ role: 'user', content: 'Inspect src/index.ts.' }],
      tools: [tool]
    }, delta => openAIDeltas.push(delta));

    assert.equal(openAIResult.text, 'I will inspect the file.');
    assert.deepEqual(openAIDeltas, ['I will inspect the file.']);
    assert.deepEqual(openAIResult.toolCalls, [{
      id: 'call_openai_1',
      name: 'read_file',
      arguments: { path: 'src/index.ts' }
    }]);
    assert.deepEqual(openAIResult.usage, { inputTokens: 31, outputTokens: 8 });

    const anthropic = new AnthropicAdapter();
    const anthropicStream = {
      async *[Symbol.asyncIterator]() {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'I will inspect the file.' } };
      },
      async finalMessage() {
        return {
          content: [
            { type: 'text', text: 'I will inspect the file.' },
            {
              type: 'tool_use',
              id: 'toolu_anthropic_1',
              name: 'read_file',
              input: { path: 'src/index.ts' }
            }
          ],
          usage: { input_tokens: 29, output_tokens: 7 }
        };
      }
    };
    (anthropic as any).getClient = () => ({
      messages: { stream: () => anthropicStream }
    });

    const anthropicDeltas: string[] = [];
    const anthropicResult = await anthropic.generateContentStream({
      model: 'claude-sonnet-5-5',
      apiModelId: 'claude-sonnet-5-5',
      messages: [{ role: 'user', content: 'Inspect src/index.ts.' }],
      tools: [tool]
    }, delta => anthropicDeltas.push(delta));

    assert.equal(anthropicResult.text, 'I will inspect the file.');
    assert.deepEqual(anthropicDeltas, ['I will inspect the file.']);
    assert.deepEqual(anthropicResult.toolCalls, [{
      id: 'toolu_anthropic_1',
      name: 'read_file',
      arguments: { path: 'src/index.ts' }
    }]);
    assert.deepEqual(anthropicResult.usage, { inputTokens: 29, outputTokens: 7 });

    console.log('[PASS] OpenAI Responses and Anthropic streaming preserve native structured tool calls');
  } finally {
    if (previousOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAIKey;
    if (previousAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
  }
}

run().catch(error => {
  console.error('[FAIL] Structured provider tool-call streaming test:', error);
  process.exitCode = 1;
});
