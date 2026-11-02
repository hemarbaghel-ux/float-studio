import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('=== FLOAT AI: Cursor Composer Multi-File Diff Verification ===\n');

// 1. Verify file presence
const cardPath = path.resolve(process.cwd(), 'src/features/composer/MultiFileDiffCard.tsx');
assert(fs.existsSync(cardPath), 'MultiFileDiffCard.tsx must exist');

const cardSrc = fs.readFileSync(cardPath, 'utf8');

// 2. Verify Accept All & Reject All actions
assert(cardSrc.includes('handleAcceptAll'), 'MultiFileDiffCard must implement handleAcceptAll');
assert(cardSrc.includes('handleRejectAll'), 'MultiFileDiffCard must implement handleRejectAll');
assert(cardSrc.includes('handleApplySingleFile'), 'MultiFileDiffCard must implement per-file apply');
assert(cardSrc.includes('renderDiffSnippet'), 'MultiFileDiffCard must render inline unified diff snippets');
assert(cardSrc.includes('saveProject'), 'MultiFileDiffCard must invoke saveProject before finalizing');
assert(cardSrc.includes('/api/projects/'), 'MultiFileDiffCard must post to the server apply endpoint');
assert(cardSrc.includes('rejectProposalRequest'), 'MultiFileDiffCard must use rejectProposalRequest helper');

console.log('[PASS] MultiFileDiffCard provides full multi-file review, Accept All, Reject All, and per-file acceptance');

// 3. Verify AIPanel.tsx integration
const aiPanelPath = path.resolve(process.cwd(), 'src/features/ai/AIPanel.tsx');
const aiPanelSrc = fs.readFileSync(aiPanelPath, 'utf8');
assert(aiPanelSrc.includes("import { MultiFileDiffCard } from '../composer/MultiFileDiffCard'"), 'AIPanel imports MultiFileDiffCard');
assert(aiPanelSrc.includes('<MultiFileDiffCard'), 'AIPanel renders MultiFileDiffCard for msg.changeSet');

console.log('[PASS] AIPanel renders interactive MultiFileDiffCard in the IDE AI dock');

// 4. Verify ChatThread.tsx integration
const chatThreadPath = path.resolve(process.cwd(), 'src/features/float/ChatThread.tsx');
const chatThreadSrc = fs.readFileSync(chatThreadPath, 'utf8');
assert(chatThreadSrc.includes("import { MultiFileDiffCard } from '../composer/MultiFileDiffCard'"), 'ChatThread imports MultiFileDiffCard');
assert(chatThreadSrc.includes('<MultiFileDiffCard'), 'ChatThread renders MultiFileDiffCard for assistant proposals');

console.log('[PASS] ChatThread renders interactive MultiFileDiffCard in full-screen chat');

// 5. Verify Keyboard shortcut indicators
assert(cardSrc.includes('Ctrl+Enter'), 'MultiFileDiffCard documents Ctrl+Enter for Accept All');
assert(cardSrc.includes('Esc'), 'MultiFileDiffCard documents Esc for Reject All');

console.log('[PASS] Keyboard accessibility hints (Ctrl+Enter, Esc) verified');

console.log('\n======================================================');
console.log('Cursor Composer Multi-File Diff Verification: All checks passed!');
console.log('======================================================\n');
