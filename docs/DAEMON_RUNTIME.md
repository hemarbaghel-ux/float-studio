# FLOAT native daemon runtime

FLOAT starts its sidecar daemon as a Code-OSS Electron Utility Process Worker.

## Lifecycle and trust boundary

- The desktop workbench starts the worker after restore.
- Code-OSS transfers a MessagePort to the utility process. FLOAT uses the `floatDaemonRuntime` channel to control start, status, daemon RPC and stop.
- The utility process—not the renderer—creates a randomized named pipe (Windows) or Unix socket below a private temporary directory (POSIX).
- The utility process owns the Node.js `FloatDaemonClient`, connects it to the daemon server, and verifies health before announcing startup.
- The renderer receives a narrow RPC facade. It does not import Node.js `fs`, `net`, `os`, `path`, `crypto` or the socket client.
- Daemon method forwarding is allowlisted to health and in-memory semantic-index operations. The pre-existing daemon persistence handlers are not exposed until their disk round-trip is corrected; shadow/toolchain execution methods are also blocked.
- The daemon starts with `allowSandboxExecution: false`; legacy shadow/toolchain handlers fail closed.
- Index snapshots are stored outside the opened repository under the current user's `~/.float-studio/daemon-index/<workspace-hash>` directory. The utility process creates POSIX storage folders with owner-only permissions.
- Unexpected worker exits trigger bounded exponential restart attempts. Workbench shutdown stops the daemon and removes its temporary socket directory.

## Building

The utility process entrypoint must be present at:

`desktop/out/vs/workbench/contrib/float/electron-sandbox/floatDaemonWorkerMain.js`

Run `npm run build:float-daemon-worker` from the repository root to build it. The desktop package runs the same script after `npm run compile` and `npm run compile-build`.

## Current scope

This change starts, monitors and exposes a restricted daemon RPC facade through `IFloatDaemonRuntimeService.getClient()`. Chat, Composer, autocomplete and the workspace indexer are not all routed through the sidecar yet; those integrations are separate follow-up slices. The utility process is managed by Code-OSS and is not a replacement for Composer's Docker execution isolation.
