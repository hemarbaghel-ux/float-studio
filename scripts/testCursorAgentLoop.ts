import { ToolRegistry } from '../src/server/agent/toolRegistry';
import { PortableAgentRunner } from '../src/server/agent/portableAgentRunner';
import { ToolExecutionContext } from '../src/server/agent/types';
import { ProposalService } from '../src/server/agent/proposalService';

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
    content: 'import { createRoot } from "react-dom/client";\nconst title = "Old Title";\nconst unused = 123;\nconsole.log(title);\n',
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

  // 3. Tool 3: edit_file (Safe with uniqueness check, empty deletion & multi-edit proposal consolidation)
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

  // C. Empty replacement (deleting code lines) on the same file preserves original baseline hash!
  const editDeleteLine = await ToolRegistry.execute('edit_file', {
    path: 'src/main.ts',
    old_str: 'const unused = 123;\n',
    new_str: ''
  }, context);
  assert(editDeleteLine.success, 'edit_file allows new_str: "" to delete lines');
  assert(!context.virtualFiles.get('src/main.ts')?.content?.includes('unused'), 'Deleted line is removed from working virtual file');

  const untouchedBaseline = new Map<string, string>([
    ['src/main.ts', 'import { createRoot } from "react-dom/client";\nconst title = "Old Title";\nconst unused = 123;\nconsole.log(title);\n']
  ]);
  const hashValidation = ProposalService.checkConflicts(editDeleteLine.output.proposal, untouchedBaseline);
  assert(!hashValidation.isStale && hashValidation.conflicts.length === 0, 'Repeated edit_file on same file preserves original baseline hash');

  // 4. Tool 4: search_code
  console.log('4. Testing search_code...');
  const searchPattern = await ToolRegistry.execute('search_code', { pattern: 'New Title' }, context);
  assert(searchPattern.success, 'search_code succeeds');
  assert(searchPattern.output.matchesFound >= 1, 'search_code found match');

  // 5. Tool 5: run_command (All 5 distinct outcomes)
  console.log('5. Testing run_command across all 5 distinct execution outcomes...');
  // A. Rejects dangerous command
  const dangerousCmd = await ToolRegistry.execute('run_command', { command: 'rm -rf /' }, context);
  assert(!dangerousCmd.success, 'run_command blocks destructive command');

  // B. Outcome 4 (command_unavailable): tsc --noEmit / npm test / npm run lint / npm run build without sandbox must NOT masquerade as succeeded
  for (const unavailCmd of ['tsc --noEmit', 'npm run lint', 'npm test', 'npm run build']) {
    const res = await ToolRegistry.execute('run_command', { command: unavailCmd }, context);
    assert(!res.success, `${unavailCmd} fails closed when sandbox is unavailable`);
    assert(res.output?.outcome === 'command_unavailable' && res.output?.status === 'command_unavailable', `${unavailCmd} reports outcome=command_unavailable`);
    assert(res.output?.executed === false && res.output?.exitCode === null, `${unavailCmd} reports executed=false and exitCode=null`);
  }

  // C. Outcome 3 (syntax_validation_only): lightweight syntax check explicitly labeled
  const syntaxOnlyCmd = await ToolRegistry.execute('run_command', { command: 'syntax-check' }, context);
  assert(syntaxOnlyCmd.success, 'syntax-check succeeds on valid syntax');
  assert(syntaxOnlyCmd.output?.outcome === 'syntax_validation_only' && syntaxOnlyCmd.output?.status === 'syntax_validation_only', 'Reports syntax_validation_only status');
  assert(syntaxOnlyCmd.output?.executed === false && syntaxOnlyCmd.output?.syntaxValidationOnly === true && syntaxOnlyCmd.output?.exitCode === null, 'Never masquerades syntax check as executed process');

  // D. Outcome 5 (requires_approval): command requiring approval
  const approvalCmd = await ToolRegistry.execute('run_command', { command: 'npm test' }, { ...context, executionPolicy: 'ask' });
  assert(!approvalCmd.success, 'Command under ask policy is not auto-executed');
  assert(approvalCmd.output?.outcome === 'requires_approval' && approvalCmd.output?.status === 'requires_approval', 'Reports outcome=requires_approval');

  // E. Outcome 1 (sandbox_passed) & Outcome 2 (sandbox_failed): isolated sandbox execution
  const sandboxPassCmd = await ToolRegistry.execute('run_command', { command: 'tsc --noEmit' }, {
    ...context,
    enableSandboxExecution: true,
    sandboxExecutor: async () => ({ status: 'succeeded', exitCode: 0, durationMs: 42, stdout: 'tsc: 0 errors', stderr: '' })
  });
  assert(sandboxPassCmd.success && sandboxPassCmd.output?.outcome === 'sandbox_passed' && sandboxPassCmd.output?.status === 'succeeded' && sandboxPassCmd.output?.exitCode === 0, 'Reports sandbox_passed when isolated sandbox succeeds');

  const sandboxFailCmd = await ToolRegistry.execute('run_command', { command: 'npm test' }, {
    ...context,
    enableSandboxExecution: true,
    sandboxExecutor: async () => ({ status: 'failed', exitCode: 1, durationMs: 55, stdout: '', stderr: '1 test failed' })
  });
  assert(!sandboxFailCmd.success && sandboxFailCmd.output?.outcome === 'sandbox_failed' && sandboxFailCmd.output?.status === 'failed' && sandboxFailCmd.output?.exitCode === 1, 'Reports sandbox_failed when isolated sandbox fails');

  // 6. Multi-step End-to-End Agent Loop: edit_file (file 1) -> edit_file (file 2) -> run_validation -> final summary
  console.log('6. Testing Multi-Step Agent Loop (edit 2 files + run_validation without premature break)...');
  const response = new TestResponse();
  let callIndex = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    callIndex++;
    const body = JSON.parse(String(init?.body || '{}'));

    // Round 1: Model edits src/utils.ts
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

    // Round 2: Model edits a second file (src/main.ts) and runs validation
    if (callIndex === 2) {
      return json({
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call-edit-2',
                type: 'function',
                function: {
                  name: 'edit_file',
                  arguments: JSON.stringify({
                    path: 'src/main.ts',
                    old_str: 'const x = 1;',
                    new_str: 'const x = 2;'
                  })
                }
              },
              {
                id: 'call-val-1',
                type: 'function',
                function: {
                  name: 'run_validation',
                  arguments: JSON.stringify({ type: 'syntax' })
                }
              }
            ]
          }
        }]
      });
    }

    // Round 3: Model receives validation result and finishes with summary
    return json({
      choices: [{
        message: {
          role: 'assistant',
          content: 'I have updated both `src/utils.ts` and `src/main.ts`, verified syntax validation, and generated a consolidated diff proposal.'
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
      'Please update utils.ts and main.ts and validate syntax',
      [
        { path: 'src/utils.ts', content: 'export function add(a: number, b: number) { return a + b; }\n' },
        { path: 'src/main.ts', content: 'const x = 1;\n' }
      ],
      'mock-api-key'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const events = response.events();
  assert(callIndex === 3, `Expected 3 model turns (edit -> edit+validate -> summary), got ${callIndex}`);
  assert(events.some(e => e.type === 'event' && e.data.type === 'tool_completed' && e.data.tool === 'edit_file'), 'Emits tool_completed for edit_file');
  assert(events.some(e => e.type === 'event' && e.data.type === 'tool_completed' && e.data.tool === 'run_validation'), 'Emits tool_completed for run_validation after edit_file');
  assert(events.some(e => e.type === 'event' && e.data.type === 'review_ready'), 'Emits review_ready for code approval flow');
  const resultEvent = events.find(e => e.type === 'result');
  assert(resultEvent && resultEvent.data.changeSet !== null, 'Result includes changeSet with diff for approval');
  assert(resultEvent.data.changeSet.changes.length === 2, 'Consolidated changeSet includes both modified files');

  console.log('\nAll Cursor-like agent loop and tools tests passed successfully!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
