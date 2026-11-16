# FLOAT repository cleanup — 16 November 2026

## Scope

This change removes generated code that inflated repository size and produced false engineering signals. It does not remove the real Tree-sitter registry, daemon indexer, built-in extensions, agent implementation, or actual product features.

## Removed from the active tree

| Removed item | Count | Raw file bytes |
|---|---:|---:|
| Synthetic grammar catalog files under `daemon/grammars/data/` | 15 | 67,235,879 |
| Synthetic SWE-bench task files under `benchmarks/swe-bench/data/` | 145 | 150,897,884 |
| **Generated datasets total** | **160** | **218,133,763** |

The removed generated data used repeated placeholder symbols, made-up repository names and commit SHAs, and repetitive diff text. The task harnesses did not run repository patches against actual upstream projects; one applied its own expected solution before checking that it matched. Their reported 100% pass rate was therefore not a meaningful agent benchmark.

The two generation scripts, the test-only harnesses, and test assertions that depended on those data files were removed. Their real coverage was replaced with checks for the 22 built-in extension bundles and the runtime Tree-sitter language registry.

## Preserved

- `daemon/src/grammars/` and `FloatTreeSitterGrammarRegistry`
- The daemon's indexing, retrieval and IPC implementation
- Built-in language extensions and their build verification
- Debugger/auto-repair, agent governance, Composer, diff and workspace regression tests
- Verified external benchmark metadata in `src/data/verifiedBenchmarks.ts`

## Release safety

The existing Electron packaging helper is a React web-preview utility. It is not a complete native Code-OSS installer. The production release workflow now fails closed until genuine Code-OSS compilation, native module rebuilds, platform installers, signing, installation tests and real workbench launch checks are complete. The preview helper has been relabelled and its renderer security settings hardened.

## Validation boundaries

The replacement repository-integrity test checks built extension bundles and real runtime grammar registration. It does not claim SWE-bench performance. Live provider generation and full native desktop acceptance remain separate release gates.
