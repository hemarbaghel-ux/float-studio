# FLOAT native daemon runtime

FLOAT starts its sidecar daemon as a Code-OSS Electron Utility Process Worker.

## Lifecycle

- The desktop workbench starts the worker after restore.
- Code-OSS transfers a MessagePort to the utility process. FLOAT uses the `floatDaemonRuntime` channel to start and stop the sidecar.
- The daemon listens on a per-window randomized local named pipe (Windows) or Unix socket under a private temporary directory (POSIX).
- The existing `FloatDaemonClient` connects to that local endpoint and performs a health check before the runtime is reported as ready.
- An unexpected worker exit moves the runtime to `failed` and triggers bounded exponential restart attempts.
- Closing or reloading the workbench stops the daemon and removes its temporary runtime directory. The daemon's index snapshot is stored under the current user's `~/.float-studio/daemon-index/<workspace-hash>` directory, outside the opened repository. The storage directory is created with owner-only permissions on POSIX systems.

## Building

The utility process entrypoint must be present at:

`desktop/out/vs/workbench/contrib/float/electron-sandbox/floatDaemonWorkerMain.js`

Run `npm run build:float-daemon-worker` from the repository root to build it. The desktop package runs the same script after `npm run compile` and `npm run compile-build`.

## Safety gate and current scope

The managed runtime explicitly starts `FloatDaemonServer` with shadow/toolchain execution disabled. The older daemon shadow manager and host-process runner must not become reachable merely because the worker starts. Those command handlers fail closed until a separately reviewed isolated adapter is enabled.

This change starts, monitors and exposes the daemon client through `IFloatDaemonRuntimeService`. It does not yet route every Chat, Composer, autocomplete or indexing request through that client; those integrations are separate follow-up slices. The utility process itself is managed by Code-OSS and is not a replacement for Composer's Docker execution isolation.
