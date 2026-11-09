# FLOAT Recovery Phase 8: Git, GitHub, and Collaboration

## 1. Overview & Objectives

Phase 8 hardens and verifies Git version control, GitHub and GitLab integration, pull request workflows, and secret leak protection across FLOAT Studio.

Developers must be able to track file modifications, review diffs before committing, generate AI-assisted conventional commit messages, create and switch branches safely, push to remote repositories, and create pull requests—with unbreakable pre-commit and pre-push secret scanning safeguards to prevent accidental credential exposure.

---

## 2. Architecture & Subsystems

```mermaid
flowchart TD
    Files[Workspace Files] --> GitService[Git Service]
    GitService --> Status[Git Status: Added, Modified, Deleted]
    Status --> DiffReview[Diff Review: Unified Diffs]
    DiffReview --> AICommit[AI Conventional Commit Generator]
    
    AICommit --> Staged[Staged Commit Changes]
    Staged --> SecretScan{Pre-Commit Secret Scanner}
    
    SecretScan -->|Detected Leak: sk-proj, ghp, AKIA, PEM| BlockCommit[ABORT COMMIT\nSecretLeakError with File:Line]
    SecretScan -->|No Leaks| CreateCommit[Create Verified Commit Object]
    
    CreateCommit --> RemotePush{Remote Push Safeguard}
    RemotePush -->|Fast-Forward Check| Push[Push to GitHub / GitLab]
    RemotePush --> PullRequest[Create Pull Request]
```

### Key Subsystems

1. **Pre-Commit / Pre-Push Secret Leak Scanner (`src/services/git/secretScanner.ts`)**:
   - `scanFileForSecrets` and `scanChangesForSecrets` scan modified text content against strict regex rules:
     - OpenAI API keys (`sk-proj-...`, `sk-live-...`, `sk-test-...`)
     - GitHub Personal Access Tokens (`ghp_...`, `github_pat_...`)
     - Google Cloud / Gemini API keys (`AIzaSy...`)
     - AWS Access Key IDs (`AKIA...`, `ASIA...`)
     - Slack tokens (`xoxb-...`, `xoxp-...`)
     - Stripe secret keys (`sk_live_...`, `sk_test_...`)
     - Cryptographic Private Key Blocks (`-----BEGIN RSA PRIVATE KEY-----`)
   - Reports line numbers and redacted snippets; strictly blocks commits with `SecretLeakError`.

2. **Git Router Integration (`src/server/github/gitRouter.ts`)**:
   - `createCommit` invokes `scanChangesForSecrets` before creating git blobs or trees on GitHub.
   - Throws HTTP 400 with `leaks` metadata if credentials are found, preventing secrets from ever reaching GitHub.

3. **Local & Cloud Git Service (`src/services/git/gitService.ts`)**:
   - `getStatus`: computes added, modified, deleted files with line addition/deletion statistics (`diffStats`).
   - `getDiff`: generates unified diff patches for developer review before committing.
   - `generateCommitMessageFromDiff`: analyzes diffs and produces conventional commit messages (`feat: ...`, `fix: ...`, `test: ...`).
   - `createBranch` / `switchBranch`: manages branch lifecycle without workspace corruption.

4. **GitHub & GitLab Collaboration (`src/server/github/gitRouter.ts` & `src/features/git/`)**:
   - Repository linking with baseline snapshot recording.
   - Fast-forward commit creation with parent verification.
   - Conflict detection on pull operations.
   - Pull request creation (`createPullRequest`) with duplicate checks and draft support.

---

## 3. Verification & Acceptance Gate

The verification suite (`scripts/testPhase8GitAndGitHub.ts`) verified all 8 Git and collaboration checks:

```
=== FLOAT Recovery Phase 8: Git, GitHub, and Collaboration Test Suite ===

1. Git Status & Diff Review Workflow
  [PASS] Git status accurately classifies modified, added, and deleted files
  [PASS] Git diff produces unified diff for review before commit

2. Pre-Commit Secret Scanning Safeguards
  [PASS] scanFileForSecrets detects OpenAI API keys and reports exact line numbers
  [PASS] scanFileForSecrets detects GitHub tokens, AWS keys, and private key blocks
  [PASS] createCommit throws SecretLeakError and blocks commits with credentials
  [PASS] createCommit succeeds when no secrets are present and updates baseline

3. AI Conventional Commit Message Synthesis
  [PASS] generateCommitMessageFromDiff synthesizes conventional commit messages

4. Branching & Switching
  [PASS] createBranch and switchBranch manage repository branches cleanly

========================================
Phase 8 Test Results: 8 passed, 0 failed
========================================
```

- `npm run lint` (`tsc --noEmit`): **0 errors**.
- All unit tests passed.
