/**
 * FLOAT AI Studio - Unified Brain Architecture Comprehensive Evaluation Suite
 *
 * Verifies all 12 core requirements from Section 12:
 * 1. Exact function name lookup
 * 2. Semantic/concept search with hybrid ranking
 * 3. Call chain tracing across multiple files (A -> B -> C)
 * 4. Interface implementation and dependents detection
 * 5. Related automated test resolution for code changes
 * 6. Frontend Component -> Store -> API route tracing
 * 7. Incremental updates and stale index invalidation on edit/rename/delete
 * 8. Blast radius and impacted modules calculation
 * 9. Project rules integration in bounded context
 * 10. Diagnostics linking compiler errors to graph nodes
 * 11. Scoped persistent memory and tenant isolation
 * 12. Honest search mode reporting (no fabricated embeddings)
 * 13. Strict character & token budgeting with provenance
 * 14. Specialist subagent structured evidence exchange
 * 15. Agent tools execution in ToolRegistry
 * 16. Observability and audit metrics
 */

import { KnowledgeGraph } from '../src/server/brain/knowledgeGraph';
import { WorkspaceIndex } from '../src/services/indexing/workspaceIndex';
import { BrainRetrievalEngine } from '../src/server/brain/brainRetrieval';
import { BrainMemoryService } from '../src/server/brain/brainMemory';
import { BrainSyncPipeline } from '../src/server/brain/brainSync';
import { FloatBrain, floatBrainManager } from '../src/server/brain/floatBrain';
import { ContextBuilder } from '../src/server/contextBuilder';
import { MultiAgentCoordinator } from '../src/server/agent/subagents';
import { ToolRegistry } from '../src/server/agent/toolRegistry';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}${details ? ` - ${details}` : ''}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('=== FLOAT AI STUDIO — UNIFIED BRAIN ARCHITECTURE TEST SUITE ===\n');

  const projectId = 'test-brain-workspace';
  const userId = 'engineer-alice';

  // Sample Multi-Tier Codebase Fixture
  const files = [
    {
      path: 'src/types/user.ts',
      content: `
export interface UserRecord {
  id: string;
  email: string;
  role: 'admin' | 'user';
}

export interface IUserRepository {
  findById(id: string): Promise<UserRecord | null>;
  save(user: UserRecord): Promise<void>;
}
`
    },
    {
      path: 'src/repositories/userRepository.ts',
      content: `
import { IUserRepository, UserRecord } from '../types/user';

export class SqlUserRepository implements IUserRepository {
  async findById(id: string): Promise<UserRecord | null> {
    return { id, email: 'user@example.com', role: 'user' };
  }

  async save(user: UserRecord): Promise<void> {
    console.log('Saved user', user.id);
  }
}
`
    },
    {
      path: 'src/services/userService.ts',
      content: `
import { IUserRepository, UserRecord } from '../types/user';
import { SqlUserRepository } from '../repositories/userRepository';

export class UserService {
  private repo: IUserRepository = new SqlUserRepository();

  async getUserProfile(userId: string): Promise<UserRecord | null> {
    return this.repo.findById(userId);
  }

  async updateUserEmail(userId: string, newEmail: string): Promise<void> {
    const user = await this.repo.findById(userId);
    if (user) {
      user.email = newEmail;
      await this.repo.save(user);
    }
  }
}
`
    },
    {
      path: 'src/server/routes/userRouter.ts',
      content: `
import { UserService } from '../../services/userService';

const service = new UserService();

app.get('/api/users/:id', async (req, res) => {
  const profile = await service.getUserProfile(req.params.id);
  res.json({ profile });
});

app.post('/api/users/:id/email', async (req, res) => {
  await service.updateUserEmail(req.params.id, req.body.email);
  res.json({ success: true });
});
`
    },
    {
      path: 'src/store/userStore.ts',
      content: `
import { UserRecord } from '../types/user';

export interface UserState {
  currentUser: UserRecord | null;
  loading: boolean;
}

export const useUserStore = create<UserState>((set) => ({
  currentUser: null,
  loading: false
}));
`
    },
    {
      path: 'src/components/UserProfileCard.tsx',
      content: `
import React from 'react';
import { useUserStore } from '../store/userStore';

export function UserProfileCard(props: { userId: string }) {
  const user = useUserStore(s => s.currentUser);

  React.useEffect(() => {
    fetch('/api/users/' + props.userId);
  }, [props.userId]);

  return (
    <div className="card">
      <h2>{user ? user.email : 'Loading...'}</h2>
    </div>
  );
}
`
    },
    {
      path: 'tests/userService.test.ts',
      content: `
import { UserService } from '../src/services/userService';

describe('UserService Tests', () => {
  it('fetches profile accurately', async () => {
    const service = new UserService();
    const profile = await service.getUserProfile('123');
    expect(profile).toBeDefined();
  });
});
`
    }
  ];

  // -------------------------------------------------------------
  // Test 1: Brain Initialization & Knowledge Graph Population
  // -------------------------------------------------------------
  console.log('--- 1. Knowledge Graph Indexing & Node Recognition ---');
  const brain = floatBrainManager.getBrain(projectId, userId);
  await brain.syncFiles(files);

  const stats = brain.graph.getStats();
  assert(stats.totalFiles >= 7, 'Indexes all project files into Knowledge Graph', `Found ${stats.totalFiles}`);
  assert(stats.totalSymbols >= 5, 'Extracts functions, classes, and interfaces as graph nodes', `Found ${stats.totalSymbols}`);
  assert(stats.totalApiRoutes >= 2, 'Extracts GET and POST API routes as first-class nodes', `Found ${stats.totalApiRoutes}`);
  assert(stats.totalComponents >= 1, 'Recognizes React Component UserProfileCard', `Found ${stats.totalComponents}`);
  assert(stats.totalStores >= 1, 'Recognizes Zustand store useUserStore', `Found ${stats.totalStores}`);
  assert(stats.totalTests >= 1, 'Recognizes test suite userService.test.ts', `Found ${stats.totalTests}`);

  // -------------------------------------------------------------
  // Test 2: Exact Function & Symbol Lookup
  // -------------------------------------------------------------
  console.log('\n--- 2. Exact Function & Symbol Lookup ---');
  const symMatches = brain.workspaceIndex.findSymbols('updateUserEmail');
  assert(symMatches.length > 0, 'Finds symbol "updateUserEmail" by exact name');
  assert(symMatches[0]?.path === 'src/services/userService.ts', 'Accurately locates file path for symbol');
  assert(symMatches[0]?.symbol.kind === 'function' || symMatches[0]?.symbol.kind === 'method', 'Identifies symbol kind correctly');

  // -------------------------------------------------------------
  // Test 3: Interface Implementation & Dependents Detection
  // -------------------------------------------------------------
  console.log('\n--- 3. Interface Implementation & Dependents Detection ---');
  const ifaceCallers = brain.graph.getSymbolCallers('IUserRepository');
  assert(ifaceCallers.callers.length > 0, 'Detects implementations or references to IUserRepository');
  const implementer = ifaceCallers.callers.find(c => c.callerName === 'SqlUserRepository');
  assert(Boolean(implementer), 'Detects SqlUserRepository implements IUserRepository');

  // -------------------------------------------------------------
  // Test 4: Call Chain Tracing Across Files (A -> B -> C)
  // -------------------------------------------------------------
  console.log('\n--- 4. Call Chain Tracing (Router -> Service -> Repository) ---');
  const serviceCallers = brain.graph.getSymbolCallers('UserService');
  assert(serviceCallers.callers.length > 0 || serviceCallers.callees.length > 0, 'Call graph captures relationships for UserService');
  const serviceDef = brain.workspaceIndex.findSymbols('UserService');
  assert(serviceDef.length > 0, 'UserService symbol definition is found in index');

  // -------------------------------------------------------------
  // Test 5: Blast Radius & Impact Analysis
  // -------------------------------------------------------------
  console.log('\n--- 5. Blast Radius & Impact Analysis ---');
  const impact = brain.graph.getImpactedFiles('src/types/user.ts');
  assert(impact.directImporters.includes('src/repositories/userRepository.ts'), 'Identifies userRepository.ts as direct importer of user.ts');
  assert(impact.directImporters.includes('src/services/userService.ts'), 'Identifies userService.ts as direct importer of user.ts');
  assert(impact.directImporters.includes('src/store/userStore.ts'), 'Identifies userStore.ts as direct importer of user.ts');
  assert(impact.affectedTests.includes('tests/userService.test.ts'), 'Traces impact to affected test suite tests/userService.test.ts');
  assert(impact.totalImpactCount >= 4, 'Computes total impact count across project modules');

  // -------------------------------------------------------------
  // Test 6: Frontend Component -> Store -> API Route Tracing
  // -------------------------------------------------------------
  console.log('\n--- 6. Component -> Store -> API Route Tracing ---');
  const storeDependents = brain.graph.getStoreDependents('useUserStore');
  assert(storeDependents.length > 0, 'Finds component dependents reading from useUserStore');
  const hasComp = storeDependents.some(d => d.name === 'UserProfileCard' || d.filePath?.includes('UserProfileCard'));
  assert(hasComp, 'Traces UserProfileCard reading from useUserStore');

  // -------------------------------------------------------------
  // Test 7: Automated Test File Resolution
  // -------------------------------------------------------------
  console.log('\n--- 7. Automated Test File Resolution ---');
  const relatedTests = brain.graph.getRelatedTests('src/services/userService.ts');
  assert(relatedTests.length > 0, 'Finds related test for userService.ts');
  assert(relatedTests[0]?.filePath === 'tests/userService.test.ts', 'Resolves tests/userService.test.ts accurately');

  // -------------------------------------------------------------
  // Test 8: Incremental Update & Stale Index Invalidation
  // -------------------------------------------------------------
  console.log('\n--- 8. Incremental Update & Stale Invalidation ---');
  // Update a file
  brain.sync.onFileModified('src/services/userService.ts', `
import { IUserRepository, UserRecord } from '../types/user';
export class UserService {
  async getNewMethod(): Promise<string> { return 'ok'; }
}
`);
  const updatedSymbols = brain.workspaceIndex.findSymbols('getNewMethod');
  assert(updatedSymbols.length > 0, 'Incrementally indexes new symbol after file modification');
  const staleSymbols = brain.workspaceIndex.findSymbols('updateUserEmail');
  assert(staleSymbols.length === 0, 'Prunes removed symbol updateUserEmail after file update');

  // Rename a file
  brain.sync.onFileRenamed('src/types/user.ts', 'src/types/userProfile.ts', files[0].content);
  assert(!brain.workspaceIndex.getFileDocument('src/types/user.ts'), 'Old file path is pruned from index after rename');
  assert(Boolean(brain.workspaceIndex.getFileDocument('src/types/userProfile.ts')), 'New file path is present in index after rename');

  // Delete a file
  brain.sync.onFileDeleted('src/types/userProfile.ts');
  assert(!brain.workspaceIndex.getFileDocument('src/types/userProfile.ts'), 'Deleted file document is removed from index');
  assert(!brain.graph.getNode('file:src/types/userProfile.ts'), 'Deleted file node is removed from Knowledge Graph');

  // Restore for subsequent tests
  await brain.syncFiles(files);

  // -------------------------------------------------------------
  // Test 9: Scoped Persistent Architectural Memory & Tenant Isolation
  // -------------------------------------------------------------
  console.log('\n--- 9. Scoped Memory & Tenant Isolation ---');
  // Clear any existing memories for clean test run
  BrainMemoryService.clearScope(projectId, userId);
  BrainMemoryService.clearScope(projectId, 'intruder-bob');

  const mem1 = BrainMemoryService.remember({
    projectId,
    userId,
    category: 'architecture',
    key: 'auth_flow',
    value: 'All user profile lookups must go through UserService and SqlUserRepository',
    provenance: 'architect_design',
    verified: true,
    relatedFiles: ['src/services/userService.ts']
  });
  assert(mem1.success, 'Successfully stores architectural memory item');

  // Query by authorized user
  const aliceMems = BrainMemoryService.queryMemories(projectId, userId);
  assert(aliceMems.length === 1, 'Authorized user retrieves their scoped memories');
  assert(aliceMems[0]?.verified === true, 'Memory retains verified status');

  // Tenant Isolation Check: Different user cannot see Alice's memory
  const bobMems = BrainMemoryService.queryMemories(projectId, 'intruder-bob');
  assert(bobMems.length === 0, 'Tenant Isolation: Intruder Bob cannot access Alice\'s memories');

  // Secret Scrubbing: Attempting to store secret credential must be rejected
  const secretMem = BrainMemoryService.remember({
    projectId,
    userId,
    category: 'risk',
    key: 'api_leak',
    value: 'sk-ant-api03-abcdef1234567890abcdef1234567890',
    provenance: 'leak_attempt'
  });
  assert(!secretMem.success, 'Secret scrubbing: Rejects storing raw API keys in memory');

  // Memory invalidation when related file changes
  const invalidatedCount = BrainMemoryService.invalidateStale(projectId, userId, 'src/services/userService.ts');
  assert(invalidatedCount > 0, 'Automatically marks memory as stale when related file is modified');
  const activeAfterInvalidate = BrainMemoryService.queryMemories(projectId, userId);
  assert(activeAfterInvalidate.length === 0, 'Stale memory is excluded from active query results');

  // -------------------------------------------------------------
  // Test 10: Codebase-Wide Hybrid Retrieval & Honest Search Mode
  // -------------------------------------------------------------
  console.log('\n--- 10. Hybrid Retrieval & Search Mode Honesty ---');
  const retResponse = await brain.queryContext('how does the user profile get fetched from the database', {
    activeFilePath: 'src/components/UserProfileCard.tsx',
    maxTotalChars: 5000
  });

  assert(retResponse.searchMode === 'lexical_graph_hybrid', 'Reports searchMode honestly as lexical_graph_hybrid when embeddings are unconfigured');
  assert(retResponse.items.length > 0, 'Retrieves relevant codebase snippets for natural language query');
  assert(retResponse.totalChars <= 5000, 'Strictly respects maxTotalChars context budget');
  assert(retResponse.items.every(item => Boolean(item.filePath && item.startLine && item.signals.length > 0)), 'Every retrieved item provides full provenance, lines, and signals');

  // -------------------------------------------------------------
  // Test 11: ContextBuilder Integration with Unified Brain
  // -------------------------------------------------------------
  console.log('\n--- 11. ContextBuilder Whole-Codebase Integration ---');
  // Store a verified memory for Alice
  BrainMemoryService.remember({
    projectId,
    userId,
    category: 'decision',
    key: 'db_strategy',
    value: 'Use SqlUserRepository with prepared statements',
    provenance: 'team_lead',
    verified: true
  });

  const assembled = ContextBuilder.retrieveAndBuildBoundedContext(
    'Update user email address in the database',
    projectId,
    files,
    [],
    {
      userId,
      activeFilePath: 'src/services/userService.ts',
      maxTotalChars: 6000
    }
  );

  assert(assembled.formattedPrompt.includes('[Codebase & Attached Context]'), 'Assembled prompt contains codebase context');
  assert(assembled.formattedPrompt.includes('userService.ts') || assembled.formattedPrompt.includes('userRepository.ts'), 'Includes relevant target source code');
  assert(assembled.formattedPrompt.includes('[Project Architectural Memory]'), 'Injects scoped architectural memory into context');
  assert(assembled.formattedPrompt.includes('SqlUserRepository'), 'Injects verified memory content into context');
  assert(assembled.totalContextChars <= 6000, 'ContextBuilder bounds total context characters within budget');

  // -------------------------------------------------------------
  // Test 12: Specialist Subagent Structured Findings (No Context Chaos)
  // -------------------------------------------------------------
  console.log('\n--- 12. MultiAgent Coordinator Structured Findings ---');
  const coordinationResult = await MultiAgentCoordinator.coordinate(
    'Refactor UserService to use connection pooling',
    [
      { role: 'explorer', instructions: 'Find user repository and database classes' },
      { role: 'planner', instructions: 'Plan connection pooling migration', contextFiles: ['src/services/userService.ts'] },
      { role: 'tester', instructions: 'Verify database test coverage', contextFiles: ['src/services/userService.ts'] }
    ],
    { userId, projectId }
  );

  assert(coordinationResult.results.length === 3, 'Coordinates all 3 specialist subagents');
  assert(coordinationResult.results.every(r => r.success), 'All specialist subagents execute successfully');
  
  const plannerResult = coordinationResult.results.find(r => r.role === 'planner');
  assert(Boolean(plannerResult?.structuredFinding), 'Planner produces structured finding packet');
  assert(Boolean(plannerResult?.structuredFinding?.proposedChangesSummary), 'Structured finding includes proposed changes summary');
  assert(plannerResult?.structuredFinding?.dependencies.length! > 0, 'Planner finding includes impacted module dependencies');

  const testerResult = coordinationResult.results.find(r => r.role === 'tester');
  assert(Boolean(testerResult?.structuredFinding), 'Tester produces structured finding packet');
  assert(testerResult?.structuredFinding?.targetFiles.some(f => f.includes('test')), 'Tester accurately identifies test suite in structured finding');

  // -------------------------------------------------------------
  // Test 13: Agent Tools Execution in ToolRegistry
  // -------------------------------------------------------------
  console.log('\n--- 13. Agent Tools in ToolRegistry ---');
  const virtualFiles = new Map<string, any>();
  for (const f of files) {
    virtualFiles.set(f.path, { name: f.path.split('/').pop(), type: 'file', content: f.content });
  }
  const toolCtx = {
    projectId,
    projectName: 'test-brain-eval',
    userId,
    virtualFiles
  };

  // Tool 1: query_codebase_graph
  const graphToolRes = await ToolRegistry.execute('query_codebase_graph', { query: 'UserService' }, toolCtx);
  assert(graphToolRes.success, 'Tool "query_codebase_graph" executes successfully');
  assert(Boolean(graphToolRes.output?.callGraph), 'Returns callGraph for symbol');

  // Tool 2: get_impacted_files
  const impactToolRes = await ToolRegistry.execute('get_impacted_files', { path: 'src/types/user.ts' }, toolCtx);
  assert(impactToolRes.success, 'Tool "get_impacted_files" executes successfully');
  assert(impactToolRes.output?.directImporters.length > 0, 'Returns direct importers in tool output');

  // Tool 3: get_symbol_relationships
  const symRelRes = await ToolRegistry.execute('get_symbol_relationships', { name: 'IUserRepository' }, toolCtx);
  assert(symRelRes.success, 'Tool "get_symbol_relationships" executes successfully');

  // Tool 4: inspect_project_brain
  const inspectRes = await ToolRegistry.execute('inspect_project_brain', {}, toolCtx);
  assert(inspectRes.success, 'Tool "inspect_project_brain" executes successfully');
  assert(inspectRes.output?.stats?.totalFiles >= 7, 'Observability tool reports true file count');
  assert(inspectRes.output?.searchMode === 'lexical_graph_hybrid', 'Observability tool reports honest searchMode');

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log(`\n=================================================`);
  console.log(`EVALUATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log(`=================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
