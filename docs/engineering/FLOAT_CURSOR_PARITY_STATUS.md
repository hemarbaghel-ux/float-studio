# FLOAT Cursor Parity Engineering Ledger

## Current baseline

- Repository: `C:\Users\ADMIN\Documents\ChatGPT\Float\float-studio-mainline`
- Active branch: `codex/float-cursor-build`
- HEAD at start of this work: `4c400b19baf8c20d50e7845f74db80c70ce4e876`
- Fetched `origin/main`: `fa05cef1caf0346192bba4a8b085ba300288a521`
- Relationship: local HEAD is an ancestor of `origin/main`; 0 ahead, 1 behind. The remote commit updates Docker/CI and a large portion of the application. No branch synchronization was performed; subsequent changes are on the current branch only.
- Worktree was clean before implementation. The outer workspace repository and the older `float-studio` worktree were not modified.
- Baseline checks before changes: `npm ls --depth=0`, `npm run lint`, `npm test`, and `npm run build` all exited 0. Build reports the existing 2.8 MB main JavaScript chunk warning. The test suite's mocked security checks log expected Firebase credential/certificate-unavailable cases while verifying fail-closed behavior.

## Phase status

### Phase 0 — Repository baseline and source-of-truth verification: PARTIAL

Repository identity, branch ancestry, package scripts, dependency tree, and initial quality baseline were verified. A repository-wide feature inventory and complete security/database review remain outstanding.

### Phase 1 — Model registry, provider routing, and genuine AI execution: PARTIAL

Implemented on the current branch:

- Added `src/server/providers/modelRegistry.ts` as the backend route and selectable-model authority. GPT-6 model descriptors include exact upstream IDs, protocol, capabilities, environment variable name, and official model metadata. Legacy provider routing remains explicit and does not silently switch providers.
- Added `GET /api/ai/models`; the client consumes its safe catalog in `src/store/aiStore.ts`. Credential presence is reported separately from model-level access, which remains `unverified` until a real provider request succeeds.
- Derived the dashboard GPT-6 choices from the verified model catalog, removed the duplicate hard-coded FLOAT Basic descriptor and stale GPT-6 cloud-session/fallback claims, corrected model context/output/pricing metadata, and separated the FLOAT Free plan label from non-zero provider token pricing. A later product decision removed the FLOAT Basic model from the selectable/server catalog entirely.
- GPT-6 chat uses the OpenAI Responses API for request, output, SSE delta, completion, error, and abort handling. Agent execution is retired from the product; legacy adapter and runner modules remain disconnected and are not supported workflows.
- All OpenAI model calls use the documented `OPENAI_API_KEY` server credential and standard OpenAI API headers; GPT-6 no longer receives hard-coded session/environment headers or model-specific credential substitution.
- The `/chat/:id` thread no longer routes `float-agent` requests through a Gemini fallback. Normal chat requires authentication and sends the selected model through the shared chat endpoint; retired agent requests return explicit unavailable errors.
- Retired the Gemini-only streaming endpoint with an explicit `410 MODEL_NOT_FOUND` response, replaced the old Gemini browser service's fabricated success fallback with an explicit unsupported-provider error, and removed unreferenced duplicate `floatAgent`, legacy server agent/router, and uppercase duplicate provider adapter modules.
- Corrected the model information card so an unknown model status is not rendered as “Available.”
- Added regression coverage for exact model/protocol selection, server catalog truthfulness, Responses API payloads, fragmented SSE reads, incremental output, and provider error normalization without fallback. Updated the opt-in GPT-6 credential check to match the standard Responses API; it was not run because no provider credential is configured.

Still outstanding in Phase 1:

- Only OpenAI is registered in the active router. Gemini, Anthropic, and xAI adapters exist elsewhere but are not integrated through the server registry/runtime; those models remain unsupported.
- `src/server/analystRouter.ts` now uses the app's shared `ModelRouter`; selected model IDs are preserved, provider failures return explicit errors, malformed/incomplete model reports do not become successful reports, and data-sharing consent uses the shared server privacy guard. CSV metrics/charts are computed server-side without claiming a Python sandbox.
- `src/store/modelIntelligenceStore.ts` no longer marks every model `AVAILABLE` when a provider credential is merely configured; model access remains `UNKNOWN` until that specific model is verified.
- Provider credentials and model-level access were not live-tested in this environment.
- The default/provider health path does not yet distinguish authentication success from account access to each selectable model.
- Agent-specific model assignments still contain fallback fields in the UI/data model, although the active request path does not execute a fallback.

### Phases 3–10 — NOT STARTED

The persistence work below is an initial compatibility-safe slice; the remaining Phase 2 work and Phases 3–10 are still not started.

### Phase 2 — Conversation persistence: INITIAL SLICE IMPLEMENTED, NOT ACCEPTED

- Cloud conversation history is now written as generation-tagged per-message Firestore documents, avoiding the previous latest-24-message-only cloud history.
- The parent conversation retains a bounded latest-message snapshot for older clients and carries the total `messageCount` for list views.
- A generation manifest is published only after all message batches finish; readers use the previous complete generation during interrupted saves, reject mixed generations, and fall back to the bounded legacy snapshot when no complete generation exists.
- Message serialization checks UTF-8 byte sizes before cloud writes. Individual records over the safe document size remain in the local cache and are reported in server logs.
- Conversation deletion removes child documents in bounded batches before deleting the parent.
- Firestore rules now enforce parent ownership and bounded schemas for message and manifest documents.
- Focused helper tests cover ordering, incomplete generations, malformed sequences, UTF-8 sizing and document limits.
- Not yet verified against the Firestore Emulator or a live authenticated Firebase project. Cross-tab/network-interruption behavior and migration recovery need emulator-backed tests before acceptance.

## Files changed in this implementation slice

- `src/server/providers/modelRegistry.ts` — authoritative selectable models, route aliases, protocols, and safe public catalog.
- `src/server/providers/router.ts` — routes resolve from the registry and propagate exact API model/protocol metadata.
- `src/server/providers/openai.ts` — Responses API chat/stream adapter path and registry-driven protocol selection.
- `src/server/agent/portableAgentRunner.ts` — Responses API agent tool loop and incremental SSE parsing.
- `src/server/providers/base.ts` — protocol metadata in provider request and agent contracts.
- `src/server/app.ts` — safe model catalog endpoint.
- `src/store/aiStore.ts` — server catalog consumption and truthful access state.
- `src/data/verifiedModels.ts`, `src/features/dashboard/dashboardModels.ts` — corrected shared metadata and derived dashboard models.
- `src/features/ai/registry.ts` — derive initial selectable models from the shared catalog instead of a second FLOAT Basic object.
- `src/features/ai/modelSelector/ModelInfoCard.tsx` — unknown status is no longer treated as success.
- `scripts/testPortableAgentRunner.ts`, `scripts/testProviderRoutingAndHealth.ts`, `scripts/testModelSelectorPanel.ts`, `scripts/testFloatBasicModel.ts` — focused regressions and updated stale assertions.
- `scripts/testProviderRoutingAndHealth.ts` — verifies that configured credentials do not promote every selectable model to available.
- `scripts/testSimulatedAIBehaviorRemoval.ts`, `scripts/testAstraEnvironmentKey.ts` — Responses API error test stubs and standard API credential/protocol verification.
- `src/features/float/ChatThread.tsx`, `src/services/gemini.ts`, `src/server/app.ts` — remove unauthenticated synthetic chat fallback and retire Gemini-only chat route.
- Deleted unreferenced `src/services/floatAgent.ts`, `src/server/agent.ts`, `src/server/providers/ModelRouter.ts`, `src/server/providers/OpenAIAdapter.ts`, `src/server/providers/GoogleGeminiAdapter.ts`, and `src/server/providers/AnthropicAdapter.ts` after confirming no application imports.
- `scripts/testSimulatedAIBehaviorRemoval.ts`, `scripts/testPhaseASecurityRegression.ts` — assert no fabricated legacy Gemini success and explicit retired-route response.
- `src/server/analystRouter.ts`, `src/server/app.ts`, `src/features/analyst/DataAnalystWorkspace.tsx`, `src/features/analyst/ReportViewer.tsx`, `src/features/analyst/types.ts` — route Analyst generation through the shared model runtime; compute and label actual CSV statistics; remove fabricated sandbox progress, output, and confidence claims; display selected provider/model and clear errors.
- `scripts/testPhaseASecurityRegression.ts` — authenticated Analyst HTTP coverage for exact model ID/provider reporting, shared privacy-consent parsing, computed row count, no fake sandbox/confidence fields, and unavailable-model errors.
- `src/services/conversationService.ts`, `src/services/conversationCloudMessages.ts`, `firestore.rules` — complete per-message cloud history, bounded legacy snapshot, generation validation, and owner-scoped access.
- `scripts/testConversationCloudMessages.ts`, `package.json` — focused persistence tests included in the standard suite.

## Persistence and migration state

- No remote data migration was applied. Existing parent conversation documents remain readable; new saves create the message subcollection lazily.
- Firestore rule changes have not been deployed. The repository does not have Firebase CLI/Emulator installed in this worktree, so rules compilation and authenticated emulator checks remain outstanding.
- No rollback is needed for persisted data. Source rollback is limited to reverting this uncommitted change set after review.

## Live and execution verification

- No live OpenAI, Gemini, Anthropic, or xAI request was made. The test environment reported OpenAI as not configured; provider protocol tests use a local mocked HTTP response and do not count as live verification.
- Terminal isolation was not implemented or re-verified here. Existing tests report sandbox unavailable when Docker is unavailable and do not claim actual isolated command execution.
- Durable worker deployment and background execution after server restart were not verified.
- Final local checks after the Phase 1 slice: `npm ls --depth=0`, `npm run lint`, `npm test`, `npm run build`, and `git diff --check` all exited 0. The production build continues to report the pre-existing oversized main JavaScript chunk warning (about 2.8 MB). `git diff --check` reports no whitespace errors; Git prints its normal LF-to-CRLF notice for `src/features/dashboard/dashboardModels.ts`.
- Focused final regression suites passed: `scripts/testPortableAgentRunner.ts`, `scripts/testProviderRoutingAndHealth.ts`, `scripts/testModelSelectorPanel.ts`, `scripts/testSimulatedAIBehaviorRemoval.ts`, and `scripts/testFloatBasicModel.ts`. `scripts/testAstraEnvironmentKey.ts` is an opt-in live credential test and was not run because no provider credential is configured.

## Continuation update — agent-free model chat and full thread history

- The product request now removes agent selection/execution surfaces and browser-entered API keys. The selectable UI catalog contains only GPT-6 Astra and GPT-6.1 Sol; both route through the OpenAI provider. Model access remains unverified until an actual provider response.
- `/api/ai/agent`, `/api/ai/plan`, `/api/agents/*`, and `/api/session/*` are unavailable; server legacy implementation files remain in the worktree but are not mounted as active workflows. Evals, cloud sessions, and scheduled agent task navigation were removed from the product UI.
- No server-side `OPENAI_API_KEY` is configured in this worktree. The credential pasted into the conversation must be revoked and rotated; no live model request was made with it.
- Found and fixed a Phase 2 persistence defect in `src/features/float/ChatThread.tsx`: the coding-chat autosave passed only the latest 24 messages to the per-message Firestore writer. The shared `mapThreadMessagesForCloud` mapping now retains the entire thread. Its restore path also maps the persisted `latency` field to the UI's `latencyMs` field.
- Added a focused 40-message mapping/serialization regression to `scripts/testConversationCloudMessages.ts`.
- Continuation checks: `npx tsx scripts/testConversationCloudMessages.ts` exited 0; `npm run lint` exited 0; `npm run build` exited 0. The build still reports the large main JavaScript chunk warning. `git diff --check` exited 0 with Git's existing line-ending normalization notices.
- The full `npm test` suite now exits 0. Its first run found seven stale cloud-session expectations after the feature was retired; `/api/session/*` now authenticates and returns 410, and the HTTP security regression checks that explicit behavior. The full rerun passed, including the 40-message persistence regression. Many legacy agent subsystem tests remain in the suite and exercise dormant internal modules; they do not demonstrate that agent product workflows are active.
- Verified the two selectable model IDs, context/output limits, pricing and reasoning-effort options against the official OpenAI API model pages. Removed guessed “Balanced”, “High”, and “Fast” labels from the model selector; it displays the verified reasoning capability instead. The model selector regression remains 42/42 passing.
- After that metadata/UI correction, `npm run lint` and `npm run build` both exited 0. The production build retains the large-chunk warning. The full suite was not rerun after this narrow selector-label change; its focused selector test was rerun and passed.
- The 40-message test is local helper evidence only. Firestore write/read behavior, owner isolation, concurrent generation recovery, and deletion still require Firebase Emulator or authenticated-project verification. Phase 2 remains unaccepted.

## Continuation update — cloud save visibility and retired agent shortcut

- `ConversationService.syncToCloud` now returns a typed outcome (`synced`, `local-only`, or `failed`) while preserving the local cache. Main coding chat displays whether it is saving, synced, limited to local storage, or failed to sync. It does not show an older attempt's result after a newer save or conversation switch.
- Added regression assertions for all cloud-save outcome labels in `scripts/testConversationCloudMessages.ts`. This validates UI status mapping, not a live Firestore write.
- The IDE Ctrl/Cmd+I shortcut previously dispatched a retired `mode: "agent"` event. The composer accepted the event without validating the mode union, so this shortcut could put a stale agent mode into chat requests. Both IDE and editor shortcuts now open/focus the normal chat composer; the dead mode event listener was removed.
- Added a regression in `scripts/testStage1Navigation.ts` proving neither shortcut dispatches the retired agent mode.
- Verification for this continuation: full `npm test` exited 0 before the shortcut follow-up; focused `scripts/testStage1Navigation.ts` passed 9/9 after the shortcut change; `scripts/testConversationCloudMessages.ts` exited 0; `npm run lint` exited 0; `npm run build` exited 0 with the existing >500 KB bundle warning; `git diff --check` exited 0 with Git line-ending notices only.
- Agent UI/API navigation remains retired, but legacy feature components, endpoint handler bodies after early 410 returns, tests, and marketing/documentation claims remain in the repository. They are not evidence that agent workflows are active. The source-level retirement and stale product claims need a dedicated cleanup pass.

## Continuation update — frontend agent surface removal and API retirement cleanup

- Removed the disconnected agent workspace, task/activity/assignment screens, Agent selector and manager, PlanCard, cloud-session UI/store, agent assignment/event-stream client services, and AI-store selected-agent/catalog state. The AI model store now contains model selection only.
- Removed the disconnected agent-comparison evaluation page and its agent selection dialog. The separate model evaluation view and backend evaluation service remain independent.
- Moved the SSE parser used by the legacy server-runner regression into `src/server/agent/sseParser.ts`; it is no longer located in the client AI feature directory.
- Replaced unreachable `/api/ai/agent` and `/api/ai/plan` handler bodies (which returned 410 before hundreds of lines of dead execution code) with small authenticated 410 handlers. `/api/agents/*` remains authenticated and retired. Standard chat and project proposal/apply routes remain mounted.
- Removed the landing page's agent/subagent, cloud-session, and fake ongoing-task sections; removed old model names and the UI depiction of an Agent mode; updated claims to the two selectable GPT-6 models and server-side access requirements.
- Fixed the IDE Ctrl/Cmd+I shortcut previously dispatching the retired agent mode; it now opens and focuses normal chat. Added regression coverage.
- Verification: final `npm test`, `npm run build`, and `npm run lint` each exited 0; final `git diff --check` exited 0 with line-ending normalization notices only. The build retains its >500 KB main-chunk warning. Focused `scripts/testPhaseASecurityRegression.ts` passed 65/65; `scripts/testStage1Navigation.ts` passed 9/9; `scripts/testModelSelectorPanel.ts` passed 42/42; `scripts/testPortableAgentRunner.ts` passed.
- Agent removal is still not source-complete: legacy server agent runners/orchestrator modules and tests remain disconnected from active routes, and several learn/resources/feature-documentation pages still describe retired agent workflows. No server provider credential is configured, so real model access remains unverified. Do not treat the full legacy agent test suites as evidence those product features are active.

## Continuation update — strict execution model allowlist

- The server previously advertised only GPT-6 Astra and GPT-6.1 Sol in `/api/ai/models` but still accepted legacy OpenAI IDs and the retired FLOAT Basic alias through direct API requests. This allowed callers to bypass the UI selector.
- `src/server/providers/modelRegistry.ts` now builds executable routes only from descriptors marked selectable, plus the explicit `auto` alias. GPT-4o, GPT-4o-mini, o1, FLOAT Basic, and retired GPT-6 aliases now fail with `MODEL_NOT_FOUND` instead of reaching a provider.
- Removed `ModelRouter.runAgentLoop` and the registry's `agentSupported` capability advertisement. `/api/ai/agent`, `/api/ai/plan`, `/api/agents/*`, browser-agent, coordinator, and automation routes are retired. The remaining underlying runner/provider implementation and historical tests are still present but disconnected; agent removal is not source-complete.
- `EvalEngine` now accepts only the two selected model IDs. Provider routing, chat reliability, Phase 7, and master audit regressions cover exact routing and legacy-ID rejection. `npm run lint`, `npm test`, `npm run build`, and `git diff --check` each exited 0 after this change. Build still warns about the >500 KB main bundle; diff check reported only existing line-ending notices.
- Removed the `runAgentLoop` contract and implementations from provider adapters. The only external agent routes remain explicit authenticated 410 responses; direct callers of `ModelRouter` cannot start an agent run.
- Removed the client supplied `workflowMode` from the chat request contract and ContextBuilder. A forged legacy `workflowMode: agent` value is ignored; chat cannot activate retired agent prompt instructions. The chat UI's Ask and Debug guidance remains ordinary chat behavior and does not execute tools or modify files.
- Updated routing and E2E regressions to assert the runtime route allowlist, missing adapter agent method, and absence of agent workflow prompt injection. Focused checks passed: provider routing 77/77, Milestone 9 E2E 5/5, and portable runner legacy assertions passed (the legacy runner remains disconnected from adapters/routes).
- Final verification after this slice: `npm run lint` exit 0; `npm test` exit 0 (all configured suites completed, including legacy agent-oriented suites); `npm run build` exit 0; `git diff --check` exit 0 with line-ending normalization notices only. Production build still reports the existing >500 KB main chunk warning.
- No `OPENAI_API_KEY` exists in the process environment or local env files. The credential pasted into chat was not stored or used; it must be revoked and rotated before configuring a new server-side secret. No live model access is verified.

## Continuation update — usage telemetry provenance and synthetic-data removal

- Removed the generated sample-usage dataset, its usage-dashboard load buttons, and the silent dashboard seeding path. The obsolete `sampleUsageData.ts` file is deleted.
- Usage-store hydration filters legacy records written by the old preview generator (`sample-req-*` and `preview-developer`) while preserving genuine provider records. New records still enter the store only when chat receives upstream token usage metadata.
- Replaced the fallback-savings widget with recorded request/token counts, measured response latency, and a rate-based estimated-cost label. Removed invented Gemini fallback savings, hard-coded avoided-cost rates, and the false “operational” status for providers that were not returned by the server.
- Usage analytics no longer combines evaluation leaderboard averages with real chat usage or fabricates input/output splits from average token counts. Unrecognized provider values remain “Unknown” instead of being attributed to Google.
- Updated a subset of account, onboarding, download, and model-page copy that claimed unsupported agent behavior. The remaining agent source modules, legacy tests, and stale resource/pricing/learn copy still require a separate retirement pass; active app routes remain retired as documented above.
- Regression: `scripts/testUsageTelemetryIntegrity.ts` now verifies sanitizer behavior, actual persisted-store hydration, absence of sample injection from the usage screens, and removal of fabricated provider/savings claims (9 assertions).
- Verification: `npm test` exited 0 with the initial telemetry regression version; then `npx tsx scripts/testUsageTelemetryIntegrity.ts` exited 0 after adding actual persisted-store hydration coverage. Final `npm run lint` exited 0; `npm run build` exited 0 with the existing >500 KB main chunk warning; final `git diff --check` exited 0 with line-ending notices only. No live provider request was made; provider credentials remain unavailable.

## Next task

Finish Phase 1 acceptance by adding per-model authentication/access checks and extending Analyst failure-path tests; a genuine provider request remains blocked until a rotated server credential is safely configured. Accept Phase 2 persistence only after Firebase Emulator tests prove owner isolation, parent/child rules, complete-history refresh, stale-generation rejection, cancellation/error recovery, multi-batch writes, and deletion. Then continue the coding-workspace roadmap through context/Brain, proposal review, IDE editing, sandbox execution, Git workflow, integrations, and full E2E/CI. FLOAT's current product direction excludes autonomous agent features; keep legacy agent internals disconnected and make no capability claim without live evidence.

## Continuation update — source-level agent retirement

- Removed the disconnected server agent orchestrator, task persistence, tool registry, autonomous and portable runners, plan services, subagent coordinator, agent worktree helpers, agent-only SSE parser, cloud-agent config, and unused agent types.
- Removed the agent-specific GitHub task branch / pull-request functions. Standard project Git integration remains.
- Moved the shared proposal service and persistence module into `src/server/proposals/`; moved the diff review modal into `src/features/proposals/`. Chat and editor continue to use explicit proposal review and apply/reject.
- Removed agent-only regression scripts and removed them from `npm test`. Retained proposal, chat, route-retirement, model routing, persistence, and project isolation coverage.
- The authenticated legacy agent and plan endpoints still return explicit 410 responses. They do not execute an agent or silently redirect to another workflow.
- No API credential was read, stored, or used. The credential shared in chat should be revoked and rotated before setting a server-side environment variable.
- Verification after source retirement: `npm run lint` exited 0; `npm test` exited 0 (all configured suites); `git diff --check` exited 0 with line-ending normalization notices. Production build still pending for this continuation.
- Remaining cleanup is limited to stale historical/help/marketing copy that still mentions agent modes or agent capabilities; those descriptions are not connected to active agent execution. User-facing help copy should be reconciled separately if those references must also disappear.

## Continuation update — bounded local chat context

- The main chat previously serialized every safe workspace file as an explicit context item on every prompt. The backend's context budget limited prompt size, but it did not stop irrelevant files from being submitted.
- `src/features/float/chatContext.ts` now keeps workspace contents local and creates chat context from explicitly `@mentioned` files (up to 8,000 characters each) plus at most six locally retrieved, bounded code excerpts for code-oriented prompts. Sensitive/traversal paths are filtered through the existing path sanitizer. Ordinary messages such as `Hello` attach no workspace files.
- `src/features/float/ChatThread.tsx` now uses this builder for `/api/ai/chat`; model routing and UI design were not changed. Retrieval is local lexical/codebase search, not embedding-based semantic retrieval, and prompts that do not match the current intent/symbol heuristics receive no automatic retrieval context.
- Added `scripts/testChatContextSelection.ts` (9 assertions) and included it in `npm test`. It verifies relevant retrieval, bounded excerpt-only automatic context, unrelated file exclusion, secret-file exclusion, greetings with no file context, explicit `@file` context, and continued retrieval alongside explicit files.
- Verification for this continuation: full `npm test` exited 0 (including the new context selection suite); `npm run lint` exited 0; `npm run build` exited 0 with the existing large main JavaScript chunk warning (2,495.47 kB); `git diff --check` exited 0 with line-ending normalization notices only.
- No provider credential was accessed and no live AI request was made. This verifies client-side context selection and existing mocked/local coverage only; it does not establish provider availability, live chat success, or Firestore persistence.

## Continuation update — exact per-model provider listing checks

- The OpenAI health check previously treated any returned model ID (including retired `gpt-4o`/`o1`) as proof that FLOAT's selectable models were available. It also reported `gpt-4o` as its default health model even though the active route allowlist is GPT-6 Astra and GPT-6.1 Sol.
- `OpenAIAdapter.checkHealth()` now compares the provider's returned model IDs against the exact selected upstream IDs. It reports each selected model as `listed`, `not_listed`, `unverified`, or `configuration_required`, and includes the exact upstream ID. Legacy model access no longer implies selected model access.
- The health result deliberately keeps `modelAvailable: false`: a model listing does not establish that a genuine generation request succeeds. Per-model detail says whether the ID was listed while clearly stating that generation is unverified.
- The Models page now consumes `/api/ai/health` and displays these exact per-model results. A configured key no longer causes `ModelDetails` to claim “Available in FLOAT”; model selection remains possible while access is unverified.
- Added `scripts/testOpenAIModelAccess.ts` with 19 assertions for exact model IDs, legacy-only listing, authentication failure, missing configuration, and the distinction between a listed ID and verified generation. Added this suite to `npm test`; expanded `testProviderRoutingAndHealth.ts` to check the UI state mapping. Updated the standalone `scripts/testOpenAIIntegration.ts` routing and catalog expectations to the two selectable models, and its mocked checks pass 78/78.
- OpenAI's official model pages list `gpt-6-astra` and `gpt-6.1-sol` and document Responses API support, streaming, function calling, and their context/output limits. This documentation does not confirm the current account's access. No credential was read or used, and no live generation request was made.
- Verification after this continuation: `npm test`, `npm run lint`, `npm run build`, and `git diff --check` all exited 0. Focused `scripts/testProviderRoutingAndHealth.ts` passed 78/78 and `scripts/testOpenAIModelAccess.ts` passed 19/19. Build retains the existing large main bundle warning (2,495.49 kB). No live credential or generation request was available, so model access remains unverified.

## Continuation update — app-wide agent retirement and two-model catalog

- Removed stale agent-mode/workflow entries from the rendered Help, Docs, Guides, Community, Learn, Pricing, Changelog, and feature-page surfaces. Learning articles and glossary entries containing retired agent copy are excluded from public navigation and direct article lookup. Agent-only pricing rows and changelog milestones were removed.
- Removed the simulated code-edit and terminal-agent showcases from the landing page so those demonstrations cannot be mistaken for live FLOAT execution.
- Disabled the authenticated `/api/evals/*` prefix with an explicit `410 AGENTS_UNAVAILABLE` response and removed its startup recovery timer and executable route handlers, preventing old evaluation runs from resuming agent work. Existing persisted evaluation data was not deleted. Legacy evaluation UI/source modules remain disconnected from the app router.
- Removed public evaluation links and added a clear unavailable page for legacy `/evals` and `/models/evals` URLs. Removed the model catalog's claim that FLOAT first-party evaluation runs were part of its source-verification hierarchy.
- `src/data/verifiedModels.ts` now contains only GPT-6 Astra and GPT-6.1 Sol. The client and server catalogs derive from these two entries; the removed FLOAT Basic alias no longer has an upstream rewrite, and empty model IDs no longer default to GPT-4o.
- Removed stale provider-key entry copy from feature descriptions. Browser custom provider-key UI was already removed in the preceding slice; credentials remain server-side only.
- Updated routing and website regression assertions for the two-model catalog, unavailable removed model, retired eval endpoint, agent-free public catalog, and changelog.
- Verification after the direct-URL/public-link cleanup: `npm test` exited 0 (the configured serial suite chain completed, including the updated chat reliability and website experience suites); `npm run lint` exited 0; `npm run build` exited 0; `git diff --check` exited 0 with line-ending notices only. Build warns about the 2,451.80 kB main JS chunk. No OpenAI environment credential was present (only `.env.example` at repository root), so no live provider call was made. The credential previously pasted into chat was not stored or used; it should be revoked and replaced with a new server-side secret.
- Remaining: legacy evaluation UI/source modules and persisted evaluation records are retained but disconnected; verify genuine GPT model access after a rotated server credential is configured. No commit, push, or deployment was made.

## Continuation update — proposal review request failures

- The proposal review modal previously swallowed rejection network failures and ignored non-2xx HTTP responses, then marked the proposal rejected and closed the dialog. This could present an unsuccessful server-side rejection as completed.
- Added an authenticated proposal rejection request helper that encodes route IDs, checks HTTP status, surfaces server errors, and propagates network failures. Apply now uses the shared `apiFetch` authentication helper as well, so token acquisition failures are shown through the existing review error state instead of sending an empty bearer token.
- Added `scripts/testProposalReviewRequests.ts` and included it in the normal test chain. It covers encoded IDs, method, API error payloads, invalid JSON errors, and network failure propagation.
- Verification: focused proposal request tests passed 5/5; `npm run lint`, full `npm test`, `npm run build`, and `git diff --check` exited 0. Build retains the existing large main bundle warning. This verifies client request behavior and local regression coverage, not live Firestore proposal persistence.

## Continuation update — Firestore project snapshot size guard

- Project files were serialized into one `projects/{projectId}.files` string with no client-side document-size preflight. A large tree could exceed Firestore's 1 MiB document limit after the local copy was saved, leaving callers without a reliable cloud-save outcome.
- Added an 800 KiB UTF-8 budget in `src/services/projectCloudFiles.ts`, plus explicit serialization and cloud-save outcomes. Oversized or unserializable trees remain in local storage and do not issue a Firestore write.
- `saveProject` now returns a typed result, updates cloud-save status, and no longer throws an unhandled Firestore error. The IDE header exposes saving, synced, local-only, and failed states. Validation and server command execution require a confirmed cloud save; proposal apply reports when changes were applied locally but could not be persisted. Chat creation remains usable with an explicit local-only status when cloud storage is unavailable.
- Added `scripts/testProjectCloudFiles.ts` (7 assertions) for nested serialization, UTF-8 byte measurement, oversized and cyclic input, and understandable permission/unavailable errors. Included it in `npm test`.
- Verification: focused project storage tests passed 7/7; `npm run lint`, full `npm test`, and `npm run build` exited 0; `git diff --check` exited 0 with existing line-ending notices. Build retains the large main-chunk warning. These tests do not exercise Firebase itself.
- Remaining: the current legacy schema still stores files as one Firestore field. Trees larger than 800 KiB are now explicitly local-only; a versioned per-file/subcollection migration with legacy reads, server consumers, deletion semantics, and Firebase Emulator rule tests is still required for large-project cloud persistence. Firebase rules have not been deployed or emulator-verified.

## Continuation update — versioned chunked project snapshots

- Replaced the single-document project file storage path with versioned snapshots in a `projectContent` subcollection. Each project root now carries a manifest identifying the active generation, chunk count, UTF-8 byte count, and completion flag. Existing legacy `files` values remain readable and are upgraded only after the new generation is complete and a transaction confirms the source generation has not changed.
- Snapshot chunks are capped at 600 KiB, split without breaking Unicode code points, and reassembled only when generation, ordering, byte count, manifest, and project-tree validation all match. Incomplete/malformed snapshots fail rather than returning partial workspace data.
- Updated browser and server project readers, saves, deletion, project search, GitHub import/sync, and Firestore rules for the chunked schema. Same-tab writes are serialized; publish uses a transaction so a stale snapshot cannot replace a concurrently changed generation. Unpublished generations are cleaned up on failure.
- `scripts/testProjectCloudFiles.ts` now passes 17/17 assertions, including >800 KiB round-trip, chunk bounds, Unicode boundaries, malformed/incomplete generation rejection, queue ordering/recovery, and source checks for owner-scoped rules. These checks do not compile or execute Firestore rules.
- Verification on the current worktree: `npm test` exited 0 (the configured serial suite chain completed, including project snapshot 17/17, security regression 77/77, routing 78/78, and model access 19/19); `npm run lint` exited 0; `npm run build` exited 0 with a 2,460.80 kB main JavaScript chunk warning; `git diff --check` exited 0 with line-ending normalization notices only.
- Firebase Emulator verification remains unavailable in this environment because the rules unit-test package is absent and Java is not installed. No Firebase deployment or live provider request was made. The versioned persistence behavior is covered with deterministic local tests and static rules assertions, not a live Firestore round-trip.

## Continuation update — bounded project-content cleanup

- Client-side whole-project and per-generation cleanup previously fetched every matching `projectContent` document before deleting in batches. Large workspaces could therefore create an unbounded browser-side read snapshot even though writes were capped at 400 operations.
- Both cleanup loops now query at most `PROJECT_CONTENT_BATCH_SIZE` (400) documents per iteration and repeat until no matching documents remain. The focused project storage suite checks that both query paths retain the read bound.
- `scripts/testProjectCloudFiles.ts` now passes 19/19 assertions. `npm test`, `npm run lint`, `npm run build`, and `git diff --check` all exited 0 on the current worktree. Build still reports the large main JavaScript chunk warning (~2,461 kB). Firestore behavior remains unverified in an emulator or live database.
- Reviewed the current OpenAI model pages: both selected model IDs, Responses endpoint, streaming, function calling, context/output limits, and listed modalities match the catalog entries. This establishes documented product/model metadata only; it does not establish this server credential's account access or a successful live request. No credential was read or used.

## Continuation update — constrain client chunk queries by owner

- Source review found that `projectContent` read rules require both ownership of the parent project and `resource.data.ownerId == request.auth.uid`, while the client queried only by generation. Firestore security rules evaluate a query's possible result set and do not filter unauthorized results; therefore the query did not prove the child owner constraint and could be denied even for a legitimate project owner.
- Client snapshot reads and both cleanup paths now include `where('ownerId', '==', auth.currentUser.uid)`. Unauthenticated access fails with a clear error before querying. The cleanup queries remain capped at 400 documents per page.
- Added a focused source-contract assertion that all three client child-document queries include the authenticated owner. The project cloud safeguard script passes 19/19.
- Final verification after these changes: `npm test`, `npm run lint`, `npm run build`, and `git diff --check` exited 0. Build retains the large main bundle warning (~2,461 kB). The Firestore Emulator is still unavailable, so rule compilation and a real Firebase round-trip remain unverified.
- Official OpenAI model docs confirm both configured model IDs and their documented Responses API features; live account access remains unverified because no server credential was available or used. No provider request, commit, push, or deployment occurred.

## Continuation update — chat-generated edits enter proposal review

- The IDE chat rendered a `DiffReviewModal`, but its normal submit path never created a server proposal from model output. The separate `/chat/:id` route parsed path-tagged code and offered direct per-file workspace acceptance, bypassing the durable proposal record and full-diff gate.
- Added `src/features/proposals/proposalWorkflow.ts` to parse completed path-tagged file/delete blocks, map create/modify/delete operations against the workspace, send only needed original file contents to the authenticated proposal endpoint, and convert the server proposal into the existing review change set. Ordinary code snippets are ignored; incomplete or duplicate-path edits fail visibly.
- The IDE chat now asks for complete path-tagged output on code-change requests, persists the workspace before proposal creation, and attaches the returned server proposal to the assistant message. The `/chat/:id` route uses the same workflow and opens the existing diff modal. Chat code cards are read-only previews, including when proposal creation fails; only modal Apply/Reject actions can alter workspace files. Apply/Reject status changes are reflected in the local chat transcript.
- `/api/projects/:projectId/proposals` now accepts and stores the originating conversation ID. Added `scripts/testChatProposalWorkflow.ts` (13 assertions) and included it in `npm test`; expanded the runtime proposal smoke test to verify conversation association.
- Verification: proposal workflow 13/13; `npm test`, `npm run lint`, `npm run build`, and `git diff --check` exited 0. The build still warns that the main JS bundle is about 2,465 kB. These tests verify proposal construction and the local HTTP/mock workflow; no genuine model response or live Firestore proposal persistence was tested.
- Remaining: review/apply still depends on the current proposal server and client cloud-save sequence; emulator/live Firestore transaction behavior and genuine model-generated proposal quality remain unverified. No agent workflow was restored; no credential was used; no commit, push, or deployment occurred.

## Continuation update — automation context privacy and capability honesty

- Automation runs previously concatenated every workspace file into the user prompt. This bypassed normal chat's sensitive-path filtering and relevance retrieval, so `.env` and unrelated files could be sent to the configured provider whenever workspace context was enabled.
- Added a shared automation request builder that uses the ordinary chat context selector. Automation prompts now carry only bounded, relevant excerpts; sensitive paths and unrelated files are excluded. The active selected model and project ID are preserved in the request.
- Empty provider text is now a visible failed run rather than a fabricated success report. The automation UI describes the feature as prompt/report generation and states that it does not edit files or run commands, matching the actual one-shot `/api/ai/chat` implementation.
- Added `scripts/testAutomationRequest.ts` to the normal test chain. It verifies model/project preservation, relevant excerpt inclusion, credential/unrelated-file exclusion, and prompt-only behavior.
- Verification: automation request regression passed 12/12; `npm test`, `npm run lint`, `npm run build`, and `git diff --check` exited 0. The build still reports a 2,464.82 kB main JavaScript chunk. No provider request or Slack notification was sent. Scheduled automation remains browser-local and only runs while the app is open; it is not a durable server worker.

## Continuation update — proposal Apply workspace isolation

- The Apply endpoint call in `DiffReviewModal` is asynchronous. Before this change, the user could switch projects or edit a target file while the request was pending; when it returned, the component applied the old proposal into the newly active global IDE store.
- The modal now captures the active project and file snapshot at submit time, then checks project identity and approved target files after the response and before changing IDE state. A project switch, target modification, target deletion, or conflicting create is surfaced and prevents local writes; unrelated edits do not block the proposal.
- Added `scripts/testProposalWorkspaceIsolation.ts` (4 assertions) to the normal test chain. Focused test passed 4/4; the full `npm test` chain, `npm run lint`, and `npm run build` exited 0. The build retains a 2,465.93 kB main JavaScript chunk warning.
- The proposal status ordering in this continuation was subsequently corrected: the client saves approved workspace files before requesting server finalization. See the continuation update below for the current contract.

## Continuation update — finalize proposals against saved cloud snapshots

- Apply no longer marks a proposal applied before the client saves the user-approved files. The modal writes the approved paths, requires `saveProject()` to return `synced`, then requests server finalization. A failed save leaves the proposal pending; a failed status confirmation is visible and retryable because already-proposed local content is recognized on retry.
- The Apply endpoint no longer trusts caller-supplied `currentFiles`. It reads the authenticated project's persisted Firestore snapshot and finalizes only when each approved path contains the exact proposed content (or a deleted file is absent). It records the verified file generation on the proposal.
- Proposal and project generation revisions are checked in a Firestore transaction before proposal status is stored. If either changed since the server read the snapshot, finalization fails without updating status. Removed the unused durable status-before-save API and reject unsupported rename proposals explicitly.
- `scripts/testProposalFinalization.ts` covers saved-content verification, non-mutating failures, partial approvals, idempotent retries, project generation tracking, and owner checks. Phase 5 proposal tests now cover this post-save contract rather than the disconnected status-only apply path.
- Verification: focused finalization tests 11/11; Phase 5 proposal suite 20/20; Phase 7 suite 26/26; tenant isolation suite 6/6; `npm test`, `npm run lint`, and `npm run build` exited 0. Build retains the large JavaScript chunk warning. `git diff --check` pending.
- Firestore transaction behavior is not emulator/live verified in this environment. Local tests verify finalization policy; they do not establish Firestore transaction execution. No provider call, commit, push, or deployment was made.
