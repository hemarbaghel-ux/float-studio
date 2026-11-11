# FLOAT AI — Developer Platform & IDE

FLOAT AI is a modern AI-powered software development environment built on the **Monaco code editor** (`@monaco-editor/react`), React 19, server-side model gateway routing, structured multi-file code review, Git workflows, and durable Firestore project state.

FLOAT provides both a web platform and a packaged cross-platform desktop application (Electron wrapper) designed around AI-assisted developer workflows. FLOAT does not maintain a Code-OSS fork and makes no claims of VS Code or Code-OSS parity; instead, it provides a streamlined Monaco-based editing experience with integrated AI capabilities.

---

## Architecture & Subsystems

1. **Editor**: Monaco Editor (`@monaco-editor/react`) with syntax highlighting, language diagnostics, and custom keybindings:
   - `Ctrl+K` / `Cmd+K`: Monaco Inline AI Assistant with diff preview and accept/reject.
   - `Ctrl+I` / `Cmd+I`: Multi-file Composer with DAG task planning and change proposals.
   - `Ctrl+L` / `Cmd+L`: Global AI Chat panel toggle with codebase context retrieval.
2. **Desktop Runtime**: Packaged Electron application bundling the client SPA (`dist/`) and entrypoint (`scripts/desktopEntrypoint.cjs`) for Windows (Inno Setup installer + portable ZIP), Linux (.deb + .tar.gz), and macOS (.dmg + .app).
3. **Backend Service**: Production Express server (`src/server/app.ts`) providing model routing, Firebase ID token verification, project execution, and Firestore persistence.
4. **VSCodium Extension**: A standalone VSIX extension (`dist/float-vscodium-poc-1.0.0.vsix`) providing FLOAT AI capabilities inside existing VS Code / VSCodium workbenches.

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
   Configure `OPENAI_API_KEY` on the server for real model requests. Configure Firebase Admin credentials when using cloud persistence. Do not place provider credentials in browser code or commit them.

3. **Start the development server:**
   - **Recommended (Full Stack with Vite HMR + Express API):**
     ```bash
     npm run dev:all
     ```
     Spawns the Express API server (Port 3000) and the Vite frontend with Hot Module Replacement (Port 5173, reverse-proxying `/api` to Port 3000).

   - **Integrated Dev Server (Single Port 3000):**
     ```bash
     npm run dev
     ```

   - **Backend API Server Only:**
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

## Git & GitHub Push Workflow

FLOAT provides server-side Git and GitHub branch/commit/PR integration (`src/server/git/gitPrService.ts`):
- Secret scanning blocks commits containing leaked credentials (`sk-`, `ghp_`, `AIza`, `AKIA`, PEM private keys).
- Protected branches (`main`, `master`, `production`, `release`) cannot be overwritten directly; changes are pushed to isolated feature branches (`float/...`) using the user's server-stored GitHub OAuth token and opened as Pull Requests.

---

## Verification & Testing

- **Typecheck:**
  ```bash
  npm run lint
  ```
- **Full verification suite (including all `scripts/testPhase*.ts` tests):**
  ```bash
  npm test
  ```
