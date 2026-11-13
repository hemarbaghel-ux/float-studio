# FLOAT Studio — Production Release Checklist

This checklist aligns with the current codebase, `Dockerfile`, `.env.example`, and CI/Release pipelines. Verify every item before promoting a build to production.

---

## 1. Runtime & Container Build

- [ ] **Node Version**:
  - `package.json` allows `"node": ">=18.0.0"` for local tooling compatibility.
  - Confirm production CI (`.github/workflows/ci.yml`), desktop packaging (`.github/workflows/release.yml`), and `Dockerfile` (`FROM node:22-bookworm-slim`) run on `Node 22.x`.
- [ ] **TypeScript Strictness**: Verify `tsconfig.json` has `"strict": true` and `npm run lint` passes with zero errors.
- [ ] **Production Bundle Compilation**:
  - Run `npm run build` and verify that frontend assets (`dist/index.html`) and server bundles (`dist/server.cjs`, `dist/server.js`) are generated cleanly.
- [ ] **Desktop Release Packaging & Binary Verification**:
  - Verify `.github/workflows/release.yml` invokes `node scripts/packageDesktopRelease.cjs --platform=<target>` and `node scripts/validateReleaseArtifacts.cjs --platform=<target>`.
  - Confirm each release artifact is `>= 20 MB`, passes binary magic-header checks (`MZ`, `PK`, `!<arch>\n`, `GZIP`, `DMG`), and passes the headless launch smoke test (`--headless` / `--smoke-test`). Text placeholder files are strictly forbidden.

---

## 2. Environment & Secret Configuration (`.env.example`)

- [ ] **Database & Durable State (`FIREBASE_SERVICE_ACCOUNT_JSON`)**:
  - Set `FIREBASE_SERVICE_ACCOUNT_JSON` (or `GOOGLE_APPLICATION_CREDENTIALS`) in the production server environment.
  - Verify `GET /api/health` reports `durableState: true`.
  - When `NODE_ENV=production` and Firestore Admin credentials are missing, stateful endpoints fail closed with HTTP `503` (`code: "NOT_CONFIGURED"`).
- [ ] **AI Provider Credentials (Server-Side Only)**:
  - Configure `OPENAI_API_KEY` (and optional `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`) only in the server environment.
  - Verify `/api/ai/models`, `/api/ai/models/status`, and `/api/ai/health`. Note that `configured`, `authenticated`, `listed`, and `generationVerified` are tracked as separate states; run `npm run test:live` in staging to verify live generation access.
- [ ] **Isolated Docker Execution & PTY Terminal Runtime**:
  - Configure `FLOAT_DOCKER_BIN`, `FLOAT_EXECUTION_IMAGE` (pinned `@sha256:` digest), `DOCKER_HOST` (`tcp://...`), `DOCKER_TLS_VERIFY=1`, `DOCKER_CERT_PATH`, and `FLOAT_EXECUTION_SHARED_DIR` (`0700` mode).
  - Verify `GET /api/terminal/doctor` reports all isolation prerequisites satisfied before advertising interactive container PTY availability.

---

## 3. Git & GitHub / GitLab Push Safety

- [ ] **Git Binary Installed**: Verify `git --version` is available inside the runtime container (`Dockerfile` installs `git` and `ca-certificates`).
- [ ] **OAuth Credentials & Encryption**: Set `FLOAT_OAUTH_ENCRYPTION_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `GITLAB_CLIENT_ID`, and `GITLAB_CLIENT_SECRET`.
- [ ] **Protected Branch & Secret Guards**: Verify pushes to `main`/`master`/`production`/`release` are blocked and staged diffs are scanned for secrets before committing or pushing.

---

## 4. Privacy & Legal Launch Governance Blocker Checklist

- [ ] **Privacy Policy Status (`GET /api/privacy/policy`)**:
  - `GET /api/privacy/policy` currently returns `status: "draft"` and `productionLaunchBlocked: true` until the product owner supplies and approves:
    1. Data controller identity and privacy contact email (`FLOAT_PRIVACY_CONTROLLER_NAME`, `FLOAT_PRIVACY_CONTACT_EMAIL`)
    2. Retention and deletion schedule (`FLOAT_PRIVACY_RETENTION_DAYS`)
    3. Subprocessors and hosting regions (`FLOAT_PRIVACY_SUBPROCESSORS`)
    4. Covered jurisdictions and user-rights request workflow (`FLOAT_PRIVACY_JURISDICTIONS`, `FLOAT_PRIVACY_RIGHTS_URL`)
    5. Legal sign-off matching actual application telemetry/storage flows (`FLOAT_PRIVACY_APPROVED=true`)

---

## 5. Pre-Release Verification Commands

```bash
npm ci
npm run lint
npm test
npm run build
git diff --check
```
