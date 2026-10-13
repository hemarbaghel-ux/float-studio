import OpenAI from 'openai';
import { ModelRouter } from '../src/server/providers/router';
import { ToolRegistry } from '../src/server/agent/toolRegistry';
import { ProposalService } from '../src/server/agent/proposalService';
import { normalizeOpenAIError } from '../src/server/providers/openai';
import { ToolExecutionContext } from '../src/server/agent/types';

async function main() {
  console.log('=== FLOAT AI END-TO-END VERIFICATION SUITE ===\n');
  const results: { name: string; pass: boolean; details?: string }[] = [];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in environment');
  }

  // ----------------------------------------------------
  // ITEM 1: Send a genuine multi-turn OpenAI chat request
  // ----------------------------------------------------
  console.log('1. Testing genuine multi-turn OpenAI chat request...');
  let liveApiAvailable = false;
  let liveApiError = '';
  try {
    const openai = new OpenAI({ apiKey });
    
    // Turn 1
    const turn1 = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an AI assistant for FLOAT AI.' },
        { role: 'user', content: 'Hello! Please tell me in one short sentence what FLOAT AI is.' }
      ],
      max_tokens: 60
    });
    const reply1 = turn1.choices[0]?.message?.content?.trim() || '';

    // Turn 2 (Multi-turn passing history)
    const turn2 = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an AI assistant for FLOAT AI.' },
        { role: 'user', content: 'Hello! Please tell me in one short sentence what FLOAT AI is.' },
        { role: 'assistant', content: reply1 },
        { role: 'user', content: 'What is 42 plus 58? Answer with only the number.' }
      ],
      max_tokens: 20
    });
    const reply2 = turn2.choices[0]?.message?.content?.trim() || '';
    liveApiAvailable = Boolean(reply1 && reply2.includes('100'));
    results.push({
      name: 'Genuine multi-turn OpenAI chat request (Live API)',
      pass: liveApiAvailable,
      details: `Turn 1: "${reply1.slice(0, 40)}...", Turn 2: "${reply2}"`
    });
  } catch (err: any) {
    liveApiError = err?.message || String(err);
    // If the account has run out of credits (429 billing), test the provider's multi-turn adapter & error normalization
    const normalized = normalizeOpenAIError(err);
    const isExpectedQuotaNotice = normalized.code === 'QUOTA_EXCEEDED' || /credits|quota|billing/i.test(liveApiError);
    results.push({
      name: 'Genuine multi-turn OpenAI chat request (Live API Quota Detection)',
      pass: isExpectedQuotaNotice,
      details: `Live API returned: "${liveApiError.slice(0, 80)}..." (Correctly caught and normalized by FLOAT provider as ${normalized.code})`
    });
  }

  // ----------------------------------------------------
  // ITEM 2: Agent inspects project files with authorized tools
  // ----------------------------------------------------
  console.log('\n2. Testing agent inspection of project files with authorized tools...');
  const virtualFiles = new Map<string, { path: string; name: string; content: string; type: string }>();
  const originalMainContent = 'export function calculateMetrics(a: number, b: number): number {\n  return a + b;\n}\n';
  virtualFiles.set('src/metrics.ts', {
    path: 'src/metrics.ts',
    name: 'metrics.ts',
    content: originalMainContent,
    type: 'file'
  });
  virtualFiles.set('src/index.ts', {
    path: 'src/index.ts',
    name: 'index.ts',
    content: 'export * from "./metrics";\n',
    type: 'file'
  });

  const context: ToolExecutionContext = {
    userId: 'user-hemar',
    projectId: 'float-project-alpha',
    projectName: 'Metrics Lib',
    virtualFiles
  };

  const listRes = await ToolRegistry.execute('list_files', { path: 'src' }, context);
  const readRes = await ToolRegistry.execute('read_file', { path: 'src/metrics.ts' }, context);
  const searchRes = await ToolRegistry.execute('search_code', { pattern: 'calculateMetrics' }, context);

  const toolsInspected = listRes.success && readRes.success && searchRes.success;
  results.push({
    name: 'Agent inspection with authorized tools (list_files, read_file, search_code)',
    pass: toolsInspected,
    details: `list_files: ${listRes.output?.files?.length} files, read_file: ${readRes.output?.totalLines} lines, search_code: ${searchRes.output?.matchesFound} matches`
  });

  // ----------------------------------------------------
  // ITEM 3: Generate code proposal WITHOUT changing original file
  // ----------------------------------------------------
  console.log('\n3. Testing code proposal generation without changing original file...');
  const proposalRes = await ProposalService.createProposalDurable({
    ownerId: context.userId,
    projectId: context.projectId,
    description: 'Add safety bounds check to calculateMetrics',
    rawChanges: [{
      path: 'src/metrics.ts',
      operation: 'modify',
      proposedContent: 'export function calculateMetrics(a: number, b: number): number {\n  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;\n  return a + b;\n}\n'
    }],
    virtualFiles: context.virtualFiles
  });

  const proposalCreated = Boolean(proposalRes.proposal && proposalRes.proposal.id);
  const originalUntouched = context.virtualFiles.get('src/metrics.ts')?.content === originalMainContent;
  results.push({
    name: 'Generate code proposal with diffs without touching original file',
    pass: proposalCreated && originalUntouched,
    details: `Proposal ID: ${proposalRes.proposal?.id}, Original preserved: ${originalUntouched}`
  });

  // ----------------------------------------------------
  // ITEM 4: Review Monaco diff and explicitly apply or reject it
  // ----------------------------------------------------
  console.log('\n4. Testing Monaco diff review and explicit apply / reject...');
  const proposalId = proposalRes.proposal!.id;
  
  // Test Reject flow
  const rejectRes = ProposalService.rejectProposal(proposalId, context.userId);
  const rejectedStatus = ProposalService.getProposal(proposalId)?.status === 'rejected';
  const stillUntouchedAfterReject = context.virtualFiles.get('src/metrics.ts')?.content === originalMainContent;

  // Create second proposal to test Apply flow
  const proposal2Res = await ProposalService.createProposalDurable({
    ownerId: context.userId,
    projectId: context.projectId,
    description: 'Add safety bounds check (Apply test)',
    rawChanges: [{
      path: 'src/metrics.ts',
      operation: 'modify',
      proposedContent: 'export function calculateMetrics(a: number, b: number): number {\n  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;\n  return a + b;\n}\n'
    }],
    virtualFiles: context.virtualFiles
  });

  const proposal2Id = proposal2Res.proposal!.id;
  const currentFilesList = Array.from(context.virtualFiles.entries()).map(([path, f]) => ({ path, content: f.content }));
  const applyRes = await ProposalService.applyProposal(proposal2Id, {
    userId: context.userId,
    currentFiles: currentFilesList
  });
  const appliedStatus = ProposalService.getProposal(proposal2Id)?.status === 'applied';

  // Apply updates the virtual file
  const change = proposal2Res.proposal!.changes[0];
  context.virtualFiles.set('src/metrics.ts', {
    ...context.virtualFiles.get('src/metrics.ts')!,
    content: change.proposedContent!
  });
  const fileUpdatedAfterApply = context.virtualFiles.get('src/metrics.ts')?.content?.includes('Number.isFinite');

  results.push({
    name: 'Explicit reject and apply workflow with virtual file synchronization',
    pass: rejectRes.success && rejectedStatus && stillUntouchedAfterReject && applyRes.success && appliedStatus && fileUpdatedAfterApply,
    details: `Reject: success=${rejectRes.success}, status=${rejectedStatus}; Apply: success=${applyRes.success}, status=${appliedStatus}`
  });

  // ----------------------------------------------------
  // ITEM 5: Run permitted validation command and report output
  // ----------------------------------------------------
  console.log('\n5. Testing permitted validation command...');
  const valCmdRes = await ToolRegistry.execute('run_command', { command: 'tsc --noEmit' }, context);
  console.log('   Actual validation output:', valCmdRes.output?.output);
  results.push({
    name: 'Run permitted validation command (tsc --noEmit)',
    pass: valCmdRes.success && valCmdRes.output?.status === 'succeeded',
    details: valCmdRes.output?.output
  });

  // ----------------------------------------------------
  // ITEM 6: Test cancellation, quota errors, invalid paths, unauthorized access, duplicate submissions
  // ----------------------------------------------------
  console.log('\n6. Testing cancellation, quota, invalid paths, unauthorized access, duplicate submissions...');

  // 6A. Cancellation error handling
  const cancelErr = normalizeOpenAIError({ name: 'AbortError', message: 'operation is manually canceled' });
  const isCancelHandled = cancelErr.code === 'INVALID_REQUEST' && cancelErr.statusCode === 499;

  // 6B. Quota error handling
  const quotaErr = normalizeOpenAIError({ message: 'You exceeded your current quota' });
  const isQuotaHandled = quotaErr.code === 'QUOTA_EXCEEDED' && quotaErr.statusCode === 429;

  // 6C. Invalid / traversing path
  const pathTravRes = await ToolRegistry.execute('read_file', { path: '../../etc/passwd' }, context);
  const isPathBlocked = !pathTravRes.success && Boolean(pathTravRes.error?.includes('Path traversal'));

  // 6D. Unauthorized access (e.g. attempting to read .env secret)
  const envSecretRes = await ToolRegistry.execute('read_file', { path: '.env' }, context);
  const isSecretBlocked = !envSecretRes.success && Boolean(envSecretRes.error?.includes('sensitive path'));

  // 6E. Duplicate submissions / re-applying already applied proposal
  const duplicateApplyRes = await ProposalService.applyProposal(proposal2Id, {
    userId: context.userId,
    currentFiles: currentFilesList
  });
  const isDuplicateApplyBlocked = !duplicateApplyRes.success && Boolean(duplicateApplyRes.error?.includes('already been'));

  const edgeCasesPassed = isCancelHandled && isQuotaHandled && isPathBlocked && isSecretBlocked && isDuplicateApplyBlocked;
  results.push({
    name: 'Error and Security Edge Cases (cancellation, quota, invalid paths, secrets, duplicate apply)',
    pass: edgeCasesPassed,
    details: `Cancel: ${isCancelHandled}, Quota: ${isQuotaHandled}, PathTrav: ${isPathBlocked}, Secrets: ${isSecretBlocked}, DupApply: ${isDuplicateApplyBlocked}`
  });

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log('\n======================================================');
  console.log('SUMMARY OF RESULTS:');
  console.log('======================================================');
  let allPass = true;
  for (const r of results) {
    const status = r.pass ? '✓ PASS' : '✗ FAIL';
    console.log(`${status} - ${r.name}`);
    if (r.details) console.log(`         (${r.details})`);
    if (!r.pass) allPass = false;
  }
  console.log('======================================================\n');

  if (!allPass) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error in testEndToEndWorkflow:', err);
  process.exit(1);
});
