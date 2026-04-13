# AlienX Desktop - Standalone Application Packaging Guide

## Overview

This application is built with **Tauri**, which compiles to native executables for Windows, macOS, and Linux. This guide shows how to package it as a standalone application that users can run directly.

---

## Quick Start (Building for Distribution)

### 1. **Windows Executable & Installer**

```powershell
# Install dependencies first
npm install

# Build for production (creates Windows MSI installer)
npm run tauri:build
```

✅ **Output locations:**

- **Executable**: `src-tauri/target/release/alienx.exe`
- **MSI Installer**: `src-tauri/target/release/bundle/msi/AlienX_Desktop_*.msi`
- **Portable EXE**: `src-tauri/target/release/bundle/nsis/AlienX*.exe`

### 2. **macOS Bundle**

```bash
npm run tauri:build
```

✅ **Output:**

- **App Bundle**: `src-tauri/target/release/bundle/macos/AlienX Desktop.app`
- **DMG Installer**: `src-tauri/target/release/bundle/dmg/AlienX_Desktop_*.dmg`

### 3. **Linux AppImage**

```bash
npm run tauri:build
```

✅ **Output:**

- **AppImage**: `src-tauri/target/release/bundle/appimage/AlienX_Desktop_*.AppImage`

---

## Configuration Updates Needed

### 1. **Update Tauri Configuration** (`src-tauri/tauri.conf.json`)

Current issues to fix:

- ❌ Version mismatch (package.json: 1.2.0, tauri.conf.json: 0.1.0)
- ❌ Identifier is still generic (`com.tauri.dev`)
- ❌ Bundle settings could be optimized

**Recommended changes:**

```json
{
  "productName": "AlienX Desktop",
  "version": "1.2.0",
  "identifier": "com.alienx.desktop",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "AlienX - Forensic Event Log Analysis",
        "width": 1400,
        "height": 900,
        "resizable": true,
        "fullscreen": false,
        "minWidth": 800,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis", "dmg", "appimage"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "nsis": {
      "installerIcon": "icons/icon.ico",
      "uninstallerIcon": "icons/icon.ico",
      "headerIcon": "icons/icon.ico",
      "dialogues": {
        "license": {
          "path": "../LICENSE"
        }
      }
    },
    "macOS": {
      "certificateCommonName": "Developer ID Application",
      "signingIdentity": null
    }
  }
}
```

---

## Distribution Options

### Option 1: Direct Downloads (Recommended for FYP)

1. Build the application (`npm run tauri:build`)
2. Upload files to GitHub Releases:
   ```
   - AlienX-Desktop-1.2.0-x64-installer.msi (Windows)
   - AlienX-Desktop-1.2.0.dmg (macOS)
   - AlienX-Desktop-1.2.0.AppImage (Linux)
   ```
3. Users download and run directly

**Pros:** No installation overhead, users stay in control
**Cons:** No auto-updates by default

### Option 2: GitHub Actions CI/CD (Automated Builds)

Create `.github/workflows/build.yml` to automatically build for all platforms on each release.

```yaml
name: Build
on:
  push:
    tags:
      - "v*"

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v3
      - uses: nodejs/setup-node@v3
        with:
          node-version: "18"
      - run: npm install
      - run: npm run tauri:build
      - uses: softprops/action-gh-release@v1
        with:
          files: "src-tauri/target/release/bundle/**/*"
```

### Option 3: Manual Distribution (Simple)

1. Build for each platform on native OS
2. Create a folder: `/releases/v1.2.0/`
3. Add installers and README
4. Package as ZIP for sharing

---

## Pre-Build Checklist

- [ ] Version numbers match (`package.json` & `tauri.conf.json`)
- [ ] Application identifier is unique (`com.alienx.desktop`)
- [ ] Icons are in place (`src-tauri/icons/`)
- [ ] All dependencies installed (`npm install`)
- [ ] Application builds without errors (`npm run build`)
- [ ] All tests pass (if any)
- [ ] Update CHANGELOG.md with new features/fixes
- [ ] Tag release in git (`git tag v1.2.0`)

---

## Build Process

### Complete Build Steps:

```powershell
# 1. Clean previous builds
rm -r src-tauri/target/release -Force

# 2. Install dependencies
npm install

# 3. Build frontend (automatically called by tauri build)
npm run build

# 4. Build native application with installers
npm run tauri:build

# 5. Verify outputs
ls src-tauri/target/release/bundle/
```

### Expected Output:

```
src-tauri/target/release/bundle/
├── msi/
│   └── AlienX_Desktop_1.2.0_x64_en-US.msi
├── nsis/
│   └── AlienX Desktop_1.2.0_x64-setup.exe
├── macos/
│   └── AlienX Desktop.app
├── dmg/
│   └── AlienX_Desktop_1.2.0_x64.dmg
└── appimage/
    └── AlienX_Desktop_1.2.0_x64.AppImage
```

---

## User Installation Instructions

### Windows

1. Download `AlienX_Desktop_1.2.0_x64_en-US.msi`
2. Double-click to run installer
3. Follow setup wizard
4. Launch from Start Menu or Desktop shortcut

### macOS

1. Download `AlienX_Desktop_1.2.0_x64.dmg`
2. Open DMG file
3. Drag `AlienX Desktop.app` to Applications
4. Launch from Applications folder

### Linux

1. Download `AlienX_Desktop_1.2.0_x64.AppImage`
2. Make executable: `chmod +x AlienX_Desktop_*.AppImage`
3. Double-click to run (or `./AlienX_Desktop_*.AppImage`)

---

## Auto-Updates (Optional)

Tauri supports built-in auto-updates. To enable:

1. **Install updater plugin:**

   ```bash
   npm install @tauri-apps/plugin-updater
   ```

2. **Update `tauri.conf.json`:**

   ```json
   {
     "plugins": {
       "updater": {
         "active": true,
         "endpoints": [
           "https://releases.example.com/updates/{{target}}/{{current_version}}"
         ],
         "dialog": true,
         "windows": {
           "installer_args": [],
           "nsis": {
             "headerBitmap": "path/to/header.bmp"
           }
         }
       }
     }
   }
   ```

3. **Host update manifest on your server** (e.g., GitHub Pages)

---

## Troubleshooting

### Build fails on Windows

- Install Rust: https://rustup.rs/
- Install Visual Studio Build Tools
- Restart terminal after installation

### Code signing errors (macOS)

- Skip signing for distribution: `--skip-code-signing`
- Or set up Apple Developer certificate in Xcode

### Large file sizes

- **MSI**: ~150-200 MB (includes Chromium-like runtime)
- **DMG**: ~120-150 MB
- This is normal for Tauri apps

---

## Release Checklist for Users

**AlienX Desktop v1.2.0 - Release Notes**

✅ Fixed 6 critical runtime bugs
✅ Improved error logging
✅ Added input validation
✅ Standalone application (no dependencies required)
✅ Works on Windows, macOS, Linux

**Download:**

- Windows: `AlienX-Desktop-1.2.0-Setup.exe`
- macOS: `AlienX-Desktop-1.2.0.dmg`
- Linux: `AlienX-Desktop-1.2.0.AppImage`

---

## Next Steps

1. **Update configuration** (see section above)
2. **Build the application** (`npm run tauri:build`)
3. **Test on target platforms**
4. **Create GitHub release** with installers
5. **Build auto-update system** (optional)

Would you like me to implement these configurations now?
