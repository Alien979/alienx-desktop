# 🚀 AlienX Desktop - Quick Build & Share Guide

**Goal**: Build a standalone app that anyone can download and run.

---

## ⚡ Quick Start (5 minutes)

### 1. Prepare Your Machine

```powershell
# Install Node.js if not already installed: https://nodejs.org/

# Verify installation
node --version      # Should be v18+
```

### 2. Build for Distribution

```powershell
# Navigate to project folder
cd "C:\Users\User\Desktop\Masters FYP\alienx-desktop"

# Build using the provided script
.\build-distribution.ps1

# OR build manually
npm install
npm run tauri:build
```

### 3. Find Your Installers

```
📦 Installers created at:
├── 🪟 Windows: src-tauri/target/release/bundle/nsis/*.exe
├── 🪟 Windows: src-tauri/target/release/bundle/msi/*.msi
├── 🍎 macOS:   src-tauri/target/release/bundle/dmg/*.dmg
└── 🐧 Linux:   src-tauri/target/release/bundle/appimage/*.AppImage
```

### 4. Share with Others

**Option A: Direct Link**

- Upload installers to Google Drive / Dropbox
- Share download link

**Option B: GitHub Releases** (Recommended)

```bash
git tag v1.2.0
git push origin v1.2.0
# Then create release at: https://github.com/Alien979/alienx-desktop/releases
```

**Option C: Email/Messenger**

- Send the `.exe` (Windows) or `.dmg` (macOS) file
- Include INSTALLATION_GUIDE.md

---

## 📋 What Gets Built?

| File                                 | Size    | Platform | Uses                    |
| ------------------------------------ | ------- | -------- | ----------------------- |
| `AlienX_Desktop_1.2.0_x64_en-US.msi` | ~150 MB | Windows  | Recommended installer   |
| `AlienX Desktop_1.2.0_x64-setup.exe` | ~140 MB | Windows  | NSIS installer          |
| `AlienX_Desktop_1.2.0_x64.dmg`       | ~100 MB | macOS    | Double-click to install |
| `AlienX_Desktop_1.2.0_x64.AppImage`  | ~120 MB | Linux    | Double-click to run     |

---

## 💻 User Installation (They Do This)

### Windows

1. Download `*.msi` or `*-setup.exe`
2. Double-click
3. Click "Next" → "Install" → "Finish"
4. Launch from Start Menu

### macOS

1. Download `*.dmg`
2. Open file
3. Drag app to "Applications" folder
4. (Right-click if macOS complains, choose "Open")

### Linux

1. Download `*.AppImage`
2. Right-click → Properties → Make Executable
3. Double-click to run

---

## 🎯 What You Just Built

✅ **Completely Standalone**

- No Python, Node, or other tools needed
- Works on any Windows/Mac/Linux computer
- Zero setup required

✅ **Professional**

- Custom icons in system taskbar
- Start menu entries (Windows)
- Application menu (macOS/Linux)
- Uninstaller support

✅ **Safe**

- Runs locally - no cloud uploads
- All data stays on user's machine
- No telemetry or tracking

---

## 🔄 Update Workflow

When you fix bugs or add features:

```powershell
# 1. Update version in two files:
#    - package.json: "version": "1.3.0"
#    - src-tauri/tauri.conf.json: "version": "1.3.0"

# 2. Build again
.\build-distribution.ps1

# 3. Create GitHub release
git add package.json src-tauri/tauri.conf.json
git commit -m "Release v1.3.0"
git tag v1.3.0
git push origin main --tags

# 4. Upload new installers to GitHub Releases
```

---

## ❗ Common Issues

**"Windows SmartScreen blocked the app"**

- → Click "More info" → "Run anyway"
- → This is normal for unsigned apps

**"macOS says app is from unknown developer"**

- → Right-click → Open
- → This is normal on macOS

**"Can't open AppImage" (Linux)**

- → Make it executable: `chmod +x AlienX_Desktop_*.AppImage`
- → Then double-click

---

## 📚 Full Documentation

- **For Users**: See `INSTALLATION_GUIDE.md`
- **For Technical Details**: See `STANDALONE_PACKAGING_GUIDE.md`
- **For Developers**: See `DISTRIBUTOR_GUIDE.md`

---

## ✨ You're Done!

Your application is now ready for anyone to download and use!

### Next Steps:

1. ✅ Test the installers yourself
2. ✅ Share with beta testers
3. ✅ Get feedback
4. ✅ Publish on GitHub Releases
5. ✅ Share link: `github.com/Alien979/alienx-desktop/releases`

---

**Questions?** Check the guides above or see Tauri docs: https://tauri.app/
