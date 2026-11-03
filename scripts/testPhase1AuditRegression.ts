import assert from 'node:assert/strict';
import { parseSegments } from '../src/features/float/chatParsing';
import { sanitizeProposalPath } from '../src/server/proposals/proposalService';
import { normalizeFilePath } from '../src/store';

let passed = 0;
function check(condition: unknown, message: string): void {
  assert.ok(condition, message);
  console.log(`[PASS] ${message}`);
  passed++;
}

console.log('=== PHASE 1: CORE CORRECTNESS & PROPOSAL WORKFLOW AUDIT ===\n');

// 1. Proposal Parsing Robustness Tests
console.log('--- 1. Proposal Parsing Robustness ---');

// Standard format
const standard = '```tsx path=src/App.tsx\nexport default function App() {}\n```';
const seg1 = parseSegments(standard);
check(seg1.length === 1 && seg1[0].kind === 'file' && seg1[0].path === 'src/App.tsx', 'Parses unquoted path= format');

// Quoted format
const quoted = '```tsx path="src/components/Header.tsx"\nexport const Header = () => null;\n```';
const seg2 = parseSegments(quoted);
check(seg2.length === 1 && seg2[0].kind === 'file' && seg2[0].path === 'src/components/Header.tsx', 'Parses quoted path="file" format');

// Single quoted format
const singleQuoted = "```python path='services/auth.py'\ndef login(): pass\n```";
const seg3 = parseSegments(singleQuoted);
check(seg3.length === 1 && seg3[0].kind === 'file' && seg3[0].path === 'services/auth.py', "Parses single-quoted path='file' format");

// Filename / file alias format
const fileAttr = '```typescript filename="src/types.ts"\nexport type User = { id: string };\n```';
const seg4 = parseSegments(fileAttr);
check(seg4.length === 1 && seg4[0].kind === 'file' && seg4[0].path === 'src/types.ts', 'Parses filename= attribute format');

// Colon syntax format (Cursor style)
const colonSyntax = '```tsx:src/views/Dashboard.tsx\nexport function Dashboard() {}\n```';
const seg5 = parseSegments(colonSyntax);
check(seg5.length === 1 && seg5[0].kind === 'file' && seg5[0].path === 'src/views/Dashboard.tsx', 'Parses Cursor-style colon syntax ```tsx:src/views/Dashboard.tsx');

// In-body top-line comment format
const commentPath = '```javascript\n// filepath: src/legacy.js\nconsole.log("hello");\n```';
const seg6 = parseSegments(commentPath);
check(seg6.length === 1 && seg6[0].kind === 'file' && seg6[0].path === 'src/legacy.js', 'Parses top-line // filepath: comment');
check(seg6[0].kind === 'file' && !seg6[0].content.includes('filepath:'), 'Removes top-line filepath comment from proposed file body');

// Hash top-line comment (Python / Bash)
const hashCommentPath = '```python\n# filepath: scripts/seed.py\nimport os\n```';
const seg7 = parseSegments(hashCommentPath);
check(seg7.length === 1 && seg7[0].kind === 'file' && seg7[0].path === 'scripts/seed.py', 'Parses top-line # filepath: comment for Python');

// Delete variations
const deleteBlock = '```delete path="old/deprecated.ts"```';
const seg8 = parseSegments(deleteBlock);
check(seg8.length === 1 && seg8[0].kind === 'delete' && seg8[0].path === 'old/deprecated.ts', 'Parses quoted delete block');

// Plain code block without path remains text
const plainCode = 'Here is how to use it:\n```python\nprint("demo")\n```';
const seg9 = parseSegments(plainCode);
check(seg9.length === 1 && seg9[0].kind === 'text', 'Leaves plain code blocks without explicit paths as text snippets');

// Incomplete block marks complete: false
const incomplete = '```tsx path=src/live.tsx\nconst streaming = 1;';
const seg10 = parseSegments(incomplete);
check(seg10.length === 1 && seg10[0].kind === 'file' && seg10[0].complete === false, 'Detects incomplete streaming code blocks');


// 2. Path Sanitization Tests
console.log('\n--- 2. Path Sanitization & Traversal Prevention ---');

// Safe relative path with ./
const dotSlash = sanitizeProposalPath('./src/App.tsx');
check(dotSlash.safePath === 'src/App.tsx' && !dotSlash.error, 'Accepts leading ./ in proposal paths and normalizes cleanly');

// Traversal blocked
check(Boolean(sanitizeProposalPath('../escape.ts').error), 'Rejects directory traversal with ../');
check(Boolean(sanitizeProposalPath('src/../../etc/passwd').error), 'Rejects embedded directory traversal');
check(Boolean(sanitizeProposalPath('/etc/shadow').error), 'Rejects root Unix paths');
check(Boolean(sanitizeProposalPath('C:\\Windows\\system.ini').error), 'Rejects Windows absolute drive paths');
check(Boolean(sanitizeProposalPath('src/.env').error), 'Rejects sensitive .env files');
check(Boolean(sanitizeProposalPath('id_rsa').error), 'Rejects sensitive SSH keys');


// 3. Store Path Normalization Tests
console.log('\n--- 3. File Store Path Normalization ---');
check(normalizeFilePath('\\src\\components\\App.tsx') === 'src/components/App.tsx', 'Normalizes Windows backslashes');
check(normalizeFilePath('/src/components/App.tsx') === 'src/components/App.tsx', 'Normalizes leading slashes');
check(normalizeFilePath('src/components/App.tsx/') === 'src/components/App.tsx', 'Normalizes trailing slashes');

console.log(`\n======================================================`);
console.log(`Phase 1 Audit Regression: All ${passed} checks passed!`);
console.log(`======================================================`);
