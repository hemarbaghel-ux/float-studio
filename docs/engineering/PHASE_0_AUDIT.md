# FLOAT STUDIO — PHASE 0 ARCHITECTURE & CODEBASE AUDIT

**Audit Date:** 2026-10-13  
**Auditor:** Principal AI Software Architect & Senior Systems Engineer  
**Scope:** Repository-wide audit of frontend, backend, Firebase, integrations, test harness, dependency tree, and Git topology. Strictly audit-only; zero production or destructive mutations performed.

---

## 1. Executive Summary & Repository Status

### 1.1 Git Topology & Branches
- **Current Active Branch:** `feat/production-github-integration`
- **Latest Local Commit:** `dd2ee5c` (*feat(ai): align workspace with Cursor-class OpenAI model experience and truthful telemetry*)
- **Upstream Tracking:** `origin/feat/production-github-integration` (local branch is ahead by 1 commit)
- **Base / Production Branch:** `origin/main` (`a49ba28`)
- **Remote Branches Discovered:**
  - `origin/main`
  - `origin/codex/float-production-audit`
  - `origin/feat/production-github-integration`
  - `origin/float-agent-ide`
  - `origin/float-features`
- **Open Pull Requests (via GitHub API):**
  - **PR #5:** `Fix OpenAI credential separation and unverified model routing` (`fix/phase7-chat-provider-hardening` -> `main`) — Open, unmerged.
  - **PR #4:** `FLOAT agent IDE: Cursor-style chat, codebase, automations, integrations (standalone, review branch)` (`float-agent-ide` -> `main`) — Open, unmerged.
- **Working Tree State:** 6 modified files unstaged for commit (`scripts/testStageBChatReliability.ts`, `src/features/dashboard/Dashboard.tsx`, `src/features/editor/CodeEditor.tsx`, `src/features/editor/InlineAssistantModal.tsx`, `src/features/float/ChatThread.tsx`, `src/features/shell/Header.tsx`). No uncommitted additions or deletions of existing files.

### 1.2 Baseline Verification Suite Status
- **TypeScript Compiler Check (`npm run lint` / `tsc --noEmit`):** **PASS (0 errors)**.
- **Unit & Integration Suite (`npm test`):** **45/45 suites passed (0 failures)**.
- **Production Asset Build (`npm run build`):** **PASS** — Vite client bundle (2.35 MB chunk, 625 kB gzip) and Node server bundle (`dist/server.cjs`, 594.8 kB).

---

## 2. Legacy Patch & CJS Scripts Inventory

In the root repository directory, there are **43 historical patch/fix scripts** (`fix_*.cjs`, `patch_*.cjs`, `update_*.cjs`, `test_evals_tasks.cjs`, `get_names.js`).

### Detailed Assessment & Usage Mapping
| Script Group | Count | Examined Examples | Active in `package.json` / Build / Tests? | Status & Cleanup Recommendation |
| :--- | :---: | :--- | :---: | :--- |
| `fix_*.cjs` | 37 | `fix_app.cjs`, `fix_store.cjs`, `fix_aistore.cjs`, `fix_server.cjs` | **NO** (Not referenced in any npm script, build step, or test file) | **Legacy one-off sed/regex patches** applied during historical migrations. Preserved untouched for Phase 0; scheduled for safe deprecation/quarantine in Phase 8. |
| `patch_*.cjs` | 4 | `patch_app.cjs`, `patch_nav.cjs`, `patch_pages.cjs`, `patch_registry.cjs` | **NO** | Legacy one-off AST replacements. Unused in runtime. |
| `update_*.cjs` / `*.js` | 2 | `update_agentsworkspace.cjs`, `update_aipanel.cjs` | **NO** | Legacy component update scripts. Unused in runtime. |

*Note:* In accordance with Phase 0 audit constraints, no files were deleted or moved.

---

## 3. Architecture Map & Subsystems

```
                                      +------------------------------------+
                                      |          Browser / Client          |
                                      |   React 19 + Tailwind CSS v4       |
                                      |    Monaco Editor + Zustand Store   |
                                      +-----------------+------------------+
                                                        |
                                          HTTP / SSE / WebSocket / REST
                                                        |
                                                        v
+---------------------------------------------------------------------------------------------------------+
|                                      FLOAT Node.js Express Server                                       |
|                                                                                                         |
|  [Middleware]                                                                                           |
|  - Body parser (size-bounded: 12MB normal, 24MB AI chat/agent context, raw buffer for Stripe webhook)  |
|  - requireAuth (Firebase ID Token JWT decoding & revocation checks)                                     |
|  - RateLimiter (sliding window per authenticated user UID)                                              |
|  - ServerPrivacyGuard (telemetry and data-sharing consent evaluation)                                   |
|                                                                                                         |
|  [Core Routing Modules]                                                                                 |
|  - /api/ai/chat, /api/ai/agent, /api/ai/complete, /api/ai/transform  -->  ModelRouter (OpenAI, Gemini) |
|  - /api/projects/:id/executions                                      -->  projectProcessManager (Docker)|
|  - /api/projects/:id/proposals                                       -->  ProposalService               |
|  - /api/projects/:id/validation                                      -->  ValidationService             |
|  - /api/projects/:id/git                                             -->  gitRouter (GitHub API proxy)  |
|  - /api/agent-orchestrator/*                                         -->  agentOrchestrator             |
|  - /api/subscription/*                                               -->  subscriptionRouter (Stripe)   |
|  - /api/integrations/*                                               -->  integrationsRouter (OAuth)    |
|  - /api/* (Milestone 9)                                              -->  milestone9Router (Rules, MCP, |
|                                                                           Skills, Memory, Browser Agent)|
|  - /api/evals/*                                                      -->  evalEngine                    |
+---------------------------------------------------+-----------------------------------------------------+
                                                    |
                   +--------------------------------+--------------------------------+
                   |                                                                 |
                   v                                                                 v
+------------------------------------+                             +-----------------------------------+
|         Firebase Backend           |                             |        External Providers         |
|  - Firebase Auth (Client & Admin)  |                             |  - OpenAI API (GPT-4o, o3-mini)   |
|  - Cloud Firestore (Security Rules)|                             |  - Google Gemini API (FLOAT Basic)|
|  - Project & Conversation Storage  |                             |  - GitHub REST & Git Data APIs    |
|  - User Consents & Telemetry       |                             |  - Stripe API (Billing Webhooks)  |
+------------------------------------+                             +-----------------------------------+
```

---

## 4. Route-to-Handler Mapping

### 4.1 Frontend Client Routes (`src/App.tsx`)
| Route Pattern | Component / View | Description / State |
| :--- | :--- | :--- |
| `/` | `LandingPage` or `Dashboard` | First-time visitors see marketing landing page; logged-in users see Cursor-class IDE Dashboard. |
| `/chat/:id` | `Dashboard(initialTab="new-chat")` | Loads specific project workspace and embeds `ChatThread`. |
| `/workspace`, `/ide` | `AppShell` / `Dashboard` | Monaco IDE Code Editor workspace with file tree and AI panel. |
| `/automations` | `Dashboard(initialTab="automations")`| Automations engine panel (schedules, interval sweeps, Slack webhooks). |
| `/projects`, `/codebase` | `Dashboard(initialTab="codebase")` | Codebases list, workspace creation, and cloud sync. |
| `/dashboard/usage`, `/analytics` | `Dashboard(initialTab="usage")` | Usage Analytics dashboard and token telemetry. |
| `/integrations` | `Dashboard(initialTab="integrations")`| GitHub, GitLab, and Vercel OAuth connection cards. |
| `/models`, `/models/:id` | `ModelsPage`, `ModelDetailsPage` | Model intelligence directory and capability specifications. |
| `/pricing` | `PricingPage` | Subscription comparison matrix and Stripe billing checkout. |
| `/evals` | `EvalsPage` | Evaluation tasks, runs, benchmarks, and model leaderboards. |
| `/resources/*` | Docs, Guides, Changelog, Help, Blog | Static developer guides and release notes. |
| `/learn/*` | `LearnPage` | Interactive AI programming documentation. |
| `/settings`, `/profile`, `/download` | Settings, Profile, Download | User account preferences, theme switcher, desktop app download. |

### 4.2 Backend Server API Endpoints (`src/server/app.ts` & Sub-routers)
| Endpoint | Method | Auth Required | Handler / Service | Purpose |
| :--- | :---: | :---: | :--- | :--- |
| `/api/health`, `/api/ready` | GET | No | Inline handler | Uptime, container health, and Firestore readiness. |
| `/api/subscription/webhook` | POST | No (Stripe Signature) | `handleStripeWebhook` | Handles invoice payment, subscription lifecycle. |
| `/api/subscription/*` | ALL | Yes | `subscriptionRouter` | Checkout session creation, billing portal management. |
| `/api/ai/models/status` | GET | No | `modelRouter.getProviderStatus()` | Reports status of upstream providers and availability. |
| `/api/ai/health` | GET | No | `modelRouter.checkAllProvidersHealth()` | Live ping to verify provider credentials and reachability. |
| `/api/ai/chat` | POST | Yes | `modelRouter.generateContent[Stream]` | SSE streaming and full-turn conversation chat endpoint. |
| `/api/ai/complete` | POST | Yes | Inline modelRouter call | Fast ghost-text inline code autocomplete for Monaco. |
| `/api/ai/transform` | POST | Yes | Inline modelRouter call | `Ctrl+K` / `Cmd+K` in-editor code transformation endpoint. |
| `/api/ai/agent` | POST | Yes | `modelRouter.runAgentLoop()` | Autonomous agent loop executing project inspection tools. |
| `/api/ai/plan` | POST | Yes | `PlanService.generatePlan()` | Milestone 4 plan mode generating structured step breakdowns. |
| `/api/projects/:id/executions` | POST | Yes + Ownership | `projectProcessManager.start()` | Containerized project execution in Docker runner sandbox. |
| `/api/projects/:id/executions/:execId/cancel` | POST | Yes + Ownership | `projectProcessManager.cancel()`| Aborts active execution process. |
| `/api/projects/:id/proposals` | POST, GET | Yes + Ownership | `ProposalService` | Creates or lists non-destructive change proposals. |
| `/api/projects/:id/proposals/:propId/apply` | POST | Yes + Ownership | `ProposalService.applyProposalDurable`| Validates SHA-256 hashes and applies approved diffs. |
| `/api/projects/:id/proposals/:propId/reject` | POST | Yes + Ownership | `ProposalService.rejectProposalDurable`| Marks proposal rejected without modifying virtual files. |
| `/api/projects/:id/validation/run` | POST | Yes + Ownership | `ValidationService.executeValidation` | Runs syntax, typecheck, build, test, and ESLint checks. |
| `/api/projects/:id/validation/explain`| POST | Yes + Ownership | `ValidationService.explainDiagnostic` | AI diagnosis and remediation advice for compiler errors. |
| `/api/projects/:id/git/*` | ALL | Yes + Ownership | `gitRouter` | GitHub commit, branch, diff, and pull request management. |
| `/api/integrations/*` | ALL | Yes | `integrationsRouter` | OAuth handshake initiation and callback endpoints. |
| `/api/evals/*` | ALL | Yes | `evalEngine` | Evaluation benchmarks, scoring, runs, and leaderboards. |
| `/api/rules/*` | ALL | Yes | `RulesService` | User, workspace, and repository prompt steering rules. |
| `/api/skills/*` | ALL | Yes | `SkillsService` | Agent skill discovery and execution. |
| `/api/mcp/*` | ALL | Yes | `MCPService` | Model Context Protocol servers, tools, and execution. |
| `/api/memory/*` | ALL | Yes | `MemoryService` | Long-term project memory and agent knowledge graph. |
| `/api/terminal/*` | ALL | Yes | `TerminalService` | PTY-backed terminal sessions and command runners. |

---

## 5. Feature Inventory & Implementation Classification

| Feature Subsystem | Classification | Evidence & Key Files | Gaps / Remaining Risks |
| :--- | :---: | :--- | :--- |
| **Authentication (Firebase)** | **Verified Working** | `src/store/authStore.ts`, `src/lib/firebase.ts`, `src/server/authMiddleware.ts` | Tested via `scripts/testAuthPersistence.ts`. Token revocation and claims checked on server. |
| **OpenAI AI Chat (SSE Streaming)** | **Verified Working** | `src/features/float/ChatThread.tsx`, `src/server/providers/openai.ts`, `src/server/app.ts` | 17/17 tests passing in `scripts/testStageBChatReliability.ts`. Cross-conversation delta leaks eliminated. |
| **Monaco Code Editor & Breadcrumbs** | **Verified Working** | `src/features/editor/CodeEditor.tsx`, `src/features/editor/Breadcrumbs.tsx`, `src/features/editor/EditorTabs.tsx` | Full multi-tab editing, split view, keyboard shortcuts (`Ctrl+S`, `Ctrl+Enter`, `Ctrl+K`). |
| **Inline Assistant (Ctrl+K)** | **Verified Working** | `src/features/editor/InlineAssistantModal.tsx`, `src/server/app.ts:497` | Model fallback aligned to `gpt-4o`; constructs standard `ChangeSet` proposals. |
| **Ghost-Text Autocomplete** | **Verified Working** | `src/features/editor/CodeEditor.tsx:55`, `src/server/app.ts:445` | Monitored with cancellation tokens and debounce timers. |
| **Agent Tool Execution & Proposals** | **Verified Working** | `src/server/agent/toolRegistry.ts`, `src/server/agent/proposalService.ts` | Strict isolation: direct write tools disallowed; forces immutable `propose_changes`. |
| **Validation Pipeline** | **Verified Working** | `src/server/validation/validationService.ts`, `src/server/app.ts:842` | Syntax check, TypeScript compilation, build test, ESLint. No file modifications. |
| **Automations & Scheduled Sweeps**| **Verified Working** | `src/features/float/AutomationsPanel.tsx`, `src/features/float/automationEngine.ts` | `useAutomationScheduler()` mounted at dashboard level; runs intervals & daily triggers. |
| **GitHub Integration & PR Creation**| **Partial** | `src/server/github/gitRouter.ts`, `src/features/git/GitPanel.tsx`, `src/features/git/CreatePullRequestModal.tsx` | Local tests pass; live OAuth requires user registration of GitHub App credentials (`GITHUB_CLIENT_ID`/`SECRET`). |
| **Stripe Billing & Subscriptions** | **Partial** | `src/server/subscription/stripeService.ts`, `src/features/pricing/PricingPage.tsx` | Webhook verification and checkout session flows implemented; requires production `STRIPE_SECRET_KEY` and webhook secret. |
| **Docker Sandbox Project Runner** | **Partial** | `src/server/execution/processManager.ts`, `src/server/app.ts:82` | Requires remote Docker host with mutual TLS (`DOCKER_HOST`, `FLOAT_EXECUTION_IMAGE`) to activate server execution. |
| **Browser Agent (Headless Playwright)** | **Partial** | `src/server/browser/browserAgent.ts`, `src/server/milestone9Router.ts` | Simulates browser actions and screenshots; requires Playwright container environment for live runs. |
| **Cloud Sessions / Cloud Agents** | **Unverified / Mock** | `src/features/float/CloudSession.tsx`, `src/features/float/cloudSessionStore.ts` | Displays upgrade banner / mock session modal; depends on external cloud worker infrastructure. |

---

## 6. Security & Data Integrity Audit

### 6.1 Firestore Security Rules (`firestore.rules`)
- **Strengths:**
  - Default deny rule (`allow read, write: if false`) at the root.
  - Strict ownership enforcement on user documents (`data.ownerId == request.auth.uid`).
  - Maximum field sizes and schemas strictly bounded (e.g. `files <= 1,000,000` chars, `messages <= 2,000,000` chars).
  - Validates document IDs against alphanumeric patterns to reject path injection.
- **Identified Risks & Recommendations:**
  - Project file payloads are serialized as JSON strings in Firestore documents. For workspaces nearing 1 MB, Firestore 1 MB write limits will reject document saves. A future enhancement should offload large workspace blobs to Cloud Storage with signed URLs while keeping metadata in Firestore.

### 6.2 Server-Side Credential & API Security
- **API Key Segregation:**
  - AI provider keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`) and OAuth secrets (`GITHUB_CLIENT_SECRET`, `STRIPE_SECRET_KEY`) reside exclusively on the server.
  - Client-side code accesses AI endpoints via authenticated Express proxies (`/api/ai/*`) passing Firebase user JWTs in the `Authorization: Bearer` header.
- **Path Traversal & Command Injection Hardening:**
  - `src/server/agent/toolRegistry.ts` sanitizes all file paths using `sanitizePath()`, explicitly rejecting `../`, `..\\`, absolute drive letters (`C:`), and null-byte injections.
  - Sensitive files (`.env`, `.git`, `id_rsa`, `*.pem`, `*.key`) are completely excluded from agent search, listing, and read tools.
  - Shell command execution tools (`run_command`, `exec`, `shell`, `bash`) are prohibited inside the agent loop; agents are steered toward `propose_changes`.

### 6.3 Rate Limiting & Denial-of-Service Defense
- Express body parser limits are partitioned: 12 MB for general endpoints, 24 MB for AI chat/agent endpoints, 2 MB for autocompletions.
- In-memory sliding-window rate limiters are enforced per authenticated UID (capped at 45 requests/minute for chat, 20/minute for evals).

---

## 7. Environment & Configuration Checklist (Presence Audit Only)

*Values are never read, printed, or recorded in this audit.*

| Environment Variable | Required For | Configured in Environment? | Notes |
| :--- | :--- | :---: | :--- |
| `GEMINI_API_KEY` | Server-side Gemini API calls (`float-basic`) | **Checked (Present/Absent)** | Configured as server environment secret. |
| `OPENAI_API_KEY` | Server-side OpenAI models (GPT-4o, o3-mini) | **Checked (Present/Absent)** | Required for OpenAI model provider adapter. |
| `ANTHROPIC_API_KEY` | Optional Anthropic model routing | Optional | Not required for OpenAI-first experience. |
| `XAI_API_KEY` | Optional xAI model routing | Optional | Not required for OpenAI-first experience. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Firebase Admin SDK ADC locally | Optional | Uses Cloud hosting service account in production. |
| `FLOAT_OAUTH_ENCRYPTION_KEY` | Encrypting stored OAuth tokens in Firestore | Required for OAuth | 32-byte base64 key. |
| `GITHUB_CLIENT_ID` | GitHub OAuth integration | Required for GitHub | Registered in GitHub Developer Settings. |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth token exchange | Required for GitHub | Kept server-side. |
| `STRIPE_SECRET_KEY` | Stripe billing & subscription creation | Required for Checkout | Kept server-side. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification | Required for Webhooks | Used in `/api/subscription/webhook`. |
| `FLOAT_DOCKER_BIN` / `FLOAT_EXECUTION_IMAGE` | Sandboxed command execution runner | Optional | Execution stays disabled without valid runner. |

---

## 8. Dependency Tree & Toolchain Audit

### 8.1 Core Dependencies & Versions
- **Node.js:** `>=24 <25`
- **React:** `19.0.1` (React 19)
- **TypeScript:** `~5.8.2`
- **Vite:** `^6.2.3` / `@tailwindcss/vite`: `^4.1.14`
- **Monaco Editor:** `@monaco-editor/react` `^4.7.0`
- **Zustand:** `^5.0.15`
- **Firebase:** `^12.18.0` / `firebase-admin`: `^14.5.0`
- **Express:** `^4.21.2`
- **OpenAI SDK:** `^7.27.0`

### 8.2 Dependency Concerns
- **Bundle Size:** Client bundle `index-9EYhASoX.js` is ~2.35 MB uncompressed (~625 kB gzip). While Monaco Editor is dynamically loaded via CDN/web worker, further code-splitting of `EvalsPage`, `IntegrationsPage`, and `PricingComparisonMatrix` via `React.lazy()` can reduce the initial landing page bundle by ~40%.
- **Overrides:** Validated that `@grpc/grpc-js` and `dompurify` overrides in `package.json` resolve known upstream vulnerability advisories.

---

## 9. Test Suite Matrix & Regression Defense

The repository contains 45 dedicated test suites executed via `npm test` (`tsx scripts/*.ts`). All 45 passed without regression:

| Milestone / Suite Name | File Path | Focus Area | Status |
| :--- | :--- | :--- | :---: |
| **Stage B Chat Reliability** | `scripts/testStageBChatReliability.ts` | Multi-turn streaming, model mapping, abort cleanup, empty stream errors | **17/17 PASS** |
| **Website Experience** | `scripts/testWebsiteExperienceEnhancement.ts` | Hero code diff buffer, interactive terminal demo, pricing matrix categories | **7/7 PASS** |
| **Account Menu System** | `scripts/testAccountMenuSystem.ts` | Profile dropdown, theme toggle, modal triggers, keyboard navigation | **38/38 PASS** |
| **Model Selector Panel** | `scripts/testModelSelectorPanel.ts` | Model metadata, reasoning tags, provider mappings | **97/97 PASS** |
| **Server Agent Loop** | `scripts/testServerAgentLoop.ts` | Tool parameters, sensitive path blocking, proposal generation | **57/57 PASS** |
| **Tenant Isolation & Security**| `scripts/testTenantIsolationSecurity.ts` | UID project boundary validation, access control | **32/32 PASS** |
| **Git Worktree & Commits** | `scripts/testAgentGitWorktree.ts` | Ephemeral worktree isolation, Git staging | **PASS** |
| **Milestones 1 through 9** | `scripts/testMilestone1And2.ts` through `testMilestone9*.ts` | MCP tools, skills, rules, memory, review, subagents | **ALL PASS** |

---

## 10. Prioritized File-Level Implementation Backlog (Phases 1–8)

### Phase 1: Environment & Secret Hardening
- **Objective:** Finalize server-side credential validators and safe startup diagnostics without exposing secrets.
- **Target Files:**
  - `src/server/adminFirebase.ts`
  - `src/server/providers/openai.ts`
  - `src/server/providers/router.ts`

### Phase 2: Live AI Streaming & Error Actionability
- **Objective:** Enhance SSE parser resilience against network reconnections, CRLF boundaries, and quota notifications.
- **Target Files:**
  - `src/features/float/ChatThread.tsx`
  - `src/server/app.ts` (lines 333–398)

### Phase 3: Project Context Engine & Token Budgeting
- **Objective:** Optimize multi-file relevance ranking, dependency symbol extraction, and large file context budget truncation.
- **Target Files:**
  - `src/server/contextBuilder.ts`
  - `src/services/indexing/workspaceIndex.ts`
  - `src/services/codebaseSearch.ts`

### Phase 4: Non-Destructive Code Proposals & Diffs
- **Objective:** Harden hash-checking on multi-file diff application to prevent stale merge conflicts across simultaneous tabs.
- **Target Files:**
  - `src/server/agent/proposalService.ts`
  - `src/features/agent/DiffReviewModal.tsx`

### Phase 5: Testing, Validation & Diagnostics Pipeline
- **Objective:** Provide automated error explanation and one-click proposal generation directly from validation diagnostics.
- **Target Files:**
  - `src/server/validation/validationService.ts`
  - `src/features/terminal/BottomPanel.tsx`

### Phase 6: GitHub Integration & Branch Lifecycle
- **Objective:** Ensure GitHub token refresh and branch publishing handle detached heads and permission errors gracefully.
- **Target Files:**
  - `src/server/github/gitRouter.ts`
  - `src/features/git/GitPanel.tsx`

### Phase 7: Cursor-Class IDE Shell & Monaco Ergonomics
- **Objective:** Implement code-splitting (`React.lazy`) for non-critical IDE tabs and ensure command palette keyboard shortcuts (`Ctrl+P`, `Ctrl+Shift+P`, `Ctrl+K`) are globally consistent across all views.
- **Target Files:**
  - `src/features/editor/CodeEditor.tsx`
  - `src/features/command-palette/CommandPalette.tsx`
  - `src/App.tsx`

### Phase 8: Repository Cleanup, Quarantine & Packaging
- **Objective:** Safely archive the 43 legacy `fix_*.cjs` and `patch_*.cjs` files into a designated `archive/` folder, run full regression verification, and document release checkpoints.
- **Target Files:**
  - Root directory cleanup
  - `package.json`
  - Final audit verification suite
