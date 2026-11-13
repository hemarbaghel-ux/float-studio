# FLOAT AI — Developer Platform & IDE

FLOAT AI is an AI-powered software development environment combining a Monaco code editor, server-side AI model routing, Composer multi-file code proposals, checkpoint rollback, Git workflows, and durable Firestore project state.

---

## Runtime Requirements

- **Node.js**:
  - `package.json` `engines` specifies `>=18.0.0` so local development and test tooling can run on Node 18+.
  - Production CI (`.github/workflows/ci.yml`), desktop release builds (`.github/workflows/release.yml`), and container deployments (`Dockerfile`) target **Node.js `22.x`**.
- **Git**: Required on the host or container for native local Git status/diff/branch/commit operations and GitHub/GitLab push/PR workflows.
- **Docker** *(required for isolated project execution & PTY terminal)*: Required when enabling `ProjectProcessManager` (`src/server/execution/processManager.ts`) and `TerminalWsServer` (`src/server/terminal/terminalWsServer.ts`). Without the required Docker/TLS variables (`FLOAT_DOCKER_BIN`, `FLOAT_EXECUTION_IMAGE` pinned by `@sha256:` digest, `DOCKER_HOST`, `DOCKER_TLS_VERIFY=1`, `DOCKER_CERT_PATH`, `FLOAT_EXECUTION_SHARED_DIR`), terminal and project execution routes fail closed with `TERMINAL_NOT_CONFIGURED` / `503`. Note that the in-browser command preview (`src/features/float/sandbox.ts`) is a virtual in-memory preview interpreter, **not** an OS-level or container terminal.

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
   Configure `OPENAI_API_KEY` (and optional `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`) on the server for real model requests. Configure Firebase Admin credentials (`FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`) when using cloud persistence. Never place provider credentials in browser code or commit them.

3. **Start the development server:**
   - **Recommended (Full Stack with Vite HMR + Express API):**
     ```bash
     npm run dev:all
     ```
     Spawns `scripts/devAll.mjs`: starts the Express API server on Port `3000` and the Vite HMR frontend on Port `5173` (reverse-proxying `/api` to Port `3000`).

   - **Frontend Vite Dev Server Only (`vite`):**
     ```bash
     npm run dev
     ```
     Starts the Vite frontend dev server (`vite`). Pair with `npm run dev:server` in a second terminal when testing API routes.

   - **Backend Express API Server (`node --import tsx server.ts`):**
     ```bash
     npm run dev:server
     ```

---

## Production Build & Execution

Build the Vite frontend (`dist/`) and Express server bundles (`dist/server.cjs` and `dist/server.js`):

```bash
npm run build
```

- **Start the production web/API server:**
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

## Git & GitHub / GitLab Workflows

FLOAT separates native local Git operations from remote GitHub/GitLab API collaboration:
- **Native Local Git (`src/services/git/nativeLocalGitService.ts`)**: Executes real `git` CLI operations (`status`, `diff`, `add`, `restore --staged`, `branch`, `checkout`, `commit`) against a local filesystem repository. (In-memory `LocalGitService` is retained strictly for deterministic unit tests and browser-virtual workspaces.)
- **Remote GitHub / GitLab Push & PR (`src/server/git/gitPrService.ts`, `src/server/github/gitRouter.ts`)**:
  - Secret scanning blocks commits containing leaked credentials (`sk-`, `ghp_`, `AIza`, `AKIA`, PEM private keys).
  - Protected branches (`main`, `master`, `production`, `release`) cannot be overwritten directly; changes are pushed to isolated feature branches (`float/...`) using the user's server-encrypted OAuth token and opened as Pull Requests.

---

## Verification & Testing

- **Typecheck:**
  ```bash
  npm run lint
  ```
- **Full automated verification suite (Mocked/Deterministic Contract & Regression Tests):**
  ```bash
  npm test
  ```
- **Opt-In Live Model Provider Smoke Test (Requires real server provider credentials):**
  ```bash
  npm run test:live
  ```
