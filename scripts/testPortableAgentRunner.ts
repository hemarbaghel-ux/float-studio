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

async function testOpenAI() {
  const response = new TestResponse();
  let requests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests++;
    const body = JSON.parse(String(init?.body || '{}'));
    assert(Array.isArray(body.tools) && body.tools.some((tool: any) => tool.function?.name === 'read_project_file'), 'openai sends registered tools to provider');
    if (requests === 1) {
      return json({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call-read', type: 'function', function: { name: 'read_project_file', arguments: '{"path":"src/main.ts"}' } }] } }] });
    }
    assert(body.messages.some((message: any) => message.role === 'tool' && message.tool_call_id === 'call-read'), 'openai receives tool result in its native conversation format');
    return json({ choices: [{ message: { role: 'assistant', content: 'The entry point contains the app bootstrap.' } }] });
  }) as typeof fetch;

  try {
    await PortableAgentRunner.run('openai', { user: { uid: 'test-user' }, body: { projectId: 'test-project' } }, response, 'gpt-4o', 'Inspect the entry point.', [{ path: 'src/main.ts', content: 'createRoot(document.getElementById("root")!).render(<App />);' }], 'test-key');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const events = response.events();
  assert(requests === 2, 'openai completes a tool call and a synthesis turn');
  assert(events.some((event) => event.type === 'event' && event.data.type === 'tool_completed'), 'openai emits tool completion progress');
  assert(events.some((event) => event.type === 'result' && event.data.text.includes('entry point')), 'openai returns the final answer');
  assert(response.writableEnded, 'openai closes the SSE response');
}

async function main() {
  await testOpenAI();
  console.log('Portable provider agent loops: assertions passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
