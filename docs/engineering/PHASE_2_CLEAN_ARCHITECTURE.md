# FLOAT Studio — Clean Architecture Specification (Phase 2)

> **Document Version**: 1.0.0  
> **Target Subsystems**: Desktop Workbench, Backend Services, Web Application, Shared Contracts, Background Daemon  
> **Status**: Authoritative Reference Baseline  

---

## 1. System Overview & Domain Boundaries

FLOAT Studio is architected into four distinct, non-overlapping subsystems governed by typed contracts:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FLOAT Studio Architecture                        │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         ▼                                                       ▼
┌────────────────────────────────┐             ┌────────────────────────────────┐
│   Desktop Workbench (Code-OSS) │             │    Web Application (Browser)   │
│ - Local Workspace Management   │             │ - Cloud Project Management     │
│ - Native Terminal & PTY        │             │ - Browser-based Monaco Editor  │
│ - Native File Watcher          │             │ - Project Persistence          │
│ - Autonomous Composer Agent    │             │ - Team & Usage Dashboards      │
│ - Daemon IPC Client Channel    │             │ - Remote Dev Experience        │
└───────────────┬────────────────┘             └───────────────┬────────────────┘
                │                                              │
                │        ┌────────────────────────────┐        │
                ├───────►│  Shared Domain Contracts   │◄───────┤
                │        │  (src/shared/contracts)    │        │
                │        │ - IWorkspaceService        │        │
                │        │ - IModelCatalog            │        │
                │        │ - IModelGateway            │        │
                │        │ - IToolRegistry            │        │
                │        │ - IDaemonIpcProtocol       │        │
                │        │ - IProposal / UnifiedDiff  │        │
                │        │ - Typed API Validation     │        │
                │        └─────────────┬──────────────┘        │
                │                      │                       │
                ▼                      ▼                       ▼
┌────────────────────────────────┐             ┌────────────────────────────────┐
│    Local Background Daemon     │             │     Backend Express API        │
│ - Multi-Language AST Parser    │             │ - Authentication (Firebase JWT)│
│ - Shadow Workspace Isolation   │             │ - Model Gateway & Routing      │
│ - Hybrid BM25 & Semantic Index │             │ - Conversation Persistence     │
│ - Speculative Token Streamer   │             │ - Sandboxed Terminal Manager   │
│ - Length-Prefixed Binary IPC   │             │ - Git & PR Orchestration       │
└────────────────────────────────┘             └────────────────────────────────┘
```

---

## 2. Authoritative Workspace Interface (`IWorkspaceService`)

Located in [`src/shared/contracts/workspace.ts`](file:///C:/Users/ADMIN/Documents/ChatGPT/Float/float-studio-mainline/src/shared/contracts/workspace.ts).

### Core Invariants:
1. **Workspace Confinement**: Operations must never escape the workspace root.
2. **Path Traversal Defense**: Rejects null bytes, `../` segments, absolute Unix `/` roots, and Windows drive letters (`C:\`).
3. **Sensitive Path Exclusion**: Automatically excludes secret files:
   - Environment variables: `.env`, `.env.*`
   - Git internal structures: `.git`
   - Credentials & Private keys: `.ssh`, `id_rsa`, `id_ed25519`, `*.pem`, `*.key`
   - Dependency caches: `node_modules`, `vendor`, `.venv`

```ts
export interface IWorkspaceService {
  getRootUri(): string;
  resolvePath(relativePath: string): string;
  readFile(relativePath: string): Promise<string>;
  writeFile(relativePath: string, content: string): Promise<void>;
  deleteFile(relativePath: string): Promise<void>;
  fileExists(relativePath: string): Promise<boolean>;
  listFiles(options?: ListFilesOptions): Promise<WorkspaceFile[]>;
  stat(relativePath: string): Promise<WorkspaceFileStat>;
  watch(listener: (event: WorkspaceFileChangeEvent) => void): () => void;
  getCapabilities(): WorkspaceCapabilities;
}
```

---

## 3. Authoritative Model Catalog (`IModelCatalog`)

Located in [`src/shared/contracts/models.ts`](file:///C:/Users/ADMIN/Documents/ChatGPT/Float/float-studio-mainline/src/shared/contracts/models.ts).

### Model Invariants:
- Single authoritative catalog derived strictly from verified production models.
- No fabricated models or phantom providers.
- Models fail closed (`isModelAvailable(...) === false`) if their required provider credentials are unconfigured.

| Model ID | Provider | API Model ID | Context Window | Max Output | Capabilities |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `gpt-6.1-sol` | OpenAI | `gpt-6.1-sol` | 1,050,000 | 65,536 | Coding, Reasoning, Vision, Tools, Streaming, LongContext |
| `gpt-6-astra` | OpenAI | `gpt-6-astra` | 1,050,000 | 32,768 | Coding, Reasoning, Vision, Tools, Streaming, LongContext |
| `gemini-3.8-flash` | Google | `gemini-3.8-flash` | 1,048,576 | 8,192 | Coding, Reasoning, Vision, Tools, Streaming, Multimodal |
| `auto` | OpenAI | `gpt-6-astra` | 1,050,000 | 32,768 | Smart Routing Alias -> `gpt-6-astra` |

---

## 4. Provider-Neutral Model Gateway (`IModelGateway`)

Located in [`src/shared/contracts/gateway.ts`](file:///C:/Users/ADMIN/Documents/ChatGPT/Float/float-studio-mainline/src/shared/contracts/gateway.ts).

### Normalized Error Taxonomy (`GatewayError`):
All provider-specific exceptions are translated into standardized gateway errors before reaching callers:

| Error Code | HTTP Status | Retryable | Cause |
| :--- | :---: | :---: | :--- |
| `AUTH_ERROR` | 401 | No | Invalid or missing API key |
| `QUOTA_EXCEEDED` | 402 | No | Upstream account balance or quota depleted |
| `RATE_LIMITED` | 429 | Yes | Provider rate limits exceeded |
| `MODEL_NOT_FOUND` | 404 | No | Requested model ID does not exist |
| `CONTEXT_EXCEEDED` | 413 | No | Input exceeds model context window limit |
| `INVALID_REQUEST` | 400 | No | Malformed parameters or unsupported tool format |
| `TIMEOUT` | 504 | Yes | Upstream request timed out |
| `CANCELLED` | 499 | No | Client explicitly aborted the request via AbortSignal |
| `PROVIDER_ERROR` | 502 | No | Upstream service failure |

---

## 5. Canonical Agent Tool Registry (`IToolRegistry`)

Located in [`src/shared/contracts/tools.ts`](file:///C:/Users/ADMIN/Documents/ChatGPT/Float/float-studio-mainline/src/shared/contracts/tools.ts).

### Canonical Tools:
1. `list_dir`: Safe relative directory inspection.
2. `read_file`: Bounded workspace file reading (up to budget).
3. `search_codebase`: Lexical and semantic search across project.
4. `propose_changes`: Proposal generator creating pending unified diffs.
5. `run_command`: Sandboxed execution of approved verification commands.

### Approval Invariants:
- Read-only tools (`list_dir`, `read_file`, `search_codebase`) execute autonomously.
- Modification tools (`propose_changes`, `run_command`) enforce explicit user review (`requiresApproval === true`) before touching user files or running host processes.

---

## 6. Versioned Daemon IPC Protocol (`IDaemonIpcProtocol`)

Located in [`src/shared/contracts/daemonIpc.ts`](file:///C:/Users/ADMIN/Documents/ChatGPT/Float/float-studio-mainline/src/shared/contracts/daemonIpc.ts).

### Binary Framing Protocol:
- **Wire Format**: 4-byte big-endian unsigned integer indicating payload length, followed by utf-8 JSON payload.
- **Protocol Version**: `DAEMON_IPC_VERSION = 1`.
- **Handshake**: Handshake request negotiates version compatibility and workspace root confinement before commands are accepted.
- **Predictable Lifecycle**:
  - `stopped` -> `starting` -> `ready` -> `busy` -> `restarting` -> `shutting_down`.
  - Clean `SIGINT`/`SIGTERM` handling ensures child processes and worker channels are released.
