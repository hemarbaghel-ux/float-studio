# FLOAT Studio — Security Architecture and Threat Model

**Document Version:** 1.0.0  
**Status:** Authoritative Security Specification  
**Last Updated:** November 2026  

---

## 1. Threat Model & Trust Boundaries

FLOAT Studio operates at the intersection of developer IDE, local filesystem access, and autonomous AI agents. This introduces distinct threat vectors:

```
+-----------------------------------------------------------------------------------+
|                                 TRUST BOUNDARIES                                  |
+-----------------------------------------------------------------------------------+
|  [External Network]                                                               |
|        |                                                                          |
|        v                                                                          |
|  [Backend API Server]  <--- Boundary 1: Authentication & Token Verification       |
|        |                                                                          |
|        v                                                                          |
|  [Model Providers]     <--- Boundary 2: Credential Scrubbing & Secret Containment |
|        |                                                                          |
|        v (AI Responses)                                                           |
|  [Agent / Composer]    <--- Boundary 3: Untrusted AI Output Sanitization          |
|        |                                                                          |
|        v                                                                          |
|  [Terminal / PTY]      <--- Boundary 4: Command Risk Scoring & Container Sandbox   |
|        |                                                                          |
|        v                                                                          |
|  [Host Filesystem]     <--- Boundary 5: Shadow Virtualization & Approval Gates    |
+-----------------------------------------------------------------------------------+
```

### Threat Vectors Analyzed:
1. **Prompt Injection / Jailbreaks:** Malicious code or comments in third-party repositories attempting to command the AI agent to exfiltrate files or execute malicious shell payloads.
2. **Untrusted Command Execution:** Autonomous agents generating destructive or dangerous shell commands (`rm -rf /`, `curl ... | sh`, credential harvesting).
3. **Secret Leakage:** Committing developer credentials (`sk-...`, `ghp_...`, AWS keys, PEM files) to Git remotes.
4. **Cross-Tenant Data Exposure:** In shared or cloud backends, User A accessing User B's workspace files, memories, or terminal streams.
5. **Client Bundle Credential Poisoning:** Exposing raw provider API keys in browser JavaScript bundles.

---

## 2. Authentication & Authorization Architecture

### 2.1. Firebase ID Token Verification
- All stateful backend routes (`/api/ai/*`, `/api/git/*`, `/api/terminal/*`, `/api/projects/*`) enforce token verification via `src/server/middleware/auth.ts`.
- Requests must carry an `Authorization: Bearer <firebase_id_token>` header.
- The server verifies the token signature, issuer, and expiration using `firebase-admin.auth().verifyIdToken()`.
- If the token is missing, expired, or invalid, the request fails immediately with HTTP `401 Unauthorized` and a structured error payload:
  ```json
  {
    "error": {
      "code": "UNAUTHORIZED",
      "message": "Valid Firebase authentication token required."
    }
  }
  ```

### 2.2. Tenant & Project Isolation
- Every project resource, architectural memory, and checkpoint is strictly partitioned by `userId` and `projectId`.
- Database queries enforce tenant scoping:
  ```typescript
  // Enforced invariant in all persistence layers:
  const project = await db.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, req.user.uid))
  });
  if (!project) throw new HttpError(403, "Access to project forbidden.");
  ```
- Terminal PTY sessions are keyed to the authenticated session ID; concurrent users cannot attach to another developer's running terminal process.

---

## 3. Credential Management & Secret Sanitization

### 3.1. Zero-Client-Key Invariant
- **Rule:** No model provider API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) may ever appear in client code, Vite environment variables (`VITE_*`), or browser bundles.
- **Enforcement:** The build script (`vite build`) inspects compiled bundles and asserts that no `VITE_*` variable contains provider key prefixes (`sk-ant-`, `sk-proj-`, `AIzaSy`).
- **Desktop Storage:** In the desktop app, developer-supplied personal API keys (BYOK mode) are stored in the OS-native secure credential store (Windows DPAPI via `keytar` / macOS Keychain / Linux Secret Service) and passed directly to the local daemon over authenticated IPC.

### 3.2. Automated Pre-Commit Secret Scanning
Before any Git commit or pull request is generated by the IDE or autonomous agent (`src/server/git/gitPrService.ts`), staged files are scanned with regex patterns for known secret formats:
- OpenAI API Keys: `sk-[a-zA-Z0-9]{48}`
- Anthropic Keys: `sk-ant-[a-zA-Z0-9_-]{90,}`
- Google API Keys: `AIza[0-9A-Za-z-_]{35}`
- GitHub Tokens: `ghp_[0-9a-zA-Z]{36}`
- AWS Access Keys: `AKIA[0-9A-Z]{16}`
- RSA / OpenSSH Private Keys: `-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----`

If any secret match is found, the commit operation is aborted with HTTP `422 Unprocessable Entity` and the offending file and line number are surfaced to the user.

---

## 4. Terminal & Command Execution Sandboxing

### 4.1. Command Risk Scoring Engine
All terminal commands generated by AI agents or requested via `/api/terminal/exec` are evaluated by the risk analyzer (`src/server/terminal/terminalManager.ts`):

| Risk Tier | Command Patterns | Execution Policy |
| :--- | :--- | :--- |
| **`LOW`** | Read-only inspection (`ls`, `pwd`, `cat`, `git status`, `git diff`, `npm test`) | Executed automatically in workspace context. |
| **`MEDIUM`** | Safe build / edit operations (`npm install`, `npm run build`, `git checkout -b`) | Notification displayed; executed automatically if autonomy is enabled. |
| **`HIGH`** | Destructive / state-altering (`git reset --hard`, `git push --force`, `rm`, `kill`, `dropdb`) | **Blocked until explicit user approval** is received in the UI. |
| **`BLOCKED`** | System-critical attacks (`rm -rf /`, `mkfs`, `:(){ :|:& };:`, raw disk writes) | **Permanently rejected** with security alert logged. |

### 4.2. Docker Container Sandboxing Option
For enterprise and untrusted repository exploration:
- Terminal commands can be redirected into an ephemeral Docker container (`docker run --rm -v workspace:/workspace:rw float-sandbox:latest`).
- The container runs as an unprivileged user (`uid 1000`), with `CAP_DROP_ALL`, network egress filtering, and a read-only root filesystem.
