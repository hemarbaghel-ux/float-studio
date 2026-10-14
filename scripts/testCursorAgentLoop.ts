import { ToolRegistry } from '../src/server/agent/toolRegistry';
import { PortableAgentRunner } from '../src/server/agent/portableAgentRunner';
import { ToolExecutionContext } from '../src/server/agent/types';

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

async function runTests() {
  console.log('=== FLOAT AI Cursor-Like Agent Loop & Tools Verification ===\n');

  const virtualFiles = new Map<string, { path: string; name?: string; content?: string; type: string }>();
  virtualFiles.set('src/main.ts', {
    path: 'src/main.ts',
    name: 'main.ts',
    content: 'import { createRoot } from "react-dom/client";\nconst title = "Old Title";\nconsole.log(title);\n',
    type: 'file'
  });
  virtualFiles.set('src/utils.ts', {
    path: 'src/utils.ts',
    name: 'utils.ts',
    content: 'export function add(a: number, b: number) { return a + b; }\n',
    type: 'file'
  });

  const context: ToolExecutionContext = {
    userId: 'user-1',
    projectId: 'proj-1',
    projectName: 'Demo Project',
    virtualFiles
  };

  // 1. Tool 1: list_files
  console.log('1. Testing list_files...');
  const listRoot = await ToolRegistry.execute('list_files', { path: '.' }, context);
  assert(listRoot.success, 'list_files root succeeds');
  assert(listRoot.output.files.includes('src/main.ts'), 'list_files returns src/main.ts');

  const listSrc = await ToolRegistry.execute('list_files', { path: 'src' }, context);
  assert(listSrc.success, 'list_files src directory succeeds');
  assert(listSrc.output.totalFound === 2, 'list_files found 2 files in src');

  // 2. Tool 2: read_file
  console.log('2. Testing read_file...');
  const readFile = await ToolRegistry.execute('read_file', { path: 'src/main.ts' }, context);
  assert(readFile.success, 'read_file succeeds');
  assert(readFile.output.content.includes('Old Title'), 'read_file contains file contents');

  // 3. Tool 3: edit_file (Safe with uniqueness check & proposal review generation)
  console.log('3. Testing edit_file...');
  // A. Non-existent string
  const editNotFound = await ToolRegistry.execute('edit_file', {
    path: 'src/main.ts',
    old_str: 'non_existent_string_123',
    new_str: 'replacement'
  }, context);
  assert(!editNotFound.success, 'edit_file rejects non-existent old_str');
  assert(editNotFound.error?.includes('was not found'), 'Reports old_str not found');

  // B. Valid unique replacement
  const editSuccess = await ToolRegistry.execute('edit_file', {
    path: 'src/main.ts',
    old_str: 'const title = "Old Title";',
    new_str: 'const title = "New Title";'
  }, context);
  assert(editSuccess.success, 'edit_file replaces unique string');
  assert(editSuccess.output.proposalId, 'edit_file creates a structured change proposal for user review');
  assert(context.virtualFiles.get('src/main.ts')?.content?.includes('New Title'), 'Updates virtual file in agent session');

  // 4. Tool 4: search_code
  console.log('4. Testing search_code...');
  const searchPattern = await ToolRegistry.execute('search_code', { pattern: 'New Title' }, context);
  assert(searchPattern.success, 'search_code succeeds');
  assert(searchPattern.output.matchesFound >= 1, 'search_code found match');

  // 5. Tool 5: run_command
  console.log('5. Testing run_command...');
  // A. Rejects dangerous command
  const dangerousCmd = await ToolRegistry.execute('run_command', { command: 'rm -rf /' }, context);
  assert(!dangerousCmd.success, 'run_command blocks destructive command');

  // B. Validation / type check execution
  const validCmd = await ToolRegistry.execute('run_command', { command: 'tsc --noEmit' }, context);
  assert(validCmd.success, 'run_command executes TypeScript validation check');
  assert(validCmd.output.status === 'succeeded', 'Validation passed on clean files');

  // 6. End-to-end agent loop with tools (Cursor pattern)
  console.log('6. Testing Agent Loop with tool calling and proposal emission...');
  const response = new TestResponse();
  let callIndex = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    callIndex++;
    const body = JSON.parse(String(init?.body || '{}'));

    // Round 1: Model decides to call edit_file
    if (callIndex === 1) {
      assert(body.tools.some((t: any) => t.function.name === 'edit_file'), 'Tools include edit_file');
      assert(body.tools.some((t: any) => t.function.name === 'run_command'), 'Tools include run_command');
      return json({
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call-edit-1',
              type: 'function',
              function: {
                name: 'edit_file',
                arguments: JSON.stringify({
                  path: 'src/utils.ts',
                  old_str: 'return a + b;',
                  new_str: 'return a + b; // added documentation'
                })
              }
            }]
          }
        }]
      });
    }

    // Round 2: Model receives tool result and finishes with summary
    return json({
      choices: [{
        message: {
          role: 'assistant',
          content: 'I have updated `src/utils.ts` and generated a code diff proposal for your review.'
        }
      }]
    });
  }) as typeof fetch;

  try {
    await PortableAgentRunner.run(
      'openai',
      { user: { uid: 'u-123' }, body: { projectId: 'p-123' } },
      response,
      'gpt-4o',
      'Please add documentation to utils.ts',
      [{ path: 'src/utils.ts', content: 'export function add(a: number, b: number) { return a + b; }\n' }],
      'mock-api-key'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const events = response.events();
  assert(events.some(e => e.type === 'event' && e.data.type === 'tool_completed' && e.data.tool === 'edit_file'), 'Emits tool_completed for edit_file');
  assert(events.some(e => e.type === 'event' && e.data.type === 'review_ready'), 'Emits review_ready for code approval flow');
  assert(events.some(e => e.type === 'result' && e.data.changeSet !== null), 'Result includes changeSet with diff for approval');

  console.log('\nAll Cursor-like agent loop and tools tests passed successfully!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
