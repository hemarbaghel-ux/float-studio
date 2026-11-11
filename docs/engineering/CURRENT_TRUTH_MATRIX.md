# FLOAT Studio — Current Truth Matrix

**Document Version:** 1.0.0  
**Status:** Authoritative Baseline Audit  
**Audit Date:** November 2026  
**Scope:** Complete repository audit covering Server API Routes, Desktop Workbench Services, Web UI Components, Float Daemon, Language Extensions, and Build Systems.

---

## Status Classification Taxonomy

| Status | Meaning & Criteria |
| :--- | :--- |
| **`WORKING_AND_VERIFIED`** | Code exists, is fully wired, and passes automated unit/integration/desktop test verification. |
| **`WORKING_WITH_LIMITATIONS`** | Fully functional in local or specific environments, but has operational constraints (e.g., requires external API credentials or specific OS binaries). |
| **`PARTIALLY_IMPLEMENTED`** | Core engine exists, but edge cases, full UI wiring, or secondary adapters are still in progress. |
| **`BROKEN`** | Implementation fails under production conditions or crashes during execution. |
| **`PLACEHOLDER`** | Superficial stub, mock returns, or synthetic non-operational code. |
| **`RETIRED`** | Deprecated, superseded, or obsolete code slated for removal. |
| **`NOT_IMPLEMENTED`** | Feature requested or declared in interface contracts, but missing backing logic. |

---

## 1. Backend Server & API Routes (`src/server/`)

| Route / Subsystem | Handler File | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| `GET /api/health` | `src/server/app.ts` | **`WORKING_AND_VERIFIED`** | Verified via test suite; returns uptime, timestamp, and service status. |
| `POST /api/ai/chat` | `src/server/models/modelGateway.ts` | **`WORKING_AND_VERIFIED`** | Verified via `testPhase3AiChatAndGateway.ts`. Multi-provider routing (Anthropic, OpenAI, Gemini) with SSE streaming. |
| `POST /api/ai/autocomplete` | `src/server/models/modelGateway.ts` | **`WORKING_AND_VERIFIED`** | Fast prompt-cached completion endpoint. Verified in `testPredictiveAutocomplete.ts`. |
| `POST /api/ai/composer/plan` | `src/server/composer/composerAgent.ts` | **`WORKING_AND_VERIFIED`** | Generates multi-file edit plans; verified in `testComposerMultiFileDiff.ts`. |
| `POST /api/ai/composer/apply` | `src/server/composer/composerAgent.ts` | **`WORKING_AND_VERIFIED`** | Applies diffs atomically after user approval. Verified in `testPhase5ComposerEditing.ts`. |
| `POST /api/git/branch` | `src/server/git/gitPrService.ts` | **`WORKING_AND_VERIFIED`** | Creates feature branches; enforces branch protection. Verified in `testPhase8GitAndGitHub.ts`. |
| `POST /api/git/commit` | `src/server/git/gitPrService.ts` | **`WORKING_AND_VERIFIED`** | Scans for secret leaks (`sk-`, `ghp_`, `AKIA`) and commits. Verified in `testPhase8GitAndGitHub.ts`. |
| `POST /api/git/pr` | `src/server/git/gitPrService.ts` | **`WORKING_AND_VERIFIED`** | Opens GitHub PRs via authenticated GitHub REST client. |
| `POST /api/terminal/session` | `src/server/terminal/terminalManager.ts`| **`WORKING_WITH_LIMITATIONS`** | Spawns `node-pty` terminal process. Requires native C++ build tools on host to compile `node-pty`. |
| `POST /api/terminal/exec` | `src/server/terminal/terminalManager.ts`| **`WORKING_AND_VERIFIED`** | Evaluates command risk levels (`LOW`, `MEDIUM`, `HIGH`, `BLOCKED`). Enforces approval gates. |
| `POST /api/projects/checkpoints`| `src/server/persistence/` | **`WORKING_AND_VERIFIED`** | Creates and restores workspace checkpoints. Verified in `testPhase9PersistenceAndCheckpoints.ts`. |
| `POST /api/auth/verify` | `src/server/middleware/auth.ts` | **`WORKING_WITH_LIMITATIONS`** | Verifies Firebase ID tokens. When `NODE_ENV=production`, requires valid Firebase Admin SDK credentials. |

---

## 2. Desktop Code-OSS Workbench Contributions (`desktop/src/vs/workbench/contrib/float/`)

| Contribution / Service | Implementation File | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **Float Chat View** | `floatChatView.ts` | **`WORKING_AND_VERIFIED`** | Full chat UI container; verified via `verifyDesktopWorkbenchContributions.ts` & `testFloatChatSessionStreaming.ts`. |
| **Float Composer View** | `floatComposerView.ts` | **`WORKING_AND_VERIFIED`** | Multi-file diff viewer with accept/reject buttons. Verified via `testComposerAutonomousAgent.ts`. |
| **Native Inline Diff** | `floatNativeInlineDiff.ts` | **`WORKING_AND_VERIFIED`** | Custom Monaco line diff decorators and zone widgets. Verified via `testDesktopNativeInlineDiff.ts`. |
| **Predictive Autocomplete** | `floatPredictiveAutocomplete.ts` | **`WORKING_AND_VERIFIED`** | Code-OSS completion item provider with ghost text. Verified via `testPredictiveAutocomplete.ts`. |
| **Daemon IPC Client** | `floatDaemonClient.ts` | **`WORKING_AND_VERIFIED`** | Socket/pipe client connecting workbench to daemon. Verified in `testFloatDaemonIpcProtocol.ts`. |
| **Shadow Workspace** | `floatShadowWorkspace.ts` | **`WORKING_AND_VERIFIED`** | Copy-on-write workspace virtualization. Verified in `testShadowWorkspace.ts`. |
| **Semantic Codebase Indexer**| `floatCodebaseSemanticIndex.ts` | **`WORKING_AND_VERIFIED`** | AST symbol extractor and lexical indexer. Verified in `testCodebaseSemanticIndex.ts`. |
| **Multi-Agent DAG Engine** | `floatAgentDagEngine.ts` | **`WORKING_AND_VERIFIED`** | Directed acyclic graph task orchestrator. Verified in `testSprint6MultiAgentDagGatewayComplete.ts`. |
| **Call Graph Speculator** | `floatCallGraphSpeculator.ts` | **`WORKING_AND_VERIFIED`** | Speculative context prefetcher. Verified in `testSprint3CursorTabAndCallGraphComplete.ts`. |
| **Auto-Repair Debugger** | `floatAutoRepairDebugger.ts` | **`WORKING_AND_VERIFIED`** | Automated error diagnosis and fix generator. Verified in `testSprint4DebugAutoRepairAndSweBenchComplete.ts`. |

---

## 3. Float Daemon & Codebase Intelligence (`daemon/`)

| Component | Path | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **Daemon Server Process** | `daemon/src/server.ts` | **`WORKING_AND_VERIFIED`** | IPC listener with handshake, ping, and request dispatcher. Verified in `testFloatDaemonIpcProtocol.ts`. |
| **Worker Channel & Threads**| `daemon/src/workerChannel.ts` | **`WORKING_AND_VERIFIED`** | Multi-threaded worker channel for AST indexing. Verified in `testFloatDaemonWorkerChannel.ts`. |
| **Grammar Catalogs** | `daemon/grammars/data/*.ts` | **`WORKING_WITH_LIMITATIONS`** | 15 precompiled grammar catalogs (~68 MB). Tree-sitter parsers work, but large static tables increase memory footprint. |
| **Index Persistence** | `daemon/src/indexPersistence.ts` | **`WORKING_AND_VERIFIED`** | Serializes indexed symbol graph to disk cache. Verified in `testFloatDaemonIndexPersistence.ts`. |
| **Hybrid Retrieval** | `daemon/src/hybridRetrieval.ts` | **`WORKING_AND_VERIFIED`** | Combines BM25 lexical token match with graph distance. Verified in `testFloatDaemonHybridRetrieval.ts`. |
| **AST Tree-Sitter Chunker** | `daemon/src/astChunker.ts` | **`WORKING_AND_VERIFIED`** | Chunks files along AST boundary nodes. Verified in `testPhase1NativeSemanticEngineComplete.ts`. |
| **Runtime Fallback** | `daemon/src/runtimeFallback.ts` | **`WORKING_AND_VERIFIED`** | Graceful fallback when daemon crashes or socket disconnects. Verified in `testFloatDaemonRuntimeFallback.ts`. |

---

## 4. Builtin Language Extensions (`extensions/`)

| Extension Name | Path | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| `python-language-features` | `extensions/python-language-features/` | **`PARTIALLY_IMPLEMENTED`** | Basic grammar & commands registered; full Pyright/LSP integration pending Sprint G. |
| `typescript-language-features`| `extensions/typescript-language-features/`| **`WORKING_AND_VERIFIED`** | Leverages Code-OSS native TypeScript service; diagnostics and completions operational. |
| `rust-language-features` | `extensions/rust-language-features/` | **`PARTIALLY_IMPLEMENTED`** | Syntax highlighting active; rust-analyzer server binding pending Sprint G. |
| `go-language-features` | `extensions/go-language-features/` | **`PARTIALLY_IMPLEMENTED`** | Syntax highlighting active; gopls server binding pending Sprint G. |
| `cpp-language-features` | `extensions/cpp-language-features/` | **`PARTIALLY_IMPLEMENTED`** | Syntax highlighting active; clangd server binding pending Sprint G. |
| Other 18 extensions | `extensions/*` | **`PARTIALLY_IMPLEMENTED`** | Language manifests and grammar files present; deep language server integration planned for Sprint G. |

---

## 5. Web UI & Companion Application (`src/`)

| Component / Store | Path | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **App Root & Router** | `src/App.tsx` | **`WORKING_AND_VERIFIED`** | Responsive layout switching between Landing, Editor, and Settings. |
| **Monaco Editor Wrapper** | `src/components/editor/EditorPane.tsx` | **`WORKING_AND_VERIFIED`** | Dynamic Monaco mount, multi-tab support, syntax highlighting, and theme support. |
| **Chat Drawer** | `src/components/chat/ChatDrawer.tsx` | **`WORKING_AND_VERIFIED`** | Streaming message renderer, markdown code blocks with copy/insert actions. |
| **Composer Modal** | `src/components/composer/ComposerModal.tsx` | **`WORKING_AND_VERIFIED`** | Multi-file diff presentation with line-by-line inspection. |
| **Terminal Panel** | `src/components/terminal/TerminalPanel.tsx` | **`WORKING_AND_VERIFIED`** | Interactive terminal connected to backend PTY via WebSocket/SSE. |
| **Zustand State Stores** | `src/stores/*.ts` | **`WORKING_AND_VERIFIED`** | Clean reactive state separation for chat, workspace, editor, and auth. |
| **Cloud Persistence Client** | `src/services/persistenceService.ts` | **`WORKING_WITH_LIMITATIONS`** | Syncs workspace to Firestore when configured; falls back to browser localStorage. |

---

## 6. Build, Packaging & Release Infrastructure (`.github/workflows/`, `scripts/`)

| Pipeline / Tool | Path | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **Web Build (`npm run build:web`)**| `vite.config.ts` | **`WORKING_AND_VERIFIED`** | Fast Vite build compiling to `dist/`. Tested and verified. |
| **Server Build (`npm run build:server`)**| `esbuild` | **`WORKING_AND_VERIFIED`** | Dual CJS/ESM bundling of Express backend. Tested and verified. |
| **Desktop Extension Build** | `scripts/buildVscodiumExtension.cjs` | **`WORKING_AND_VERIFIED`** | Packages workbench extensions into installable bundle. |
| **CI Workflow (`ci.yml`)** | `.github/workflows/ci.yml` | **`WORKING_AND_VERIFIED`** | Multi-job CI running lint, build, unit tests, integration tests, and desktop tests. |
| **Release Workflow (`release.yml`)**| `.github/workflows/release.yml` | **`BROKEN` / `PLACEHOLDER`** | **CRITICAL DEFECT DETECTED**: Currently writes fake text placeholders (`echo "FLOAT Studio Desktop Release..." > dist/release/...`). Target for Sprint B replacement with genuine packaging pipelines. |
| **Headless Smoke Tests** | `scripts/verifyRealElectronDesktopApp.ts`| **`WORKING_AND_VERIFIED`** | Verifies Electron app launch, window creation, and IPC channel availability. |

---

## 7. Benchmarks & Synthetic Evaluations (`benchmarks/`)

| Benchmark Component | Path | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **SWE-bench Synthetic Tasks** | `benchmarks/swe-bench/data/` | **`PLACEHOLDER` / `RETIRED`** | 145 synthetic task records generated during prior prototyping. Must not be cited as real evaluation metrics. True validation scheduled for Sprint K. |
| **E2E Workflow Test Mock** | `scripts/testPhase10EndToEndCursorWorkflow.ts` | **`WORKING_WITH_LIMITATIONS`** | Uses an in-memory `WorkflowTestModelGateway` with deterministic mock responses. Proves pipeline plumbing, but is not a live AI benchmark. |
