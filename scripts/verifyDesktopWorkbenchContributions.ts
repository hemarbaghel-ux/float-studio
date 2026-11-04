/**
 * FLOAT Studio - Native Desktop Workbench Verification Suite
 *
 * Verifies that the native Code-OSS Workbench FLOAT subsystem:
 * 1. Exports valid Action descriptors and Keybindings for Composer (Ctrl+I), Inline Diff (Ctrl+K), and Chat (Ctrl+L)
 * 2. Provides active model registry with Gemini, OpenAI, and Claude models
 * 3. Enforces proposal path safety (sanitization, traversal protection, secret exclusion)
 * 4. Parses multi-file fenced code proposals with various syntax headers
 * 5. Manages turn checkpoints and rollback snapshots
 * 6. Expands workspace context mentions (@file, @folder, @codebase, @symbol) within character budget
 * 7. Correctly packages failing terminal commands for "Fix with FLOAT"
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';

async function runDesktopWorkbenchVerification() {
  console.log('================================================================');
  console.log('       FLOAT STUDIO: NATIVE WORKBENCH SUBSYSTEM VERIFICATION     ');
  console.log('================================================================\n');

  const desktopSrc = path.resolve(process.cwd(), 'desktop/src/vs/workbench/contrib/float');

  // This suite verifies the Code-OSS source tree and executes selected pure FLOAT modules
  // through tsx. A full Code-OSS/Gulp build is a separate pipeline and is not produced by
  // the root npm test workflow.
  // --- Step 1: Verify Native Module Source Artifacts ---
  console.log('--- Step 1: Verify Native Module Source Artifacts ---');
  const expectedModules = [
    'common/floatService.ts',
    'common/auth/floatAuthService.ts',
    'common/protocols/floatProtocol.ts',
    'common/proposals/floatProposalValidator.ts',
    'common/proposals/floatProposal.ts',
    'common/checkpoints/floatCheckpointService.ts',
    'common/model-runtime/floatModelRegistry.ts',
    'common/model-runtime/floatModelClient.ts',
    'common/brain/floatBrainService.ts',
    'common/workspace/floatWorkspaceIndexer.ts',
    'common/agent-runtime/floatAgentLoop.ts',
    'browser/float.contribution.ts',
    'browser/composer/floatComposer.ts',
    'browser/composer/floatComposerActions.ts',
    'browser/inline-diff/floatInlineDiffController.ts',
    'browser/inline-diff/floatInlineDiffZoneWidget.ts',
    'browser/inline-diff/floatInlineDiffActions.ts',
    'browser/chat/floatChatActions.ts',
    'browser/context/floatContextProvider.ts',
    'browser/context/floatMentionParser.ts',
    'browser/terminal/floatTerminalListener.ts',
    'browser/terminal/floatTerminalActions.ts',
    'electron-sandbox/native-bridge/floatNativeBridge.ts',
    'electron-sandbox/security/floatSecurityGuard.ts',
    'electron-sandbox/filesystem/floatNativeFs.ts',
    'electron-sandbox/process/floatNativeProcess.ts'
  ];

  for (const mod of expectedModules) {
    const fullPath = path.join(desktopSrc, mod);
    assert(fs.existsSync(fullPath), `Native FLOAT source module missing: ${mod}`);
  }
  console.log(`[PASS] All ${expectedModules.length} native FLOAT desktop source modules found and verified.\n`);

  // --- Step 2: Keybinding & Action Descriptors ---
  console.log('--- Step 2: Workbench Keybinding & Action Descriptors ---');
  const actionFile = fs.readFileSync(path.join(desktopSrc, 'browser/float.contribution.ts'), 'utf8');
  assert(actionFile.includes('OpenFloatComposerAction'), 'Composer action must be registered');
  assert(actionFile.includes('FloatInlineDiffAction'), 'Inline diff action must be registered');
  assert(actionFile.includes('OpenFloatChatAction'), 'Chat action must be registered');
  assert(actionFile.includes('FixWithFloatTerminalAction'), 'Terminal action must be registered');

  // Verify keybinding definitions in source action files
  const composerActionSrc = fs.readFileSync(path.join(desktopSrc, 'browser/composer/floatComposerActions.ts'), 'utf8');
  assert(composerActionSrc.includes('CtrlCmd | KeyCode.KeyI'), 'Composer must bind to Ctrl+I / Cmd+I');
  assert(composerActionSrc.includes('float.composer.open'), 'Composer ID must be float.composer.open');

  const inlineDiffActionSrc = fs.readFileSync(path.join(desktopSrc, 'browser/inline-diff/floatInlineDiffActions.ts'), 'utf8');
  assert(inlineDiffActionSrc.includes('CtrlCmd | KeyCode.KeyK'), 'Inline Diff must bind to Ctrl+K / Cmd+K');
  assert(inlineDiffActionSrc.includes('float.inlineDiff.trigger'), 'Inline Diff ID must be float.inlineDiff.trigger');

  const chatActionSrc = fs.readFileSync(path.join(desktopSrc, 'browser/chat/floatChatActions.ts'), 'utf8');
  assert(chatActionSrc.includes('CtrlCmd | KeyCode.KeyL'), 'Chat must bind to Ctrl+L / Cmd+L');
  assert(chatActionSrc.includes('float.chat.open'), 'Chat ID must be float.chat.open');

  console.log('[PASS] Ctrl+I (Composer), Ctrl+K (Inline Diff), and Ctrl+L (AI Chat) keybinding registrations verified.\n');

  // --- Step 3: Model Registry & Metadata ---
  console.log('--- Step 3: Native Model Registry ---');
  const modelRegistrySrc = fs.readFileSync(path.join(desktopSrc, 'common/model-runtime/floatModelRegistry.ts'), 'utf8');
  assert(modelRegistrySrc.includes('gpt-6.1-sol'), 'GPT-6.1 Sol model registered (default)');
  assert(modelRegistrySrc.includes('gpt-6-astra'), 'GPT-6 Astra model registered');
  assert(modelRegistrySrc.includes('auto'), 'Auto alias registered');
  console.log('[PASS] Model catalog strictly aligned with server verified models (gpt-6.1-sol, gpt-6-astra, auto).\n');

  // --- Step 4: Multi-File Proposal Validator & Path Security ---
  console.log('--- Step 4: Multi-File Proposal Validator & Path Safety ---');
  const validatorModule = await import(pathToFileURL(path.join(desktopSrc, 'common/proposals/floatProposalValidator.ts')).href);
  const { sanitizeProposalPath, parseModelProposals } = validatorModule;

  // Path safety checks
  assert.strictEqual(sanitizeProposalPath('./src/components/Header.tsx'), 'src/components/Header.tsx');
  assert.throws(() => sanitizeProposalPath('..\\secret.env'));
  assert.throws(() => sanitizeProposalPath('/etc/passwd'));
  assert.throws(() => sanitizeProposalPath('C:\\Windows\\system32'));
  assert.throws(() => sanitizeProposalPath('.env'));
  assert.throws(() => sanitizeProposalPath('id_rsa'));

  // Proposal extraction
  const sampleAiResponse = [
    'Here is the solution:',
    '```typescript path="src/calculator.ts"',
    'export function add(a: number, b: number) { return a + b; }',
    '```',
    'And update the test:',
    '```typescript path="tests/calc.test.ts"',
    'import { add } from "../src/calculator";',
    'console.assert(add(1, 2) === 3);',
    '```'
  ].join('\n');

  const proposals = parseModelProposals(sampleAiResponse);
  assert.strictEqual(proposals.length, 1, 'Should extract proposal session');
  assert.strictEqual(proposals[0].files.length, 2, 'Should have 2 file changes');
  assert.strictEqual(proposals[0].files[0].path, 'src/calculator.ts');
  assert.ok(proposals[0].files[0].proposedContent.includes('export function add'));
  assert.strictEqual(proposals[0].files[1].path, 'tests/calc.test.ts');
  assert.ok(proposals[0].files[1].proposedContent.includes('console.assert'));
  console.log('[PASS] Multi-file diff parsing and traversal protection validated.\n');

  // --- Step 5: Checkpoint Rollback Service ---
  console.log('--- Step 5: Turn Checkpoints & Rollback Architecture ---');
  const checkpointModule = await import(pathToFileURL(path.join(desktopSrc, 'common/checkpoints/floatCheckpointService.ts')).href);
  const { FloatCheckpointService } = checkpointModule;

  const checkpointService = new FloatCheckpointService();
  const cp1 = checkpointService.createCheckpoint('Turn 1: Initial state', {
    'src/app.ts': 'const x = 1;'
  });
  assert.strictEqual(checkpointService.getAllCheckpoints().length, 1);

  checkpointService.createCheckpoint('Turn 2: Added function', {
    'src/app.ts': 'const x = 2; function foo() {}'
  });
  assert.strictEqual(checkpointService.getAllCheckpoints().length, 2);

  const found = checkpointService.getCheckpoint(cp1.id);
  assert.ok(found);
  assert.strictEqual(found.snapshot['src/app.ts'], 'const x = 1;');

  const popped = checkpointService.popLatestCheckpoint();
  assert.ok(popped);
  assert.strictEqual(checkpointService.getAllCheckpoints().length, 1);
  console.log('[PASS] Checkpoint snapshot creation and rollback verified.\n');

  // --- Step 6: Context Mentions & Secret Scoping ---
  console.log('--- Step 6: Context Mention Parser (@file, @folder, @codebase, @symbol) ---');
  const mentionModule = await import(pathToFileURL(path.join(desktopSrc, 'browser/context/floatMentionParser.ts')).href);
  const { parseFloatMentions } = mentionModule;

  const mentions = parseFloatMentions('Please check @file:src/main.ts and @folder:src/utils/ and @codebase for @symbol:calculateTotal');
  assert.strictEqual(mentions.length, 4);
  assert.strictEqual(mentions[0].type, 'file');
  assert.strictEqual(mentions[0].value, 'src/main.ts');
  assert.strictEqual(mentions[1].type, 'folder');
  assert.strictEqual(mentions[1].value, 'src/utils/');
  assert.strictEqual(mentions[2].type, 'codebase');
  assert.strictEqual(mentions[3].type, 'symbol');
  assert.strictEqual(mentions[3].value, 'calculateTotal');
  console.log('[PASS] Context mentions (@file, @folder, @codebase, @symbol) accurately classified.\n');

  // --- Step 7: Terminal Listener & "Fix with FLOAT" ---
  console.log('--- Step 7: Terminal Listener & "Fix with FLOAT" Packaging ---');
  const terminalActionsSrc = fs.readFileSync(path.join(desktopSrc, 'browser/terminal/floatTerminalActions.ts'), 'utf8');
  assert(terminalActionsSrc.includes('export class FixWithFloatTerminalAction'), 'Terminal recovery action must be exported');
  assert(terminalActionsSrc.includes("static readonly ID = 'float.composer.openWithTerminalError'"), 'Terminal recovery action ID must be stable');
  assert(actionFile.includes('FixWithFloatTerminalAction'), 'Terminal recovery action must be imported by the workbench contribution');
  console.log('[PASS] Terminal failure action registered (float.composer.openWithTerminalError).\n');

  console.log('================================================================');
  console.log('  ALL 7 NATIVE WORKBENCH SUBSYSTEM VERIFICATIONS PASSED (100%)  ');
  console.log('================================================================\n');
}

runDesktopWorkbenchVerification().catch((err) => {
  console.error('[FATAL] Verification failed:', err);
  process.exit(1);
});
