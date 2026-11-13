# FLOAT Recovery Phase 10: Verification & Release Governance Reference

> **Important Truthfulness Notice:**
> This document accompanies `docs/engineering/FLOAT_CURSOR_PARITY_STATUS.md`, which is the single authoritative status ledger for the repository.
> - `scripts/testPhase10EndToEndCursorWorkflow.ts` is a **deterministic orchestration contract test** using `WorkflowTestModelGateway` (a deterministic fake model gateway) and `LocalGitService` (an in-memory Git helper). It verifies the orchestration contracts across indexing, context assembly, tool invocation, proposal diffs, checkpoints, rollback, terminal policy/error classification, and secret scanning, **not** live upstream LLM reasoning or native OS `git` execution.
> - Live model provider verification (`npm run test:live` / `scripts/testLiveModelProvider.ts`) and native local Git verification (`NativeLocalGitService`) are tracked and executed separately.

---

## 1. Deterministic 13-Step Orchestration Contract (`scripts/testPhase10EndToEndCursorWorkflow.ts`)

1. **Open Workspace (`LocalFileSystemWorkspaceService`)**: Opens a real temporary directory on the local filesystem.
2. **Codebase Indexing (`WorkspaceIndex`)**: Extracts symbols, token/trigram inverted indices, and AST declarations.
3. **Whole-Codebase Context (`ContextBuilder`)**: Resolves `@codebase`, `@file`, and scoped memory within bounded character/token budgets.
4. **Composer Agent Loop (`ComposerAgent` + `WorkflowTestModelGateway`)**: Exercises deterministic multi-turn tool call parsing (`list_dir`, `read_file`, `propose_changes`).
5. **Multi-File Proposals**: Produces structured proposals in `pending_review` status without mutating workspace files prior to approval.
6. **Diff Review & Statistics (`computeDiffStats`, `generateUnifiedDiff`)**: Computes line additions, deletions, and unified diffs.
7. **Pre-Apply Safety Checkpoint (`WorkspaceCheckpointManager`)**: Captures a snapshot to `.float/checkpoints/${id}.json` before applying changes.
8. **Atomic Workspace Patching (`applyProposal`)**: Writes approved changes to the workspace and records applied state.
9. **Deterministic Rollback**: Restores modified/deleted files and removes newly created files from the checkpoint snapshot.
10. **Terminal Execution Policy (`TerminalExecutionPolicy`)**: Evaluates commands against allow/approval/deny rules.
11. **Terminal Error Classification (`classifyTerminalOutput`)**: Extracts compiler/test error categories, target files, and line numbers.
12. **Corrective Repair Proposal**: Exercises diagnostic-to-proposal repair orchestration.
13. **Pre-Commit Secret Scanning (`scanChangesForSecrets`)**: Blocks commits containing leaked credentials (`sk-`, `ghp_`, `AIza`, `AKIA`, PEM private keys).

---

## 2. Release & Governance Gates

See `docs/engineering/FLOAT_CURSOR_PARITY_STATUS.md` and `docs/RELEASE_CHECKLIST.md` for the authoritative subsystem status matrix and public launch blockers (including `GET /api/privacy/policy` draft status).
