# FLOAT Studio — Feature Support Matrix

**Document Version:** 1.0.0  
**Status:** Living Engineering Reference  
**Last Updated:** November 2026  

---

## 1. Cross-Platform Capability Matrix

The table below delineates feature availability across execution environments:

| Feature Category | Feature Description | Web Companion | Desktop Windows (x64) | Desktop macOS (arm64/x64) | Desktop Linux (amd64) |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Core Editor** | Monaco-based lightweight editor | Yes | Yes (Fallback) | Yes (Fallback) | Yes (Fallback) |
| | Full Code-OSS v1.99.3 Workbench | No | **Yes** | **Yes** | **Yes** |
| | Multi-root workspace folders | No | **Yes** | **Yes** | **Yes** |
| | Native OS file tree & watchers | No | **Yes** | **Yes** | **Yes** |
| **AI Capabilities** | Streaming AI Chat sidebar | Yes | **Yes** | **Yes** | **Yes** |
| | Multi-File Autonomous Composer | Yes (Modal) | **Yes (Workbench)** | **Yes (Workbench)** | **Yes (Workbench)** |
| | Native Inline Diff Decorator | No (Modal) | **Yes (Monaco line-level)** | **Yes (Monaco line-level)** | **Yes (Monaco line-level)** |
| | Predictive Autocomplete / Cursor Tab | Partial | **Yes (Ghost text)** | **Yes (Ghost text)** | **Yes (Ghost text)** |
| | Multi-Agent DAG Engine | Yes | **Yes** | **Yes** | **Yes** |
| | Call Graph Speculative Prefetch | Partial | **Yes** | **Yes** | **Yes** |
| **Codebase Intelligence** | Lexical BM25 codebase search | Yes | **Yes** | **Yes** | **Yes** |
| | AST Tree-Sitter parsing (Daemon) | Remote Server | **Yes (Local IPC)** | **Yes (Local IPC)** | **Yes (Local IPC)** |
| | Vector embeddings index | Cloud/Server | **Yes (Local SQLite)** | **Yes (Local SQLite)** | **Yes (Local SQLite)** |
| | Incremental index invalidation | Server-side | **Yes (File watcher)** | **Yes (File watcher)** | **Yes (File watcher)** |
| **Terminal & Execution**| Interactive PTY Terminal | Server PTY | **Yes (cmd/powershell/bash)** | **Yes (zsh/bash)** | **Yes (bash)** |
| | Command Risk Evaluation & Approval | Yes | **Yes** | **Yes** | **Yes** |
| | Docker container sandbox | Server-side | Local Docker | Local Docker | Local Docker |
| **Git & Collaboration** | Feature branch creation | Server-side | **Yes (Local + Remote)** | **Yes (Local + Remote)** | **Yes (Local + Remote)** |
| | Automated secret scanning on commit | Yes | **Yes** | **Yes** | **Yes** |
| | GitHub PR creation & review link | Yes | **Yes** | **Yes** | **Yes** |
| **Extensions** | Built-in language packs (23 langs) | Syntax only | **Yes (Code-OSS host)** | **Yes (Code-OSS host)** | **Yes (Code-OSS host)** |
| | Install custom VSIX packages | No | **Yes** | **Yes** | **Yes** |
| | Open VSX marketplace download | No | **Planned (Sprint G)** | **Planned (Sprint G)** | **Planned (Sprint G)** |
| **Packaging & Release** | Cloud web deployment (Docker/Cloud Run)| **Yes** | N/A | N/A | N/A |
| | Standalone installer (.exe / .dmg / .deb)| N/A | **Yes (Inno/NSIS)** | **Yes (.app/.dmg)** | **Yes (.deb/tar.gz)** |
| | Unsigned build launch support | N/A | **Yes** | **Yes (Gatekeeper note)**| **Yes (AppArmor profile)**|

---

## 2. Model Provider Matrix

| Provider | Supported Models | Streaming (SSE) | Tool Calling / Functions | Vision / Multimodal | Auth Method |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus | Yes | Yes | Yes | Server `ANTHROPIC_API_KEY` |
| **OpenAI** | GPT-4o, GPT-4o-mini, o3-mini, o1 | Yes | Yes | Yes | Server `OPENAI_API_KEY` |
| **Google Gemini**| Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.0 Flash | Yes | Yes | Yes | Server `GEMINI_API_KEY` |
| **Local / Custom**| Ollama, LM Studio, vLLM (OpenAI-compatible) | Yes | Planned | Planned | Custom Base URL + Key |

---

## 3. Platform-Specific Operational Requirements

### Windows:
- Windows 10 / 11 (64-bit).
- Float Daemon uses Named Pipes (`\\.\pipe\float-daemon`).
- Terminal defaults to PowerShell 7 / Windows PowerShell, falling back to `cmd.exe`.
- Inno Setup installer bundles Visual C++ Redistributable.

### macOS:
- macOS 12.0 (Monterey) or later; native Apple Silicon (`arm64`) and Intel (`x64`).
- Float Daemon uses UNIX Domain Socket in `/tmp` or `$TMPDIR`.
- Terminal defaults to `zsh`.
- App bundles signed with hardened runtime; notarized via Apple Notary API when credentials are provided.

### Linux:
- Ubuntu 20.04+, Debian 11+, Fedora 36+, Arch Linux.
- Requires standard desktop GTK/NSS libraries (`libgtk-3-0`, `libnss3`, `libasound2`, `libxss1`, `libx11-xcb1`, `libsecret-1-0`).
- Ubuntu 24.04+ includes dedicated AppArmor profile in `/etc/apparmor.d/float-studio` for unprivileged user namespace support.
