# FLOAT STUDIO — DEPLOYMENT & ENVIRONMENT SPECIFICATION

**Specification Version:** v1.2.2  
**Target Environments:** Production Hosted API Server, Desktop Local Daemon, and CI/CD Runners  

---

## 1. Required Host Environment Variables

### Security & Approval Tokens
| Variable | Required | Description | Default / Example |
| :--- | :--- | :--- | :--- |
| `FLOAT_APPROVAL_SECRET` | **Production** | Secret key used to sign and verify HMAC-SHA256 tool approval tokens | Cryptographically random 256-bit string |
| `FLOAT_DESKTOP_DEV` | Desktop | Enables local desktop development features when set to `1` | `0` (hosted production) |
| `FLOAT_ENABLE_LOCAL_EXECUTION`| Optional | Enables fallback local execution on dev machines | `false` (fail-closed) |

### Docker Execution & Sandboxing (ProjectProcessManager)
| Variable | Required | Description | Default / Example |
| :--- | :--- | :--- | :--- |
| `FLOAT_DOCKER_BIN` | **Production** | Path to Docker CLI executable | `/usr/bin/docker` or `docker.exe` |
| `FLOAT_EXECUTION_IMAGE` | **Production** | Hardened container image pinned by SHA256 digest | `float-runner@sha256:7b5...` |
| `DOCKER_HOST` | **Production** | Docker daemon socket or TLS endpoint | `tcp://127.0.0.1:2376` or `npipe:////./pipe/docker_engine` |
| `DOCKER_TLS_VERIFY` | **Production** | Enforces TLS certificate validation | `1` |
| `DOCKER_CERT_PATH` | **Production** | Directory containing CA, cert, and key files | `/etc/docker/certs` |
| `FLOAT_EXECUTION_SHARED_DIR`| **Production** | Host directory for ephemeral workspace bind mounts | `/var/lib/float/workspaces` |
| `FLOAT_EXECUTION_UID` | **Production** | UID for unprivileged in-container execution | `1000` |
| `FLOAT_EXECUTION_GID` | **Production** | GID for unprivileged in-container execution | `1000` |

### Firebase & Cloud Storage
| Variable | Required | Description | Default / Example |
| :--- | :--- | :--- | :--- |
| `FIREBASE_PROJECT_ID` | **Production** | Google Cloud / Firebase project identifier | `float-studio-prod` |
| `GOOGLE_APPLICATION_CREDENTIALS` | **Production** | Service account JSON key path for Admin SDK | `/etc/secrets/firebase-admin.json` |

---

## 2. Docker Sandbox Configuration & Security Baseline

To preserve container isolation and prevent container escapes:
1. **Network Isolation:** `--network=none` strictly enforced on all project execution containers.
2. **Resource Boundaries:**
   - Memory limit: `--memory=512m` (swap capped at 512m).
   - CPU quota: `--cpus=1`.
   - Process limit: `--pids-limit=128`.
3. **Privilege Reduction:**
   - `--cap-drop=ALL` (drops all Linux capabilities).
   - `--security-opt=no-new-privileges`.
   - Read-only root filesystem (`--read-only`).
   - Non-root user execution (`--user 1000:1000`).
   - Ephemeral memory-only `/tmp` mount (`--tmpfs /tmp:rw,noexec,nosuid,size=64m`).
