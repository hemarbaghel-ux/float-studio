/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { WorkspaceIndex } from '../src/services/indexing/workspaceIndex';

describe('Workspace Index & Multi-Signal Semantic Retrieval (@Codebase)', () => {
  it('indexes documents, extracts symbols, and finds relevant files by query', () => {
    const index = new WorkspaceIndex('test-project');

    index.updateFile('src/auth.ts', `
      export interface User { id: string; email: string; }
      export class AuthService {
        public login(email: string, password: string): User {
          return { id: '1', email };
        }
      }
    `);

    index.updateFile('src/router.ts', `
      import { AuthService } from './auth';
      const auth = new AuthService();
      export function handleLogin() {
        return auth.login('test@example.com', 'pass');
      }
    `);

    // Search for AuthService
    const results = index.search('AuthService login user');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].filePath).toMatch(/src\/(auth|router)\.ts/);

    const stats = index.getStats();
    expect(stats.totalFiles).toBe(2);
    expect(stats.totalSymbols).toBeGreaterThan(0);
  });

  it('bounds retrieved context to requested token limit', () => {
    const index = new WorkspaceIndex('budget-project');

    index.updateFile('big.ts', 'const x = 1;\n'.repeat(500));
    const bounded = index.retrieveBoundedContext('big variable', { maxTotalChars: 1500 });

    expect(bounded).toBeDefined();
    expect(bounded.totalChars).toBeLessThanOrEqual(1600);
  });
});
