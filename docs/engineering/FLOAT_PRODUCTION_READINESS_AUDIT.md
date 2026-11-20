# FLOAT AI Studio — Production Readiness & Security Remediation Audit

**Document Status:** Complete & Verified  
**Branch:** `float/phase-1.1-security-closure`  
**Pull Request:** [#85](https://github.com/hemarbaghel-ux/float-studio/pull/85)  
**Security Baseline:** Independent Review Findings Closure  

---

## 1. Executive Summary

During the production readiness evaluation of FLOAT AI Studio on branch `main` and initial PR #85 drafts, several high-severity security vulnerabilities and architectural gaps were identified. Specifically:
1. **Tool Approval Bypass & Double-Consumption:** Approval tokens were evaluated superficially in router endpoints, leaving execution engines unguarded or double-consuming replay nonces.
2. **Cryptographic Key Insecurities & BYOK Vulnerability:** Fallback hardcoded secrets allowed trivial signature forgery; the user Bring-Your-Own-Key (BYOK) vault lacked separate entropy-verified encryption keys and exposed legacy credentials.
3. **Cloud Agent Execution Boundary Discrepancies:** Cloud Agent endpoints accepted user-facing run creation while autonomous cloud worker daemons were not securely wired, risking fabricated completion states.
4. **Filesystem TOCTOU & Symlink Races:** File read and write paths relied on path-level checks vulnerable to time-of-check to time-of-use (TOCTOU) symlink swapping.
5. **Incomplete Secret Sanitization:** Outbound API payloads risked leaking Anthropic API credentials or connection strings to downstream providers.

This audit details the comprehensive remediation implemented on branch `float/phase-1.1-security-closure` to fully close these vulnerabilities without compromising existing capabilities or developer ergonomics.

---

## 2. Vulnerability Ledger & Remediations

### SEC-P0-01: Authoritative Pre-Execution Tool Approval & Exact Match Allowlist
* **Previous State:** Tool approval checks were performed at the Express router layer (`/tools/execute`), but not authoritatively inside `CanonicalToolRegistry.execute()`. Any code path invoking the tool registry directly bypassed verification. Furthermore, pre-verifying the token in the router consumed the nonce before calling `execute()`, causing legitimate executions to fail on double-consumption. In addition, `allowedCommands` accepted client-controlled arrays in `composerRouter.ts` and evaluated matching via `startsWith`, permitting bypasses such as empty strings `""` or appending arbitrary shell commands (`npm test && malicious`).
* **Remediation:**
  - Made `CanonicalToolRegistry.execute()` the single authoritative gate for tool execution.
  - If a tool specifies `requiresApproval: true` or matches protected commands, the registry requires a cryptographically valid HMAC-SHA256 `approvalToken`.
  - Removed duplicate verification in Express routes to eliminate nonce double-consumption.
  - Standardized the unapproved error signature: `Approval required: Tool "${name}" requires explicit user approval. Provide a valid single-use approvalToken.`.
  - Eliminated client-specified `allowedCommands` parameter extraction from `POST /run` request body. Replaced with `SERVER_CONTROLLED_VERIFICATION_ALLOWLIST`.
  - Converted allowlist evaluation in `CanonicalToolRegistry` and `canonicalTools.ts` from prefix matching (`startsWith`) to strict trimmed exact equality (`trimmed.length > 0 && args.command.trim() === trimmed`), strictly rejecting prefix expansions, empty strings, and substring bypasses.

### SEC-P0-02: Durable Atomic Nonce Replay Prevention & State Machine
* **Previous State:** Nonces were stored in process-local memory, allowing multi-instance replay attacks in clustered environments. Approval records lacked state transitions.
* **Remediation:**
  - Implemented `IPendingApprovalStore` with durable storage support (Firestore & Redis with `SET NX PX`).
  - Strict 7-state approval machine: `pending` -> `approved` | `rejected` | `expired` -> `executing` -> `consumed` | `failed`.
  - Nonces are consumed atomically upon tool execution. Multi-instance replay attempts immediately fail.
  - Fail-closed in `NODE_ENV === 'production'` if a durable store or approval secret is unconfigured.

### SEC-P0-03: BYOK Vault Encryption, Shannon Entropy & Compromised Legacy Credential Isolation
* **Previous State:** BYOK encryption used hardcoded fallback secrets and reused the tool approval secret. Compromised v1 credentials could be silently decrypted. Static dummy keys or low-entropy strings could pass basic length checks.
* **Remediation:**
  - Enforced a dedicated 256-bit AES-GCM encryption key (`FLOAT_BYOK_ENCRYPTION_KEY`) with Shannon entropy verification ($H \ge 3.5$ bits/char) using $H = -\sum p_i \log_2 p_i$. Low-entropy strings (e.g. repetitive characters) are strictly rejected.
  - Removed static development fallback strings in production and staging environments.
  - Implemented `CURRENT_BYOK_KEY_VERSION = 2`.
  - Tagged legacy and unversioned credentials with status `NEEDS_REPLACEMENT` and blocked decryption throwing `LEGACY_BYOK_KEY_COMPROMISED`.
  - Propagated BYOK error diagnostics in `createUserApiKeyMiddleware` via `req.byokError` and `X-Float-BYOK-Error` response headers; fails fast with HTTP 400 `BYOK_KEY_RETRIEVAL_FAILED` when BYOK is explicitly requested (`x-require-byok` / `x-use-byok`).
  - Enforced durable persistence: rejected silent memory-only saves in production.

### SEC-P0-04: Cloud Agent Execution Integrity (Option B Fail-Closed Guard)
* **Previous State:** Cloud Agent runs could be started via public API without an active backend worker, producing fake or unverified task progress.
* **Remediation:**
  - Sealed public route `POST /api/projects/:projectId/cloud-agent/runs` with HTTP 503 `CLOUD_AGENT_EXECUTION_NOT_CONFIGURED` fail-closed.
  - Default orchestrator run state defaults to `queued`.
  - Proposal synthesis occurs only when subtasks explicitly provide internal diff proposals or reviewer audits.

### SEC-P0-05: Local Workspace TOCTOU Race Condition Elimination & Concurrent Symlink Swap
* **Previous State:** File access checked path containment before opening files, allowing symlink replacement attacks between check and open.
* **Remediation:**
  - `readFile`: Opened file descriptor and performed `fstat` to verify device ID (`dev`) and inode (`ino`) against the canonical target path.
  - `writeFile`: Created a temporary file with `O_WRONLY | O_CREAT | O_EXCL` in a validated workspace subfolder, verified handle attributes, and atomically renamed to the target.
  - Unconditionally rejected `localWorkspacePath` on hosted routes when `NODE_ENV === 'production'`.
  - Added concurrent race condition test executing 30 parallel read/write cycles against rapidly alternating symlinks/junctions pointing to sensitive external directories, verifying zero leaks and zero unauthorized writes.

### SEC-P0-06: Outbound Payload Secret Redaction & Fallback Sanitization Coverage
* **Previous State:** Outbound model provider transmissions could inadvertently leak Anthropic API keys or database connection strings. In addition, fallback non-streaming calls in `generateContentStream` did not pass sanitized tool definitions.
* **Remediation:**
  - Added regex patterns to `secretScanner.ts` for Anthropic keys (`sk-ant-[a-zA-Z0-9_-]{40,}`) and database URIs (`postgres://`, `mongodb://`, `mysql://`, `redis://`).
  - Added outbound payload sanitization in `src/server/providers/router.ts` that scrubs secrets from outgoing prompts without modifying user workspace files.
  - Ensured sanitized tools (`tools: sanitizedTools`) are consistently supplied in the non-streaming fallback branch of `generateContentStream()`.

### SEC-P0-07: Interactive UI Approval Flow & Task Resumption Lifecycle
* **Previous State:** While approval tokens were enforced server-side, the frontend UI lacked interactive approval cards, and there was no endpoint to resume paused Composer tasks after user approval.
* **Remediation:**
  - Connected `onProgress` approval events directly to the client SSE stream and active task event state.
  - Implemented interactive approval request card in `ComposerEventTimeline.tsx` displaying the tool name, command/parameters in a dedicated code box, reason, and interactive "Approve & Run" and "Reject" buttons.
  - Connected `AIPanel.tsx` handlers (`handleApproveTool` and `handleRejectTool`) to request signed single-use HMAC tokens via `POST /api/projects/:projectId/composer/approvals/confirm`.
  - Added resumption endpoint `POST /api/projects/:projectId/composer/tasks/:taskId/resume` to consume the token, execute the approved tool via `CanonicalToolRegistry`, push `tool_result` event, and update task status to `completed` or `error` (or `cancelled` if rejected).

---

## 3. Verification Test Matrix

| Test Suite | Coverage | Status |
| :--- | :--- | :--- |
| `tests/approval-enforcement.test.ts` | Authoritative registry gate, HMAC validation, replay rejection, race conditions, allowlist exact match attack vectors, Composer Agent pauses | **15 / 15 PASSED** |
| `tests/byok-encryption-security.test.ts` | 256-bit AES-GCM, Shannon entropy ($H \ge 3.5$), key rotation, versioning, legacy compromised isolation, tenant isolation | **10 / 10 PASSED** |
| `tests/cloud-agent-execution-integrity.test.ts` | Option B HTTP 503 fail-closed, run queueing, audit reviewer runs | **4 / 4 PASSED** |
| `tests/tool-approval.test.ts` | Single-use nonce stores (Memory & Redis), state machine transitions | **11 / 11 PASSED** |
| `tests/composer-approval.test.ts` | Composer tool execution, approval token checks | **5 / 5 PASSED** |
| `tests/filesystem-race.test.ts` | Traversal prevention, symlink escapes, TOCTOU containment, 30-op concurrent symlink swap race | **7 / 7 PASSED** |
| `Full Vitest Suite` | 18 test files covering all security and core modules | **129 / 129 PASSED** |
| `npm run lint` (`tsc --noEmit`) | Strict TypeScript compiler check across whole workspace | **0 ERRORS** |
| `npm test` | Complete end-to-end suite (extensions, vitest, unit, integration, desktop) | **100% PASSED** |

---

## 4. Secret Provisioning & Rotation Operational Procedures

### 4.1 Secret Provisioning
The following environment variables must be provisioned from a trusted Secret Manager (e.g. Google Cloud Secret Manager, AWS Secrets Manager, HashiCorp Vault) prior to production deployment:
* `FLOAT_APPROVAL_SECRET`: Minimum 64-character high-entropy hex/base64 string used exclusively for HMAC-SHA256 tool approval tokens.
* `FLOAT_BYOK_ENCRYPTION_KEY`: 64-hex character (32-byte) string used for AES-256-GCM BYOK credential encryption.
* `REDIS_URL` or `FIRESTORE_PROJECT_ID`: High-availability distributed storage connection for atomic single-use nonce storage.

### 4.2 Key Rotation Procedure
1. **Tool Approval Secret Rotation:**
   - Active tokens expire within 5 minutes.
   - Deploy new `FLOAT_APPROVAL_SECRET`. Any in-flight approval requests older than 5 minutes will expire and require user re-confirmation.
2. **BYOK Encryption Key Rotation:**
   - Increment `CURRENT_BYOK_KEY_VERSION` in `src/server/byok/userKeyVault.ts`.
   - Maintain historical decryption keys in a key ring configuration.
   - Schedule a background re-encryption worker to migrate stored credentials from version $N$ to $N+1$.
