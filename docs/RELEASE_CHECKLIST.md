# FLOAT Studio — Production Release Checklist

This checklist aligns with the current codebase, `Dockerfile`, and CI pipeline. Verify every item before promoting a build to production.

---

## 1. Runtime & Container Build (`Node 22`)

- [ ] **Node Version**: Confirm `node -v` is `v22.x` across local build, `.github/workflows/ci.yml`, `package.json` (`"engines": { "node": "22.x" }`), and `Dockerfile` (`FROM node:22-bookworm-slim`).
- [ ] **TypeScript Strictness**: Verify `tsconfig.json` has `"strict": true` and `npm run lint` passes with zero errors.
- [ ] **Production Bundle Compilation**:
  - Run `npm run build` and verify that all three artifacts are generated cleanly:
    1. Frontend assets in `dist/`
    2. Server bundle at `dist/server.cjs` (`npm start`)
    3. Background worker bundle at `dist/worker.cjs` (`npm run worker`)
- [ ] **Docker Targets**:
  - Web server target (`runtime`): runs as non-root `USER node`, `git` installed, `HEALTHCHECK` polling `/api/health`, `CMD ["node", "dist/server.cjs"]`.
  - Worker target (`worker`): runs as non-root `USER node`, `CMD ["node", "dist/worker.cjs"]`.

---

## 2. Environment & Secret Configuration

- [ ] **Database & Durable State (`FIREBASE_SERVICE_ACCOUNT_JSON`)**:
  - Set `FIREBASE_SERVICE_ACCOUNT_JSON` (or GCP Application Default Credentials) in the production environment.
  - Verify `GET /api/health` reports `durableState: true`.
  - When `NODE_ENV=production` and Firestore Admin credentials are missing, stateful endpoints intentionally fail closed with HTTP `503` (`code: "NOT_CONFIGURED"`) rather than using the development in-memory fallback.
- [ ] **AI Provider Keys & Model Catalog (`gemini-4-argon`, `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-5-5`)**:
  - Configure `GEMINI_API_KEY`, `OPENAI_API_KEY`, and/or `ANTHROPIC_API_KEY` on the server.
  - Verify `/api/ai/models/status` and `/api/ai/health`. Models with missing keys or failing health checks are automatically hidden in the UI selector.
- [ ] **Cloud Agent Session IDs (Optional)**:
  - Configure `FLOAT_ASTRA_SESSION_ID`, `FLOAT_ASTRA_ENVIRONMENT_ID`, `FLOAT_SOL_SESSION_ID`, `FLOAT_SOL_ENVIRONMENT_ID`, and `FLOAT_CLOUD_AGENT_REMOTE_URL` if using remote cloud agent sessions. Unset variables return `NOT_CONFIGURED` cleanly without hardcoded fallback IDs.
- [ ] **Optional Runtime Packages**:
  - `node-pty` and `playwright` are declared in `optionalDependencies`. If omitted in minimal environments, terminal WebSocket and headless browser tools gracefully return `TERMINAL_NOT_CONFIGURED` / `NOT_CONFIGURED`.

---

## 3. Git & GitHub Push Safety

- [ ] **Git Binary Installed**: Verify `git --version` is available inside the runtime container (`Dockerfile` installs `git` and `ca-certificates`).
- [ ] **GitHub OAuth Credentials**: Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_WEBHOOK_SECRET` for repository sync, remote branch push (`git push`), and Pull Request creation.
- [ ] **Protected Branch & Secret Guards**: Verify `scripts/testPhase7GitAndPRSafety.ts` passes (blocks pushes to `main`/`master`/`production`/`release` and scans staged diffs for secrets before committing or pushing).

---

## 4. Pre-Release Verification Commands

```bash
npm run lint
npm test
npm run build
```
