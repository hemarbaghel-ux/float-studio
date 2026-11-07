# FLOAT native daemon runtime

FLOAT starts its sidecar daemon as a Code-OSS Electron Utility Process Worker.

## Lifecycle and trust boundary

- The desktop workbench starts the worker after restore.
- Code-OSS transfers a MessagePort to the utility process. FLOAT uses the `floatDaemonRuntime` channel to control start, status, daemon RPC and stop.
- The utility process—not the renderer—creates a randomized named pipe (Windows) or Unix socket below a private temporary directory (POSIX).
- The utility process owns the Node.js `FloatDaemonClient`, connects it to the daemon server, and verifies health before announcing startup.
- The renderer receives a narrow RPC facade. It does not import Node.js `fs`, `net`, `os`, `path`, `crypto` or the socket client.
- Daemon forwarding is allowlisted to health, semantic indexing/search, symbol lookup, file removal and indexed-file listing.
- The daemon starts with `allowSandboxExecution: false`; legacy shadow/toolchain handlers fail closed. Direct persistence RPCs are not exposed; snapshot writes are performed internally by the daemon.
- Browser workbenches register a no-op runtime so shared Chat/Composer/Autocomplete code can keep using its local fallback without requiring Electron.
- Unexpected worker exits trigger bounded exponential restart attempts. Workbench shutdown stops the daemon and removes its temporary socket directory.

## Workspace indexing

- The current synchronizer indexes the first local `file:` workspace folder. Multi-root aggregation and remote/virtual filesystems are not implemented.
- Initial scans are capped at 10,000 files. Individual files over 2 MB are skipped.
- Only approved source, configuration and documentation extensions are included.
- Dependency/build/cache directories, dotenv files, credential stores, private keys, binary files and symlinks are excluded.
- Add/update/delete events are applied incrementally.
- On startup, the synchronizer asks the daemon for its known relative paths, scans the current workspace, and removes cached entries that are no longer present or indexable. If the listing RPC fails, the scan does not prune from an incomplete comparison.

## Semantic index persistence

Snapshots are stored outside the opened repository under the current user's
`~/.float-studio/daemon-index/<workspace-hash>` directory. POSIX storage
folders are created with owner-only permissions, and snapshot/manifest files
are written with owner-only file permissions.

Version-2 snapshots use unique immutable data-generation files. The daemon
writes the new data file first, then atomically replaces the manifest pointer.
A crash before the pointer update leaves the previous snapshot readable.
Version-1 `index.data.json` snapshots remain readable and are upgraded on the
next save.

Snapshots contain symbol metadata and searchable code chunks, including the
current deterministic feature vectors. The loader verifies the checksum,
manifest counts, record shape and vector dimensions before restoring a cache.
Invalid snapshots are ignored so the current workspace scan can rebuild the
index. File additions, updates and deletions schedule a debounced snapshot
write; graceful daemon shutdown flushes pending writes.

The current 384-dimensional vectors are deterministic token-hash projections,
not learned embeddings. The daemon symbol extractor uses grammar-profile
regular expressions, not genuine Tree-sitter parsing. These are explicit
technical limitations, not completed semantic-model features.

## Chat, Composer and Cursor Tab integrations

- Chat and Composer route explicit `@codebase` and `@symbol` mentions through daemon search and include bounded snippets in model context.
- Composer's code-search tool tries daemon retrieval first, then falls back to the existing workbench index and file search.
- Cursor Tab can include up to two bounded related-file snippets in its completion prompt. Retrieval has a 70 ms RPC timeout, excludes the active file, and fails open to normal completion when the daemon is unavailable or slow.
- The existing model-backed completion provider remains responsible for generating inline completions. The daemon provides context; it does not generate the completion itself.

## Building

The utility process entrypoint must be present at:

`desktop/out/vs/workbench/contrib/float/electron-sandbox/floatDaemonWorkerMain.js`

Run `npm run build:float-daemon-worker` from the repository root to build it. The desktop package runs the same script after `npm run compile` and `npm run compile-build`.

## Remaining work

- Add multi-root and remote/virtual workspace indexing.
- Replace regex-only daemon symbol extraction with real parser integration and validated language grammars.
- Add a pluggable learned-embedding provider and a scalable retrieval index; current hash vectors are not semantic embeddings or an ANN database.
- Complete a packaged Windows/macOS Electron launch test.
- Keep legacy daemon shadow/toolchain execution disabled until it is explicitly wired to a hardened isolated execution adapter and security-tested.
