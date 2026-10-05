import { searchCodebase } from '../src/services/codebaseSearch';
import { FileNode } from '../src/types';

const files: FileNode[] = [
  {
    id: 'src-api', name: 'src', type: 'folder', children: [
      { id: 'auth', name: 'authService.ts', type: 'file', content: 'export function authenticateUser(token: string) {\n  return validateToken(token);\n}\n' },
      { id: 'format', name: 'format.ts', type: 'file', content: 'export function formatDate(date: Date) {\n  return date.toISOString();\n}\n' }
    ]
  }
];

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Codebase search test failed: ${message}`);
  console.log(`[PASS] ${message}`);
}

const identifierMatches = searchCodebase(files, 'authenticateUser');
assert(identifierMatches.some(match => match.filePath === 'src/authService.ts' && match.line === 1), 'finds exact camelCase identifiers with line numbers');

const terms = searchCodebase(files, 'validate token');
assert(terms[0]?.filePath === 'src/authService.ts' && terms[0].matchType === 'content', 'ranks files by multiple code search terms');

const pathMatches = searchCodebase(files, 'authService.ts');
assert(pathMatches[0]?.matchType === 'path' && pathMatches[0].filePath.endsWith('authService.ts'), 'finds exact file paths');

const contextMatches = searchCodebase(files, 'validateToken', { contextLines: 1 });
assert(contextMatches[0]?.contentExcerpt.includes('1: export function authenticateUser'), 'returns surrounding source context');

assert(searchCodebase(files, 'nonexistentIdentifier').length === 0, 'returns no false match for absent terms');
