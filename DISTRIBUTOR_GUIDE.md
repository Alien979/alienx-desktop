# AlienX Desktop - Distributor's Guide

This guide explains how to build and distribute AlienX Desktop as a standalone application.

---

## Prerequisites

Install these tools before building:

### Windows

1. **Node.js** (v18+): https://nodejs.org/
2. **Rust**: https://rustup.rs/
3. **Visual Studio Build Tools** 2015+
   - Or: Visual Studio Community with C++ build tools

```powershell
# Verify installation
node --version      # Should be v18+
npm --version       # Should be 9+
rustc --version     # Any recent version
cargo --version
```

### macOS

1. **Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```
2. **Node.js**: `brew install node`
3. **Rust**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

### Linux (Ubuntu/Debian)

```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  webkit2gtk-4.1 \
  curl \
  wget \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

---

## Build Process

### Step 1: Clone and Setup

```bash
git clone https://github.com/Alien979/alienx-desktop.git
cd alienx-desktop
npm install
```

### Step 2: Build for All Platforms

#### Option A: Using PowerShell Script (Recommended for Windows)

```powershell
./build-distribution.ps1
```

#### Option B: Manual Build

```bash
# Clean previous builds
npm run clean                  # If available, otherwise:
rm -rf src-tauri/target/release dist

# Build the application
npm run tauri:build

# For specific platform:
npm run tauri:build -- --target x86_64-pc-windows-msvc      # Windows 64-bit
npm run tauri:build -- --target x86_64-apple-darwin         # macOS Intel
npm run tauri:build -- --target aarch64-apple-darwin        # macOS Apple Silicon
npm run tauri:build -- --target x86_64-unknown-linux-gnu    # Linux 64-bit
```

### Step 3: Locate Build Outputs

Compiled installers are at: `src-tauri/target/release/bundle/`

```
bundle/
├── msi/
│   └── AlienX_Desktop_1.2.0_x64_en-US.msi      (~150 MB)
├── nsis/
│   └── AlienX Desktop_1.2.0_x64-setup.exe      (~140 MB)
├── macos/
│   └── AlienX Desktop.app/                      (folder, ~180 MB)
├── dmg/
│   └── AlienX_Desktop_1.2.0_x64.dmg            (~100 MB)
└── appimage/
    └── AlienX_Desktop_1.2.0_x64.AppImage       (~120 MB)
```

---

## Testing the Build

### Windows

```powershell
# Test MSI installer
.\src-tauri\target\release\bundle\nsis\AlienX*-setup.exe

# Test portable executable
.\src-tauri\target\release\alienx.exe
```

### macOS

```bash
# Test app bundle
open "src-tauri/target/release/bundle/macos/AlienX Desktop.app"

# Or test DMG
open "src-tauri/target/release/bundle/dmg/AlienX Desktop.dmg"
```

### Linux

```bash
# Make executable and test
chmod +x src-tauri/target/release/bundle/appimage/AlienX_Desktop_*.AppImage
./src-tauri/target/release/bundle/appimage/AlienX_Desktop_*.AppImage
```

---

## Creating a Release

### Step 1: Prepare Release Notes

```markdown
# AlienX Desktop v1.2.0

## What's New

- 🐛 Fixed 6 critical runtime bugs
- 🔍 Improved error logging
- ✅ Added comprehensive input validation
- 🚀 Standalone application - no dependencies required

## Supported Platforms

- Windows 10/11 (64-bit)
- macOS 10.13+ (Intel & Apple Silicon)
- Linux (Ubuntu 20.04+, Fedora, etc.)

## Installation

See INSTALLATION_GUIDE.md

## Downloads

[See below]
```

### Step 2: Upload to GitHub Releases

1. Go to: https://github.com/Alien979/alienx-desktop/releases/new
2. **Tag**: `v1.2.0`
3. **Title**: `AlienX v1.2.0 - Forensic Analysis Toolkit`
4. **Description**: Paste release notes (see above)
5. **Attach Files**:
   - ✓ `AlienX_Desktop_1.2.0_x64_en-US.msi` (Windows)
   - ✓ `AlienX Desktop_1.2.0_x64-setup.exe` (Windows alternative)
   - ✓ `AlienX_Desktop_1.2.0_x64.dmg` (macOS)
   - ✓ `AlienX_Desktop_1.2.0_x64.AppImage` (Linux)
   - ✓ `INSTALLATION_GUIDE.md` (help file)
6. **Publish Release**

---

## Distribution Channels

### GitHub Releases (Recommended)

- ✅ Free hosting
- ✅ Automatic download tracking
- ✅ Supports auto-updates via Tauri
- ✅ Version history maintained

**URL**: `https://github.com/Alien979/alienx-desktop/releases`

### Alternative Channels

**1. Package Managers**

```bash
# Homebrew (macOS/Linux)
brew tap alienx/tools
brew install alienx-desktop

# Snap (Linux)
snap install alienx-desktop

# Chocolatey (Windows)
choco install alienx-desktop
```

**2. Direct Website Download**

- Host installers on project website
- Provide direct download links

**3. Asset Distribution Platforms**

- **SourceForge**: https://sourceforge.net/
- **BinTray**: https://bintray.com/
- **AWS S3**: Cloud-hosted installers

---

## Automation: GitHub Actions (CI/CD)

Create `.github/workflows/release.yml`:

```yaml
name: Build and Release
on:
  push:
    tags:
      - "v*"

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
          - os: macos-latest
            target: x86_64-apple-darwin
          - os: macos-latest
            target: aarch64-apple-darwin
          - os: windows-latest
            target: x86_64-pc-windows-msvc
    steps:
      - uses: actions/checkout@v3
      - uses: nodejs/setup-node@v3
        with:
          node-version: "18"
      - uses: actions-rs/toolchain@v1
        with:
          profile: minimal
          toolchain: stable
      - run: npm install
      - run: npm run tauri:build -- --target ${{ matrix.target }}
      - uses: softprops/action-gh-release@v1
        with:
          files: "src-tauri/target/release/bundle/**/*"
```

Then, to create a release:

```bash
git tag v1.2.0
git push origin v1.2.0
# GitHub Actions automatically builds and uploads!
```

---

## Version Management

### Bumping Versions

1. Update `package.json`:
   ```json
   "version": "1.2.1"
   ```
2. Update `src-tauri/tauri.conf.json`:
   ```json
   "version": "1.2.1"
   ```
3. Commit and tag:
   ```bash
   git add package.json src-tauri/tauri.conf.json
   git commit -m "chore: bump to v1.2.1"
   git tag v1.2.1
   git push origin main --tags
   ```

---

## Known Issues & Limitations

| Issue                   | Workaround                                                  |
| ----------------------- | ----------------------------------------------------------- |
| **File size** (~150 MB) | Normal for Tauri apps (includes WebKit runtime)             |
| **Slow first launch**   | Chromium runtime initialization                             |
| **Code signing**        | Not signed on macOS (users must allow in Security settings) |
| **Auto-updates**        | Currently disabled (can be enabled with update server)      |

---

## Performance Benchmarks

| Operation          | Time     |
| ------------------ | -------- |
| Build (Windows)    | ~3-5 min |
| Build (macOS)      | ~4-6 min |
| Build (Linux)      | ~3-5 min |
| Installer creation | ~30 sec  |
| App startup        | ~1-2 sec |

---

## Troubleshooting During Build

### Build fails with "failed to link"

```bash
# Try cleaning Cargo cache
cargo clean
npm run tauri:build
```

### "MSVC not found" (Windows)

- Install Visual Studio Build Tools: https://visualstudio.microsoft.com/downloads/

### "CocoaPods not found" (macOS)

```bash
sudo gem install cocoapods
```

### "libssl not found" (Linux)

```bash
sudo apt-get install libssl-dev
```

---

## Security Considerations

- ✅ All code is open-source and auditable
- ✅ No telemetry or data collection
- ✅ All analysis done locally on user's machine
- ✅ No internet connection required
- ⚠️ Code is not signed (users must accept security warnings)

---

## Support Resources

- **Documentation**: https://github.com/Alien979/alienx-desktop/
- **Issues**: https://github.com/Alien979/alienx-desktop/issues
- **Discussions**: https://github.com/Alien979/alienx-desktop/discussions
- **Tauri Docs**: https://tauri.app/docs/

---

**Last Updated**: April 5, 2026
