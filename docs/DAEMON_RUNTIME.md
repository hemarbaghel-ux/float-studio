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

- The synchronizer indexes every local `file:` workspace folder. Multi-root paths are namespaced as `workspace-1/`, `workspace-2/`, and so on, preventing same-relative-path collisions; single-root workspaces keep unprefixed paths for compatibility.
- Remote and virtual workspace folders are skipped until their filesystem providers are explicitly supported.
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
not learned embeddings. TypeScript and JavaScript symbol extraction uses the
TypeScript compiler AST, including source ranges for declarations; it is not
a Tree-sitter parser. Other configured language profiles (Python, Rust, Go,
C/C++, Java, Ruby and PHP) still use best-effort grammar-profile regular
expressions and must not be described as full AST parsing. These are explicit
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

## Retrieval quality smoke benchmark

`scripts/testFloatDaemonHybridRetrieval.ts` includes an offline relevance and
latency smoke benchmark. It indexes six curated code fixtures plus 96 unrelated
graphics fixtures, evaluates six natural-language/code-identifier queries,
asserts Recall@5 = 1.0 and MRR >= 0.8, and reports index time plus search p50/p95.
The test runs in the desktop regression suite and requires no API key or model
download.

This is a deterministic fixture benchmark, not an evaluation against production
repositories. It does not establish semantic understanding, learned-embedding
quality, ANN scalability, or end-to-end model completion latency.

## Remaining work

- Add remote and virtual workspace filesystem indexing; current indexing is limited to local `file:` roots.
- Replace the non-TypeScript regex grammar profiles with maintained parser runtimes and versioned language grammars.
- Add a pluggable learned-embedding provider and a scalable retrieval index; current hash vectors are not semantic embeddings or an ANN database.
- Expand retrieval relevance/latency benchmarks from deterministic fixtures to representative repositories and evaluate Chat, Composer and Cursor Tab context quality end to end.
- Complete packaged Windows/macOS Electron launch and restart tests.
- Keep legacy daemon shadow/toolchain execution disabled until it is explicitly wired to a hardened isolated execution adapter and security-tested.
