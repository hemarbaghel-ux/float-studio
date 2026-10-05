# FLOAT Studio

FLOAT Studio is a browser based coding workspace with AI chat, reviewable code proposals, model integrations, and account backed project features.

## Requirements

- Node.js 24.x and npm
- A Firebase project with Authentication and the configured Firestore database enabled
- At least one server-side model provider key (for example `GEMINI_API_KEY`)
- An HTTPS origin and OAuth app credentials to enable GitHub or GitLab connections

## Local development

```sh
npm ci
cp .env.example .env
npm run dev
```

Set `GEMINI_API_KEY` in `.env` to enable Gemini calls. For Firestore-backed agent, eval, proposal, and OAuth persistence during local development, run `gcloud auth application-default login` or set `GOOGLE_APPLICATION_CREDENTIALS` to a local service account file. Do not commit that file. The UI can sign in only when the Firebase project has the requested providers enabled and the deployed origin is in its authorized domains.

Browser-local project, transcript, and automation caches are partitioned by Firebase user ID; signed-out work is stored in a separate local namespace. Legacy cache entries created before account partitioning are never silently assigned to an account. A one-time confirmation prompt lets the owner import them; existing account data is not overwritten, source caches are kept, and one account's claim prevents another account in that browser from importing the same legacy data (legacy automation data is backed up before ownership is assigned).

## Build and checks

```sh
npm run lint
npm test
npm run build
npm start
```

`npm start` serves the production build from `dist/`. The server listens on `PORT` (default `3000`) and exposes `/api/health` for health checks.

## Production deployment

The included Dockerfile builds a production image on Node 24. For a Cloud Run deployment:

1. Build and deploy the image with ingress restricted as appropriate for the app.
2. Attach a dedicated service account with Firestore access to the configured named database. The server uses Application Default Credentials; do not ship service account keys in the image.
3. Configure the Firebase web app, Authentication providers, authorized domains, Firestore rules, and the named database referenced by `firebase-applet-config.json`.
4. Set `APP_URL` to the canonical HTTPS origin. Set `FLOAT_OAUTH_ENCRYPTION_KEY` to a stable base64 encoded 32-byte secret; store it in Secret Manager and keep it unchanged while encrypted integration tokens exist.
5. Configure at least one model provider secret such as `GEMINI_API_KEY`. Provider keys are server-side and must not use a `VITE_` prefix.
6. To enable GitHub or GitLab, configure the corresponding client ID and secret. Register the callback URLs as `APP_URL/api/integrations/github/callback` and `APP_URL/api/integrations/gitlab/callback`.
7. Configure `NODE_ENV=production` and the platform supplied `PORT`.
8. Install Git in the app/worker image. Agent tasks create an independent local Git repository, `agent/<task-id>` branch, and linked worktree from FLOAT's saved project snapshot. Set `FLOAT_AGENT_WORKTREE_ROOT` to a private writable scratch directory and `FLOAT_GIT_BIN` if Git is not on `PATH`.

OAuth connection records and one-time callback states are stored in Firestore by the server Admin SDK; browser Firestore rules deny access to these collections. The Admin SDK uses the configured named database and the Cloud Run service account.

Agent task records, sequenced activity events, isolated-workspace snapshots, and proposals are stored in Firestore. Queued tasks are claimed transactionally; a Firestore lease serializes tasks for the same owner/project, renews with the worker heartbeat, and expires if a worker disappears. Each running task uses a task-private Git branch/worktree; only validated proposal changes are written there. The review diff and baseline commit are persisted, then the local worktree and branch repository are removed. Users must review the durable proposal before applying it to their active project. The generated branch is based on FLOAT's saved file snapshot and has no GitHub remote or source-repository ancestry; pushing/merging this task branch to a connected repository is not implemented. Task events stream over authenticated, resumable SSE; task state still refreshes through the task API. Interrupted tasks can be resumed or retried, and stale task worktrees are removed during recovery. Evaluation runs are persisted and marked interrupted if their worker stops. For sustained high availability and long-running jobs, deploy a dedicated managed worker queue and worker service before scaling beyond a preview release.

## Current release scope

FLOAT is a preview browser application. Subscription checkout, paid plan entitlements, desktop installers, and hosted cloud execution are not implemented. The browser worker is isolated from the server and does not provide a remote shell. Provider availability depends on deployment credentials and account configuration. Do not advertise paid plans or hosted execution until those services are implemented and operational.
