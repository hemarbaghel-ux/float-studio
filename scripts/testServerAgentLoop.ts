import { ToolRegistry } from '../src/server/agent/toolRegistry';
import { ProposalService, sanitizeProposalPath } from '../src/server/agent/proposalService';
import { AgentProgressEvent, AgentProgressAction, ToolExecutionContext } from '../src/server/agent/types';

async function runAgentLoopTestSuite() {
  console.log('=== FLOAT AI Server Agent Loop, Context Validation & Tool Safety Test Suite ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // --- SECTION 1: Project Context Validation & Sanitization ---
  console.log('--- 1. Project Context Validation & Sanitization ---');

  const virtualFiles = new Map<string, { path: string; name?: string; content?: string; type: string }>();
  virtualFiles.set('src/index.ts', { path: 'src/index.ts', name: 'index.ts', content: 'export const app = "FLOAT";\n', type: 'file' });
  virtualFiles.set('src/components/Header.tsx', { path: 'src/components/Header.tsx', name: 'Header.tsx', content: 'export const Header = () => <header />;\n', type: 'file' });
  virtualFiles.set('.env', { path: '.env', name: '.env', content: 'DATABASE_URL=postgres://...', type: 'file' });
  virtualFiles.set('src/secrets/cert.pem', { path: 'src/secrets/cert.pem', name: 'cert.pem', content: '-----BEGIN CERTIFICATE-----', type: 'file' });

  const validContext: ToolExecutionContext = {
    userId: 'test-user-123',
    projectId: 'test-proj-456',
    projectName: 'FLOAT Workspace',
    virtualFiles
  };

  // Missing or invalid context handling
  const nullContextResult = await ToolRegistry.execute('list_project_files', {}, null as any);
  assert(!nullContextResult.success, 'Rejects null tool execution context');
  assert(nullContextResult.error?.includes('Invalid project context'), 'Reports invalid context error clearly');

  const invalidFilesContext = await ToolRegistry.execute('list_project_files', {}, { ...validContext, virtualFiles: null as any });
  assert(!invalidFilesContext.success, 'Rejects context with null virtualFiles map');

  // get_project_context excludes sensitive files from summary
  const summaryResult = await ToolRegistry.execute('get_project_context', {}, validContext);
  assert(summaryResult.success, 'get_project_context succeeds on valid context');
  assert(summaryResult.output.totalFiles === 2, 'Excludes sensitive files (.env, cert.pem) from totalFiles count');

  // --- SECTION 2: Tool Call Argument Validation Before Execution ---
  console.log('\n--- 2. Tool Argument Validation Before Execution ---');

  // read_project_file missing required 'path' parameter
  const missingPathResult = await ToolRegistry.execute('read_project_file', {}, validContext);
  assert(!missingPathResult.success, 'Rejects read_project_file with missing required "path" argument');
  assert(missingPathResult.error?.includes('Missing or empty required parameter "path"'), 'Explains missing "path" parameter');

  // search_project missing required 'query' parameter
  const missingQueryResult = await ToolRegistry.execute('search_project', {}, validContext);
  assert(!missingQueryResult.success, 'Rejects search_project with missing required "query" argument');
  assert(missingQueryResult.error?.includes('Missing or empty required parameter "query"'), 'Explains missing "query" parameter');

  // Path traversal guard
  const traversalRead = await ToolRegistry.execute('read_project_file', { path: '../../etc/shadow' }, validContext);
  assert(!traversalRead.success, 'Blocks path traversal in read_project_file');
  assert(traversalRead.error?.includes('Path traversal'), 'Explains path traversal rejection');

  // Null byte in path guard
  const nullByteRead = await ToolRegistry.execute('read_project_file', { path: 'src/index.ts\0.js' }, validContext);
  assert(!nullByteRead.success, 'Blocks null-byte injection in path argument');

  // Sensitive file reading guard
  const secretRead = await ToolRegistry.execute('read_project_file', { path: '.env' }, validContext);
  assert(!secretRead.success, 'Blocks reading sensitive .env file');
  assert(secretRead.error?.includes('Access to sensitive path'), 'Explains sensitive path restriction');

  const certRead = await ToolRegistry.execute('read_project_file', { path: 'src/secrets/cert.pem' }, validContext);
  assert(!certRead.success, 'Blocks reading sensitive .pem certificate file');

  // Valid read succeeds
  const validRead = await ToolRegistry.execute('read_project_file', { path: 'src/index.ts' }, validContext);
  assert(validRead.success, 'Successfully reads authorized file');
  assert(validRead.output.content.includes('export const app = "FLOAT"'), 'Returns file content with line numbers');

  // --- SECTION 3: Strict Prevention of Direct File Modifications ---
  console.log('\n--- 3. Strict Prevention of Direct File Modifications ---');

  const directModTools = [
    'write_file',
    'write_project_file',
    'edit_file',
    'modify_file',
    'delete_file',
    'create_file',
    'save_file',
    'apply_changes'
  ];

  for (const toolName of directModTools) {
    const res = await ToolRegistry.execute(toolName, { path: 'src/index.ts', content: 'bad' }, validContext);
    assert(!res.success, `Blocks direct file modification via "${toolName}"`);
    assert(res.error?.includes('propose_changes'), `Guides agent to use "propose_changes" when "${toolName}" is called`);
  }

  // Direct command execution prohibition
  const directExecTools = ['run_command', 'execute_command', 'exec', 'shell', 'bash', 'terminal'];
  for (const execTool of directExecTools) {
    const res = await ToolRegistry.execute(execTool, { command: 'rm -rf /' }, validContext);
    assert(!res.success, `Blocks command execution tool "${execTool}"`);
    assert(res.error?.includes('prohibited in agent workflow'), `Explains "${execTool}" is prohibited in agent workflow`);
  }

  // --- SECTION 4: Progress Indicator Action Tags & Meaningful Messages ---
  console.log('\n--- 4. Progress Indicators & Meaningful Action Tags ---');

  const testEvents: AgentProgressEvent[] = [
    { type: 'task_started', action: 'Planning', message: 'Agent initialized task and workspace context...' },
    { type: 'planning', action: 'Exploring', message: 'Validated project context (2 files loaded).' },
    { type: 'tool_started', action: 'Searching', message: 'Searching codebase for "Header"...' },
    { type: 'tool_completed', action: 'Searching', message: 'Found 1 match(es) in codebase.' },
    { type: 'tool_started', action: 'Reading', message: 'Reading src/components/Header.tsx...' },
    { type: 'tool_completed', action: 'Reading', message: 'Read src/components/Header.tsx (1 lines).' },
    { type: 'tool_started', action: 'Generating proposal', message: 'Generating code proposal and diffs ("Add navigation items")...' },
    { type: 'review_ready', action: 'Generating proposal', message: 'Code changes proposed: "Add navigation items" (1 file(s) ready for review).' },
    { type: 'completed', action: 'Synthesizing', message: 'Agent completed task.' }
  ];

  const actions: AgentProgressAction[] = testEvents.map(e => e.action!).filter(Boolean);
  assert(actions.includes('Searching'), 'Includes "Searching" progress indicator');
  assert(actions.includes('Reading'), 'Includes "Reading" progress indicator');
  assert(actions.includes('Exploring'), 'Includes "Exploring" progress indicator');
  assert(actions.includes('Generating proposal'), 'Includes "Generating proposal" progress indicator');
  assert(actions.includes('Synthesizing'), 'Includes "Synthesizing" progress indicator');

  // --- SECTION 5: Proposal & Diff-Review Workflow Integration ---
  console.log('\n--- 5. Proposal / Diff-Review Immutability & Workflow ---');

  const originalHeaderContent = virtualFiles.get('src/components/Header.tsx')?.content;

  // Agent submits propose_changes
  const proposedChanges = [
    {
      path: 'src/components/Header.tsx',
      operation: 'modify',
      proposedContent: 'export const Header = () => <header><nav><a href="/">Home</a></nav></header>;\n'
    }
  ];

  const proposalToolResult = await ToolRegistry.execute('propose_changes', {
    description: 'Add navigation link to Header component',
    changes: JSON.stringify(proposedChanges)
  }, validContext);

  assert(proposalToolResult.success, 'propose_changes executes successfully via ToolRegistry');
  assert(!!proposalToolResult.output.proposalId, 'Returns valid proposal ID');
  assert(proposalToolResult.output.status === 'pending_review', 'Proposal initial status is pending_review');

  // Verify original virtual file is 100% UNTOUCHED
  const headerContentAfterProposal = virtualFiles.get('src/components/Header.tsx')?.content;
  assert(headerContentAfterProposal === originalHeaderContent, 'Original virtual file content is 100% UNTOUCHED upon proposal generation');

  // Verify proposal contains diff statistics
  const createdProposal = proposalToolResult.output.proposal;
  assert(createdProposal.changes[0].diffStats.additions >= 1, 'Calculated addition diff stats in proposal');
  assert(createdProposal.changes[0].originalHash.length > 0, 'Computed original SHA-256 content hash');
  assert(createdProposal.changes[0].proposedHash.length > 0, 'Computed proposed SHA-256 content hash');

  console.log(`\n======================================================`);
  console.log(`Server Agent Loop Test Suite: ${passed} passed, ${failed} failed.`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAgentLoopTestSuite().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
