# FLOAT Studio — Baseline Repository Audit & PR Triage Report

**Document Version:** 1.0.0  
**Generated At:** 2026-11-11T21:35:00+05:30  
**Auditor:** Principal Software Architect & Quality Engineering Lead  
**Repository:** `hemarbaghel-ux/float-studio`  
**Audited Baseline Commit:** `7853e0f91e2609468f73b0462f12e237aaa43df7`  
**Current Branch:** `main` (synchronized with `origin/main`)  

---

## 1. Executive Summary & Baseline State

This report establishes the verified engineering baseline for `hemarbaghel-ux/float-studio` prior to any code modification. It executes Step 1 of the required master engineering protocol.

### 1.1 Git Topology & Identity
- **Current HEAD:** `7853e0f91e2609468f73b0462f12e237aaa43df7`
- **Commit Subject:** `Phase 10: Final Verification, Release Readiness, and Governance (#64)`
- **Remote URL:** `https://github.com/hemarbaghel-ux/float-studio.git`
- **Active Tags:**
  - `v1.0.0-recovery-complete` (points to `7853e0f9`)
  - `recovery-baseline-phase0` (points to `09b99752`)
  - `1.99.3`
- **Working Tree Cleanliness:** Clean working tree. Only one untracked local directory (`.desktop-build-cache/`) which is an artifact from prior build verification.

### 1.2 Package & Manifest State
- **Root `package.json`:** Valid JSON. Contains 19 root scripts. No duplicate script keys detected on `main`.
- **`package-lock.json`:** Version 3 format, synchronized with root `package.json` at version `1.0.0`.
- **Primary Toolchain:** Node.js 22 LTS, Vite 6, React 19, TypeScript 5.8, Express 4.21, esbuild 0.25.
- **Identified Package Script Flaws:**
  - `npm run clean` invokes `rm -rf dist`, which is non-portable across native Windows PowerShell/cmd environments without a bash subshell.
  - `npm run test:desktop`, `test:unit`, and `test:integration` use extremely long shell chains (`&&`) running over 80 individual tsx script files without centralized test runner lifecycle or per-test timeouts.

### 1.3 CI & Release Workflow State
- **`.github/workflows/ci.yml`:** Runs `npm ci`, `npm run lint`, `npm run build`, `npm run build:float-daemon-worker`, `npm run build:extensions`, and `npm test` on `ubuntu-latest`. It is strict and fails closed on lint or test errors.
- **`.github/workflows/release.yml` (CRITICAL DEFECT):**
  Lines 49–54 directly write placeholder text files to disk and publish them as distribution binaries:
  ```bash
  echo "FLOAT Studio Desktop Release - ${{ matrix.platform }}" > "dist/release/${{ matrix.artifact_name }}"
  echo "FLOAT Studio Portable Bundle - ${{ matrix.platform }}" > "dist/release/${{ matrix.archive_name }}"
  ```
  This creates text files named `.exe`, `.dmg`, `.deb`, and `.zip` (< 100 bytes). This stubbed release pipeline must be completely replaced with genuine Code-OSS/Electron packaging toolchains.

---

## 2. Pull Request Triage (#65 to #71)

All 7 open PRs have been inspected against the verified baseline `7853e0f9`. The table below details the findings, architectural evaluation, and decision for each PR.

| PR # | Head Branch | Head Commit | Files / Diffs | Decision | Core Findings & Blocker Analysis | Target Sprint |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **#65** | `claude/phase1-reliability` | `4e44a0a4` | 13 files (+1002, -27) | **REWRITE / SELECTIVE INTEGRATION** | Introduces Vitest and Sentry telemetry behind `SENTRY_DSN`. However, several test cases assert string existence in source code rather than live behavioral contracts. Must rewrite assertions to execute real components and routes. | Sprint 1 & 2 |
| **#66** | `claude/phase1b-real-packaging` | `5425264a` | 16 files (+1780, -46) | **SUPERSEDED** | Replaces release placeholders with Inno Setup and curl-based binary download scripts. Does not build genuine Code-OSS/Electron targets from source; uses makeshift node packaging scripts. Superseded by Sprint 14 genuine packaging engine. | Sprint 14 |
| **#67** | `claude/phase1c-install-smoke` | `e452a5fa` | 22 files (+2023, -51) | **SUPERSEDED** | Adds `--smoke-test` flag to the React web app. The smoke test does not launch or verify the actual compiled Code-OSS desktop workbench. Superseded by real workbench mounter verification. | Sprint 14 |
| **#68** | `claude/phase2-prep-architecture` | `2a113539` | 31 files (+2371, -87) | **SELECTIVE INTEGRATION** | Adds configurable backend URL (`src/lib/apiConfig.ts`) and Settings modal override. Useful for the web companion and desktop bridge. However, mock AI round-trip test is transport-only and must not be conflated with live model verification. | Sprint 3 |
| **#69** | `claude/phase2a-hosted-backend-auth` | `70df8518` | 8,254 files (+3477, -2628092) | **STRICTLY REJECT / CLOSE** | **FATAL ARCHITECTURAL BREACH**: Deletes 2,628,092 lines of code, completely destroying the `desktop/` Code-OSS codebase, build toolchains, and native workbench contributions to force a React-only shell. Violates non-negotiable Master Specification Rule 16. | N/A (Closed) |
| **#70** | `recovery/sprint-a-audit-and-stabilize` | `b6611f44` | 10 files (+954, -20) | **CANDIDATE / AUDIT** | Introduces normalized architecture documentation in `docs/engineering/`. Contains useful structural analysis, but requires updating because several claims of `WORKING_AND_VERIFIED` were premature (e.g. language extension stubs). | Sprint 1 |
| **#71** | `recovery/sprint-b-build-and-release` | `6392d2aa` | 15 files (+2160, -24) | **STRICTLY REJECT / REWRITE** | **POLICY VIOLATIONS**: Injects 24 MiB of `crypto.randomBytes` into `resources/float-runtime-core.bin` to artificially satisfy size gates; generates synthetic PE headers via JavaScript fallback; smoke test terminates Node server with SIGTERM and claims workbench mount. Must be rebuilt cleanly. | Sprint 14 |

---

## 3. Verified Addendum A Defects on `main` (`7853e0f9`)

Every defect listed in Addendum A of the Master Specification was physically inspected and confirmed in the tracked source:

### A.1: Checkout and Subscription Flow
- **Files:** `src/features/checkout/CheckoutPage.tsx`, `src/store/subscriptionStore.ts`
- **Finding:**
  - `CheckoutPage.tsx` defines a monthly/yearly toggle (`billingCycle`), but the `useEffect` that calls `createCheckoutSession` only passes `selectedPlan` and omits `billingCycle` from its dependencies and payload.
  - `subscriptionStore.ts` defines `createCheckoutSession: async (planId: string)` and transmits only `{ planId }` to `/api/subscription/create-checkout-session`.
  - The "Try Again" retry button calls `handleSelectPlan(selectedPlan)`. Because `handleSelectPlan` has an early return `if (planId === selectedPlan) return;`, clicking retry is a complete no-op.
  - **Verdict:** Confirmed defect. Annual billing is completely ignored by the server, and retry fails.

### A.2: Browser Execution Sandbox
- **File:** `src/features/float/sandbox.ts`
- **Finding:**
  - The browser worker evaluates virtual workspace code using:
    ```javascript
    const fn = new Function('require','module','exports','console','__filename','__dirname','process', src);
    ```
  - While it attempts module sandboxing, `new Function` inside a Web Worker has access to worker global scope, `fetch`, `WebSocket`, `crypto`, `IndexedDB`, and timers.
  - **Verdict:** Confirmed defect. It must be explicitly labelled as an untrusted browser preview interpreter and forbidden from executing code that implies host-level terminal guarantees.

### A.3: Python and Rust Language Extension Stubs
- **Files:** `extensions/python-language-features/src/extension.ts`, `extensions/rust-language-features/src/extension.ts`
- **Finding:**
  - Both extensions maintain only an in-memory boolean `_isActive` and an active files set.
  - Commands (`python.selectInterpreter`, `python.restartLspServer`, `python.runTests`, `rust.cargoBuild`, `rust.cargoTest`, `rust.cargoClippy`) execute only:
    ```typescript
    vscode.window.showInformationMessage('Python: Select Interpreter executed.');
    ```
  - No language server (Pyright, rust-analyzer) or Cargo process is spawned or communicated with.
  - **Verdict:** Confirmed defect. These are dead stub affordances.

### A.4: Historical Phase 10 E2E Test Overclaims
- **File:** `scripts/testPhase10EndToEndCursorWorkflow.ts`
- **Finding:**
  - Uses `WorkflowTestModelGateway` (a deterministic in-memory mock).
  - Step 9 runs `node -e "console.log('Tests passed successfully'); process.exit(0);"` rather than running actual project tests.
  - Automated repair step merely appends `\n// Fix applied\n` to a file rather than diagnosing and fixing errors.
  - Git operations use `LocalGitService(baseFiles)`, an in-memory mock, rather than a real repository on disk.
  - **Verdict:** Confirmed overclaim. Valid only as a deterministic unit orchestration test, not an end-to-end integration proof.

### A.5: Agent Capability State
- **Files:** Server routes and historical docs.
- **Finding:**
  - Web client agent endpoints were previously retired with HTTP 410. Desktop Composer operated via separate local daemon logic.
  - **Verdict:** Confirmed need for consolidation. Web and desktop must share one canonical, versioned, authenticated agent service with bounded iterations and explicit user approval gates.

### A.6: Model Gateway & Provider Wiring
- **File:** `src/server/providers/router.ts`, `src/server/providers/modelRegistry.ts`
- **Finding:**
  - `ModelRouter.ensureAdaptersRegistered()` only instantiates `OpenAIAdapter` and `GoogleGeminiAdapter`.
  - Anthropic is completely missing from runtime registration, despite being featured prominently in the catalog and UI selector.
  - `resolveModelId` defaults `'auto'` to `'gpt-6-astra'`, an unreleased or demo model ID.
  - **Verdict:** Confirmed defect. Must register OpenAI, Anthropic, and Gemini adapters with verified API schemas and runtime health checks.

### A.7: Documentation Staleness
- **File:** `docs/engineering/FLOAT_CURSOR_PARITY_STATUS.md`
- **Finding:**
  - Contains historical paths, commits, and assertions that are no longer aligned with code realities.
  - **Verdict:** Must be marked as historical/archival. Canonical architecture must be maintained in versioned `docs/architecture/` with verified test links.

---

## 4. Repository Risk Ledger

| Risk ID | Category | Severity | Description | Mitigation Strategy | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RSK-01** | Release / Packaging | **CRITICAL** | `release.yml` outputs fake text files (< 100 bytes) named `.exe`, `.dmg`, `.deb`. | Replace release workflow with authentic packaging pipeline building real binaries from Code-OSS/Electron. Enforce binary header check (`MZ`, `PK`, `ar`) and minimum size gate ($\ge 20\text{ MB}$). | Open |
| **RSK-02** | Integrity | **CRITICAL** | PR #71 injected 24MB random-byte padding and fake PE headers to simulate packaging. | Strictly reject PR #71. Build genuine executables using real packaging toolchains (Inno Setup / NSIS, dpkg-deb, create-dmg). | Mitigated (Rejected) |
| **RSK-03** | Architecture | **CRITICAL** | PR #69 deleted 2.6M lines of Code-OSS desktop code. | Strictly reject PR #69. Preserve `desktop/` as the canonical desktop IDE client. | Mitigated (Rejected) |
| **RSK-04** | Security / Sandbox | **HIGH** | `src/features/float/sandbox.ts` runs untrusted code via `new Function` in Web Worker. | Disallow arbitrary `new Function` code execution. Route commands through authorized backend sandbox with container isolation or fail-closed preview limits. | Open |
| **RSK-05** | Billing / Revenue | **HIGH** | Checkout ignores annual billing cycle; retry button is a no-op. | Send `{ planId, billingCycle, idempotencyKey }` to `/api/subscription/create-checkout-session`; fix retry button click handler; map to server-owned Stripe prices. | Open |
| **RSK-06** | AI / Models | **HIGH** | Anthropic provider not registered in active router; 'auto' routes to unverified demo model. | Register Anthropic, OpenAI, and Gemini adapters. Implement true multi-provider fallback cascade and SSE stream verification. | Open |
| **RSK-07** | Extensions | **MEDIUM** | Python and Rust extensions are dead stubs showing info messages. | Label stubs honestly or wire real LSP processes (Pyright, rust-analyzer). | Open |
| **RSK-08** | Testing | **MEDIUM** | Monolithic `&&` test script chains in `package.json` hide per-test metrics and failure causes. | Modularize test suites into unit, integration, contract, and desktop smoke tests with clear exit codes. | Open |

---

## 5. Master Consolidation & Step-by-Step Recovery Plan

In accordance with the required 8-step execution order:

1. **Step 1 (Audit Baseline & Triage PRs):** **COMPLETE.** This document, along with `docs/engineering/repository-inventory.json`, establishes the verified starting state.
2. **Step 2 (Establish Clean Integration Branch & Rollback Point):**
   - Tag current baseline: `rollback/baseline-7853e0f9`.
   - Create clean integration branch: `work/master-recovery-integration`.
3. **Step 3 (Fix Build & Architecture Before Features):**
   - Normalize `package.json` scripts (`clean`, `dev:all`, `build`, `test:*`).
   - Fix Addendum A.1 (checkout billing cycle, retry button, Stripe Price ID mapping).
   - Fix Addendum A.2 (browser sandbox `new Function` containment).
   - Incorporate Sentry telemetry (`SENTRY_DSN` gated) and Vitest suite from PR #65 with fixed behavioral assertions.
4. **Step 4 (Rebuild Code-OSS/Electron Desktop & Authentic Packaging):**
   - Wire genuine Code-OSS build targets.
   - Author authentic packaging engine producing real `FLOAT-Setup-x64.exe`, portable zip, `.deb`, and `.dmg`.
   - Implement real headless smoke test that launches the packaged binary and verifies IPC + workbench mounting.
5. **Step 5 (Shared Model Gateway, Composer, & Safe Execution):**
   - Wire multi-provider gateway (`IModelGateway`) for Anthropic, OpenAI, and Gemini.
   - Implement unified Composer with shadow workspace virtualization, diff review, approval gates, and atomic application.
6. **Step 6 (Repair UI Controls & End-to-End Workflows):**
   - Eliminate dead affordances and placebo info messages.
   - Enforce the UI Control Acceptance Matrix.
7. **Step 7 & 8 (Independent Verification & PR Integration):**
   - Verify each sprint against automated test gates.
   - Open focused, reviewable PRs with passing CI before merging.
