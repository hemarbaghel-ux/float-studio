# FLOAT Studio — Production Release Engineering Handbook

**Document Version:** 1.0.0  
**Status:** Living Engineering Guide  
**Primary Audience:** Release Managers, DevOps Engineers, and Platform Leads  

---

## 1. Overview

FLOAT Studio ships cross-platform desktop installers for Windows, macOS, and Linux alongside cloud container images. This document outlines:
1. The release lifecycle and dispatch mechanisms.
2. Code-signing infrastructure, certificates, and secrets.
3. Clean-machine installation workflows and OS gatekeeper behaviors for unsigned/signed builds.
4. Production quality gates (size thresholds, binary magic headers, headless smoke tests).

---

## 2. Release Triggering & Workflows

FLOAT Studio uses automated Git tagging and GitHub Actions for continuous delivery.

### 2.1. Tag-Driven Production Release (Recommended)
Creating and pushing a semver tag matching `v*` initiates the full release pipeline:
```bash
# 1. Ensure main branch is clean and all PR CI checks passed
git checkout main
git pull origin main

# 2. Create an annotated release tag
git tag -a v1.0.0 -m "Release v1.0.0 — Production Baseline"

# 3. Push the tag to GitHub
git push origin v1.0.0
```

### 2.2. Manual Workflow Dispatch
For staging or test distributions:
1. Navigate to **Actions** → **FLOAT Studio Desktop Release** in the GitHub repository.
2. Click **Run workflow**.
3. Specify the version tag (e.g. `v1.0.1-rc1`) and target branch.
4. Click **Run workflow**.

---

## 3. Mandatory Quality Gates & Validation

Every release artifact must pass three sequential automated gates before publication:

| Gate | Check Type | Enforcement Criteria | Failure Action |
| :--- | :--- | :--- | :--- |
| **Gate 1: Minimum Size Threshold** | File Size | Every binary, installer, or archive must be **≥ 20 MB** (`20,971,520` bytes). | Build job fails immediately. Zero placeholder text files permitted. |
| **Gate 2: Binary Format Integrity** | Magic Header | Windows: `MZ` (0x4D, 0x5A)<br>ZIP: `PK\x03\x04`<br>Linux `.deb`: `!<arch>\n`<br>Linux `.tar.gz`: GZIP (0x1F, 0x8B)<br>macOS `.dmg`: Apple Disk Image format | Rejects truncated or misnamed files. |
| **Gate 3: Clean Runner Smoke Test** | Headless Execution | Launches with `--smoke-test --headless`. Verifies that Code-OSS workbench, Monaco, and Float AI views mount within 30 seconds. | Halts release if process crashes or hangs. |

---

## 4. Code Signing & Secret Infrastructure

### 4.1. Secrets Configuration in GitHub Repository
To produce signed and notarized binaries, configure these repository secrets in **Settings** → **Secrets and variables** → **Actions**:

#### Windows Code Signing:
- `WINDOWS_SIGNING_CERT_PFX`: Base64-encoded Authenticode code-signing certificate (`.pfx`).
- `WINDOWS_SIGNING_PASSWORD`: Password for the PFX certificate.

#### Apple / macOS Notarization:
- `APPLE_CERTIFICATE`: Base64-encoded Apple Developer ID Application certificate (`.p12`).
- `APPLE_CERTIFICATE_PASSWORD`: Password for the P12 certificate.
- `APPLE_ID`: Apple ID email address associated with the developer team.
- `APPLE_APP_SPECIFIC_PASSWORD`: 16-character app-specific password generated via appleid.apple.com.
- `APPLE_TEAM_ID`: 10-character Apple Developer Team ID (e.g. `ABCDE12345`).

### 4.2. Unsigned Fallback Behavior
The release workflow is designed to **succeed gracefully when signing secrets are absent**. If `APPLE_CERTIFICATE` is not configured, the macOS build applies an ad-hoc signature (`codesign --force --deep --sign -`), ensuring open-source developers and fork maintainers can build working artifacts without paid developer accounts.

---

## 5. Clean-Machine Installation Experience

### 5.1. Windows
- **Installer:** `FLOAT-Setup-x64.exe`
- **Portable:** `FLOAT-win32-x64.zip`
- **Runtime Dependency:** Bundles Visual C++ 2015-2022 Redistributable (`vcruntime140.dll`).
- **Unsigned Behavior:**
  1. Windows SmartScreen displays: *"Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."*
  2. The user clicks **More info** → **Run anyway**.
  3. Once signed with an EV certificate, SmartScreen trust accumulates and the warning ceases.

### 5.2. macOS
- **Installer:** `FLOAT-arm64.dmg` (Apple Silicon) / `FLOAT-x64.dmg` (Intel)
- **Portable:** `FLOAT-darwin-arm64.zip`
- **Entitlements:** Hardened runtime with JIT execution enabled (`desktop/build/darwin/entitlements.plist`).
- **Unsigned Behavior:**
  1. Apple Gatekeeper displays: *"FLOAT Studio cannot be opened because the developer cannot be verified."*
  2. The user right-clicks `FLOAT.app` in `/Applications` and clicks **Open**, then confirms **Open** in the modal dialog.
  3. Alternatively, the user can run:
     ```bash
     xattr -cr /Applications/FLOAT.app
     ```

### 5.3. Linux
- **Debian Package:** `float-studio_amd64.deb`
- **Tarball:** `FLOAT-linux-x64.tar.gz`
- **Installation:**
  ```bash
  sudo dpkg -i float-studio_amd64.deb
  sudo apt-get install -f # Resolves any missing system dependencies
  ```
- **Ubuntu 24.04+ User Namespace Support:**
  Ubuntu 24.04 enforces AppArmor restrictions on unprivileged user namespaces. FLOAT automatically installs an AppArmor profile in `/etc/apparmor.d/float-studio` to permit unprivileged sandboxing without requiring the `--no-sandbox` flag.
