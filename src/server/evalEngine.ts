import { v4 as uuidv4 } from 'uuid';
import { 
  EvalTask, 
  EvalRun, 
  Benchmark, 
  Difficulty,
  HumanReview, 
  LeaderboardEntry, 
  ScoreBreakdown, 
  TestResult, 
  ValidationResult,
  ToolCallTrace,
  AgentTraceStep
} from '../types/evals';
import { ChangeSet, Change } from '../types';
import { ScoringEngine } from './scoringEngine';
import { sanitizeProposalPath } from './agent/proposalService';
import { ModelRouter } from './providers/router';
import { INITIAL_MODELS } from '../features/ai/registry';
import { ServerPrivacyGuard } from './privacyGuard';
import {
  deleteEvalTask,
  failInterruptedEvalRun,
  heartbeatEvalRun,
  getEvalBenchmark,
  getEvalRun,
  getEvalTask,
  listEvalBenchmarks,
  listEvalRuns,
  listEvalTasks,
  listRunningEvalRuns,
  listEvalReviews,
  saveEvalReview,
  saveEvalBenchmark,
  saveEvalTask,
  saveEvalRun,
} from './evalPersistence';

// Built-in standard evaluation tasks for coding, debugging, refactoring, and agentic workflows
const INITIAL_TASKS: EvalTask[] = [
  {
    id: 'task-debug-twosum',
    name: 'Debug: Two Sum Zero-Index Offset',
    description: 'Fix an off-by-one bug in a two-sum index lookup that fails on edge cases with duplicate values.',
    category: 'Debugging',
    difficulty: 'Easy',
    prompt: 'Fix the function `find_target_pair(numbers, target)` in `solution.py`. Currently, it returns 1-based indexes instead of 0-based indexes and raises a KeyError when identical complement numbers exist. Return the exact 0-based indices `(i, j)` where numbers[i] + numbers[j] == target.',
    expectedBehavior: 'Returns a tuple of 0-based indices for pairs summing to target; returns None if no pair exists.',
    validationMethod: 'Tests',
    files: [
      {
        path: 'solution.py',
        content: `def find_target_pair(numbers, target):\n    seen = {}\n    for idx, num in enumerate(numbers):\n        diff = target - num\n        if diff in seen:\n            return (seen[diff] + 1, idx + 1)\n        seen[num] = idx\n    return None\n`
      },
      {
        path: 'test_solution.py',
        content: `from solution import find_target_pair\n\ndef test_two_sum():\n    assert find_target_pair([2, 7, 11, 15], 9) == (0, 1)\n    assert find_target_pair([3, 2, 4], 6) == (1, 2)\n    assert find_target_pair([3, 3], 6) == (0, 1)\n    assert find_target_pair([1, 2, 3], 10) is None\n`
      }
    ],
    validationCommands: ['python -m py_compile solution.py'],
    testCommands: ['pytest test_solution.py'],
    expectedFiles: ['solution.py'],
    forbiddenFiles: ['node_modules', '.env'],
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 86400000 * 5
  },
  {
    id: 'task-code-retry-decorator',
    name: 'Implement: Async Exponential Backoff Retry',
    description: 'Create a reusable Python async decorator that retries failing coroutines with exponential backoff and jitter.',
    category: 'Coding',
    difficulty: 'Medium',
    prompt: 'In `retry.py`, implement an asynchronous decorator `@async_retry(max_attempts=3, base_delay=0.1, max_delay=1.0, exceptions=(Exception,))`. If all attempts fail, it should raise the original exception.',
    expectedBehavior: 'Decorator retries transient errors up to max_attempts with exponential delay, and re-raises on persistent failure.',
    validationMethod: 'Tests',
    files: [
      {
        path: 'retry.py',
        content: `# TODO: Implement async_retry decorator\nimport asyncio\nimport functools\n\ndef async_retry(max_attempts=3, base_delay=0.1, max_delay=1.0, exceptions=(Exception,)):\n    pass\n`
      },
      {
        path: 'test_retry.py',
        content: `import asyncio\nimport pytest\nfrom retry import async_retry\n\n@async_retry(max_attempts=3, base_delay=0.01)\nasync def flaky_call(tracker):\n    tracker['calls'] += 1\n    if tracker['calls'] < 3:\n        raise ConnectionError("Timeout")\n    return "success"\n`
      }
    ],
    validationCommands: ['python -m py_compile retry.py'],
    testCommands: ['pytest test_retry.py'],
    expectedFiles: ['retry.py'],
    forbiddenFiles: [],
    createdAt: Date.now() - 86400000 * 4,
    updatedAt: Date.now() - 86400000 * 4
  },
  {
    id: 'task-refactor-generics',
    name: 'Refactor: Safe Generic Container',
    description: 'Refactor Python untyped dictionary registry into a strictly typed generic container with validation.',
    category: 'Refactoring',
    difficulty: 'Medium',
    prompt: 'Refactor `container.py` using Python `typing.Generic`, `TypeVar`, and runtime validation. Ensure safe access with `get()`, `register()`, and `freeze()`.',
    expectedBehavior: 'Provides type-safe storage preventing invalid type registration and protecting frozen instances.',
    validationMethod: 'TypeScript',
    files: [
      {
        path: 'container.py',
        content: `class Registry:\n    def __init__(self):\n        self._items = {}\n    def add(self, k, v):\n        self._items[k] = v\n    def get(self, k):\n        return self._items[k]\n`
      }
    ],
    validationCommands: ['mypy container.py'],
    expectedFiles: ['container.py'],
    forbiddenFiles: [],
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 3
  },
  {
    id: 'task-security-sanitizer',
    name: 'Security: SQL Injection & Input Sanitizer',
    description: 'Detect and patch SQL injection vulnerabilities in a raw database query helper.',
    category: 'Security',
    difficulty: 'Hard',
    prompt: 'Fix the security vulnerability in `db_helper.py`. The function `find_user_records(db, user_query, status)` constructs raw SQL with f-strings. Refactor it to use parameterized queries with safe parameter substitution and validate that status belongs to an allowed enum.',
    expectedBehavior: 'Never interpolates raw strings into SQL queries. Passes parameters dictionary to execute method.',
    validationMethod: 'Tests',
    files: [
      {
        path: 'db_helper.py',
        content: `def find_user_records(cursor, username, status):\n    # VULNERABLE: Direct string interpolation\n    query = f"SELECT id, username, email FROM users WHERE username = '{username}' AND status = '{status}'"\n    return cursor.execute(query).fetchall()\n`
      }
    ],
    validationCommands: ['bandit -r db_helper.py'],
    testCommands: ['pytest test_db_helper.py'],
    expectedFiles: ['db_helper.py'],
    forbiddenFiles: [],
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2
  },
  {
    id: 'task-agentic-multifile',
    name: 'Agentic: Multi-file API & Store Refactor',
    description: 'Coordinate changes across an API handler, client store, and data models without regressions.',
    category: 'Agentic',
    difficulty: 'Hard',
    prompt: 'Coordinate an update across `src/models/user.ts`, `src/api/users.ts`, and `src/store/userStore.ts` to add a new `preferredTheme: "dark" | "light" | "system"` property with backward compatibility for legacy users who do not have this field.',
    expectedBehavior: 'All 3 files updated coherently with type safety and fallback defaults.',
    validationMethod: 'TypeScript',
    files: [
      {
        path: 'src/models/user.ts',
        content: `export interface UserProfile {\n  id: string;\n  name: string;\n  email: string;\n}\n`
      },
      {
        path: 'src/api/users.ts',
        content: `import { UserProfile } from '../models/user';\nexport function parseUser(raw: any): UserProfile {\n  return { id: raw.id, name: raw.name, email: raw.email };\n}\n`
      }
    ],
    expectedFiles: ['src/models/user.ts', 'src/api/users.ts'],
    forbiddenFiles: ['package.json'],
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000
  }
];

const INITIAL_BENCHMARKS: Benchmark[] = [
  {
    id: 'bench-python-core',
    name: 'FLOAT Python Core Coding Benchmark',
    description: 'Standard benchmark evaluating algorithmic correctness, edge case resilience, unit test adherence, and code quality in Python.',
    version: 'v1.0',
    taskCount: 3,
    taskIds: ['task-debug-twosum', 'task-code-retry-decorator', 'task-refactor-generics'],
    categories: ['Coding', 'Debugging', 'Refactoring', 'Testing'],
    difficulty: 'Medium',
    scoringConfig: {
      taskCompletion: 0.30,
      testSuccess: 0.30,
      buildSuccess: 0.15,
      typeSafety: 0.15,
      patchValidity: 0.10
    },
    createdAt: Date.now() - 86400000 * 10,
    updatedAt: Date.now() - 86400000 * 2
  },
  {
    id: 'bench-agentic-swe',
    name: 'Autonomous Agentic Software Engineering Benchmark',
    description: 'Evaluates agent orchestration, tool call precision, multi-file consistency, and clean patch generation across complex repository tasks.',
    version: 'v1.2',
    taskCount: 2,
    taskIds: ['task-security-sanitizer', 'task-agentic-multifile'],
    categories: ['Agentic', 'Multi-file Editing', 'Security', 'Repository Understanding'],
    difficulty: 'Hard',
    scoringConfig: {
      taskCompletion: 0.25,
      testSuccess: 0.25,
      agentEfficiency: 0.20,
      patchValidity: 0.15,
      codeQuality: 0.15
    },
    createdAt: Date.now() - 86400000 * 7,
    updatedAt: Date.now() - 86400000 * 1
  }
];

export class EvalEngine {
  private tasks: EvalTask[] = [...INITIAL_TASKS];
  private runs: EvalRun[] = [];
  private benchmarks: Benchmark[] = [...INITIAL_BENCHMARKS];
  private reviews: HumanReview[] = [];
  private modelRouter: ModelRouter;
  private runWrites = new Map<string, Promise<void>>();
  private runHeartbeats = new Map<string, ReturnType<typeof setInterval>>();

  constructor() {
    this.modelRouter = new ModelRouter();
  }

  // Task Management
  createTask(task: Omit<EvalTask, 'id' | 'createdAt' | 'updatedAt'>, ownerId?: string): EvalTask {
    if (!task || typeof task.name !== 'string' || !task.name.trim() || task.name.length > 150) {
      throw new Error('Evaluation task name is required and must be 150 characters or fewer.');
    }
    if (typeof task.prompt !== 'string' || !task.prompt.trim() || task.prompt.length > 10_000) {
      throw new Error('Evaluation prompt is required and must be 10,000 characters or fewer.');
    }
    if (typeof task.description !== 'string' || task.description.length > 2_000) {
      throw new Error('Evaluation description must be 2,000 characters or fewer.');
    }
    if (typeof task.category !== 'string' || !task.category.trim() || task.category.length > 50) {
      throw new Error('Evaluation category is required and must be 50 characters or fewer.');
    }
    const difficulty = String(task.difficulty).toLowerCase();
    const normalizedDifficulty = ({ easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' } as Record<string, Difficulty>)[difficulty];
    if (!normalizedDifficulty) throw new Error('Choose a supported evaluation difficulty.');
    if (task.files && (!Array.isArray(task.files) || task.files.length > 100)) {
      throw new Error('An evaluation task can include at most 100 files.');
    }
    const files = Array.isArray(task.files) ? task.files : [];
    let totalBytes = 0;
    const seenPaths = new Set<string>();
    for (const file of files) {
      if (!file || typeof file.path !== 'string' || file.path.length > 300 || typeof file.content !== 'string') {
        throw new Error('Evaluation files need a valid relative path and text content.');
      }
      const pathValidation = sanitizeProposalPath(file.path);
      if (pathValidation.error) throw new Error(`Evaluation file path is not allowed: ${pathValidation.error}`);
      const normalizedPath = pathValidation.safePath;
      if (seenPaths.has(normalizedPath)) throw new Error(`Evaluation file paths must be unique: ${file.path}`);
      seenPaths.add(normalizedPath);
      totalBytes += Buffer.byteLength(file.content, 'utf8');
      if (totalBytes > 650 * 1024) throw new Error('Evaluation task files must total 650 KB or less.');
    }
    const newTask: EvalTask = {
      ...task,
      difficulty: normalizedDifficulty,
      ownerId,
      id: uuidv4(),
      files,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.tasks.push(newTask);
    return newTask;
  }

  async createTaskDurable(task: Omit<EvalTask, 'id' | 'createdAt' | 'updatedAt'>, ownerId: string): Promise<EvalTask> {
    const newTask = this.createTask(task, ownerId);
    try {
      await saveEvalTask(newTask);
      return newTask;
    } catch (error) {
      this.tasks = this.tasks.filter((item) => item.id !== newTask.id);
      throw error;
    }
  }

  async deleteTaskDurable(id: string, ownerId: string): Promise<boolean> {
    const local = this.tasks.find((item) => item.id === id);
    if (local && (!local.ownerId || local.ownerId !== ownerId)) return false;
    const removed = await deleteEvalTask(id, ownerId);
    if (removed) this.tasks = this.tasks.filter((item) => item.id !== id);
    return removed;
  }

  getTasks(ownerId?: string): EvalTask[] {
    return this.tasks.filter(task => !task.ownerId || task.ownerId === ownerId);
  }

  async getTasksDurable(ownerId: string): Promise<EvalTask[]> {
    const tasks = await listEvalTasks(ownerId);
    for (const task of tasks) {
      const index = this.tasks.findIndex((item) => item.id === task.id);
      if (index >= 0) this.tasks[index] = task;
      else this.tasks.push(task);
    }
    return this.getTasks(ownerId);
  }

  async getTaskDurable(id: string, ownerId: string): Promise<EvalTask | null> {
    const local = this.getTask(id, ownerId);
    if (local) return local;
    const task = await getEvalTask(id, ownerId);
    if (task) this.tasks.push(task);
    return task;
  }

  getTask(id: string, ownerId?: string): EvalTask | undefined {
    const task = this.tasks.find(t => t.id === id);
    return task && (!task.ownerId || task.ownerId === ownerId) ? task : undefined;
  }

  deleteTask(id: string, ownerId?: string): boolean {
    const idx = this.tasks.findIndex(t => t.id === id && t.ownerId === ownerId);
    if (idx >= 0) {
      this.tasks.splice(idx, 1);
      return true;
    }
    return false;
  }

  // Benchmark Management
  getBenchmarks(): Benchmark[] {
    return this.benchmarks;
  }

  async getBenchmarksDurable(ownerId: string): Promise<Benchmark[]> {
    const benchmarks = await listEvalBenchmarks(ownerId);
    for (const benchmark of benchmarks) {
      const index = this.benchmarks.findIndex((item) => item.id === benchmark.id);
      if (index >= 0) this.benchmarks[index] = benchmark;
      else this.benchmarks.push(benchmark);
    }
    return this.benchmarks.filter((benchmark) => !benchmark.ownerId || benchmark.ownerId === ownerId);
  }

  async getBenchmarkDurable(id: string, ownerId: string): Promise<Benchmark | null> {
    const local = this.getBenchmark(id);
    if (local && (!local.ownerId || local.ownerId === ownerId)) return local;
    const benchmark = await getEvalBenchmark(id, ownerId);
    if (benchmark) this.benchmarks.push(benchmark);
    return benchmark;
  }

  getBenchmark(id: string): Benchmark | undefined {
    return this.benchmarks.find(b => b.id === id);
  }

  createBenchmark(bench: Omit<Benchmark, 'id' | 'createdAt' | 'updatedAt'>, ownerId?: string): Benchmark {
    const newBench: Benchmark = {
      ...bench,
      ownerId,
      id: uuidv4(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.benchmarks.push(newBench);
    return newBench;
  }

  async createBenchmarkDurable(bench: Omit<Benchmark, 'id' | 'createdAt' | 'updatedAt'>, ownerId: string): Promise<Benchmark> {
    if (!bench || typeof bench.name !== 'string' || !bench.name.trim() || bench.name.length > 150) {
      throw new Error('Benchmark name is required and must be 150 characters or fewer.');
    }
    if (!Array.isArray(bench.taskIds) || bench.taskIds.length > 100) {
      throw new Error('A benchmark must reference 100 tasks or fewer.');
    }
    const availableTaskIds = new Set((await this.getTasksDurable(ownerId)).map((task) => task.id));
    if (bench.taskIds.some((taskId) => typeof taskId !== 'string' || !availableTaskIds.has(taskId))) {
      throw new Error('Benchmark tasks must belong to your account or the built-in catalog.');
    }
    const newBenchmark = this.createBenchmark({ ...bench, taskCount: bench.taskIds.length }, ownerId);
    try {
      await saveEvalBenchmark(newBenchmark);
      return newBenchmark;
    } catch (error) {
      this.benchmarks = this.benchmarks.filter((item) => item.id !== newBenchmark.id);
      throw error;
    }
  }

  // Execution Pipeline (EvaluationRunner)
  async runEval(
    taskId: string, 
    modelId: string, 
    agentId: string, 
    providerId: string,
    benchmarkId?: string,
    parentRunId?: string,
    options?: { dataSharingAllowed?: boolean; dataSharingConsent?: boolean; userId?: string }
  ): Promise<EvalRun> {
    let task = this.tasks.find(t => t.id === taskId && (!t.ownerId || t.ownerId === options?.userId));
    if (!task && options?.userId) {
      task = (await getEvalTask(taskId, options.userId)) || undefined;
      if (task) this.tasks.push(task);
    }
    if (!task) {
      throw new Error(`Evaluation task ${taskId} not found.`);
    }
    if (benchmarkId) {
      const benchmark = this.benchmarks.find((item) => item.id === benchmarkId);
      if (benchmark?.ownerId && benchmark.ownerId !== options?.userId) {
        throw new Error(`Evaluation benchmark ${benchmarkId} not found.`);
      }
      if (!benchmark && options?.userId && !await getEvalBenchmark(benchmarkId, options.userId)) {
        throw new Error(`Evaluation benchmark ${benchmarkId} not found.`);
      }
    }

    // Runtime check for user's consent preference (defaults strictly to false)
    const dataSharingAllowed = options?.dataSharingAllowed !== undefined
      ? options.dataSharingAllowed === true
      : options?.dataSharingConsent === true;

    ServerPrivacyGuard.logAudit('EvalEngine', `runEval(${taskId}, ${modelId})`, dataSharingAllowed, {
      taskName: task.name,
      benchmarkId,
      dataSharingAllowed
    });

    const runId = uuidv4();
    const run: EvalRun = {
      id: runId,
      taskId: task.id,
      taskName: task.name,
      modelId,
      providerId,
      agentId,
      benchmarkId,
      status: 'running',
      startedAt: Date.now(),
      parentRunId,
      ownerId: options?.userId,
      dataSharingConsent: dataSharingAllowed,
      isPrivate: !dataSharingAllowed,
      toolTrace: [],
      agentTrace: [],
      activity: [
        { type: 'info', message: `Evaluation started for model ${modelId} with agent ${agentId}`, timestamp: Date.now() },
        ...(!dataSharingAllowed ? [{
          type: 'info' as const,
          message: 'Privacy Protection Active: Data sharing is OFF. Run traces, test outputs, and patches are excluded from external telemetry and training datasets.',
          timestamp: Date.now()
        }] : [])
      ]
    };

    this.runs.unshift(run);

    await this.persistRun(run);
    this.startRunHeartbeat(run.id);

    // Run execution pipeline asynchronously
    this.executePipeline(run, task).then(async () => {
      await this.persistRun(run);
      this.stopRunHeartbeat(run.id);
    }).catch(err => {
      console.error(`Evaluation run ${runId} execution error:`, err);
      run.status = 'failed';
      run.errorType = 'ExecutionError';
      run.errorMessage = err.message || 'Unknown error occurred during evaluation.';
      run.completedAt = Date.now();
      run.durationMs = run.completedAt - run.startedAt;
      run.duration = Math.round(run.durationMs / 1000);
      return this.persistRun(run).finally(() => this.stopRunHeartbeat(run.id));
    }).catch((error) => console.error(`[EvalEngine] Could not persist run ${runId}:`, error));

    return run;
  }

  private async executePipeline(run: EvalRun, task: EvalTask): Promise<void> {
    const startTime = Date.now();
    const model = INITIAL_MODELS.find(m => m.id === run.modelId);
    
    // Step 1: Clean repository snapshot isolation
    run.activity?.push({ type: 'info', message: 'Step 1/8: Creating clean repository snapshot isolation', timestamp: Date.now() });
    const snapshotFiles = task.files.map(f => ({ path: f.path, content: f.content }));
    let filesReadCount = snapshotFiles.length;
    let filesChangedCount = 0;

    // Step 2: Build model prompt & context
    run.activity?.push({ type: 'info', message: `Step 2/8: Constructing task context and prompts for ${run.modelId}`, timestamp: Date.now() });
    const promptMessage = `Task: ${task.name}\nDescription: ${task.description}\nCategory: ${task.category}\nDifficulty: ${task.difficulty}\n\nInstructions: ${task.prompt}\nExpected Behavior: ${task.expectedBehavior}\n\nCurrent Workspace Files:\n${snapshotFiles.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n')}\n\nPlease provide the corrected code or changes. Return clean code blocks with the file path specified.`;

    // Step 3: Model Execution via ModelRouter / Provider Adapter
    run.activity?.push({ type: 'info', message: `Step 3/8: Executing model ${run.modelId}...`, timestamp: Date.now() });
    let outputText = '';
    let isProviderConfigured = false;
    let inputTokens = Math.round(promptMessage.length / 3.8);
    let outputTokens = 0;
    const modelStartTime = Date.now();

    try {
      const adapter = this.modelRouter.getAdapterForModel(run.modelId);
      isProviderConfigured = adapter.isConfigured();

      if (!isProviderConfigured) {
        throw new Error(
          `Provider "${adapter.name}" is not configured on the server (API key missing). To execute first-party FLOAT evaluations for model "${run.modelId}", configure the server-side API key.`
        );
      }

      const response = await adapter.generateContent({
        model: run.modelId,
        messages: [{ role: 'user', content: promptMessage }],
        systemInstruction: `You are an expert autonomous software engineer participating in the FLOAT coding benchmark. Follow instructions precisely.`,
        dataSharingConsent: run.dataSharingConsent,
        dataSharingAllowed: run.dataSharingConsent
      });
      outputText = response.text || '';
      // This adapter returns a completed response; it does not expose first-token timing.
    } catch (e: any) {
      console.warn(`Evaluation execution aborted for ${run.modelId}:`, e.message);
      run.status = 'failed';
      run.errorType = isProviderConfigured ? 'ProviderError' : 'ProviderUnconfigured';
      run.errorMessage = e.message;
      run.completedAt = Date.now();
      run.durationMs = run.completedAt - startTime;
      run.duration = Math.max(1, Math.round(run.durationMs / 1000));
      run.activity?.push({ 
        type: 'error', 
        message: `Evaluation aborted: ${e.message}`, 
        timestamp: Date.now() 
      });
      return;
    }

    const modelEndTime = Date.now();
    run.generationLatency = modelEndTime - modelStartTime;
    outputTokens = Math.round(outputText.length / 3.8);
    run.inputTokens = inputTokens;
    run.outputTokens = outputTokens;
    run.cachedTokens = 0;
    run.totalTokens = inputTokens + outputTokens;
    run.outputText = outputText;

    // Calculate real cost based on model pricing registry
    if (model?.pricing) {
      const inRate = model.pricing.inputCost / 1_000_000;
      const outRate = model.pricing.outputCost / 1_000_000;
      run.estimatedCost = Number((inputTokens * inRate + outputTokens * outRate).toFixed(6));
      run.actualCost = run.estimatedCost;
    } else {
      run.estimatedCost = 0;
      run.actualCost = 0;
    }

    // This evaluation path currently generates a response but does not run agent tools.
    run.toolTrace = [];
    run.agentTrace = [];
    run.agentSteps = 0;
    run.toolCalls = 0;
    run.filesRead = filesReadCount;

    // Capture only changes explicitly returned as file code blocks.
    run.activity?.push({ type: 'info', message: 'Extracting proposed file changes from model output', timestamp: Date.now() });
    const { changeSet, updatedFiles } = this.extractChangeSet(task, snapshotFiles, outputText);
    run.changeSet = changeSet;
    filesChangedCount = changeSet.changes.length;
    run.filesChanged = filesChangedCount;
    run.patchCreated = filesChangedCount > 0;

    // Lightweight structural checks are not a substitute for executing the project.
    run.activity?.push({ type: 'info', message: 'Checking patch structure; project commands are not executed by this evaluation path', timestamp: Date.now() });
    const patchSyntaxValid = this.validateSyntax(changeSet);
    const forbiddenFilesTouched = (task.forbiddenFiles || []).some(forb => 
      changeSet.changes.some(c => c.path.includes(forb))
    );
    run.patchValid = patchSyntaxValid && !forbiddenFilesTouched;

    const notRun = (command: string | undefined): ValidationResult => ({
      command: command || 'Not configured',
      exitCode: null,
      durationMs: 0,
      stdout: '',
      stderr: '',
      errorSummary: 'Not executed by the model-generation evaluation path.',
      status: 'Not Run'
    });
    run.validationResults = {
      build: notRun(task.buildCommands?.[0]),
      typecheck: notRun(task.typecheckCommands?.[0]),
      lint: notRun(task.lintCommands?.[0]),
      tests: [],
      security: notRun(task.securityChecks?.[0])
    };
    run.testCount = 0;
    run.testsPassed = undefined;
    run.buildPassed = undefined;
    run.typecheckPassed = undefined;
    run.lintPassed = undefined;
    run.securityPassed = undefined;
    run.score = undefined;
    run.automatedScore = undefined;
    run.finalScore = undefined;
    run.scoreBreakdown = undefined;
    run.status = 'completed';

    run.completedAt = Date.now();
    run.durationMs = run.completedAt - startTime;
    run.duration = Math.round(run.durationMs / 1000);
    run.activity?.push({ 
      type: 'success',
      message: `Model generation completed in ${run.duration}s. Project checks were not run and no benchmark score was assigned.`,
      timestamp: Date.now() 
    });

    // Guard external telemetry / dataset pipeline dispatch based on user consent
    if (run.dataSharingConsent) {
      ServerPrivacyGuard.dispatchExternalTelemetry('evaluation_metrics_collector', true, {
        runId: run.id,
        taskId: run.taskId,
        modelId: run.modelId,
        score: null,
        durationMs: run.durationMs,
        testsPassed: null
      });
    } else {
      ServerPrivacyGuard.dispatchExternalTelemetry('evaluation_metrics_collector', false, null);
      ServerPrivacyGuard.logAudit('EvalEngine', `Evaluation run ${run.id} concluded in Privacy Mode. External telemetry, usage data, and dataset export blocked.`, false);
    }
  }

  private extractChangeSet(task: EvalTask, originalFiles: { path: string; content: string }[], outputText: string): { changeSet: ChangeSet; updatedFiles: { path: string; content: string }[] } {
    const changes: Change[] = [];
    const updatedFiles = originalFiles.map(f => ({ ...f }));
    
    // Extract code blocks with file indicators e.g. ```python:solution.py ... ``` or ```solution.py ... ```
    const codeBlockRegex = /```(?:[a-zA-Z0-9_-]+:)?([a-zA-Z0-9_\-\.\/]+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = codeBlockRegex.exec(outputText)) !== null) {
      let matchedPath = match[1]?.trim();
      const code = match[2];

      if (!matchedPath || matchedPath.length > 50 || matchedPath === 'python' || matchedPath === 'ts') {
        matchedPath = task.files[0]?.path || 'solution.py';
      }

      const existingFile = originalFiles.find(f => f.path === matchedPath) || originalFiles[0];
      const targetPath = existingFile ? existingFile.path : matchedPath;
      const originalContent = existingFile ? existingFile.content : '';

      changes.push({
        path: targetPath,
        operation: existingFile ? 'modify' : 'create',
        originalContent,
        proposedContent: code,
        status: 'approved'
      });

      const existingIdx = updatedFiles.findIndex(f => f.path === targetPath);
      if (existingIdx >= 0) {
        updatedFiles[existingIdx].content = code;
      } else {
        updatedFiles.push({ path: targetPath, content: code });
      }
    }

    const changeSet: ChangeSet = {
      id: uuidv4(),
      description: `Evaluation patch generated for task: ${task.name}`,
      status: 'pending_review',
      changes
    };

    return { changeSet, updatedFiles };
  }

  private validateSyntax(changeSet: ChangeSet): boolean {
    for (const change of changeSet.changes) {
      const content = change.proposedContent || '';
      // Basic balanced braces/brackets and non-empty check
      let paren = 0, brace = 0, bracket = 0;
      for (let i = 0; i < content.length; i++) {
        const c = content[i];
        if (c === '(') paren++;
        else if (c === ')') paren--;
        else if (c === '{') brace++;
        else if (c === '}') brace--;
        else if (c === '[') bracket++;
        else if (c === ']') bracket--;
        if (paren < 0 || brace < 0 || bracket < 0) return false;
      }
      if (paren !== 0 || brace !== 0 || bracket !== 0) return false;
    }
    return true;
  }

  // Run Queries
  getRuns(): EvalRun[] {
    return this.runs;
  }

  async getRunsDurable(ownerId: string): Promise<EvalRun[]> {
    const runs = await listEvalRuns(ownerId);
    for (const run of runs) {
      const index = this.runs.findIndex((item) => item.id === run.id);
      if (index >= 0) this.runs[index] = run;
      else this.runs.push(run);
    }
    return this.runs.filter((run) => run.ownerId === ownerId).sort((a, b) => b.startedAt - a.startedAt);
  }

  async getRunDurable(id: string, ownerId: string): Promise<EvalRun | null> {
    const local = this.getRun(id);
    if (local?.ownerId === ownerId) return local;
    const run = await getEvalRun(id, ownerId);
    if (run) this.runs.unshift(run);
    return run;
  }

  async persistRun(run: EvalRun): Promise<void> {
    const prior = this.runWrites.get(run.id) || Promise.resolve();
    const next = prior.catch(() => undefined).then(() => saveEvalRun(run));
    this.runWrites.set(run.id, next);
    try {
      await next;
    } finally {
      if (this.runWrites.get(run.id) === next) this.runWrites.delete(run.id);
    }
  }

  private startRunHeartbeat(runId: string) {
    this.stopRunHeartbeat(runId);
    const timer = setInterval(() => {
      const run = this.getRun(runId);
      if (!run || run.status !== 'running') {
        this.stopRunHeartbeat(runId);
        return;
      }
      void heartbeatEvalRun(runId).catch((error) => {
        console.error(`[EvalEngine] Heartbeat failed for run ${runId}:`, error);
      });
    }, 10_000);
    timer.unref?.();
    this.runHeartbeats.set(runId, timer);
  }

  private stopRunHeartbeat(runId: string) {
    const timer = this.runHeartbeats.get(runId);
    if (timer) clearInterval(timer);
    this.runHeartbeats.delete(runId);
  }

  async recoverInterruptedRuns() {
    const running = await listRunningEvalRuns();
    for (const run of running) {
      const failed = await failInterruptedEvalRun(run.id);
      if (!failed) continue;
      const recovered = {
        ...run,
        status: 'failed',
        errorType: 'WorkerInterrupted',
        errorMessage: 'Evaluation was interrupted when its worker stopped. Retry this run.',
        completedAt: Date.now(),
        updatedAt: Date.now(),
      } as EvalRun;
      const index = this.runs.findIndex((item) => item.id === run.id);
      if (index >= 0) this.runs[index] = recovered;
      else this.runs.push(recovered);
    }
  }

  getRun(id: string): EvalRun | undefined {
    return this.runs.find(r => r.id === id);
  }

  cancelRun(id: string): boolean {
    const run = this.runs.find(r => r.id === id);
    if (run && (run.status === 'running' || run.status === 'queued')) {
      run.status = 'cancelled';
      run.completedAt = Date.now();
      run.durationMs = run.completedAt - run.startedAt;
      run.duration = Math.round(run.durationMs / 1000);
      run.activity?.push({ type: 'warning', message: 'Evaluation run cancelled by user', timestamp: Date.now() });
      void this.persistRun(run).catch((error) => console.error(`[EvalEngine] Could not persist cancelled run ${id}:`, error));
      this.stopRunHeartbeat(id);
      return true;
    }
    return false;
  }

  async retryRun(
    id: string, 
    options?: { dataSharingAllowed?: boolean; dataSharingConsent?: boolean; userId?: string }
  ): Promise<EvalRun> {
    const oldRun = this.runs.find(r => r.id === id);
    if (!oldRun) {
      throw new Error(`Run ${id} not found.`);
    }

    const dataSharingAllowed = options?.dataSharingAllowed !== undefined 
      ? options.dataSharingAllowed === true 
      : (options?.dataSharingConsent !== undefined ? options.dataSharingConsent === true : oldRun.dataSharingConsent);

    return this.runEval(
      oldRun.taskId, 
      oldRun.modelId, 
      oldRun.agentId, 
      oldRun.providerId, 
      oldRun.benchmarkId, 
      oldRun.id, 
      {
        dataSharingAllowed,
        userId: options?.userId || oldRun.ownerId
      }
    );
  }

  // Leaderboard Calculation strictly from completed evaluation runs (excluding private/unconsented runs)
  getLeaderboard(benchmarkId?: string, minEvaluations = 1): LeaderboardEntry[] {
    const completedRuns = this.runs.filter(r => 
      (r.status === 'completed' || r.status === 'Completed') && 
      typeof (r.finalScore ?? r.score) === 'number' &&
      (!benchmarkId || r.benchmarkId === benchmarkId) &&
      !r.isPrivate &&
      r.dataSharingConsent === true
    );

    // Group by modelId
    const modelMap = new Map<string, EvalRun[]>();
    for (const run of completedRuns) {
      const list = modelMap.get(run.modelId) || [];
      list.push(run);
      modelMap.set(run.modelId, list);
    }

    const entries: LeaderboardEntry[] = [];

    for (const [modelId, runs] of modelMap.entries()) {
      if (runs.length < minEvaluations) continue;

      const modelMeta = INITIAL_MODELS.find(m => m.id === modelId);
      const count = runs.length;
      const totalScore = runs.reduce((acc, r) => acc + (r.finalScore || r.score || 0), 0);
      const avgScore = Math.round(totalScore / count);

      const passedTasks = runs.filter(r => (r.finalScore || r.score || 0) >= 70).length;
      const taskSuccessRate = Math.round((passedTasks / count) * 100);

      const passedTestsCount = runs.filter(r => r.testsPassed).length;
      const testPassRate = Math.round((passedTestsCount / count) * 100);

      const buildPassedCount = runs.filter(r => r.buildPassed).length;
      const buildSuccessRate = Math.round((buildPassedCount / count) * 100);

      const patchValidCount = runs.filter(r => r.patchValid).length;
      const patchValidityRate = Math.round((patchValidCount / count) * 100);

      const totalLatency = runs.reduce((acc, r) => acc + (r.durationMs || (r.duration ? r.duration * 1000 : 0)), 0);
      const avgLatencyMs = Math.round(totalLatency / count);

      const totalTokens = runs.reduce((acc, r) => acc + (r.totalTokens || 0), 0);
      const avgTokens = Math.round(totalTokens / count);

      const totalCost = runs.reduce((acc, r) => acc + (r.actualCost || r.estimatedCost || 0), 0);
      const avgCost = Number((totalCost / count).toFixed(5));

      entries.push({
        rank: 1,
        modelId,
        modelName: modelMeta?.displayName || modelId,
        providerId: modelMeta?.providerId || runs[0].providerId,
        agentId: runs[0].agentId,
        overallScore: avgScore,
        taskSuccessRate,
        testPassRate,
        buildSuccessRate,
        patchValidityRate,
        avgLatencyMs,
        avgTokens,
        avgCost,
        evaluationsCount: count,
        confidence: count >= 5 ? 'high' : count >= 3 ? 'medium' : 'limited'
      });
    }

    // Sort descending by overallScore, then by testPassRate
    entries.sort((a, b) => b.overallScore - a.overallScore || b.testPassRate - a.testPassRate);

    // Assign rank
    entries.forEach((entry, idx) => {
      entry.rank = idx + 1;
    });

    return entries;
  }

  // Model-specific analytics (excluding unconsented/private runs from shared statistics)
  getModelAnalytics(modelId: string) {
    const runs = this.runs.filter(r => 
      r.modelId === modelId && 
      (r.status === 'completed' || r.status === 'Completed') &&
      typeof (r.finalScore ?? r.score) === 'number' &&
      !r.isPrivate &&
      r.dataSharingConsent === true
    );
    if (runs.length === 0) {
      return null;
    }

    const count = runs.length;
    const avgScore = Math.round(runs.reduce((acc, r) => acc + (r.finalScore || r.score || 0), 0) / count);
    const avgDuration = Number((runs.reduce((acc, r) => acc + (r.duration || 0), 0) / count).toFixed(2));
    const avgCost = Number((runs.reduce((acc, r) => acc + (r.estimatedCost || 0), 0) / count).toFixed(5));
    const avgTokens = Math.round(runs.reduce((acc, r) => acc + (r.totalTokens || 0), 0) / count);

    // Breakdown by task category
    const categoryMap: Record<string, { totalScore: number; count: number }> = {};
    for (const run of runs) {
      const task = this.tasks.find(t => t.id === run.taskId);
      const cat = task?.category || 'General';
      if (!categoryMap[cat]) categoryMap[cat] = { totalScore: 0, count: 0 };
      categoryMap[cat].totalScore += (run.finalScore || run.score || 0);
      categoryMap[cat].count += 1;
    }

    const categories = Object.entries(categoryMap).map(([category, data]) => ({
      category,
      score: Math.round(data.totalScore / data.count),
      evaluationsCount: data.count
    }));

    return {
      modelId,
      evaluationsCount: count,
      avgScore,
      avgDuration,
      avgCost,
      avgTokens,
      categories,
      runs: runs.slice(0, 10)
    };
  }

  // Human Reviews
  addReview(review: Omit<HumanReview, 'id' | 'reviewTimestamp'>): HumanReview {
    const newReview: HumanReview = {
      ...review,
      id: uuidv4(),
      reviewTimestamp: Date.now()
    };
    this.reviews.push(newReview);

    // Update run's humanReviewScore
    const run = this.runs.find(r => r.id === review.runId);
    if (run) {
      const avgReview = Math.round(
        (review.codeQualityScore + review.architectureScore + review.maintainabilityScore + review.instructionFollowingScore + review.correctnessScore) / 5
      );
      run.humanReviewScore = avgReview;
      if (run.automatedScore !== undefined) {
        run.finalScore = Math.round(run.automatedScore * 0.7 + avgReview * 0.3);
      }
    }

    return newReview;
  }

  async addReviewDurable(review: Omit<HumanReview, 'id' | 'reviewTimestamp'>): Promise<HumanReview> {
    const newReview = this.addReview(review);
    try {
      await saveEvalReview(newReview);
      const run = this.getRun(review.runId);
      if (run) await this.persistRun(run);
      return newReview;
    } catch (error) {
      this.reviews = this.reviews.filter((item) => item.id !== newReview.id);
      throw error;
    }
  }

  getReviews(runId: string): HumanReview[] {
    return this.reviews.filter(r => r.runId === runId);
  }

  async getReviewsDurable(runId: string, ownerId: string): Promise<HumanReview[]> {
    const reviews = await listEvalReviews(runId, ownerId);
    const ids = new Set(reviews.map((review) => review.id));
    this.reviews = this.reviews.filter((review) => review.runId !== runId || review.ownerId !== ownerId || ids.has(review.id));
    return reviews;
  }
}

export const evalEngine = new EvalEngine();
