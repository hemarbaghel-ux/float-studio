import { PortableAgentRunner } from '../src/server/agent/portableAgentRunner';

class TestResponse {
  destroyed = false;
  writableEnded = false;
  chunks: string[] = [];
  writeHead(_status: number, _headers: Record<string, string>) {}
  on(_event: string, _listener: (...args: unknown[]) => void) {}
  write(chunk: string) { this.chunks.push(chunk); return true; }
  end() { this.writableEnded = true; }
  events() {
    return this.chunks.flatMap((chunk) => chunk.split('\n')).filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)));
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function testOpenAICompatible(provider: 'openai' | 'xai') {
  const response = new TestResponse();
  let requests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests++;
    const body = JSON.parse(String(init?.body || '{}'));
    assert(Array.isArray(body.tools) && body.tools.some((tool: any) => tool.function?.name === 'read_project_file'), `${provider} sends registered tools to provider`);
    if (requests === 1) {
      return json({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call-read', type: 'function', function: { name: 'read_project_file', arguments: '{"path":"src/main.ts"}' } }] } }] });
    }
    assert(body.messages.some((message: any) => message.role === 'tool' && message.tool_call_id === 'call-read'), `${provider} receives tool result in its native conversation format`);
    return json({ choices: [{ message: { role: 'assistant', content: 'The entry point contains the app bootstrap.' } }] });
  }) as typeof fetch;

  try {
    await PortableAgentRunner.run(provider, { user: { uid: 'test-user' }, body: { projectId: 'test-project' } }, response, provider === 'xai' ? 'grok-4.7' : 'gpt-4o', 'Inspect the entry point.', [{ path: 'src/main.ts', content: 'createRoot(document.getElementById("root")!).render(<App />);' }], 'test-key');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const events = response.events();
  assert(requests === 2, `${provider} completes a tool call and a synthesis turn`);
  assert(events.some((event) => event.type === 'event' && event.data.type === 'tool_completed'), `${provider} emits tool completion progress`);
  assert(events.some((event) => event.type === 'result' && event.data.text.includes('entry point')), `${provider} returns the final answer`);
  assert(response.writableEnded, `${provider} closes the SSE response`);
}

async function testAnthropic() {
  const response = new TestResponse();
  let requests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests++;
    const body = JSON.parse(String(init?.body || '{}'));
    assert(Array.isArray(body.tools) && body.tools.some((tool: any) => tool.name === 'read_project_file'), 'Anthropic receives native tool schema');
    if (requests === 1) return json({ content: [{ type: 'text', text: 'I will inspect the file.' }, { type: 'tool_use', id: 'tool-read', name: 'read_project_file', input: { path: 'src/main.ts' } }] });
    assert(body.messages.some((message: any) => message.role === 'user' && Array.isArray(message.content) && message.content.some((block: any) => block.type === 'tool_result' && block.tool_use_id === 'tool-read')), 'Anthropic receives native tool_result blocks');
    return json({ content: [{ type: 'text', text: 'The entry point contains the app bootstrap.' }] });
  }) as typeof fetch;

  try {
    await PortableAgentRunner.run('anthropic', { user: { uid: 'test-user' }, body: { projectId: 'test-project' } }, response, 'claude-3-7-sonnet-20250219', 'Inspect the entry point.', [{ path: 'src/main.ts', content: 'bootstrap();' }], 'test-key');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const events = response.events();
  assert(requests === 2, 'Anthropic completes a tool call and a synthesis turn');
  assert(events.some((event) => event.type === 'result' && event.data.text.includes('entry point')), 'Anthropic returns the final answer');
  assert(response.writableEnded, 'Anthropic closes the SSE response');
}

async function main() {
  await testOpenAICompatible('openai');
  await testAnthropic();
  await testOpenAICompatible('xai');
  console.log('Portable provider agent loops: 20 assertions passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
