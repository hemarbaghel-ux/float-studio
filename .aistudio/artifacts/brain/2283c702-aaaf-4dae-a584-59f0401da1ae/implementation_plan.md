# FLOAT AI — Implementation Plan (Prompts A–I)

## 1. Execution Sequence (Approved Scope)
Per your direction, execution is sequenced so that **Milestone 1 executes Prompt A (Release Plumbing) and Prompt B (Model Catalog) only first**, followed by full static, unit, and build verification before proceeding to **Prompts C through I**.

---

## 2. Milestone 1 (Immediate Execution Upon Approval): Prompt A & Prompt B

### Prompt A — Finish Release Plumbing
1. **Multi-Stage `Dockerfile` & `worker.ts` Build Target**:
   - Update `Dockerfile` on `node:22-alpine` with multi-stage build (`build`, `runtime` for the web server with `HEALTHCHECK /api/health`, and `worker` target/CMD running `node dist/worker.cjs` as non-root `USER node`, with `git` and `docker-cli` installed).
   - Update `package.json` scripts:
     - `"build"`: `vite build && esbuild src/server/app.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs && esbuild worker.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/worker.cjs`
     - `"start"`: `node dist/server.cjs`
     - `"worker"`: `node dist/worker.cjs`
2. **Single Node Version (`22`) Everywhere**:
   - Set `"engines": { "node": "22.x" }` in `package.json`.
   - Align `.github/workflows/ci.yml`, `README.md` (currently says Node 24), `docs/RELEASE_CHECKLIST.md`, and `Dockerfile` to Node 22.
3. **Dependencies & Dynamic Import Cleanup**:
   - Declare `"optionalDependencies": { "node-pty": "^1.0.0", "playwright": "^1.51.0" }` in `package.json`.
   - Add `"@monaco-editor/loader"` to `dependencies` in `package.json`.
   - Remove duplicate `esbuild` and `vite` entries from `dependencies` (keeping them in `devDependencies`) and delete `/bun.lock`.
   - In `src/server/terminal/terminalWsServer.ts`, replace `new Function('modulePath', 'return import(modulePath)')` with a standard `await import('node-pty')` guarded by `try / catch`.
4. **Comprehensive `.env.example`**:
   - Rewrite `.env.example` from every `process.env` variable read across the codebase:
     - AI Providers: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_ENVIRONMENT_KEY`, `CODEX_API_KEY`
     - Cloud Agent env vars: `FLOAT_CLOUD_ASTRA_SESSION_ID`, `FLOAT_CLOUD_ASTRA_ENVIRONMENT_ID`, `FLOAT_CLOUD_ASTRA_REMOTE_URL`, `FLOAT_CLOUD_SOL_SESSION_ID`, `FLOAT_CLOUD_SOL_ENVIRONMENT_ID`
     - Firebase & Storage: `FIREBASE_SERVICE_ACCOUNT_JSON`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `GOOGLE_CLOUD_STORAGE_BUCKET`
     - Server & Security: `PORT`, `NODE_ENV`, `APP_URL`, `FLOAT_OAUTH_ENCRYPTION_KEY`, `FLOAT_AUTH_ALLOW_INSECURE_DEV`
     - Sandbox, Terminal, Git & Worktrees: `FLOAT_DOCKER_BIN`, `FLOAT_EXECUTION_IMAGE`, `FLOAT_EXECUTION_SHARED_DIR`, `FLOAT_ENABLE_AGENT_COMMAND_EXECUTION`, `FLOAT_TERMINAL_IDLE_TIMEOUT_MS`, `FLOAT_AGENT_WORKTREE_ROOT`, `FLOAT_GIT_BIN`, `FLOAT_ALLOW_STDIO_MCP`, `FLOAT_ENABLE_BROWSER_AGENT`
     - OAuth Integrations: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET`, `GITLAB_BASE_URL`
     - Stripe Billing: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO_MONTHLY`, `STRIPE_PRICE_ID_PRO_ANNUAL`, `STRIPE_PRICE_ID_ULTRA_MONTHLY`, `STRIPE_PRICE_ID_ULTRA_ANNUAL`, `VITE_ENABLE_BILLING_CHECKOUT`
5. **All `scripts/testPhase*.ts` in `npm test` and CI**:
   - Add every `scripts/testPhase*.ts` script (`testPhase0And1Truthfulness.ts`, `testPhase4DurableStateAndWorkers.ts`, `testPhase5Proposal.ts`, `testPhase5TerminalSandbox.ts`, `testPhase6ReviewAndContext.ts`, `testPhase6Validation.ts`, `testPhase7FinalIntegration.ts`, `testPhase7GitAndPRSafety.ts`, `testPhase8Hardening.ts`, `testPhaseASecurityRegression.ts`) to `package.json` `"test"` and `.github/workflows/ci.yml`, and fix any failures.
6. **Eliminate Hard-Coded `ccarenv_b64_` / `rt_` / `sess_` IDs**:
   - Remove all hard-coded `ccarenv_b64_...`, `rt_...`, and `sess_...` literals from `src/data/cloudAgentConstants.ts`, `src/server/providers/cloudAgentConfig.ts`, and related files/tests.
   - Read them strictly from environment variables (`FLOAT_CLOUD_ASTRA_ENVIRONMENT_ID`, `FLOAT_CLOUD_ASTRA_REMOTE_URL`, `FLOAT_CLOUD_ASTRA_SESSION_ID`, etc.) or return `NOT_CONFIGURED` (`503`) when absent.
7. **Fail-Closed `503 NOT_CONFIGURED` in Production When Firestore Admin Missing**:
   - In `src/server/durableState.ts`, `src/server/adminFirebase.ts`, and Express middleware/routes, if `process.env.NODE_ENV === 'production'` and Firestore Admin credentials are missing (`!hasAdminCredentials()` and no test override), reject stateful operations with HTTP `503` `{ error: ..., code: 'NOT_CONFIGURED' }` instead of falling back to in-memory Maps.
   - Align `README.md` and `docs/RELEASE_CHECKLIST.md` with the actual Node 22 runtime, `Dockerfile` targets (`runtime` and `worker`), and GitHub branch push/PR capabilities.

---

### Prompt B — Model Catalog Consolidation
1. **Verified Models & Router (`src/data/verifiedModels.ts`, `src/server/providers/router.ts`)**:
   - Update catalog and routes to use the exact current model IDs:
     - Anthropic: `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-5-5`
     - OpenAI: `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`
     - Google: `gemini-4-argon`
   - Remove `gpt-6.1-sol` unless `/api/ai/health` dynamically proves it works with the active key.
2. **Health-Check & Key-Based UI Visibility**:
   - Hide any model in the UI model selector (`src/store/aiStore.ts`, `src/features/ai/AIPanel.tsx`, `src/features/dashboard/Dashboard.tsx`, `/api/ai/models`) if its provider API key is missing or its health check in `/api/ai/health` fails.
3. **Single Pricing Config (`MODEL_CONFIG`)**:
   - Consolidate all model pricing in `MODEL_CONFIG` with `effectiveDate` and per-model `sourceUrl`, using `null` whenever pricing is unknown or unpublished.
4. **Update Catalog & Routing Tests**:
   - Update `scripts/testModelSelectorPanel.ts`, `scripts/testProviderRoutingAndHealth.ts`, `scripts/testFloatBasicModel.ts`, and `scripts/testPhase8Hardening.ts` to validate the new model IDs and health-based visibility rules.

---

## 3. Subsequent Milestones (Planned Specification for Prompts C–I)

### Prompt C — Cursor-Style Tab Completions
- Multi-line next-edit prediction in Monaco (`src/features/editor/CodeEditor.tsx`) backed by `POST /api/ai/complete` using `gpt-6-luna` or the cheapest configured healthy model.
- 150ms debounce, `AbortSignal` cancellation of stale requests, context = current file window around cursor + ring buffer of last 5 edits + open tabs' import statements.
- Keybindings: `Tab` accepts full completion, `Ctrl+Right` accepts next word, `Esc` dismisses.
- Enforce `.gitignore` / `.floatignore` and secret pattern filters before sending completion context.
- Record rolling P50/P95 latency and acceptance-rate counters displayed in Settings.
- Add automated tests for `AbortSignal` cancellation and secret/`.gitignore` filtering.

### Prompt D — Web Search (`@web`) and Docs (`@docs`)
- Server-side `@web` context source and `web_search` agent tool via provider built-in search (`gemini-4-argon` Google Search grounding `{ googleSearch: {} }` or OpenAI web search), returning structured citations (`{ title, url, snippet }`).
- 10-minute server-side TTL cache; reuse `assertSafeHttpUrl` DNS/IP SSRF guard for `@docs` fetching; return `NOT_CONFIGURED` if no configured provider supports search.
- Render clickable citation pills in `AIPanel.tsx` assistant messages.

### Prompt E — Real Codebase Semantic Indexing
- Server-side AST/symbol + size chunker honoring `.gitignore` and `.floatignore`.
- **Strict Embedding Rules**:
  - Choose the embedding provider once per project (`gemini-embedding-2-preview` or OpenAI `text-embedding-3-small`) and store `provider`, `modelId`, and `dimension` on every chunk and in the project index metadata document.
  - Never mix vectors from different providers or dimensions in one index. Provider fallback applies **only** when creating a new index. If the stored provider later becomes unavailable, keep searching with the stored provider if possible; otherwise return `NOT_CONFIGURED` without silently switching.
  - If the user deliberately changes the embedding provider, display a `"Re-index required"` confirmation modal and rebuild the index in the background upon confirmation.
  - Verify the embedding model ID with a 1-item test call in `/api/ai/health` before indexing; surface the real upstream error if it fails.
- Store vectors in Firestore vector fields (`server_codebase_vectors`, tenant- and project-scoped), re-index incrementally via file SHA-256 hashes, and route >900 KB payloads through `durableState.ts`.
- Add automated tests for creation-time fallback, zero provider/dimension mixing, incremental update, tenant isolation, and re-index on provider change.

### Prompt F — Local Folders & GitHub Import
- Add `"Open Folder"` using Chromium File System Access API (`window.showDirectoryPicker`) with directory read, poll/watch, and write-back on apply; fall back to `.zip` upload where unsupported.
- Add `"Clone from GitHub"` via connected GitHub OAuth integration.
- Maintain per-file SHA-256 sync conflict detection and render an explicit conflict resolution dialog.

### Prompt G — Agent Verify Loop & Parallel Agents (Max 3 Per Project)
- Automatic verify loop after proposed edits: run lint/tests in the sandbox, feed failures back to the agent for up to 3 iterations, with every iteration streamed and visible in the UI.
- Plan mode produces an editable structured TODO list executed step-by-step by the agent.
- Support up to **3 parallel background agents per project** in `worker.ts` on isolated Git worktrees (`agent/<taskId>`) with UI task list, live status, cancel, and resume controls.
- Push agent branches to connected GitHub repositories and open PRs (comment-only reviews; never `APPROVE`), and remove the outdated `README.md` claim that pushing task branches is unimplemented.

### Prompt H — Settings, Customization & Usage Polish
- Keybinding editor, theme and editor font settings, per-user slash commands and custom commands synced through Firestore, and a real Usage page displaying verified token counts and cost per model from `MODEL_CONFIG`. Keep Stripe behind existing feature flags and do not attempt VS Code extension compatibility.

### Prompt I — Release Gate & Playwright E2E Suite
- Playwright E2E tests covering: sign in, open project, chat, agent proposes edits, accept one hunk, restore checkpoint, run terminal command, and open PR.
- Wire CI (`.github/workflows/ci.yml`) to run `npm run lint`, full `npm test`, `npm run build`, and Playwright E2E tests, explicitly marking steps that require live API keys or a Docker daemon as `skipped` (never falsely `passed`).
