# FLOAT AI Studio — Production Execution Status & Boundary Definitions

**Revision:** 2026-11-16  
**Scope:** Architecture Boundaries, Isolation Invariants, and Release Readiness  
**Target:** PR #85 (`float/phase-1.1-security-closure`)  

---

## 1. Security Architecture Boundaries

FLOAT AI Studio defines four distinct trust zones:

```
[ Browser / Client UI ] 
        | (HTTPS / WSS with Auth Token)
        v
[ FLOAT API Gateway / Express Services ]
        |
        +---> [ Authoritative Tool Registry & Approval Gate ]
        |             | (Single-Use Nonce / HMAC Token Verification)
        |             v
        |     [ Isolated Command Execution (Docker Container) ]
        |
        +---> [ Key Vault (AES-256-GCM BYOK v2) ]
        |
        +---> [ Cloud Agent Orchestrator (Option B Fail-Closed Guard) ]
        |
        v
[ Protected Workspace Storage ] (fd-verified, atomic temp-file write)
```

### 1.1 Boundary Invariants
1. **No Host Execution:** Untrusted user commands and agent-generated scripts NEVER execute directly in the hosted Node.js process. They execute exclusively inside ephemeral Linux Docker containers with rootless privileges, dropped Linux capabilities, network isolation, and read-only root filesystems.
2. **Authoritative Tool Gate:** Tool invocations must pass through `CanonicalToolRegistry.execute()`. Bypassing Express routes does not bypass approval verification.
3. **Fail-Closed Default:** If production environment variables (`FLOAT_APPROVAL_SECRET`, `FLOAT_BYOK_ENCRYPTION_KEY`, durable nonce store) are unconfigured or corrupted, the system fails closed and refuses privileged execution.
4. **Cloud Agent Option B:** Cloud Agent autonomous worker execution route (`/api/projects/:projectId/cloud-agent/runs`) is guarded with HTTP 503 `CLOUD_AGENT_EXECUTION_NOT_CONFIGURED` until remote container runner infrastructure is provisioned.

---

## 2. Component Execution Status

| Subsystem | Execution Model | Security Isolation | Status |
| :--- | :--- | :--- | :--- |
| **Composer Agent** | Multi-turn LLM agent loop | Authoritative registry gate; pauses on unapproved actions | **Hardened & Active** |
| **Toolchain Commands** | Docker container runner (`run_command`) | Ephemeral container, dropped capabilities, net disabled | **Hardened & Active** |
| **Workspace File I/O** | `LocalWorkspaceService` | File descriptor `fstat` inode check; atomic temp file rename | **Hardened & Active** |
| **BYOK Key Vault** | `UserKeyVault` | AES-256-GCM, v2 versioning, legacy compromised quarantine | **Hardened & Active** |
| **Approval Tokens** | `ToolApprovalService` | HMAC-SHA256, distributed Redis/Firestore atomic nonces | **Hardened & Active** |
| **Cloud Agent** | `CloudAgentOrchestrator` | Option B fail-closed (HTTP 503) | **Guarded & Verified** |
| **Secret Sanitizer** | `SecretScanner` / Router | Outbound payload scrubbing; regex coverage for Anthropic & URIs | **Hardened & Active** |
| **Desktop Native App** | Electron / VSCodium Fork | Sandboxed renderer, isolated daemon worker channel | **Active & Pass** |

---

## 3. Production Release Readiness Evaluation

### 3.1 Blocker Checklist & Resolution

- [x] **P0-1: Composer Host Command Execution:** Resolved via ephemeral Docker container execution and authoritative `CanonicalToolRegistry` HMAC token gate.
- [x] **P0-2: Replay Attack & Multi-Instance Nonce Race:** Resolved via atomic nonce consumption in durable stores (`IPendingApprovalStore` / Redis / Firestore).
- [x] **P0-3: BYOK Hardcoded Key & Secret Sharing:** Resolved via dedicated 256-bit `FLOAT_BYOK_ENCRYPTION_KEY`, versioning, and compromised key blocking.
- [x] **P0-4: Cloud Agent Execution Boundary:** Resolved via Option B HTTP 503 fail-closed guard.
- [x] **P0-5: Local Workspace Traversal & TOCTOU:** Resolved via fd-level validation, atomic temp files, and production route rejection.
- [x] **P0-6: CI Release Safeguard:** Verified release pipeline `.github/workflows/release.yml` maintains safety gate on unverified native desktop packages.

### 3.2 Verdict
The security posture of PR #85 on branch `float/phase-1.1-security-closure` resolves all identified P0 and P1 review blockers. All automated test suites, typechecks, and packaging validations pass 100% green. PR #85 is ready for final review and squash-merge into `main`.
