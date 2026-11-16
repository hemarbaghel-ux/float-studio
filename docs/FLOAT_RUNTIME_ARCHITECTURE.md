# FLOAT STUDIO — RUNTIME ARCHITECTURE SPECIFICATION

**Architecture Version:** v1.2.2  
**Target Platform:** Desktop Native (Code-OSS Electron Workbench) & Cloud Hosted (Express / Firebase)  
**Last Updated:** 2026-11-16  

---

## 1. High-Level System Architecture

FLOAT Studio delivers an AI-native developer environment providing Cursor-grade developer velocity with strict tenant boundaries, cryptographically enforced tool approvals, and native Code-OSS desktop integration.

```
+-------------------------------------------------------------------------+
|                  FLOAT Code-OSS Desktop Application                     |
|  - Monaco Workbench (.monaco-workbench, .part.editor)                   |
|  - FLOAT Native Contributions (Ctrl+K Inline Diff, Ctrl+I Composer)     |
|  - Extension Host (101 Built-in Language & Tooling Extensions)          |
+------------------------------------+------------------------------------+
                                     | Named Pipe / Domain Socket (IPC)
                                     v
+-------------------------------------------------------------------------+
|                   FLOAT Desktop Daemon Service                          |
|  - Tree-Sitter AST Semantic Parser & BM25 Hybrid Retrieval              |
|  - Local Workspace File Watcher & Incremental Indexer                   |
|  - Desktop Native Git Service                                           |
+------------------------------------+------------------------------------+
                                     | HTTP / SSE / WebSocket
                                     v
+-------------------------------------------------------------------------+
|                     FLOAT Cloud API Gateway                             |
|  - Authentication & Tenant Ownership Middleware                         |
|  - TabCompletionCoordinator (Privacy Scrubbing & Cache)                 |
|  - ModelRouter (Dynamic Upstream Aliases & Capabilities)                |
|  - Composer Agent & Canonical Tool Registry (Approval-Gated)            |
+-------------------+--------------------------------+--------------------+
                    |                                |
                    v                                v
+----------------------------------+ +----------------------------------+
|    Isolated Execution Runner     | |     Durable Persistence Store    |
| - ProjectProcessManager          | | - Firestore Generation Manifests |
| - Network-Isolated Containers    | | - Byte-Bounded Content Chunks    |
| - PTY WebSocket Terminal Server  | | - Durable Task State Machine     |
+----------------------------------+ +----------------------------------+
```

---

## 2. Key Subsystem Specifications

### 2.1 Tab Completion & Predictive Cursor Tab
- **Endpoint:** `POST /api/ai/complete`
- **Coordinator:** `TabCompletionCoordinator` (`src/services/completion/tabCompletionService.ts`)
- **Key Capabilities:**
  - Prefix/suffix bounded context extraction with LRU caching.
  - Server-side privacy mode redaction: scrub API tokens, private keys, and passwords before provider transmission.
  - Multi-line completion, partial word/line acceptance tokens, and `nextEditJump` line navigation.
  - Language enablement filtering and latency metrics telemetry.

### 2.2 Model Router & Capability-Based Gateway
- **Component:** `ModelRouter` (`src/server/providers/router.ts`)
- **Dynamic Aliases:**
  - `gpt-6-astra` -> high-throughput fast completion
  - `gpt-6.1-sol` -> complex multi-file architectural planning and autonomous editing
  - `gemini-3.8-flash` -> deep multimodal reasoning and large-context codebase ingestion
- **Provider Protocol Support:**
  - OpenAI: Responses API (`/v1/responses`) & Chat Completions with function declarations.
  - Gemini: Multimodal content generation with `functionDeclarations`.
  - Anthropic: Messages API with tool declarations.

### 2.3 Composer & Canonical Tool Registry
- **Component:** `ComposerAgent` & `CanonicalToolRegistry` (`src/services/composer/`)
- **Supported Modes:** `ask` (read-only), `plan` (stepwise architectural blueprint), `agent` (autonomous multi-file drafting), `debug` (diagnostic log evaluation).
- **Security Invariant:** Privileged mutation or execution tools enforce explicit cryptographic approval tokens before invocation. Single-use tokens prevent replay attacks.
- **Fail-Closed Execution:** Commands run via `projectProcessManager` in isolated Docker containers; execution in the host API server process is strictly prohibited.

### 2.4 Code-OSS Native Desktop Release Pipeline
- **Electron Shell:** Packaged via `scripts/packageDesktopRelease.cjs` using genuine Electron runtime.
- **Startup Guarantee:** Boots genuine `desktop/out/main.js` Code-OSS workbench. Generic web browser fallbacks are strictly disabled in release builds.
- **Extensions:** 101 built-in extensions compiled with pure JS native fallbacks for `@vscode/sqlite3`, `native-keymap`, `@vscode/policy-watcher`, and `@vscode/windows-mutex`.
