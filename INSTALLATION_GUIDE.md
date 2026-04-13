# AlienX Desktop - Installation Guide

**AlienX** is a standalone forensic event log analysis application that requires no installation of additional dependencies. Download and run it directly!

---

## Quick Start

### Windows

1. **Download** `AlienX-Desktop-1.2.0-Setup.exe`
2. **Run** the installer
3. **Follow** the setup wizard
4. **Launch** from Start Menu or Desktop shortcut

### macOS

1. **Download** `AlienX-Desktop-1.2.0.dmg`
2. **Open** the DMG file
3. **Drag** AlienX to Applications folder
4. **Launch** from Applications

### Linux

1. **Download** `AlienX-Desktop-1.2.0.AppImage`
2. **Make executable**: `chmod +x AlienX-Desktop-1.2.0.AppImage`
3. **Run**: Double-click the file or run `./AlienX-Desktop-1.2.0.AppImage`

---

## System Requirements

| OS          | Minimum        | Recommended   |
| ----------- | -------------- | ------------- |
| **Windows** | Windows 7 SP1+ | Windows 10/11 |
| **macOS**   | macOS 10.13+   | macOS 12+     |
| **Linux**   | Ubuntu 16.04+  | Ubuntu 20.04+ |

**RAM**: 2GB minimum, 4GB+ recommended
**Disk Space**: ~500MB for application

---

## Features

✅ **No Dependencies** - Everything bundled in the installer
✅ **Offline Analysis** - Works completely offline
✅ **Cross-Platform** - Windows, macOS, Linux support
✅ **Auto-Updates** - Automatic update notifications (coming soon)
✅ **Local Data** - All data stays on your machine

---

## Usage

### 1. Load Event Logs

- Drag & drop EVTX, XML, or Excel files
- Or use "File" → "Open" menu
- Supported formats: .evtx, .xml, .xlsx, .csv

### 2. Analyze Events

- SIGMA rule matching
- YARA rule detection
- Timeline correlation
- Threat hunting

### 3. Export Results

- PDF reports
- Excel spreadsheets
- JSON data export

---

## Troubleshooting

### Windows

**"Windows Defender blocked the app"**

- Click "More info" → "Run anyway"
- Or temporarily disable SmartScreen (not recommended)

**Application crashes on startup**

- Try running in Compatibility Mode:
  - Right-click → Properties → Compatibility
  - Select Windows 10 mode

### macOS

**"Cannot open AlienX.app because it is from an unknown developer"**

- Right-click → Open → Open

**"Permission denied" error**

- Open Terminal: `xattr -d com.apple.quarantine /Applications/AlienX\ Desktop.app`

### Linux

**"Permission denied" error**

```bash
chmod +x AlienX-Desktop-1.2.0.AppImage
./AlienX-Desktop-1.2.0.AppImage
```

**Missing FUSE library (Ubuntu/Debian)**

```bash
sudo apt-get install libfuse2
```

---

## Uninstallation

| OS          | Method                                                                |
| ----------- | --------------------------------------------------------------------- |
| **Windows** | Control Panel → Programs → Uninstall Program → Select AlienX → Remove |
| **macOS**   | Drag AlienX from Applications to Trash                                |
| **Linux**   | Delete the AppImage file                                              |

---

## Getting Help

- **Documentation**: See README.md in the installation directory
- **Report Issues**: https://github.com/Alien979/alienx-desktop/issues
- **Feature Requests**: https://github.com/Alien979/alienx-desktop/discussions

---

## Version Info

**Current Version**: 1.2.0

**Latest Fixes**:

- ✓ 6 critical runtime bug fixes
- ✓ Improved error handling
- ✓ Better input validation
- ✓ Enhanced logging for debugging

---

**Last Updated**: April 5, 2026
