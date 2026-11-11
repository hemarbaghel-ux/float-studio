# FLOAT Studio — Production Backend Deployment Guide

This guide details how to deploy the production Express backend for FLOAT Studio to **Google Cloud Run** using container images, configure required environment variables, and verify backend health and authentication.

---

## Architecture Overview

- **Runtime**: Node.js 22 LTS container (`node:22-bookworm-slim`), running compiled Express server (`dist/server.cjs`).
- **Endpoints**:
  - `GET /health` & `GET /api/health`: Public health check returning HTTP `200` with status, uptime, and timestamp.
  - `POST /api/ai/chat`: Authenticated SSE streaming model chat (requires verified Firebase ID token).
  - `GET /api/ai/models` & `GET /api/ai/models/status`: Authenticated model catalog and provider status.
  - `GET /api/auth/profile` & `POST /api/auth/profile`: User profile state (auto-provisioned on first login).
  - `POST /api/subscription/webhook`: Raw body Stripe billing webhook.
- **Port**: Google Cloud Run automatically sets `PORT=8080`. The server dynamically binds to `process.env.PORT` with fallback to `3000`.
- **CORS**: Strict CORS whitelist allows configured web origins (`ALLOWED_ORIGINS` / `CORS_ORIGIN`), local development, and desktop application requests (`file://`, `float://`, null origin, Electron user agents). Unauthorized foreign browser origins are rejected with `403 Forbidden`.
- **Rate Limiting**: Built-in per-IP sliding window rate limiting (120 requests/min per IP) to mitigate abuse on public routes.

---

## Deployment to Google Cloud Run

### 1. Prerequisites
- Google Cloud SDK (`gcloud` CLI) installed and authenticated:
  ```bash
  gcloud auth login
  gcloud config set project <YOUR_GCP_PROJECT_ID>
  ```
- Artifact Registry or Google Container Registry API enabled:
  ```bash
  gcloud services enable run.googleapis.com artifactregistry.googleapis.com
  ```

### 2. Build and Push Container Image
Build the container image using Google Cloud Build:
```bash
gcloud builds submit --tag gcr.io/<YOUR_GCP_PROJECT_ID>/float-backend:latest .
```

### 3. Deploy Service to Cloud Run
Deploy with HTTP/2 and concurrency configured:
```bash
gcloud run deploy float-backend \
  --image gcr.io/<YOUR_GCP_PROJECT_ID>/float-backend:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 0 \
  --max-instances 10 \
  --env-vars-file .env.production.yaml
```

Alternatively, set environment variables directly:
```bash
gcloud run services update float-backend \
  --region us-central1 \
  --set-env-vars NODE_ENV=production \
  --set-env-vars OPENAI_API_KEY="sk-..." \
  --set-env-vars FIREBASE_PROJECT_ID="float-studio" \
  --set-env-vars ALLOWED_ORIGINS="https://float-studio.web.app,https://floatstudio.dev"
```

### 4. Verify Health Check
Once deployed, verify that the health check responds with HTTP `200`:
```bash
curl -i https://<YOUR-CLOUD-RUN-URL>/health
```
Expected output:
```json
HTTP/2 200 
content-type: application/json; charset=utf-8

{"status":"ok","uptime":3.42,"timestamp":1731327600000}
```

---

## Environment Variables Reference

All server configuration is managed through environment variables. Do **NOT** commit secrets to version control.

| Variable | Required? | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | **Yes** | `development` | Set to `production` in live environments. Enforces strict authentication and fail-closed persistence. |
| `PORT` | Optional | `3000` | Port for the HTTP server. Cloud Run sets this automatically to `8080`. |
| `ALLOWED_ORIGINS` | Recommended | `""` | Comma-separated list of allowed web browser origins for CORS (e.g. `https://float-studio.web.app,https://floatstudio.dev`). Desktop apps are always permitted. |
| `FLOAT_BACKEND_URL` | Optional | Current host | Public URL of this hosted backend (e.g. `https://api.floatstudio.dev`). |
| `OPENAI_API_KEY` | **Yes** | None | Primary OpenAI API key for frontier models (`gpt-6-astra`, `gpt-6.1-sol`, `gpt-4o`). Server-only; never sent to clients. |
| `GEMINI_API_KEY` | Optional | None | Google Gemini API key for Gemini models (`gemini-3.8-flash`). |
| `ANTHROPIC_API_KEY` | Optional | None | Anthropic API key for Claude models. |
| `FIREBASE_PROJECT_ID` | **Yes** | `float-studio` | Google Cloud / Firebase project ID for token verification and Firestore. |
| `FIREBASE_CLIENT_EMAIL` | Recommended | None | Service account email for Firebase Admin SDK. |
| `FIREBASE_PRIVATE_KEY` | Recommended | None | Service account private key (PEM format with `\n` linebreaks) for Firebase Admin SDK. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Optional | None | Alternative raw JSON string containing the full service account credentials. |
| `STRIPE_SECRET_KEY` | Optional | None | Stripe secret key (`sk_live_...` or `sk_test_...`) for subscriptions and checkout sessions. |
| `STRIPE_WEBHOOK_SECRET` | Optional | None | Stripe endpoint secret (`whsec_...`) for verifying cryptographic webhook signatures. |
| `SENTRY_DSN` | Optional | None | Sentry DSN for server and client error tracking. If omitted, Sentry stays disabled with zero overhead. |
| `GITHUB_CLIENT_ID` | Optional | None | GitHub OAuth App client ID for repository sync. |
| `GITHUB_CLIENT_SECRET` | Optional | None | GitHub OAuth App client secret for repository sync. |

---

## Alternative: Render Deployment

1. Create a new **Web Service** on [Render](https://render.com).
2. Connect your Git repository.
3. Select **Docker** environment.
4. Set **Health Check Path** to `/health`.
5. Add the required environment variables from the table above in the Render Dashboard.
6. Render will automatically build the `Dockerfile` and start the container on `$PORT` (Render default: `10000`).
