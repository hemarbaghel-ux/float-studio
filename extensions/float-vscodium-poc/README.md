# FLOAT Studio for VS Code & VSCodium

Cursor-class bounded AI coding workflows directly inside VS Code, VSCodium, and Code-OSS.

## Features

### 1. Native Composer & Chat Panel (`Ctrl+Shift+I`)
- **Progressive Streaming**: Real-time token delivery via SSE from your FLOAT backend server.
- **Multi-File Proposals**: Proposes changes across your entire local repository with unified diff view.
- **Explicit Approval Gating**: Rejection leaves files 100% untouched. Changes are applied only after explicit human approval.
- **One-Click Rollback**: Automatic pre-turn disk snapshots allow rolling back any applied changeset instantly.
- **Conversation Isolation**: Fully isolated threads with zero context bleed between chats or workspaces.

### 2. Inline AI Code Editing (`Ctrl+K`)
- Trigger inline edits on any active editor selection with `Ctrl+K` (or `Cmd+K` on macOS).
- Green addition and red deletion decorations rendered in-place within the editor buffer.
- `Tab` accepts the transformation; `Esc` reverts back to the original text.

### 3. Terminal Error Monitoring & Fixes
- Automatically watches terminal commands and process exits.
- When a command fails with a non-zero exit code, FLOAT offers a one-click `[Fix with FLOAT]` prompt to diagnose and resolve errors immediately.

### 4. Enterprise Security & Hard Drive Privacy
- Pure local disk engine runs on your machine.
- Automatically excludes `.env*`, `.git`, `node_modules`, secret keys, and credentials from AI prompt context.
- Full cryptographic Bearer token authentication with tenant and project isolation.

## Configuration Settings

You can configure FLOAT Studio under `Settings > Extensions > FLOAT Studio`:

| Setting | Default | Description |
|---|---|---|
| `float.backendUrl` | `http://localhost:3000` | Base URL of the FLOAT backend server. |
| `float.authToken` | `""` | Bearer authentication token for FLOAT API access. |
| `float.model` | `gpt-6.1-sol` | Model identifier used for code generation. |
| `float.autoFixTerminalErrors` | `true` | Prompt to fix non-zero terminal process exit errors. |

## Keyboard Shortcuts

- **Open Composer**: `Ctrl+Shift+I` (`Cmd+Shift+I` on macOS)
- **Inline Edit (Selection)**: `Ctrl+K` (`Cmd+K` on macOS)
- **Accept Inline Diff**: `Tab` (when inline edit active)
- **Reject Inline Diff**: `Escape` (when inline edit active)

## License
MIT
