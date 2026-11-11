# FLOAT Studio — Test Engineering Strategy

**Document Version:** 1.0.0  
**Status:** Authoritative Test Architecture  
**Last Updated:** November 2026  

---

## 1. Quality Engineering Principles & Test Pyramid

FLOAT Studio enforces rigorous automated verification across five distinct testing layers:

```
                  +-----------------------------------+
                  |      E2E Headless Smoke Tests     |  (Real binary, clean runner, --smoke-test)
                  +-----------------------------------+
                  |    SWE-bench Evaluation Suite     |  (Real repo tasks, docker sandboxes)
                  +-----------------------------------+
                  |  Desktop & Daemon IPC Verifiers   |  (Code-OSS workbench, socket protocols)
                  +-----------------------------------+
                  |      Integration Test Layer       |  (Server APIs, Git PRs, PTY isolation)
                  +-----------------------------------+
                  |       Unit & Brain AST Tests      |  (Knowledge graph, diffs, routers)
                  +-----------------------------------+
```

### Core Invariants:
1. **Zero Mocked Benchmarks:** Evaluation suites must execute against real repository checkouts in sandboxed containers. Never commit canned pass/fail strings or synthetic benchmark files.
2. **Deterministic CI:** All tests run in pull request CI must be hermetic and not rely on live third-party network access or live paid model credits.
3. **Live Tests Isolated:** Live model tests are separated under `test:live` and only executed when credentials are explicitly provisioned in a secure runner environment.

---

## 2. Test Suite Breakdown & Execution Commands

### 2.1. Unit Test Layer (`npm run test:unit`)
Validates isolated domain logic, AST parsing, graph traversal, and state machines:
- **`scripts/testFloatBrain.ts`**: Unified Brain AST indexing, symbol lookup, call chain tracing, blast radius calculation, scoped memory isolation.
- **`scripts/testComposerMultiFileDiff.ts`**: Multi-file diff generation, unified patch construction, whitespace handling, and rejection logic.
- **`scripts/testChatProposalWorkflow.ts`**: Chat turn state transitions, proposal generation, and finalization.
- **`scripts/testProposalWorkspaceIsolation.ts`**: Verifies that active proposals cannot bleed into concurrent user workspaces.
- **`scripts/testCursorIdeLayout.ts`**: Verifies responsive layout state transitions and panel collapsing logic.

### 2.2. Integration Test Layer (`npm run test:integration`)
Validates multi-component interactions across the Express backend, filesystem, and Git:
- **`scripts/testPhaseASecurityRegression.ts`**: Validates JWT/Firebase token rejection, path traversal protection (`../`), and command sanitization.
- **`scripts/testPhase8GitAndGitHub.ts`**: Tests branch creation, branch protection enforcement, secret scanning in commits, and GitHub PR construction.
- **`scripts/testProviderRoutingAndHealth.ts`**: Validates model gateway health checks, dynamic fallback, and error propagation.
- **`scripts/testTenantIsolationSecurity.ts`**: Validates that User A cannot read User B's files, memories, or terminal sessions.
- **`scripts/testProjectExecution.ts`**: Validates PTY terminal spawning, command output streaming, and approval gate prompts for high-risk commands.

### 2.3. Desktop & Daemon IPC Test Layer (`npm run test:desktop`)
Validates native Code-OSS workbench contributions and daemon IPC:
- **`scripts/verifyRealElectronDesktopApp.ts`**: Boots Electron shell headless, confirms window creation, checks preload API availability.
- **`scripts/verifyDesktopWorkbenchContributions.ts`**: Verifies that Float Chat, Float Composer, and Float Status Bar widgets register into Code-OSS dependency injection.
- **`scripts/testFloatDaemonIpcProtocol.ts`**: Tests UNIX socket / Named Pipe handshake, heartbeat ping/pong, and error frame handling.
- **`scripts/testDesktopNativeInlineDiff.ts`**: Tests Monaco editor line diff decorators, additions, deletions, and inline accept/reject handlers.
- **`scripts/testPredictiveAutocomplete.ts`**: Tests ghost text inline completion provider and prefix/suffix cache hit rates.

### 2.4. Extension Test Layer (`npm run test:extension`)
- **`scripts/buildAllBuiltinExtensions.cjs`**: Compiles all 23 language extension manifests and grammars.
- **`scripts/testVscodiumPoCWorkflow.ts`**: Validates VSIX packaging, manifest validation, and extension host activation.

### 2.5. E2E Headless Smoke Test Layer (`npm run test:smoke`)
Executed on clean CI runners against packaged platform artifacts:
- Launches packaged binary with `--smoke-test`.
- Opens a scratch workspace, mounts Monaco, confirms chat panel loads.
- Dispatches a mock ping to the model gateway.
- Exits with code `0` on complete success, or fails CI if the process crashes or hangs for > 30 seconds.

---

## 3. Mocking Policy & Guidelines

| Layer | Mocking Strategy | Approved Libraries / Tools |
| :--- | :--- | :--- |
| **Unit Tests** | In-memory mock adapters for storage and AI models (`WorkflowTestModelGateway`). Fast execution (< 50ms per test). | Native Node.js `assert`, custom fixtures. |
| **Integration Tests** | Ephemeral SQLite / in-memory Firestore; mocked external model HTTP endpoints via `msw` or Express test server. | Express test harness, temporary directories (`os.tmpdir()`). |
| **Desktop Tests** | Real Electron binary launched in headless test mode with mock backend server URL. | Electron test flags, Node.js child processes. |
| **Live Tests** | Real API calls against OpenAI, Anthropic, or Gemini test accounts. Restricted to manual triggers or scheduled nightly runs. | `@anthropic-ai/sdk`, `openai`, `@google/genai`. |

---

## 4. Continuous Integration Matrix (`.github/workflows/ci.yml`)

The GitHub Actions CI pipeline enforces strict gating on every pull request:
1. **Lint & Typecheck:** Runs `tsc --noEmit` across `src/`, `server.ts`, and `vite.config.ts`.
2. **Build Verification:** Runs `npm run build:web` and `npm run build:server`.
3. **Unit Tests:** Runs all 22 unit test scripts; zero failures permitted.
4. **Integration Tests:** Runs all 16 integration test scripts; zero failures permitted.
5. **Desktop & Extension Tests:** Builds extensions and runs desktop workbench verifiers.
6. **PR Status:** The pull request cannot be merged if any check in the matrix fails.
