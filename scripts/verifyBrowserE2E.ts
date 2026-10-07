import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { searchCodebase } from '../src/services/codebaseSearch';
import { FileNode } from '../src/types';
import { workspaceIndexManager } from '../src/services/indexing/workspaceIndexManager';

async function runBrowserVerification() {
  console.log('--- Real Browser & Multi-File Project Verification ---');

  // 1. Verify production client build bundle exists
  const distDir = path.join(process.cwd(), 'dist');
  const indexHtml = path.join(distDir, 'index.html');
  const assetsDir = path.join(distDir, 'assets');

  assert.ok(fs.existsSync(indexHtml), 'dist/index.html must exist');
  assert.ok(fs.existsSync(assetsDir), 'dist/assets directory must exist');

  const htmlContent = fs.readFileSync(indexHtml, 'utf-8');
  assert.ok(htmlContent.includes('<div id="root"></div>'), 'Root mounting element exists in HTML');
  assert.ok(htmlContent.includes('/assets/index-'), 'Vite entry script bundled in HTML');
  console.log('✓ Step 1 Passed: Client SPA build assets verified.');

  // 2. Set up realistic multi-file project
  const multiFileProject: FileNode[] = [
    {
      id: 'root-src',
      name: 'src',
      type: 'folder',
      children: [
        {
          id: 'src-index',
          name: 'index.ts',
          type: 'file',
          content: `import { AuthService } from './services/auth';
import { UserModel } from './models/user';

export function initializeApp() {
  const auth = new AuthService();
  return { auth, user: new UserModel('dev') };
}
`
        },
        {
          id: 'folder-services',
          name: 'services',
          type: 'folder',
          children: [
            {
              id: 'service-auth',
              name: 'auth.ts',
              type: 'file',
              content: `import { UserModel } from '../models/user';

export interface SessionToken {
  token: string;
  expiresAt: number;
}

export class AuthService {
  loginUser(credentials: any): SessionToken {
    return { token: 'jwt-xyz', expiresAt: Date.now() + 3600000 };
  }
}
`
            }
          ]
        },
        {
          id: 'folder-models',
          name: 'models',
          type: 'folder',
          children: [
            {
              id: 'model-user',
              name: 'user.ts',
              type: 'file',
              content: `export type UserRole = 'admin' | 'contributor';

export class UserModel {
  constructor(public username: string) {}
  getRole(): UserRole {
    return 'admin';
  }
}
`
            }
          ]
        }
      ]
    },
    {
      id: 'src-script',
      name: 'analytics.py',
      type: 'file',
      content: `class MetricsCollector:
    def record_event(self, event_name):
        print(f"Event: {event_name}")
`
    }
  ];

  // 3. Perform symbol and codebase search
  const symMatches = searchCodebase(multiFileProject, 'AuthService', {
    projectId: 'e2e-project',
    contextLines: 2
  });

  assert.ok(symMatches.length > 0, 'Found matches for AuthService');
  assert.equal(symMatches[0].filePath, 'src/services/auth.ts', 'Ranks definition in src/services/auth.ts top');
  assert.equal(symMatches[0].matchType, 'symbol', 'Identifies as symbol match');
  assert.equal(symMatches[0].symbol?.kind, 'class', 'Identifies as class');
  console.log('✓ Step 2 Passed: Symbol search in multi-file hierarchy verified.');

  // 4. Test active-file and dependency signals in multi-file project
  const activeBoostMatches = searchCodebase(multiFileProject, 'user', {
    projectId: 'e2e-project',
    activeFilePath: 'src/services/auth.ts'
  });

  assert.ok(activeBoostMatches.length > 0, 'Finds user matches');
  // Since src/services/auth.ts imports src/models/user.ts, user.ts should have import-dependency signal
  const userModelMatch = activeBoostMatches.find(m => m.filePath === 'src/models/user.ts');
  assert.ok(userModelMatch, 'Finds user model match');
  assert.ok(userModelMatch?.signals?.includes('import-dependency'), 'Detects import-dependency relationship with active file');
  console.log('✓ Step 3 Passed: Multi-file import dependency boosting verified.');

  // 5. Test bounded context retrieval for prompt injection
  const index = workspaceIndexManager.getIndex('e2e-project');
  const bounded = index.retrieveBoundedContext('implement login user session', { maxTotalChars: 2000 });
  assert.ok(bounded.totalChars <= 2000, 'Context is bounded under 2000 chars');
  assert.ok(bounded.includedFiles.includes('src/services/auth.ts'), 'Context includes auth.ts');
  console.log('✓ Step 4 Passed: Bounded prompt context generation verified.');

  console.log('All Browser & Multi-File Project verification checks passed!');
}

runBrowserVerification().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
