# FLOAT Studio — Service Ownership & Topology

**Document Version:** 1.0.0  
**Status:** Living Architectural Specification  
**Last Updated:** November 2026  

---

## 1. Overview & Service Inventory

FLOAT Studio decomposes its capabilities across four core subsystems:
1. **Desktop Code-OSS Shell & Workbench (`desktop/`)**
2. **Float Daemon Sidecar (`daemon/`)**
3. **Backend API & Model Gateway (`src/server/`)**
4. **Web Companion Frontend (`src/`)**

```
+---------------------------------------------------------------------------------+
|                               FLOAT Studio Monorepo                              |
+---------------------------------------------------------------------------------+
| 1. Desktop IDE (Code-OSS)      | Owner: Staff Electron & Workbench Engineers     |
| 2. Float Daemon (Sidecar)      | Owner: AI Systems & Performance Engineers       |
| 3. Backend & Model Gateway     | Owner: Backend & Security Engineers             |
| 4. Web Companion Application   | Owner: Frontend & Platform Engineers            |
+---------------------------------------------------------------------------------+
```

---

## 2. Detailed Service Specifications

### 2.1. Float Desktop Application (Code-OSS / Electron)
- **Primary Directories:** `desktop/src/vs/workbench/contrib/float/`, `desktop/src/main.js`
- **Logical Owner:** Staff Electron Engineer & Workbench UX Lead
- **Process Model:** Multi-process Electron runtime (Main process, Workbench Renderer, Shared Process, Extension Host).
- **Communication Interfaces:**
  - Standard Code-OSS IPC channels.
  - Native Named Pipe / UNIX Socket to Float Daemon.
  - HTTPS / WSS / SSE to Float Backend Server.
- **Resource Budget & Ceilings:**
  - Idle Memory: ≤ 350 MB RAM across all renderer processes.
  - Active Typing Latency: ≤ 16ms frame render budget.
  - Inline Diff Decorator Render: ≤ 25ms for 1,000-line changes.
- **Failure Modes & Fallback:**
  - If Daemon IPC connection drops: Automatically retry 3 times with exponential backoff (100ms, 500ms, 2000ms). If unreachable, fall back to in-process lexical search (`floatDaemonRuntimeFallback.ts`).
  - If Backend API unreachable: Notify user with non-blocking status bar toast; allow local file editing, Git, and extensions to continue functioning offline.

---

### 2.2. Float Daemon (Codebase Intelligence Sidecar)
- **Primary Directories:** `daemon/src/`, `daemon/grammars/`
- **Logical Owner:** AI Systems Engineer & Native Optimization Lead
- **Process Model:** Dedicated Node.js background child process with worker threads (`worker_threads`).
- **Communication Interfaces:**
  - Windows: Named Pipe (`\\.\pipe\float-daemon-<pid>`)
  - Linux / macOS: UNIX Domain Socket (`/tmp/float-daemon-<pid>.sock` or `$XDG_RUNTIME_DIR/float-daemon.sock`)
- **Protocol:** Typed JSON-RPC over framing protocol with sequence numbers and error codes.
- **Resource Budget & Ceilings:**
  - Startup Handshake: ≤ 250ms from spawn to ready.
  - AST Symbol Query: ≤ 10ms for single-file symbol lookup.
  - Incremental Index Invalidation: ≤ 30ms per file change.
  - Memory Ceiling: ≤ 500 MB RAM for workspaces under 25,000 files. Automatic garbage collection triggered when memory exceeds 800 MB.
- **Failure Modes & Fallback:**
  - Uncaught Exception / Crash: Electron Main process restarts daemon automatically up to 3 times in 5 minutes. If repeated crashes occur, marks daemon disabled for the current session.

---

### 2.3. Backend API Server & Multi-Provider Model Gateway
- **Primary Directories:** `server.ts`, `src/server/`
- **Logical Owner:** Backend Engineer & Infrastructure Lead
- **Process Model:** Node.js 22 LTS single or cluster instance (configured via Docker / Cloud Run).
- **Port Bindings:**
  - Local Dev: Port `3000` (HTTP / SSE / WebSocket)
  - Production: Configured via `PORT` environment variable (default `8080` in container).
- **External Dependencies:**
  - Anthropic Claude API (`@anthropic-ai/sdk`)
  - OpenAI API (`openai`)
  - Google Gemini API (`@google/genai`)
  - Firebase Authentication (`firebase-admin`)
  - Google Cloud Firestore (`@google-cloud/firestore`) or PostgreSQL (`pg` + `drizzle-orm`)
  - GitHub REST API
- **SLAs & Performance Budgets:**
  - `/api/health`: 99.99% availability, p99 latency ≤ 10ms.
  - Time-to-First-Token (TTFT) for streaming chat: ≤ 600ms (provider dependent).
  - Terminal Session Spawn: ≤ 150ms.
- **Failure Modes & Fallback:**
  - Provider Rate Limit / Outage: Model Gateway automatically attempts configured fallback provider (Claude 3.5 Sonnet -> GPT-4o -> Gemini 2.5 Pro).
  - Firestore Outage: In production, fails closed with HTTP 503 (`NOT_CONFIGURED` / `STORAGE_UNAVAILABLE`) to prevent silent data loss. In local development (`NODE_ENV=development`), falls back to ephemeral memory store.

---

### 2.4. Web Companion Application
- **Primary Directories:** `src/components/`, `src/stores/`, `src/services/`
- **Logical Owner:** Frontend Engineer & Design Systems Lead
- **Hosting / Runtime:** Static SPA served via Vite dev server (Port `5173`) or production Nginx/Express static file mounter (`dist/`).
- **Dependencies:**
  - Monaco Editor (`@monaco-editor/react`)
  - React 19 (`react`, `react-dom`)
  - Zustand (`zustand`)
  - Lucide Icons (`lucide-react`)
- **Resource Budget & Ceilings:**
  - Initial JS Bundle Size (gzipped): ≤ 850 KB (excluding async Monaco chunk).
  - First Contentful Paint (FCP): ≤ 1.2s on 4G connection.
- **Failure Modes & Fallback:**
  - Network Offline: State cached in browser IndexedDB/localStorage; banner warns user of offline state.
  - Monaco Load Failure: Displays fallback accessible textarea with basic syntax styling.

---

## 3. Communication Matrix & Port Allocations

| Source Subsystem | Destination | Channel / Port | Protocol | Encryption / Auth |
| :--- | :--- | :--- | :--- | :--- |
| Desktop Workbench | Float Daemon | Named Pipe / UNIX Socket | JSON-RPC | OS process ownership & permissions |
| Desktop Workbench | Backend API | HTTP(S) / Port 3000 / 8080 | REST / SSE | Firebase Bearer Token |
| Web Companion | Backend API | HTTP(S) / Port 3000 / 8080 | REST / SSE | Firebase Bearer Token + Strict CORS |
| Web Companion | Backend Terminal | WebSocket / WSS | binary / JSON | Firebase Ticket Auth |
| Backend API | OpenAI / Anthropic / Gemini | HTTPS / Port 443 | TLS 1.3 REST / SSE | Server-side API Keys (`Authorization: Bearer`) |
| Backend API | Firestore / Database | TLS 1.3 / Port 443 / 5432 | gRPC / TLS | GCP Service Account / DB TLS Cert |

---

## 4. Incident Response & Escalation Protocol

1. **Build / CI Breakage:** Infrastructure Lead investigates within 1 hour. Fix-forward or revert PR immediately.
2. **Model Gateway Regression:** Backend Lead reviews provider error rates and failover telemetry. If error rate > 5%, adjust fallback weights.
3. **Desktop Crash on Launch:** Staff Electron Engineer tests against clean runner snapshots (Windows, macOS, Linux) with `--smoke-test`.
