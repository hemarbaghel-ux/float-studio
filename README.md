# FLOAT AI — Developer Platform & IDE

FLOAT AI is an AI-powered software development environment providing:
1. **Desktop IDE (Primary Product):** An Electron-based desktop application integrating Code-OSS workbench contributions (`desktop/src/vs/workbench/contrib/float/`) with a native Float daemon for local AST parsing, hybrid codebase indexing, inline diffs, and autonomous agent execution.
2. **Web IDE & Companion Portal:** A Monaco-based React web application for browser access, cloud workspace editing, project management, and account settings.
3. **Backend Services:** A Node.js/Express service providing multi-provider AI model routing (Anthropic Claude, OpenAI, Google Gemini), server-side Git/GitHub operations, Firebase authentication verification, and durable cloud state persistence.

---

## Engineering Documentation

Authoritative engineering and architecture documentation is located in `docs/engineering/`:
- [Current Architecture](docs/engineering/CURRENT_ARCHITECTURE.md) — System boundaries, data flows, and component breakdown.
- [Current Truth Matrix](docs/engineering/CURRENT_TRUTH_MATRIX.md) — Exact audit status of every route, component, IPC channel, and subsystem.
- [Service Ownership](docs/engineering/SERVICE_OWNERSHIP.md) — Service boundaries, dependencies, SLAs, and failure modes.
- [Build and Release Guide](docs/engineering/BUILD_AND_RELEASE.md) — Toolchains, packaging steps, and CI/CD pipelines.
- [Test Strategy](docs/engineering/TEST_STRATEGY.md) — Unit, integration, desktop, smoke, and benchmark test suites.
- [Security Model](docs/engineering/SECURITY_MODEL.md) — Authentication, credential protection, container sandboxing, and tenant isolation.
- [Feature Support Matrix](docs/engineering/FEATURE_SUPPORT_MATRIX.md) — Platform support across Web, Windows, macOS, and Linux.

---

## Runtime Requirements

- **Node.js**: `22.x` (enforced in `package.json` `engines`, `.github/workflows/ci.yml`, and `Dockerfile`)
- **Git**: Required on the host or container for worktree isolation, branch creation, commit, and remote push workflows.
- **Docker** *(optional)*: Required only if using containerized terminal sandboxes (`node-pty` + Docker) or building production container images.

---

## Quick Start (Local Development)

1. **Install dependencies:**
   ```bash
   npm ci
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Configure `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY` on the server for real model requests. Configure Firebase Admin credentials when using cloud persistence. Provider credentials must never be placed in browser bundles.

3. **Start the development servers:**
   - **Recommended (Full Stack with Vite HMR + Express API):**
     ```bash
     npm run dev:all
     ```
     Spawns the Express API server (Port 3000) and the Vite frontend with Hot Module Replacement (Port 5173, reverse-proxying `/api` to Port 3000).

   - **Frontend Only:**
     ```bash
     npm run dev:web
     ```

   - **Backend API Server Only:**
     ```bash
     npm run dev:server
     ```

---

## Production Build & Execution

- **Build all components (Web + Express Server):**
  ```bash
  npm run build
  ```
  Runs `npm run build:web` and `npm run build:server`.

- **Build desktop extensions and Float daemon worker:**
  ```bash
  npm run build:desktop
  ```

- **Package desktop extension (.vsix):**
  ```bash
  npm run package:desktop
  ```

- **Start the production server:**
  ```bash
  npm start
  # Runs: node dist/server.cjs
  ```

> **Production Durable State Note (`NODE_ENV=production`)**:
> In production, FLOAT requires valid Firebase Admin credentials (`FIREBASE_SERVICE_ACCOUNT_JSON` or Application Default Credentials). If Firestore Admin credentials are missing when `NODE_ENV=production`, stateful API routes fail closed with HTTP `503` (`code: "NOT_CONFIGURED"`) instead of falling back to ephemeral in-memory storage.

---

## Docker Deployment

The repository includes a multi-stage `Dockerfile` based on `node:22-bookworm-slim` with `git` installed, running as the non-root `node` user, and exposing a `HEALTHCHECK` against `/api/health`.

- **Build and run the web/API server image:**
  ```bash
  docker build --target runtime -t float-studio:web .
  docker run -p 3000:3000 --env-file .env float-studio:web
  ```

---

## Git & GitHub Push Workflow

FLOAT provides server-side Git and GitHub branch/commit/PR integration (`src/server/git/gitPrService.ts`):
- Secret scanning blocks commits containing leaked credentials (`sk-`, `ghp_`, `AIza`, `AKIA`, PEM private keys).
- Protected branches (`main`, `master`, `production`, `release`) cannot be overwritten directly; changes are pushed to isolated feature branches (`float/...`) using the user's server-stored GitHub OAuth token and opened as Pull Requests.

---

## Verification & Testing

- **TypeScript Typecheck:**
  ```bash
  npm run lint
  ```
- **Unit Test Suite:**
  ```bash
  npm run test:unit
  ```
- **Integration Test Suite:**
  ```bash
  npm run test:integration
  ```
- **Desktop & Daemon Test Suite:**
  ```bash
  npm run test:desktop
  ```
- **Full Verification Suite:**
  ```bash
  npm test
  ```
