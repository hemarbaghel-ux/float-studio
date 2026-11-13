# FLOAT Cursor-Parity Implementation Program

## Objective

Deliver a reliable native AI development environment with parity across the major user-facing workflows offered by Cursor. This is a capability and reliability program, not an attempt to reproduce Cursor's private source code or infrastructure.

A capability earns parity credit only when its code path is implemented, integrated into the product, tested at component and system level, and exercised by a realistic end-to-end workflow. UI labels, model catalogue entries, placeholder APIs, and source files that are never reached at runtime do not count as delivered features.

## Release gates

Every stage must provide:

1. A defined product workflow and user-visible behavior.
2. An architecture and threat model for the affected subsystem.
3. Unit and contract tests for core behavior.
4. Integration tests across component boundaries.
5. An end-to-end acceptance test against the running application.
6. Observability: structured logs, errors, cancellation, and useful diagnostics.
7. Documentation of limitations and unsupported cases.
8. Successful required CI checks. A skipped or cancelled check is not a pass.

## Stage sequence and acceptance criteria

### Stage 0 — Reliability and native verification
Status: **In progress / blocking**.

- Keep strict Code-OSS type checking enabled.
- Fix all FLOAT contribution type errors without weakening compiler settings.
- Verify native Electron launch, actual workbench render, editor input/save, daemon utility-process lifecycle, and cleanup.
- Ensure missing executables, startup exits, failed assertions, and missing artifacts fail CI.
- Run Windows, macOS, and Linux jobs independently.

Exit gate: all required compilation and runtime checks pass on each supported OS.

### Stage 1 — Native IDE experience
Status: **In progress** in PR #76.

- Multi-root workspace loading and file operations.
- Editor tabs, split groups, Quick Open, save/reopen, search and replace.
- Explorer, Extensions, Problems, Settings, terminal and task runner.
- Workbench startup, workspace restore, keybindings and command palette.
- Verify the actual Electron UI rather than a browser-only mock.
- Explicitly document whether SSH, WSL and development-container workflows are supported. Upstream APIs alone do not constitute FLOAT support.

Exit gate: a user can open a multi-root project, navigate, edit, save, search, split editors, use the terminal, and restore the workspace in the native FLOAT application.

### Stage 2 — AI chat and autonomous Composer
- Define one canonical agent execution protocol and typed tool schemas.
- Replace production text-parsed `tool_call` fences with provider-native function/tool calling.
- Implement Ask, Plan, Agent and Manual modes with distinct permission and mutation semantics.
- Add bounded execution, cancellation, resumability, retries, progress events and durable session state.
- Implement multi-file atomic proposals, diff review, checkpoints, rollback and conflict handling.
- Replace retired HTTP 410 agent/session endpoints with authenticated, owner-scoped APIs.
- Keep model routing server-side and secrets out of renderer code.

Exit gate: a real task runs from request through repository exploration, multi-file proposal, approval, application, test execution and verified completion. Failure and cancellation must leave a recoverable workspace.

### Stage 3 — Codebase intelligence
- Build incremental indexing with file watcher reconciliation and persisted index versions.
- Parse symbols and relationships using language-appropriate parsers where available.
- Use lexical search (ripgrep/BM25) and measured semantic retrieval; avoid treating deterministic hash projections as semantic embeddings.
- Add symbol, import, call-graph and dependency navigation.
- Add context selection, source attribution, token budgeting and stale-index detection.
- Support large repositories with bounded memory, indexing queues and cancellation.

Exit gate: benchmark on a versioned repository-question dataset with measured Recall@5, MRR, stale-index rate, latency and memory.

### Stage 4 — Predictive editing and inline diffs
- Complete inline edit flows with exact diff boundaries and accept/reject/undo.
- Add multi-line Tab completions, suffix/prefix de-duplication, import-aware suggestions and next-edit prediction.
- Add cross-file suggestion support only when the context and target are explicit.
- Handle cancellation, stale responses, model outages and latency budgets.
- Measure accepted suggestion rate and edit correctness on a fixed task set.

Exit gate: stable editor behavior and measured completion quality; model catalogue claims alone do not count.

### Stage 5 — Terminal, testing and debugging
- Use persistent PTY sessions and explicit terminal lifecycle ownership.
- Enforce command approval, workspace boundaries and isolated execution.
- Discover and run project tests, builds, linters and formatters.
- Parse diagnostics and map failures to files/lines.
- Integrate Debug Adapter Protocol state and scoped debug context.
- Make automated repair bounded, cancellable and reviewable.

Exit gate: FLOAT can reproduce a failing test, propose a fix, run the relevant tests and demonstrate the regression is resolved without modifying protected files.

### Stage 6 — Git and code review
- Complete Git status, staging, commit, history, branches, diff and conflict resolution.
- Securely integrate GitHub, GitLab and Bitbucket using least-privilege OAuth scopes.
- Add PR creation, review summaries, inline findings and patch suggestions.
- Run agent work on isolated branches/worktrees.
- Never push directly to protected branches by default.

Exit gate: a full tested feature branch and reviewable pull request can be produced from a user task.

### Stage 7 — Browser automation and MCP
- Add an isolated browser runtime for local app navigation and visual testing.
- Capture screenshots, console errors and failed network requests.
- Add MCP STDIO and HTTP transports, server discovery, typed tool schemas and OAuth where required.
- Require per-server and per-tool permission controls, audit logs, timeouts and process cleanup.

Exit gate: the agent can launch a local app, test a user workflow in a browser, diagnose a failure, and use an approved MCP tool without escaping its permission boundary.

### Stage 8 — Cloud and background agents
- Build isolated per-task execution environments with ephemeral credentials.
- Add repository checkout, environment bootstrap, secrets injection, network policy and resource quotas.
- Persist sessions, logs, artifacts and cancellation state.
- Support background tasks, multi-repository tasks and agent handoff.
- Produce reviewable branches/PRs instead of silently mutating the default branch.

Exit gate: an isolated cloud agent can complete, validate and publish a task while its environment and permissions are auditable.

### Stage 9 — Automations and Bugbot
- Add event/schedule triggers, webhook verification and idempotency.
- Add PR review, security and regression checks with evidence-backed findings.
- Add configurable auto-fix policies and approval thresholds.
- Add retry, dead-letter handling, rate limits, run history and per-repository controls.

Exit gate: a triggered automation executes once, records a traceable result, and cannot exceed its granted permissions.

### Stage 10 — Teams, rules and collaboration
- Add team/workspace membership and role-based access control.
- Add project, user and team rules with precedence and versioning.
- Add shared instructions, usage quotas, spend controls and audit logs.
- Enforce tenant isolation for projects, sessions, indexes, integrations and secrets.
- Define data retention, export and deletion behavior.

Exit gate: two users can collaborate with correct permissions and no cross-tenant data exposure.

### Stage 11 — Production hardening and release
- Add performance budgets for startup, indexing, chat, completion and agent execution.
- Test large repositories, network failures, provider outages and long sessions.
- Add crash reporting, safe update/rollback and platform package verification.
- Build genuine Windows, macOS and Linux installers; sign releases where available.
- Run security reviews, dependency audits, threat-model tests and recovery drills.

Exit gate: supported installers pass clean-install, upgrade, operation, rollback and security acceptance on every supported OS.

## Measurement policy

Maintain a parity scorecard per stage with separate columns for:

- Source implemented
- Unit/contract tested
- Integration tested
- End-to-end verified
- Production-ready

The score must be weighted by user value and reliability, not lines of code, number of files, tests that only inspect source strings, or the number of UI controls.

Suggested benchmark targets are release gates, not claims about Cursor: task completion >=85% on a fixed task suite; code retrieval Recall@5 >=90%; tool execution success >=99%; no unauthorized workspace modifications; and all supported platform acceptance suites passing.

## Current verified state

- Stage 0 strict compilation currently has known failures in the FLOAT contribution set. A correction pass has been committed on the Stage 1 branch and is awaiting fresh CI.
- Stage 1 now has a Playwright Electron acceptance test covering multi-root open, editor save round-trip, split groups, Explorer, Search, Extensions, Problems, Settings and Terminal. It has not yet passed on CI.
- Stages 2–11 are not complete. Existing classes or endpoints must be audited and integrated before they receive parity credit.
