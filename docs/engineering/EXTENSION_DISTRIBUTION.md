# FLOAT Studio: VS Code & VSCodium Extension Distribution Guide

This document outlines the architecture, packaging pipeline, installation workflows, and marketplace publishing procedures for distributing FLOAT Studio as a native VS Code, VSCodium, and Code-OSS extension.

---

## 1. Executive Summary & Strategy

**Distribution Strategy**: Option A — Native Extension Packaging (`.vsix`)
**Target Workbenches**: VS Code (1.85+), VSCodium (1.85+), Code-OSS, Gitpod, Eclipse Theia, Cursor

By packaging FLOAT Studio as a high-performance extension rather than maintaining an upstream Code-OSS fork, FLOAT achieves:
- **Zero Upstream Maintenance Overhead**: No need to continually rebase against Microsoft's fast-moving Code-OSS master branch.
- **Immediate Cross-Platform Compatibility**: Single `.vsix` runs identically on Windows (x64, arm64), macOS (Apple Silicon, Intel), and Linux.
- **Native Workbench Capabilities**: Direct access to Monaco editor buffers, terminal monitoring, native file tree, and Open VSX extension ecosystem.
- **Enterprise-Grade Safety Gates**: Explicit proposal acceptance gating, automatic pre-turn rollback checkpoints, and secret filtering (.env).

---

## 2. Directory Structure

```text
extensions/float-vscodium-poc/
├── package.json           # Extension manifest (contributes sidebar, views, commands, keybindings)
├── README.md              # Extension marketplace documentation
├── dist/
│   ├── extension.js       # Bundled Node.js CJS extension binary (esbuild)
│   └── extension.js.map   # Source map
└── src/
    ├── extension.ts       # Workbench activation, command wiring, status bar, and IPC
    ├── floatApiClient.ts  # Progressive SSE client, Bearer auth, AbortController cancellation
    ├── floatEngine.ts     # Pure Node.js local disk scanner, diff generator, and rollback manager
    ├── composerViewProvider.ts # WebviewViewProvider for Composer UI
    ├── inlineDiffController.ts # Ctrl+K inline editor decorations and hunk acceptance
    ├── terminalMonitor.ts      # Terminal process exit listener and error repair hook
    └── types/
        └── vscode.d.ts    # Standalone VS Code API type declarations

scripts/
├── buildVscodiumExtension.cjs   # Bundles extension with esbuild
├── packageVscodiumExtension.cjs # Generates OPC-compliant .vsix package using JSZip
├── testVscodiumPoCWorkflow.ts   # Release Gate 1: Local hard drive scanning, diffs & rollback
├── verifyVscodiumWorkbenchIntegration.ts # Release Gate 2: Workbench activation & native install
└── testVscodiumBackendIntegration.ts     # Release Gate 3: Auth, SSE streaming, cancellation & isolation
```

---

## 3. Build & Packaging Pipeline

### Step 1: Bundle Extension JavaScript
Bundles TypeScript source into a standalone CommonJS bundle targeting Node 20:
```bash
npm run build:extension
```
*Output: `extensions/float-vscodium-poc/dist/extension.js`*

### Step 2: Package into `.vsix`
Packages manifest, metadata, documentation, and JavaScript bundle into an Open Packaging Conventions (OPC) ZIP archive:
```bash
npm run package:extension
```
*Output: `dist/float-vscodium-poc-1.0.0.vsix` (2.77 MB)*

### Step 3: Run Strict Release Gates
Verifies local disk workflow, workbench IPC, native VSCodium CLI installation, progressive SSE streaming, cancellation, and isolation:
```bash
npm run test:extension
```

---

## 4. Local Installation Instructions

### VSCodium (Open Source Workbench)
```bash
# Using CLI
codium --install-extension dist/float-vscodium-poc-1.0.0.vsix

# Or launch portable development instance directly
.\launch-float-vscodium.cmd
```

### Visual Studio Code
```bash
# Using CLI
code --install-extension dist/float-vscodium-poc-1.0.0.vsix
```

### GUI Installation
1. Open VS Code or VSCodium.
2. Press `Ctrl+Shift+X` to open the Extensions view.
3. Click the `...` (Views and More Actions) menu in the top right of the Extensions panel.
4. Select **Install from VSIX...**.
5. Select `dist/float-vscodium-poc-1.0.0.vsix`.

---

## 5. Marketplace Publishing Pipeline

FLOAT is distributed across two primary extension registries:

### A. Open VSX Registry (VSCodium, Eclipse Theia, Gitpod)
1. Register or sign in at [open-vsx.org](https://open-vsx.org/).
2. Create or verify the `float-ai` publisher namespace.
3. Generate an Open VSX Access Token from account settings.
4. Publish using `ovsx`:
```bash
# Publish built VSIX package
npx ovsx publish dist/float-vscodium-poc-1.0.0.vsix -p <OPENVSX_ACCESS_TOKEN>
```

### B. Visual Studio Marketplace (Standard VS Code)
1. Register at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage).
2. Create the `float-ai` publisher.
3. Generate an Azure DevOps Personal Access Token (PAT) with `Marketplace (Manage)` permissions.
4. Publish using `@vscode/vsce`:
```bash
# Publish built VSIX package
npx @vscode/vsce publish --packagePath dist/float-vscodium-poc-1.0.0.vsix -p <VSCE_PERSONAL_ACCESS_TOKEN>
```

---

## 6. Architecture & Security Invariants

1. **Explicit Human Review Gate**: AI never writes directly to user files without interactive review. Every multi-file proposal presents unified diffs requiring an explicit "Accept All" or "Reject All" click.
2. **Deterministic Checkpoint Rollback**: Before any changeset touches local disk, a pre-turn snapshot is captured in a `.float-checkpoints` cache, allowing instantaneous one-click rollback.
3. **Strict Credential & Secret Protection**: Pure local disk scanning strictly ignores `.env*`, `.git`, `node_modules`, `*.pem`, `*.key`, and files matching common credential patterns.
4. **SSE Abort & Resource Cleanup**: When a user clicks `[⏹ Cancel]`, an `AbortController` signal immediately terminates the client HTTP stream and sends socket termination to the backend, cleanly halting upstream model inference.
5. **Multi-Tenant Conversation Isolation**: Every conversation maintains its own UUID, memory thread, and project context binding, preventing accidental cross-workspace contamination.
