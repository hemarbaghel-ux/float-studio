import {
  ContextBuilder,
  classifyTaskIntent,
  type ContextBuilderOptions,
  type ActiveEditorContext,
  type GitContextInfo,
  type ConversationTurnSummary
} from '../src/server/contextBuilder';
import { workspaceIndexManager } from '../src/services/indexing/workspaceIndexManager';
import { AIContextItem } from '../src/types';

async function runMilestone8Tests() {
  console.log('=== FLOAT AI Milestone 8: Advanced AI Coding Intelligence & Context Retrieval ===\n');
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

  // 1. Task Intent Classification
  console.log('--- Test 1: Task Intent Classification ---');
  try {
    assert(classifyTaskIntent('Fix this Firebase authentication error in login.ts') === 'bugfix', 'Bugfix intent correctly classified');
    assert(classifyTaskIntent('Rename authenticateUser across all files') === 'refactor', 'Refactor intent correctly classified');
    assert(classifyTaskIntent('Make the sidebar layout responsive with Tailwind flexbox') === 'ui', 'UI intent correctly classified');
    assert(classifyTaskIntent('Why is my current branch failing on git diff?') === 'git', 'Git intent correctly classified');
    assert(classifyTaskIntent('Where is the token expiration handled?') === 'question', 'Question intent correctly classified');
    assert(classifyTaskIntent('Hello assistant') === 'general', 'General conversation classified');
  } catch (err: any) {
    assert(false, `Task intent classification threw unexpected error: ${err.message}`);
  }

  // 2. Explicit @context prioritization & handling
  console.log('\n--- Test 2: Explicit @context Prioritization & Path Traversal Guards ---');
  try {
    const explicitItems: AIContextItem[] = [
      {
        id: 'ctx-1',
        type: 'file',
        name: 'src/auth/login.ts',
        path: 'src/auth/login.ts',
        content: 'export function login() { return true; }'
      },
      {
        id: 'ctx-2',
        type: 'terminal',
        name: 'Terminal Logs',
        content: 'TypeError: undefined is not a function'
      },
      {
        id: 'ctx-traversal',
        type: 'file',
        name: '../../etc/passwd',
        path: '../../etc/passwd',
        content: 'root:x:0:0:'
      },
      {
        id: 'ctx-sensitive',
        type: 'file',
        name: '.env.local',
        path: '.env.local',
        content: 'STRIPE_SECRET_KEY=sk_test_123'
      }
    ];

    const assembled = ContextBuilder.build('How does login work?', explicitItems, {
      projectName: 'TestProj',
      maxTotalChars: 15000
    });

    assert(assembled.includedCount === 2, 'Only safe items included (2 safe, 2 malicious/sensitive excluded)');
    assert(assembled.omittedCount === 2, 'Traversal and sensitive items counted as omitted');
    assert(assembled.formattedPrompt.includes('src/auth/login.ts'), 'Explicit file included in prompt');
    assert(assembled.formattedPrompt.includes('TypeError: undefined is not a function'), 'Terminal log included in prompt');
    assert(!assembled.formattedPrompt.includes('STRIPE_SECRET_KEY'), 'Sensitive .env content strictly excluded');
    assert(!assembled.formattedPrompt.includes('etc/passwd'), 'Path traversal strictly rejected');
    assert(assembled.excludedItems.some(ex => ex.reason === 'sensitive_file'), 'Recorded sensitive_file exclusion reason');
    assert(assembled.excludedItems.some(ex => ex.reason === 'path_traversal'), 'Recorded path_traversal exclusion reason');
  } catch (err: any) {
    assert(false, `Explicit context test threw unexpected error: ${err.message}`);
  }

  // 3. Active Editor Context & Surrounding Scope
  console.log('\n--- Test 3: Active Editor Context & Selection Priority ---');
  try {
    const activeEditor: ActiveEditorContext = {
      filePath: 'src/components/Header.tsx',
      language: 'typescript',
      selectedText: '<nav className="flex gap-4">Links</nav>',
      selectionStartLine: 14,
      selectionEndLine: 16,
      currentSymbol: 'HeaderNav'
    };

    const assembled = ContextBuilder.build('Make this navigation responsive', [], {
      activeEditor,
      projectName: 'TestProj'
    });

    assert(assembled.includedCount === 1, 'Active editor selection included');
    assert(assembled.formattedPrompt.includes('--- Selection: src/components/Header.tsx (lines 14-16) ---'), 'Selection formatted with line boundaries');
    assert(assembled.formattedPrompt.includes('<nav className="flex gap-4">Links</nav>'), 'Selection text present');
    assert(assembled.intent === 'ui', 'UI intent identified from prompt');
  } catch (err: any) {
    assert(false, `Active editor context test threw unexpected error: ${err.message}`);
  }

  // 4. Multi-File Reasoning & Import Dependency Proximity
  console.log('\n--- Test 4: Workspace Retrieval with Import Proximity & Reference Awareness ---');
  try {
    const projId = 'test-m8-multi-file';
    const mockFiles = [
      {
        path: 'src/auth/session.ts',
        name: 'session.ts',
        content: `export interface UserSession { id: string; role: string; }\nexport function validateSession(token: string): boolean { return token.length > 5; }`
      },
      {
        path: 'src/auth/authService.ts',
        name: 'authService.ts',
        content: `import { UserSession, validateSession } from './session';\nexport class AuthService {\n  authenticate(user: string, token: string) {\n    return validateSession(token);\n  }\n}`
      },
      {
        path: 'src/pages/LoginPage.tsx',
        name: 'LoginPage.tsx',
        content: `import { AuthService } from '../auth/authService';\nexport function LoginPage() {\n  const auth = new AuthService();\n  return <div>Login</div>;\n}`
      },
      {
        path: 'src/utils/unrelated.ts',
        name: 'unrelated.ts',
        content: `export function unrelatedMath(a: number, b: number) { return a * b; }`
      }
    ];

    const assembled = ContextBuilder.retrieveAndBuildBoundedContext(
      'Fix session validation bug in AuthService',
      projId,
      mockFiles,
      [],
      {
        projectId: projId,
        activeFilePath: 'src/auth/authService.ts'
      }
    );

    assert(assembled.includedCount >= 1, 'Relevant files retrieved');
    assert(assembled.formattedPrompt.includes('authService.ts'), 'Active target file authService.ts retrieved');
    assert(!assembled.formattedPrompt.includes('unrelatedMath'), 'Unrelated math file excluded from context');
    assert(assembled.intent === 'bugfix', 'Bugfix intent identified');
  } catch (err: any) {
    assert(false, `Multi-file retrieval test threw unexpected error: ${err.message}`);
  }

  // 5. Context Deduplication & Higher-Priority Source Preservation
  console.log('\n--- Test 5: Context Deduplication ---');
  try {
    const projId = 'test-m8-dedup';
    const mockFiles = [
      {
        path: 'src/App.tsx',
        name: 'App.tsx',
        content: `export function App() { return <h1>Float Studio</h1>; }`
      }
    ];

    // Explicit item for src/App.tsx
    const explicitItems: AIContextItem[] = [
      {
        id: 'explicit-app',
        type: 'file',
        name: 'src/App.tsx',
        path: 'src/App.tsx',
        content: `export function App() { return <h1>Float Studio Explicit</h1>; }`
      }
    ];

    const assembled = ContextBuilder.retrieveAndBuildBoundedContext(
      'Explain App',
      projId,
      mockFiles,
      explicitItems,
      { projectId: projId }
    );

    // Should only contain 1 entry for src/App.tsx, preserving the explicit version
    const occurrences = (assembled.formattedPrompt.match(/--- File: src\/App\.tsx ---/g) || []).length +
                        (assembled.formattedPrompt.match(/--- Codebase Excerpt: src\/App\.tsx/g) || []).length;
    assert(occurrences === 1, 'Deduplication ensures file appears exactly once');
    assert(assembled.formattedPrompt.includes('Float Studio Explicit'), 'Explicit version preserved over automatic retrieval');
    assert(assembled.excludedItems.some(e => e.reason === 'duplicate'), 'Duplicate item recorded in exclusions');
  } catch (err: any) {
    assert(false, `Deduplication test threw unexpected error: ${err.message}`);
  }

  // 6. Context Budgeting & Graceful Truncation
  console.log('\n--- Test 6: Strict Context Budgeting & Model-Specific Limits ---');
  try {
    const largeContentA = 'A'.repeat(5000);
    const largeContentB = 'B'.repeat(5000);
    const largeContentC = 'C'.repeat(5000);

    const explicitItems: AIContextItem[] = [
      { id: '1', type: 'selection', name: 'src/selection.ts', path: 'src/selection.ts', content: largeContentA },
      { id: '2', type: 'file', name: 'src/file2.ts', path: 'src/file2.ts', content: largeContentB },
      { id: '3', type: 'file', name: 'src/file3.ts', path: 'src/file3.ts', content: largeContentC }
    ];

    // Budget of only 6000 chars total
    const assembled = ContextBuilder.build('Test budgeting', explicitItems, {
      maxTotalChars: 6000,
      maxPerItemChars: 4000
    });

    assert(assembled.totalContextChars <= 6000, `Total context (${assembled.totalContextChars}c) respects 6000 limit`);
    assert(assembled.includedItems.some(i => i.name === 'src/selection.ts'), 'High-priority selection retained');
    assert(assembled.omittedCount > 0, 'Lower priority items omitted when budget exceeded');
    assert(assembled.excludedItems.some(e => e.reason === 'budget_exceeded'), 'Exclusion reason logged as budget_exceeded');
  } catch (err: any) {
    assert(false, `Budgeting test threw unexpected error: ${err.message}`);
  }

  // 7. Git-Aware Context & Diff Injection
  console.log('\n--- Test 7: Git-Aware Context Integration ---');
  try {
    const gitContext: GitContextInfo = {
      gitRepository: 'owner/float-studio',
      gitBranch: 'feat/test-branch',
      defaultBranch: 'main',
      gitDiffPaths: ['src/auth/session.ts', 'src/server/app.ts'],
      diffExcerpt: 'diff --git a/src/auth/session.ts b/src/auth/session.ts\n+ export const NEW_FEATURE = true;'
    };

    const assembled = ContextBuilder.build('Review my current branch changes', [], {
      gitContext,
      projectName: 'Float Studio'
    });

    assert(assembled.formattedPrompt.includes('[Project Context: Float Studio (Linked: owner/float-studio@feat/test-branch) [Intent: GIT]]'), 'Git repository and branch in project header');
    assert(assembled.formattedPrompt.includes('diff --git a/src/auth/session.ts'), 'Diff excerpt included in prompt');
    assert(assembled.intent === 'git', 'Intent classified as GIT');
  } catch (err: any) {
    assert(false, `Git context test threw unexpected error: ${err.message}`);
  }

  // 8. Bounded Multi-Turn Conversation History
  console.log('\n--- Test 8: Bounded Conversation History ---');
  try {
    const conversationHistory: ConversationTurnSummary[] = [
      { role: 'user', content: 'Turn 1: How do I initialize Firebase?' },
      { role: 'model', content: 'Turn 1 response: Use initializeApp with config.' },
      { role: 'user', content: 'Turn 2: Now add authentication.' },
      { role: 'model', content: 'Turn 2 response: Import getAuth.' },
      { role: 'user', content: 'Turn 3: Add Firestore database.' },
      { role: 'model', content: 'Turn 3 response: Import getFirestore.' }
    ];

    const assembled = ContextBuilder.build('Now add security rules', [], {
      conversationHistory,
      projectName: 'Float Studio'
    });

    assert(assembled.formattedPrompt.includes('Turn 3: Add Firestore database'), 'Recent turn included in prompt');
    assert(assembled.includedItems.some(i => i.source === 'conversation'), 'Conversation recorded as included source');
  } catch (err: any) {
    assert(false, `Conversation history test threw unexpected error: ${err.message}`);
  }

  // Summary
  console.log('\n==================================================');
  console.log(`Milestone 8 Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runMilestone8Tests().catch(err => {
  console.error('Milestone 8 test runner crashed:', err);
  process.exit(1);
});
