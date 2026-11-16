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

### SEC-P0-01: Authoritative Pre-Execution Tool Approval
* **Previous State:** Tool approval checks were performed at the Express router layer (`/tools/execute`), but not authoritatively inside `CanonicalToolRegistry.execute()`. Any code path invoking the tool registry directly bypassed verification. Furthermore, pre-verifying the token in the router consumed the nonce before calling `execute()`, causing legitimate executions to fail on double-consumption.
* **Remediation:**
  - Made `CanonicalToolRegistry.execute()` the single authoritative gate for tool execution.
  - If a tool specifies `requiresApproval: true` or matches protected commands, the registry requires a cryptographically valid HMAC-SHA256 `approvalToken`.
  - Removed duplicate verification in Express routes to eliminate nonce double-consumption.
  - Standardized the unapproved error signature: `Approval required: Tool "${name}" requires explicit user approval. Provide a valid single-use approvalToken.`.
  - Supported pre-approved context vectors (`allowedCommands` for explicit verification steps and `mcpApprovedTools` for authenticated MCP bridges).

### SEC-P0-02: Durable Atomic Nonce Replay Prevention & State Machine
* **Previous State:** Nonces were stored in process-local memory, allowing multi-instance replay attacks in clustered environments. Approval records lacked state transitions.
* **Remediation:**
  - Implemented `IPendingApprovalStore` with durable storage support (Firestore & Redis with `SET NX PX`).
  - Strict 7-state approval machine: `pending` -> `approved` | `rejected` | `expired` -> `executing` -> `consumed` | `failed`.
  - Nonces are consumed atomically upon tool execution. Multi-instance replay attempts immediately fail.
  - Fail-closed in `NODE_ENV === 'production'` if a durable store or approval secret is unconfigured.

### SEC-P0-03: BYOK Vault Encryption & Compromised Legacy Credential Isolation
* **Previous State:** BYOK encryption used hardcoded fallback secrets and reused the tool approval secret. Compromised v1 credentials could be silently decrypted.
* **Remediation:**
  - Enforced a dedicated 256-bit AES-GCM encryption key (`FLOAT_BYOK_ENCRYPTION_KEY`) with Shannon entropy verification (> 3.5 bits/char).
  - Implemented `CURRENT_BYOK_KEY_VERSION = 2`.
  - Tagged legacy and unversioned credentials with status `NEEDS_REPLACEMENT` and blocked decryption throwing `LEGACY_BYOK_KEY_COMPROMISED`.
  - Enforced durable persistence: rejected silent memory-only saves in production.

### SEC-P0-04: Cloud Agent Execution Integrity (Option B Fail-Closed Guard)
* **Previous State:** Cloud Agent runs could be started via public API without an active backend worker, producing fake or unverified task progress.
* **Remediation:**
  - Sealed public route `POST /api/projects/:projectId/cloud-agent/runs` with HTTP 503 `CLOUD_AGENT_EXECUTION_NOT_CONFIGURED` fail-closed.
  - Default orchestrator run state defaults to `queued`.
  - Proposal synthesis occurs only when subtasks explicitly provide internal diff proposals or reviewer audits.

### SEC-P0-05: Local Workspace TOCTOU Race Condition Elimination
* **Previous State:** File access checked path containment before opening files, allowing symlink replacement attacks between check and open.
* **Remediation:**
  - `readFile`: Opened file descriptor and performed `fstat` to verify device ID (`dev`) and inode (`ino`) against the canonical target path.
  - `writeFile`: Created a temporary file with `O_WRONLY | O_CREAT | O_EXCL` in a validated workspace subfolder, verified handle attributes, and atomically renamed to the target.
  - Unconditionally rejected `localWorkspacePath` on hosted routes when `NODE_ENV === 'production'`.

### SEC-P0-06: Outbound Payload Secret Redaction & Scanner Coverage
* **Previous State:** Outbound model provider transmissions could inadvertently leak Anthropic API keys or database connection strings.
* **Remediation:**
  - Added regex patterns to `secretScanner.ts` for Anthropic keys (`sk-ant-[a-zA-Z0-9_-]{40,}`) and database URIs (`postgres://`, `mongodb://`, `mysql://`, `redis://`).
  - Added outbound payload sanitization in `src/server/providers/router.ts` that scrubs secrets from outgoing prompts without modifying user workspace files.

---

## 3. Verification Test Matrix

| Test Suite | Coverage | Status |
| :--- | :--- | :--- |
| `tests/approval-enforcement.test.ts` | Authoritative registry gate, HMAC validation, replay rejection, race conditions, Composer Agent pauses | **14 / 14 PASSED** |
| `tests/byok-encryption-security.test.ts` | 256-bit AES-GCM, key rotation, versioning, legacy compromised isolation, tenant isolation | **8 / 8 PASSED** |
| `tests/cloud-agent-execution-integrity.test.ts` | Option B HTTP 503 fail-closed, run queueing, audit reviewer runs | **4 / 4 PASSED** |
| `tests/tool-approval.test.ts` | Single-use nonce stores (Memory & Redis), state machine transitions | **11 / 11 PASSED** |
| `tests/composer-approval.test.ts` | Composer tool execution, approval token checks | **5 / 5 PASSED** |
| `tests/filesystem-race.test.ts` | Traversal prevention, symlink escapes, TOCTOU containment | **6 / 6 PASSED** |
| `Full Vitest Suite` | 18 test files covering all modules | **126 / 126 PASSED** |
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
