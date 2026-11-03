import assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FloatVSCodiumEngine } from '../extensions/float-vscodium-poc/src/floatEngine';

console.log('=== FLOAT VSCodium Proof of Concept: Local Desktop Workflow Validation ===\n');

async function runPoCTests() {
  const tempDir = path.join(os.tmpdir(), `float-vscodium-poc-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  const engine = new FloatVSCodiumEngine();
  let passedCount = 0;

  try {
    // -------------------------------------------------------------------------
    // Step 1: Populate local folder and test openLocalFolder
    // -------------------------------------------------------------------------
    console.log('--- Step 1: Open Local Folder on Hard Drive ---');
    const srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    const mainPyPath = path.join(srcDir, 'main.py');
    const initialMainPy = 'def main():\n    print("Hello from VSCodium Local Hard Drive")\n';
    await fs.writeFile(mainPyPath, initialMainPy, 'utf8');

    const configPath = path.join(tempDir, 'config.json');
    await fs.writeFile(configPath, '{"version": "1.0.0"}', 'utf8');

    // Add sensitive file to verify filtering
    const envPath = path.join(tempDir, '.env');
    await fs.writeFile(envPath, 'SECRET_KEY=12345', 'utf8');

    const openResult = await engine.openLocalFolder(tempDir);
    assert.strictEqual(openResult.success, true, 'Opened local directory successfully');
    assert.strictEqual(openResult.fileCount, 2, 'Indexed 2 non-sensitive files (main.py, config.json)');
    
    const indexed = engine.getIndexedFiles();
    assert.ok(indexed.has('src/main.py'), 'src/main.py is indexed from disk');
    assert.ok(indexed.has('config.json'), 'config.json is indexed from disk');
    assert.ok(!indexed.has('.env'), '.env was filtered out from local workspace index');
    console.log(`[PASS] Opened local hard drive workspace at "${tempDir}" (${openResult.fileCount} files indexed, .env excluded)`);
    passedCount++;

    // -------------------------------------------------------------------------
    // Step 2: Connect FLOAT Chat / Context Retrieval
    // -------------------------------------------------------------------------
    console.log('\n--- Step 2: Connect FLOAT Context Engine to Local Files ---');
    const userPrompt = 'Please inspect @src/main.py and add a calculator function';
    const contextResult = engine.buildPromptContext(userPrompt);

    assert.strictEqual(contextResult.contextFiles.length, 1, 'Extracted 1 mention');
    assert.strictEqual(contextResult.contextFiles[0], 'src/main.py', 'Extracted @src/main.py');
    assert.ok(contextResult.totalChars > 0, 'Computed character budget');
    console.log(`[PASS] Context Engine resolved local mention @src/main.py (${contextResult.totalChars} chars)`);
    passedCount++;

    // -------------------------------------------------------------------------
    // Step 3: Show Multi-File Change Proposal
    // -------------------------------------------------------------------------
    console.log('\n--- Step 3: Generate Multi-File Change Proposal ---');
    const proposalRes = engine.createProposal('Add calculator module and import in main.py', [
      {
        path: 'src/main.py',
        operation: 'modify',
        proposedContent: 'from calculator import add\n\ndef main():\n    print("Result:", add(2, 3))\n'
      },
      {
        path: 'src/calculator.py',
        operation: 'create',
        proposedContent: 'def add(a, b):\n    return a + b\n'
      }
    ]);

    assert.strictEqual(proposalRes.success, true, 'Proposal created successfully');
    const proposal = proposalRes.proposal!;
    assert.strictEqual(proposal.status, 'pending_review', 'Status is pending_review');
    assert.strictEqual(proposal.changes.length, 2, 'Proposal contains 2 file changes');
    assert.strictEqual(proposal.changes[0].diffStats.additions > 0, true, 'Computed additions for main.py');
    assert.strictEqual(proposal.changes[1].diffStats.additions >= 2, true, 'Computed additions for calculator.py');
    console.log(`[PASS] Multi-file proposal generated (+${proposal.totalDiffStats.additions}, -${proposal.totalDiffStats.deletions}) awaiting review`);
    passedCount++;

    // -------------------------------------------------------------------------
    // Step 4a: Explicit Approval Gating - User REJECTION
    // -------------------------------------------------------------------------
    console.log('\n--- Step 4a: Explicit Approval Gating: Rejection leaves disk files untouched ---');
    const rejectOutcome = await engine.reviewAndFinalizeProposal(proposal.id, 'reject');
    assert.strictEqual(rejectOutcome.status, 'rejected', 'Proposal marked as rejected');

    // VERIFY LOCAL DISK CONTENT IS 100% UNTOUCHED
    const mainPyAfterReject = await fs.readFile(mainPyPath, 'utf8');
    assert.strictEqual(mainPyAfterReject, initialMainPy, 'main.py on local disk was NOT modified');

    // Calculator.py should NOT exist on local disk
    let calcExists = false;
    try {
      await fs.stat(path.join(srcDir, 'calculator.py'));
      calcExists = true;
    } catch {}
    assert.strictEqual(calcExists, false, 'calculator.py was NOT created on local disk');
    console.log('[PASS] Rejection strictly left local hard drive files completely untouched');
    passedCount++;

    // -------------------------------------------------------------------------
    // Step 4b: Explicit Approval Gating - User ACCEPTANCE
    // -------------------------------------------------------------------------
    console.log('\n--- Step 4b: Explicit Approval Gating: User Acceptance updates local disk ---');
    // Generate fresh proposal
    const freshProposal = engine.createProposal('Apply calculator updates', [
      {
        path: 'src/main.py',
        operation: 'modify',
        proposedContent: 'from calculator import add\n\ndef main():\n    print("Result:", add(2, 3))\n'
      },
      {
        path: 'src/calculator.py',
        operation: 'create',
        proposedContent: 'def add(a, b):\n    return a + b\n'
      }
    ]).proposal!;

    const acceptOutcome = await engine.reviewAndFinalizeProposal(freshProposal.id, 'accept');
    assert.strictEqual(acceptOutcome.status, 'applied', 'Proposal applied');
    assert.strictEqual(acceptOutcome.appliedFiles?.length, 2, 'Applied 2 files');

    // VERIFY DISK FILES NOW REFLECT PROPOSAL
    const mainPyOnDisk = await fs.readFile(mainPyPath, 'utf8');
    assert.ok(mainPyOnDisk.includes('from calculator import add'), 'main.py updated on local disk');

    const calcOnDisk = await fs.readFile(path.join(srcDir, 'calculator.py'), 'utf8');
    assert.ok(calcOnDisk.includes('def add(a, b):'), 'calculator.py created on local disk');
    console.log('[PASS] Explicit user approval wrote verified changes directly to local hard drive');
    passedCount++;

    // -------------------------------------------------------------------------
    // Step 5: Rollback Checkpoint
    // -------------------------------------------------------------------------
    console.log('\n--- Step 5: One-Click Rollback Restores Pre-Turn Disk Snapshot ---');
    const rollbackSuccess = await engine.rollbackLastCheckpoint();
    assert.strictEqual(rollbackSuccess, true, 'Rollback succeeded');

    const mainPyAfterRollback = await fs.readFile(mainPyPath, 'utf8');
    assert.strictEqual(mainPyAfterRollback, initialMainPy, 'main.py rolled back to original initial code');
    console.log('[PASS] Rollback checkpoint restored pre-turn disk state cleanly');
    passedCount++;

    console.log('\n======================================================');
    console.log(`VSCodium PoC Validation: All ${passedCount}/${passedCount} steps passed!`);
    console.log('======================================================\n');
  } finally {
    // Cleanup temporary local directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

runPoCTests().catch((err) => {
  console.error('\n[FAIL] VSCodium PoC Validation failed:', err);
  process.exit(1);
});
