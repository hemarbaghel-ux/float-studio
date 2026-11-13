# FLOAT Stage 3 — Codebase Intelligence

## Current implementation in this branch

This stage improves the existing codebase indexing and retrieval path. It does not claim neural semantic embeddings or Cursor-equivalent retrieval quality.

### Retrieval architecture

- The server-side `WorkspaceIndex` builds incremental per-project document records.
- It maintains token and trigram inverted indices, symbol definitions, imports and reverse imports.
- Search combines path/filename relevance, symbol matches, content-line matches, BM25-style term weighting, active-file proximity, import relationships and Git-diff relevance.
- Results include source paths, line ranges, excerpts and ranking signals.
- `WorkspaceIndexManager` keeps a bounded LRU cache of project indices.
- The native desktop index uses AST-oriented chunks and a deterministic sparse token-hash projection plus BM25. That projection is not a learned neural embedding.

### Correctness fixes

- Gitignore matching now follows ordered, last-matching-rule-wins behavior for the supported path, directory, wildcard and negation patterns. Later negation rules can re-include matching files.
- Workspace-index change detection now uses two independent 32-bit accumulators rather than one 32-bit DJB2 hash. It remains a synchronous cache fingerprint, not a cryptographic security primitive.
- Symbol-kind filters are applied before symbol relevance contributes to ranking.
- Native desktop index metadata restore now restores the saved SHA-1 Merkle file hashes instead of hashing empty strings.
- Native index metadata restore validates version, embedding architecture, file record schema, path safety, hash shape, file count, root hash and restored vector chunk count. Invalid snapshots fail closed.

### Automated evaluation

`scripts/testCodebaseRetrievalQuality.ts` uses a deterministic 12-file source fixture and 10 query cases. It measures unique-file Recall@5 and mean reciprocal rank, with gates of 90% Recall@5 and 0.65 MRR. It also verifies stale-file pruning, stale-term removal, symbol-kind filtering and ignore-rule negation.

`scripts/testFloatWorkspaceIndexPersistence.ts` exercises save/restart/restore, verifies that an unchanged file is skipped after restart, verifies a modified file is re-indexed and rejects traversal paths in persisted metadata.

CI runs the benchmark, existing search regression, native index persistence test and root TypeScript typecheck.

## Remaining Stage 3 acceptance work

- Run the benchmark against a versioned real-repository question set, not only a synthetic fixture.
- Measure Recall@5, MRR, indexing latency, incremental-update latency, peak memory and stale-index rate on small, medium and large repositories.
- Add cancellation and bounded concurrency for large indexing jobs.
- Validate language parser coverage and unsupported-language fallbacks with realistic samples.
- Add a real learned-embedding provider only behind a separately measured, opt-in retrieval backend; do not relabel deterministic hash projections as embeddings.
- Exercise cross-process persistence and workspace watcher reconciliation under rapid create/rename/delete operations.

## Stage status

**Partial implementation; not accepted as complete.** The synthetic benchmark is a regression gate, not evidence of production retrieval quality or parity with Cursor.
