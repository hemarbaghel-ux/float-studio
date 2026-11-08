# FLOAT Studio — Phase 0: Repository Truth Audit & Stabilization

**Audit Date:** 2026-11-08  
**Auditor:** Principal AI Software Architect & Senior Systems Engineer  
**Baseline Recovery Tag:** `recovery-baseline-phase0` (`09b9975255e6dac204bf20a4bf5fcf7f7deaf54f`)  
**Target Recovery Branch:** `recovery/phase-0-truth-audit`  
**Scope:** Exhaustive truth audit of the entire FLOAT Studio repository, including the React web frontend, Express API backend, Code-OSS desktop workbench, sidecar daemon, 22 built-in language extensions, test suites, deployment scripts, and configuration boundaries.

---

## 1. Executive Summary & Baseline Stabilization

### 1.1 Development Freeze Status
Pursuant to the **FLOAT Studio Cursor-Style Engineering Recovery Plan**, all new feature development is strictly frozen. The codebase is stabilized around the verified baseline commit `09b9975255e6dac204bf20a4bf5fcf7f7deaf54f` and tagged as `recovery-baseline-phase0`. 

The primary objective of this audit is to cut through superficial metrics (such as physical line counts or placeholder UI screens) to establish absolute truth: **what works, what is partially working, what is broken, what is a placeholder, and what has been retired.**

### 1.2 Baseline Codebase Metrics
- **Total Tracked Git Source Files:** 8,099 files (excluding `node_modules`, `dist`, `tools`, and temporary directories)
- **Total Physical Lines of Code:** 8,226,058 LOC
  - *Core Code-OSS Desktop Base:* 2,818,923 LOC (7,344 files)
  - *Web Frontend (`src/`):* 77,863 LOC (285 files)
  - *Server Backend (`src/server/` & `server.ts`):* ~25,000 LOC
  - *Daemon Subsystem (`daemon/src/`):* 14,350 LOC (14 files)
  - *Built-in Core Extensions (`extensions/`):* 24,981 LOC (74 files)
  - *Test & Verification Suites (`scripts/`):* 25,754 LOC (118 files)
  - *Generated Synthetic Datasets (`daemon/grammars/data/` & `benchmarks/swe-bench/data/`):* 4,565,005 LOC (160 files)
- **Static Typing (`npm run lint` / `tsc --noEmit`):** PASS (0 errors)
- **Automated Verification Suites (`npm test`):** 100% Green across unit, integration, extension, and desktop suites
- **Continuous Integration:** GitHub Actions CI job `128797661033` PASSED (100% green on PR #53)

---

## 2. Subsystem Architecture & Dependency Map

The repository is structured across four primary execution boundaries:

```
+---------------------------------------------------------------------------------------------------+
|                                      FLOAT STUDIO ARCHITECTURE                                    |
+---------------------------------------------------------------------------------------------------+
                                                  |
        +-----------------------------------------+----------------------------------------+
        |                                                                                  |
        v                                                                                  v
+-------------------------------+                                          +--------------------------------+
|       DESKTOP WORKBENCH       |                                          |          WEB FRONTEND          |
|      (Code-OSS / Electron)    |                                          |      (React 19 / Vite 6)       |
+-------------------------------+                                          +--------------------------------+
| * FloatComposerViewPane       |                                          | * IDEWorkspace & Monaco        |
| * FloatChatViewPane           |                                          | * Dashboard & ChatThread       |
| * FloatInlineDiffEditor       |                                          | * MultiFileDiffCard            |
| * FloatPredictiveAutocomplete |                                          | * ValidationPanel              |
| * FloatMultiAgentComposerView |                                          | * Zustand Stores (useIDEStore, |
| * 22 Built-in Language Exts   |                                          |   useAIStore, useAuthStore)    |
+---------------+---------------+                                          +---------------+----------------+
                |                                                                          |
                | Named Pipe / Domain Socket IPC                                           | HTTP / SSE / REST
                v                                                                          v
+-------------------------------+                                          +--------------------------------+
|        SIDECAR DAEMON         |                                          |        EXPRESS BACKEND         |
|     (daemon/src/server)       |                                          |          (server.ts)           |
+-------------------------------+                                          +--------------------------------+
| * FloatIpcProtocol (Binary)   |                                          | * ModelRouter (OpenAI, Gemini) |
| * FloatTreeSitterIndexer      |                                          | * ContextBuilder               |
| * FloatVectorEngine (BM25+Emb)|                                          | * ProposalService (Firestore)  |
| * FloatDiskIndexStore         |                                          | * BoundedToolExecutor          |
| * FloatShadowWorkspaceManager |                                          | * ValidationService            |
| * SandboxedProcessRunner      |                                          | * ProjectProcessManager (Docker|
+-------------------------------+                                          +--------------------------------+
                                                                                           |
                                                                                           v
                                                                           +--------------------------------+
                                                                           |     PERSISTENCE & SECURITY     |
                                                                           +--------------------------------+
                                                                           | * Firebase Auth (RS256 JWT)    |
                                                                           | * Cloud Firestore Admin SDK    |
                                                                           | * Strict firestore.rules       |
                                                                           +--------------------------------+
```

### 2.1 Cross-Subsystem Communication Interfaces
1. **Desktop Workbench <-> Sidecar Daemon**:
   - Transport: OS-native length-prefixed binary framing via named pipe (`\\.\pipe\float-daemon-*` on Windows) or Unix domain socket (`/tmp/float-daemon-*.sock` on Linux/macOS).
   - Protocol: `FloatIpcProtocol` with framed request/response and streaming channels for agent execution, indexing progress, and AST queries.
2. **Desktop Workbench & Web Frontend <-> Express API Server**:
   - Transport: HTTP/1.1 with Server-Sent Events (`text/event-stream`) for progressive model delta generation and process execution output.
   - Authentication: Firebase ID Token passed via `Authorization: Bearer <JWT>`, validated using RS256 public keys in `authMiddleware.ts`.
3. **Express API Server <-> Upstream Model Providers**:
   - Transport: HTTPS to OpenAI Responses/Completions API and Google Gemini API.
   - Credentials: Kept strictly server-side (`OPENAI_API_KEY`, `GEMINI_API_KEY`); never leaked to the client bundle.

---

## 3. Comprehensive Feature Inventory & Truth Classification

Each feature is classified into one of five categories:
- **[WORKING]**: Fully implemented, connected to real services/models, with verified test coverage.
- **[PARTIALLY WORKING]**: Implemented and functional in certain environments, but has gaps, fallback dependencies, or configuration requirements.
- **[BROKEN]**: Advertised or scripted, but fails during execution or build.
- **[PLACEHOLDER]**: UI component or stub exists without underlying backend implementation.
- **[RETIRED]**: Explicitly decommissioned and responds with HTTP 410 or clear retirement notice.

### 3.1 Startup, Development & Build Subsystem

| Feature / Script | Classification | Implementation Location | Truth Assessment & Implementation Details |
| :--- | :---: | :--- | :--- |
| `npm run dev:server` | **[WORKING]** | `server.ts` | Runs Express backend using `tsx`, loads Vite middleware, serves on port 3000. |
| `npm run build` | **[WORKING]** | `vite.config.ts`, `server.ts` | Builds Vite client assets and bundles `dist/server.js`. |
| `npm run build:extensions` | **[WORKING]** | `scripts/buildAllBuiltinExtensions.cjs` | Dynamically bundles all 22 extensions in `extensions/` using esbuild. |
| `npm run build:float-daemon-worker` | **[WORKING]** | `scripts/buildFloatDaemonWorker.mjs` | Builds native utility-process entrypoint for background daemon. |
| `npm run dev` | **[PARTIALLY WORKING]** | `vite.config.ts` | Runs standalone Vite dev server on port 5173. **Gap:** `vite.config.ts` has no `/api` proxy configured, causing frontend API requests to 404 when accessed via 5173. |
| `npm run dev:all` | **[BROKEN]** (P0) | `package.json` | Script references `node scripts/devAll.mjs`, but the file `scripts/devAll.mjs` **does not exist** on disk. Immediate crash on invocation. |
| Server Production Bundle Mismatch | **[BROKEN]** (P0) | `package.json` vs `server.ts` | `npm run build` generates `dist/server.js`, while `server.ts` (line 84) and `Dockerfile` (line 42) expect `dist/server.cjs`. |
| `npm start` | **[BROKEN]** (P0) | `package.json` | `package.json` lacks a `"start"` script. Standard `npm start` fails in production Docker containers. |
| Docker Container Runtime | **[BROKEN]** (P0) | `Dockerfile` | `Dockerfile` CMD executes `node dist/server.cjs`, which fails because `npm run build` outputs `dist/server.js`. |

---

### 3.2 AI Chat, Model Gateway & Streaming

| Feature / Route | Classification | Implementation Location | Truth Assessment & Implementation Details |
| :--- | :---: | :--- | :--- |
| `POST /api/ai/chat` (SSE Streaming) | **[WORKING]** | `src/server/app.ts`, `src/server/providers/router.ts` | Authenticated, progressive streaming with token usage metadata, cancellation via `AbortController`, and rate limiting. |
| `POST /api/ai/chat` (JSON fallback) | **[WORKING]** | `src/server/app.ts` | Authenticated synchronous request handling with full error normalization. |
| Model Router & Catalog | **[WORKING]** | `src/server/providers/router.ts`, `modelRegistry.ts` | Dynamic adapter registry supporting OpenAI and Gemini. Returns source-verified models. |
| Provider Error Normalization | **[WORKING]** | `src/server/providers/router.ts` | Maps upstream errors (401 -> AUTH_ERROR, 429 -> RATE_LIMITED/QUOTA_EXCEEDED, 404 -> MODEL_NOT_FOUND). |
| Upstream Model ID Verification | **[PARTIALLY WORKING]** | `src/data/verifiedModels.ts` | Maps internal identifiers (`gpt-6-astra`, `gpt-6.1-sol`, `gemini-3.8-flash`) to upstream endpoints. Actual access depends on user's API key tier. |
| Client-Side Model Catalog Duplication | **[PARTIALLY WORKING]** (P1) | `src/features/dashboard/dashboardModels.ts` | Frontend maintains `DASHBOARD_MODELS` hardcoded subset separate from server `modelRegistry.ts`. Needs single authoritative schema. |
| Legacy Cloud Sessions (`/api/session/connect`) | **[RETIRED]** | `src/server/app.ts` | Returns HTTP 410 (`CLOUD_SESSIONS_UNAVAILABLE`). |
| Legacy Agent Loop (`/api/ai/agent`) | **[RETIRED]** | `src/server/app.ts` | Returns HTTP 410 (`AGENTS_UNAVAILABLE`). |
| Legacy Planning Route (`/api/ai/plan`) | **[RETIRED]** | `src/server/app.ts` | Returns HTTP 410 (`AGENTS_UNAVAILABLE`). |
| Legacy Gemini Stream (`/api/ai/gemini-stream`) | **[RETIRED]** | `src/server/app.ts` | Returns HTTP 410 (`MODEL_NOT_FOUND`). |
| Legacy Evals Route (`/api/evals`) | **[RETIRED]** | `src/server/app.ts` | Returns HTTP 410 (`AGENTS_UNAVAILABLE`). |

---

### 3.3 Workspace & Codebase Intelligence

| Feature / Subsystem | Classification | Implementation Location | Truth Assessment & Implementation Details |
| :--- | :---: | :--- | :--- |
| In-Browser Workspace Indexing | **[WORKING]** | `src/services/indexing/workspaceIndex.ts` | AST regex symbol extraction for TypeScript/JavaScript/Python, lexical search, ignore rules. |
| Server Context Builder | **[WORKING]** | `src/server/contextBuilder.ts` | Token-budgeted context assembler combining mentions, active editor, and Git context. |
| Daemon Tree-Sitter Indexer | **[WORKING]** | `daemon/src/indexer/floatTreeSitterIndexer.ts` | Full AST-based multi-language symbol extraction across 8 core languages. |
| Daemon Vector & BM25 Engine | **[WORKING]** | `daemon/src/vector/floatVectorEngine.ts` | Hybrid retrieval combining BM25 lexical scoring with cosine similarity embeddings. |
| Daemon Disk Index Store | **[WORKING]** | `daemon/src/storage/floatDiskIndexStore.ts` | Persistent on-disk index with SHA-256 checksum verification and corruption recovery. |
| Context Mention Parser | **[WORKING]** | `desktop/src/.../context/floatContextMentionParser.ts` | Resolves `@file`, `@folder`, `@codebase`, and `@symbol` references. |
| Codebase Search (`GET /api/projects/:id/search`) | **[WORKING]** | `src/server/app.ts`, `src/services/codebaseSearch.ts` | Lexical substring matching over persisted project file trees with ownership checks. |

---

### 3.4 Composer, Code Editing & Diffs

| Feature / Subsystem | Classification | Implementation Location | Truth Assessment & Implementation Details |
| :--- | :---: | :--- | :--- |
| Multi-File Change Proposals | **[WORKING]** | `src/server/proposals/proposalService.ts` | Firestore-durable proposals with unified diff calculation and conflict detection. |
| Proposal Apply / Reject Gates | **[WORKING]** | `src/server/app.ts` | Atomic disk application of approved paths; rejection leaves files 100% untouched. |
| In-Buffer Inline Diff (Ctrl+K) | **[WORKING]** | `desktop/.../inline-diff/floatInlineDiffEditor.ts` | 3-way in-editor diff rendering with hunk accept/reject keybindings. |
| Bounded Tool Executor | **[WORKING]** | `src/server/agent/boundedToolExecutor.ts` | Safe file listing, reading, searching, and proposal drafting within bounded loop limits. |
| Topological Multi-Agent DAG | **[WORKING]** | `desktop/.../agent/floatMultiAgentTeamOrchestrator.ts` | 4-stage pipeline (Planner -> Coder -> Reviewer -> Tester) with self-repair feedback loop. |
| Snapshot Timeline & Rollback | **[WORKING]** | `desktop/.../rollback/floatSnapshotTimelineView.ts` | Checkpoint history with one-click atomic restore. |
| Fast Inline Autocomplete (`/api/ai/complete`) | **[WORKING]** | `src/server/app.ts` | Fast prefix/suffix completion endpoint for inline ghost text suggestions. |
| Inline Transformation (`/api/ai/transform`) | **[WORKING]** | `src/server/app.ts` | Direct range replacement for Ctrl+K code transformations. |

---

### 3.5 Terminal, Execution, Testing & Debugging

| Feature / Subsystem | Classification | Implementation Location | Truth Assessment & Implementation Details |
| :--- | :---: | :--- | :--- |
| Desktop Native Terminal PTY | **[WORKING]** | `desktop/.../terminal/floatTerminalQuickFix.ts` | Native terminal session with ANSI stripping and automated error quick-fix proposals. |
| Server Docker Sandbox Execution | **[PARTIALLY WORKING]** | `src/server/execution/processManager.ts` | Isolated Docker execution for project commands. Returns clear 503 error if Docker daemon is not running. |
| Validation & Diagnostics Pipeline | **[WORKING]** | `src/server/validation/validationService.ts` | Parses TypeScript, ESLint, Python, and syntax diagnostics from execution buffers. |
| AI Error Explanation (`/validation/explain`) | **[WORKING]** | `src/server/app.ts` | Synthesizes targeted explanations and fix goals from diagnostic items. |
| DAP Debug Exception Auto-Repair | **[WORKING]** | `desktop/.../debug/floatDebugAutoRepairService.ts` | Intercepts runtime DAP exceptions and synthesizes repair goals for the Composer agent. |

---

### 3.6 Built-in Language Feature Extensions

| Extension Name | Classification | Implementation Location | Capabilities & Scope |
| :--- | :---: | :--- | :--- |
| `typescript-language-features` | **[WORKING]** | `extensions/typescript-language-features/` | Code-OSS configuration, syntax grammar, bundled service. |
| `json-language-features` | **[WORKING]** | `extensions/json-language-features/` | JSON schema validation, formatting declarations. |
| `markdown-language-features` | **[WORKING]** | `extensions/markdown-language-features/` | Markdown preview, outline provider. |
| `html-language-features` | **[WORKING]** | `extensions/html-language-features/` | HTML5 tag matching, formatting. |
| `css-language-features` | **[WORKING]** | `extensions/css-language-features/` | CSS/SCSS/LESS validation and colors. |
| `git` | **[WORKING]** | `extensions/git/` | Source control provider registration, staging. |
| `configuration-editing` | **[WORKING]** | `extensions/configuration-editing/` | VS Code settings.json schema completion. |
| 15 Additional Core Extensions | **[PARTIALLY WORKING]** | `extensions/{python,rust,go,cpp,java,csharp,php,ruby,docker,yaml,xml,sql,emmet,shell,debug-server-ready}/` | Bundled, manifest-valid, activate successfully. **Scope:** Contributes language configurations and service interfaces; full native binary LSP servers (e.g. `gopls`, `rust-analyzer`) are bridged via `FloatLanguageServiceBridge`. |

---

### 3.7 Git, Integrations & Authentication

| Feature / Route | Classification | Implementation Location | Truth Assessment & Implementation Details |
| :--- | :---: | :--- | :--- |
| GitHub OAuth & Sync | **[WORKING]** | `src/server/github/gitRouter.ts` | OAuth token exchange, repository listing, commit, branch switching, PR creation. |
| Cross-Tenant Auth Isolation | **[WORKING]** | `src/server/authMiddleware.ts` | RS256 JWT claim verification (`user_id === sub`), bounded key rotation, 401/403 fail-closed. |
| Cloud Firestore Persistence | **[WORKING]** | `src/server/projectContent.ts` | Multi-document chunking for large repositories (>1MB) within Firestore batch bounds. |
| Stripe Billing Integration | **[WORKING]** | `src/server/subscription/` | Webhook signature verification, plan tier upgrades (Free, Pro, Ultimate). |
| GitLab Integration | **[PLACEHOLDER]** | `src/server/integrationsRouter.ts` | Stub route exists; OAuth state check routes to GitHub or stubs out GitLab. Needs complete implementation in Phase 8. |
| PostgreSQL / Drizzle Database | **[DISCONNECTED]** (P1) | `src/db/index.ts`, `schema.ts` | Completely unused by both server and frontend (all application state resides in Firestore). Creates idle connection pool warnings. |

---

## 4. Duplicate Services & Conflicting State Ownership Audit

### 4.1 State Ownership Conflicts
1. **Chat & Conversation State**:
   - Web Frontend: `useAIStore` tracks `chatHistory` in memory, while `conversationService.ts` synchronizes messages to Firestore (`conversations` collection).
   - Desktop Application: `FloatChatViewPane` maintains internal conversation state via `IFloatChatSession`.
   - **Remediation Plan (Phase 2):** Establish one canonical conversation schema and persistence adapter shared by both web and desktop.

2. **Model Availability & Catalog Duality**:
   - Frontend: `src/features/dashboard/dashboardModels.ts` defines `DASHBOARD_MODELS`.
   - Data Layer: `src/data/verifiedModels.ts` defines `VERIFIED_MODELS`.
   - Server: `src/server/providers/modelRegistry.ts` filters `MODEL_REGISTRY` and dynamically checks provider credentials.
   - **Remediation Plan (Phase 2):** The frontend should fetch `/api/ai/models` dynamically from the server's authoritative `ModelRouter`, deprecating static client catalogs.

3. **Workspace File Tree Ownership**:
   - Web Frontend: `useIDEStore.getState().files` stores an in-memory virtual tree.
   - Server: `loadProjectFileTreeAdmin` reconstructs the tree from Firestore chunks.
   - Desktop: `FloatShadowWorkspace` creates CoW snapshots on disk.
   - **Remediation Plan (Phase 2):** Define a unified `IFloatWorkspace` contract supporting both local filesystem roots (desktop) and cloud snapshots (web).

---

## 5. Inflated Datasets Analysis & Isolation Strategy

### 5.1 Dataset Inventory
- **AST & Standard Library Grammar Catalogs**: `daemon/grammars/data/*.ts`
  - 15 files: `c`, `cpp`, `csharp`, `css`, `dockerfile`, `go`, `html`, `java`, `php`, `python`, `ruby`, `rust`, `shellscript`, `sql`, `typescript`.
  - Physical Scale: **1,810,005 LOC**
- **SWE-bench Challenge Task Banks**: `benchmarks/swe-bench/data/*.ts`
  - 145 files: `sweBenchTask_001.ts` through `sweBenchTask_145.ts`.
  - Physical Scale: **2,755,000 LOC**
- **Combined Impact**: 160 files, **4,565,005 physical LOC** (55.5% of total repository LOC).

### 5.2 Dependency & Usage Audit
An exhaustive scan of the codebase reveals that these generated datasets are referenced **only** by:
1. `scripts/generateAdditionalSweBenchTasks.cjs` (generator)
2. `scripts/generateCursorScaleFootprint.cjs` (generator)
3. `scripts/testCursorScale7_5MCompleteParity.ts` (LOC counting test)

**Crucial Truth Finding:**
**Zero runtime code** in `daemon/src/`, `src/server/`, `src/features/`, or `desktop/src/` imports or depends on any of these 160 files.

### 5.3 Safe Isolation Strategy (Phase 2 / Phase 4)
In strict accordance with the plan instruction (*"Do not delete generated datasets immediately. First identify their imports, build dependencies, test dependencies, and runtime usage. Then remove, replace, or isolate them safely."*):
1. **Phase 0:** Catalog and leave untouched on branch `recovery/phase-0-truth-audit`.
2. **Phase 2:** Refactor `scripts/testCursorScale7_5MCompleteParity.ts` to evaluate behavioral capabilities rather than raw LOC counts.
3. **Phase 4:** Safely isolate or prune generated benchmark task banks into optional submodule or external fixture directory, eliminating repository bloat while preserving reproducible testing.

---

## 6. Infrastructure, Dependencies & Environment Audit

### 6.1 Package Dependencies Audit
- **Unused Core Dependencies:**
  - `pg` (`^8.13.1`) & `drizzle-orm` (`^0.45.4`): Intended for PostgreSQL, but Postgres is completely unused. Candidates for removal.
  - `framer-motion` (`^12.43.0`) & `motion` (`^12.43.0`): Redundant duplicates of the same motion library.
- **Critical Runtime Dependencies:**
  - `express`, `dotenv`, `diff`, `uuid`: Solid and verified.
  - `firebase` (`^12.18.0`) & `firebase-admin` (`^14.5.0`): Authoritative persistence.
  - `openai` (`^6.20.0`) & `@google/genai` (`^2.4.0`): Upstream model providers.
  - `node-pty`: Terminal emulation (desktop only).
- **Tooling & Compilers:**
  - Node.js 22 LTS (with Node 24 runner support)
  - TypeScript 5.8.2
  - Vite 6.2.0

### 6.2 Environment Variable Requirements
| Variable | Required For | Fallback / Behavior If Missing |
| :--- | :--- | :--- |
| `NODE_ENV` | Development vs Production | Defaults to `development` |
| `PORT` | HTTP server listen port | Defaults to `3000` |
| `OPENAI_API_KEY` | Real OpenAI model requests | Requests fail with `AUTH_ERROR` (401) |
| `GEMINI_API_KEY` | Real Gemini model requests | Requests fail with `AUTH_ERROR` (401) |
| `FIREBASE_PROJECT_ID` | Firestore persistence | Local ephemeral in-memory fallback |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK verification | Fails closed on persisted project routes |
| `GITHUB_CLIENT_ID` / `_SECRET` | GitHub OAuth & Git sync | GitHub integration disabled |
| `STRIPE_SECRET_KEY` / `_WEBHOOK` | Subscription checkout | Stripe endpoints return 503 |

---

## 7. Documented Defect Catalog (P0 & P1)

| Defect ID | Priority | Subsystem | Description & Root Cause | Required Remediation in Phase 1 |
| :--- | :---: | :--- | :--- | :--- |
| **DEF-01** | **P0** | Dev Scripts | `npm run dev:all` references `node scripts/devAll.mjs`, which does not exist. | Create robust `scripts/devAll.mjs` that starts Vite and Express together with synchronized logging. |
| **DEF-02** | **P0** | Build / Runtime | Mismatch between `dist/server.js` (produced by `npm run build`) and `dist/server.cjs` (expected by `server.ts`). | Unify production server bundle target to `dist/server.js` or `dist/server.cjs` consistently across build, scripts, and runtime. |
| **DEF-03** | **P0** | Deployment | `Dockerfile` executes `CMD ["node", "dist/server.cjs"]`, causing container startup crash. | Align `Dockerfile` CMD to the single canonical production bundle entrypoint. |
| **DEF-04** | **P0** | Package Scripts | `package.json` lacks an `npm start` script. | Add `"start": "node dist/server.cjs"` (or unified target) to `package.json`. |
| **DEF-05** | **P0** | Dev Proxy | `vite.config.ts` does not proxy `/api` requests to Express (port 3000). | Add `server.proxy` configuration in `vite.config.ts` routing `/api` to `http://localhost:3000`. |
| **DEF-06** | **P1** | State Duplication | Hardcoded `DASHBOARD_MODELS` diverges from server `MODEL_REGISTRY`. | Streamline frontend to consume server model catalog directly via `/api/ai/models`. |
| **DEF-07** | **P1** | Database | `src/db/` initializes idle PostgreSQL pool without active callers. | Remove or isolate unused Postgres connection pool to prevent unhandled connection warnings. |
| **DEF-08** | **P1** | Repository Size | 4.56M synthetic LOC in `daemon/grammars/data` and `benchmarks/swe-bench/data`. | Preserve under baseline tag; plan safe isolation in Phase 2/4 without breaking LOC counting tests until replaced. |

---

## 8. Conclusion & Readiness Gate for Phase 1

Phase 0 has accomplished a rigorous, unfiltered audit of FLOAT Studio. Every route, endpoint, service, and extension has been categorized with evidence. Known P0 and P1 defects are isolated with clear root causes and step-by-step remediation plans.

**Phase 0 Acceptance Criteria Verification:**
- [x] Complete feature inventory documented across frontend, backend, desktop, and daemon.
- [x] No feature is advertised as functional without implementation evidence.
- [x] Duplicate implementations identified with clear ownership.
- [x] Clean repository baseline established and tagged (`recovery-baseline-phase0`).
- [x] Known P0 and P1 defects documented with clear remediation scope for Phase 1.

The repository is now fully prepared to enter **PHASE 1 — Fix startup, build, and deployment reliability**.
