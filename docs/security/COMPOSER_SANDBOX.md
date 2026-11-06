# FLOAT Composer command sandbox

Composer toolchain commands are executed through Docker. FLOAT does not fall back to a host shell when Docker is missing, the daemon is unavailable, or the configured image cannot start.

## Requirements

- Docker Desktop on Windows or macOS, or Docker Engine on Linux.
- Default image: node:22-bookworm-slim. Docker pulls it when it is not present locally.
- Set FLOAT_COMPOSER_SANDBOX_IMAGE to a compatible image for another toolchain. The image must contain /bin/sh and the required compilers/runtimes.

On Linux, prefer rootless Docker. On Windows and macOS, use Docker Desktop's Linux container backend.

## Container policy

Each command runs in a disposable Linux container with:
- Network disabled.
- All Linux capabilities dropped and no-new-privileges enabled.
- Read-only container root filesystem.
- CPU, memory, process-count, timeout, and temporary-filesystem limits.
- Only the disposable Composer workspace mounted writable.
- Workspace node_modules, when present, mounted read-only.
- A fixed environment. Host process variables and provider API keys are not forwarded into the container.
- No Docker socket, host home directory, SSH agent, or credential directory mounted in the container.

Autonomous Composer creates a copy-based shadow workspace before executing commands. Shadow copies use file copies rather than hard links; hard links are shared inodes and are not an isolation mechanism.

## Limits

This is a container-isolation layer, not a formally verified sandbox. The Docker daemon and host kernel remain trusted computing base components. Container escapes and Docker/runtime or kernel vulnerabilities are outside FLOAT's application-level guarantee. Keep Docker updated and use rootless Docker where supported.

The command-string deny-list in FloatSecurityGuard is defense in depth only. When Docker cannot be used, Composer can still produce and review file proposals, but toolchain command execution fails closed.
