# FLOAT Studio — Production Release Checklist

This checklist aligns with the current codebase, `Dockerfile`, and CI pipeline. Verify every item before promoting a build to production.

---

## 1. Runtime & Container Build (`Node 22`)

- [ ] **Node Version**: Confirm `node -v` is `v22.x` across local build, `.github/workflows/ci.yml`, `package.json` (`"engines": { "node": "22.x" }`), and `Dockerfile` (`FROM node:22-bookworm-slim`).
- [ ] **TypeScript Strictness**: Verify `tsconfig.json` has `"strict": true` and `npm run lint` passes with zero errors.
- [ ] **Production Bundle Compilation**:
  - Run `npm run build` and verify that both artifacts are generated cleanly:
    1. Frontend assets in `dist/`
    2. Server bundle at `dist/server.cjs` (`npm start`)
- [ ] **Docker Targets**:
  - Web server target (`runtime`): runs as non-root `USER node`, `git` installed, `HEALTHCHECK` polling `/api/health`, `CMD ["node", "dist/server.cjs"]`.

---

## 2. Environment & Secret Configuration

- [ ] **Database & Durable State (`FIREBASE_SERVICE_ACCOUNT_JSON`)**:
  - Set `FIREBASE_SERVICE_ACCOUNT_JSON` (or GCP Application Default Credentials) in the production environment.
  - Verify `GET /api/health` reports `durableState: true`.
  - When `NODE_ENV=production` and Firestore Admin credentials are missing, stateful endpoints intentionally fail closed with HTTP `503` (`code: "NOT_CONFIGURED"`) rather than using the development in-memory fallback.
- [ ] **AI Provider Key & Model Catalog (`gpt-6-astra`, `gpt-6.1-sol`)**:
  - Configure `OPENAI_API_KEY` only in the server environment.
  - Verify `/api/ai/models/status` and `/api/ai/health`. Models with missing keys or failing health checks are automatically hidden in the UI selector.
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
