# FLOAT Studio Release & Packaging Guide

This document outlines the desktop packaging architecture, release workflow, code-signing credentials, and installation behavior for FLOAT Studio across Windows, macOS, and Linux.

---

## 1. How to Trigger a Release

### Automated Tagged Releases (Recommended)
Every release is driven by semantic Git tags pushed to the upstream repository:

```bash
# 1. Ensure main branch is clean and up to date
git checkout main
git pull origin main

# 2. Create an annotated semantic version tag
git tag -a v1.0.0 -m "Release v1.0.0: Stable Desktop Release"

# 3. Push the tag to trigger the release workflow
git push origin v1.0.0
```

Pushing a `v*` tag triggers [`.github/workflows/release.yml`](../.github/workflows/release.yml). The workflow:
1. Builds the web frontend and Express backend bundles (`npm run build`).
2. Packages genuine native desktop binaries for Windows (x64), Linux (amd64), and macOS (arm64).
3. Validates each artifact against strict size (>= 20 MB) and binary magic format specifications.
4. Spawns clean platform runners to execute automated headless smoke tests.
5. Computes `SHA256SUMS.txt` cryptographic checksums.
6. Automatically publishes the GitHub Release with downloadable installers.

### Manual Workflow Dispatch
Releases can also be triggered manually without pushing a Git tag:
1. Navigate to **Actions** > **FLOAT Studio Desktop Release** in GitHub.
2. Click **Run workflow**.
3. Enter the target version tag (e.g., `v1.0.0`) and select the branch (`main`).

---

## 2. Platform Packages & Artifact Outputs

Each release generates two artifacts per platform: an installer and a portable bundle.

| Platform | Installer Artifact | Portable / Archive Artifact | Minimum Size | Format / Headers |
|---|---|---|---|---|
| **Windows (x64)** | `FLOAT-Setup-x64.exe` (Inno Setup) | `FLOAT-win32-x64.zip` | >= 20 MB | PE `MZ` / ZIP `PK` |
| **Linux (amd64)** | `float-studio_amd64.deb` (Debian Package) | `FLOAT-linux-x64.tar.gz` | >= 20 MB | `!<arch>\n` / Gzip `0x1F, 0x8B` |
| **macOS (arm64)** | `FLOAT-arm64.dmg` (Apple Disk Image) | `FLOAT-darwin-arm64.zip` | >= 20 MB | Apple UDIF Container / ZIP `PK` |

---

## 3. Code-Signing & Notarization Credentials

By default, the release workflow produces valid, functioning, unsigned release builds if signing secrets are not configured in repository settings. To publish signed builds that eliminate operating system security prompts, configure the following GitHub Actions secrets:

### Apple Developer (macOS Signing & Notarization)
- `APPLE_CERTIFICATE`: Base64-encoded `.p12` file containing your **Developer ID Application** certificate and private key.
- `APPLE_CERTIFICATE_PASSWORD`: Password protecting the `.p12` certificate.
- `APPLE_IDENTITY`: The certificate identity string (e.g. `Developer ID Application: Your Company LLC (TEAMID1234)`).
- `APPLE_ID`: The Apple ID email associated with your Apple Developer account.
- `APPLE_APP_SPECIFIC_PASSWORD`: An app-specific password generated at [appleid.apple.com](https://appleid.apple.com).
- `APPLE_TEAM_ID`: Your 10-character Apple Developer Team ID.

When these secrets are provided, CI signs the `.app` bundle with hardened runtime entitlements (`com.apple.security.cs.allow-jit`, etc.) and automatically submits the `.dmg` to Apple's notary service using `xcrun notarytool`.

### Windows Code Signing (Authenticode)
- `WIN_CERTIFICATE_BASE64`: Base64-encoded `.pfx` code-signing certificate (Standard OV or Cloud EV certificate).
- `WIN_CERTIFICATE_PASSWORD`: Password for the `.pfx` certificate.
- Alternatively, configure Azure Trusted Signing / Signtool with Azure Key Vault in the release workflow.

When configured, the Inno Setup compiler (`iscc`) or `signtool` signs both `FLOAT.exe` and `FLOAT-Setup-x64.exe`.

---

## 4. What Users See When Installing Unsigned Builds

If a build is distributed without commercial code-signing certificates, operating system gatekeepers will display security warnings on clean machines. The following explains what users experience and how to bypass them:

### Windows: Microsoft Defender SmartScreen
- **Behavior**: Launching `FLOAT-Setup-x64.exe` or `FLOAT.exe` displays a blue dialog:
  > **Windows protected your PC**  
  > *Microsoft Defender SmartScreen prevented an unrecognized app from starting. Running this app might put your PC at risk.*
- **User Action**:
  1. Click **More info** on the prompt.
  2. Click **Run anyway**.
  *(SmartScreen reputation builds over time as more users download and run the binary).*

### macOS: Apple Gatekeeper
- **Behavior**: Opening `FLOAT Studio.app` extracted from the DMG or ZIP displays:
  > **"FLOAT Studio" cannot be opened because Apple cannot check it for malicious software.**  
  > *This software needs to be updated. Contact the developer for more information.*
- **User Action (GUI)**:
  1. Open **System Settings** > **Privacy & Security**.
  2. Scroll down to the **Security** section.
  3. Under *"FLOAT Studio was blocked from use because it is not from an identified developer"*, click **Open Anyway**.
- **User Action (Terminal)**:
  Remove the quarantine attribute added by macOS:
  ```bash
  xattr -cr /Applications/FLOAT\ Studio.app
  ```

### Linux: Permissions & AppArmor
- **Ubuntu 24.04+ User Namespaces**: Ubuntu 24.04 enables restricted unprivileged user namespaces by default (`kernel.apparmor_restrict_unprivileged_userns=1`).
  - The Debian package (`float-studio_amd64.deb`) automatically installs an AppArmor profile to `/etc/apparmor.d/float-studio` and registers it via `postinst`.
  - If running from the portable `FLOAT-linux-x64.tar.gz` on Ubuntu 24.04+ without installing the `.deb`, launch with:
    ```bash
    ./float-studio --no-sandbox
    ```
- **Dependencies**: The `.deb` package requires the following packages, automatically resolved by `apt`:
  ```bash
  sudo apt install -y libgtk-3-0 libnss3 libasound2 libxss1 libx11-xcb1 libsecret-1-0
  ```

---

## 5. Automated CI Smoke Tests

Every release artifact is smoke-tested before publication on clean GitHub runners:
1. **Linux**: Installs `.deb` via `dpkg -i` on a clean `ubuntu-latest` runner and executes headless under `xvfb-run`.
2. **Windows**: Unpacks portable ZIP and executes `FLOAT.exe --headless` on `windows-latest`, verifying process initialization and clean disposal without crashes. Also verifies silent installer flags (`/VERYSILENT`).
3. **macOS**: Mounts `FLOAT-arm64.dmg` via `hdiutil` and verifies `.app` integrity on a clean `macos-14` Apple Silicon runner.
