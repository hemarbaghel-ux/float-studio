# FLOAT Stage 1 — Native IDE Capability Map

## Scope

Stage 1 turns the restored Code-OSS workbench into a verified native FLOAT development environment. It intentionally reuses the pinned Code-OSS implementation instead of reimplementing mature editor infrastructure.

## Upstream workbench capabilities already included

The Code-OSS v1.99.3 workbench is the implementation source for:

- File Explorer and multi-root workspace management
- Editor tabs, split editor groups, file opening and saving
- Global Search and Search Editor
- Integrated Terminal
- Extensions view and Open VSX gallery configuration
- Settings UI and JSON settings
- Problems / diagnostics panel
- Debug, tasks, merge editor and diff editor infrastructure

These are upstream capabilities bundled by the desktop workbench imports. Their presence in source is not, by itself, proof that the packaged FLOAT application works.

## FLOAT-specific native integration

FLOAT contributions are registered through:

- `desktop/src/vs/workbench/workbench.common.main.ts`
- `desktop/src/vs/workbench/workbench.desktop.main.ts`
- `desktop/src/vs/workbench/contrib/float/browser/float.contribution.ts`

The Electron-specific daemon runtime contribution is loaded by the desktop workbench. FLOAT actions include Composer, Chat, Inline Diff, predictive autocomplete, terminal repair, debug repair and multi-agent actions.

## Stage 1 runtime acceptance

Run:

```bash
npm run test:native-ide
```

The Playwright test launches the real Electron application and verifies:

1. A multi-root workspace loads.
2. A source file opens in the native editor.
3. An edit is saved to disk and read back from the filesystem.
4. A file in the second workspace root opens through Quick Open.
5. Split editor creates multiple editor groups.
6. Explorer lists both workspace roots.
7. Search, Extensions and Problems views open.
8. Settings UI opens.
9. Integrated Terminal and its terminal emulator render.

The test must run after native compilation and Electron runtime preparation. A missing executable, missing UI surface, failed file save or renderer startup failure is a test failure.

## Remaining Stage 1 work

This first Stage 1 increment verifies local native IDE workflows only. Remote development providers (for example SSH, development containers and WSL) remain unimplemented or unverified in FLOAT's supported product configuration. Do not count upstream remote APIs alone as support.

Cloud execution, full AI Agent parity, MCP, cloud agents and automated PR review belong to later stages. Do not claim those capabilities based on placeholder UI or unused service interfaces.
