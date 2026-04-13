# AlienX Desktop - Complete Release & Distribution Guide

Complete workflow for building, signing, and releasing AlienX Desktop across all platforms.

---

## 🎯 Overview

This guide covers:

1. ✅ **Automated CI/CD** with GitHub Actions
2. ✅ **File Organization** for easy distribution
3. ✅ **Windows Code Signing** to prevent security warnings
4. ✅ **Complete Release Process**

---

## Part 1: GitHub Actions CI/CD Automation

### How It Works

When you create a new release tag (e.g., `v1.2.0`), GitHub Actions automatically:

1. ✅ Builds the application on Windows, macOS, and Linux
2. ✅ Creates installers for each platform
3. ✅ Uploads files to the GitHub release
4. ✅ Generates a release summary

### Setup

**Already configured!** The workflow is at: `.github/workflows/build-and-release.yml`

### Creating an Automated Release

#### Step 1: Update Version Numbers

```bash
# Update package.json
"version": "1.3.0"

# Update src-tauri/tauri.conf.json
"version": "1.3.0"
```

#### Step 2: Commit and Tag

```bash
git add package.json src-tauri/tauri.conf.json
git commit -m "Release v1.3.0"
git tag v1.3.0
git push origin main --tags
```

#### Step 3: Watch GitHub Actions

1. Go to: `github.com/Alien979/alienx-desktop/actions`
2. Wait for all jobs to complete (5-10 minutes)
3. All builds will be automatically uploaded to release

#### Step 4: Verify Release

1. Go to: `github.com/Alien979/alienx-desktop/releases`
2. You'll see all 4 installers ready!

### GitHub Actions Workflow Features

**Supported Platforms:**

- Windows 64-bit (x86_64-pc-windows-msvc)
- macOS Intel (x86_64-apple-darwin)
- macOS Apple Silicon (aarch64-apple-darwin)
- Linux 64-bit (x86_64-unknown-linux-gnu)

**Automatic Actions:**

- Installs Node.js and Rust
- Installs platform-specific dependencies
- Builds frontend and backend
- Creates native installers
- Uploads to GitHub Release

---

## Part 2: File Organization

After building, organize files for easy distribution.

### Local Build + Organize

```powershell
# 1. Build the application
npm run tauri:build

# 2. Organize files
.\organize-release-files.ps1

# Output structure:
# release-dist/
# ├── windows/
# │   ├── AlienX_Desktop_1.2.0_x64_en-US.msi
# │   └── AlienX Desktop_1.2.0_x64-setup.exe
# ├── macos/
# │   └── AlienX_Desktop_1.2.0_x64.dmg
# └── linux/
#     └── AlienX_Desktop_1.2.0_x64.AppImage
```

### What `organize-release-files.ps1` Does

✅ Finds all built files from `src-tauri/target/release/bundle/`
✅ Organizes into platform-specific folders
✅ Shows file sizes for each installer
✅ Creates structure ready for GitHub Releases

### Manual Upload to GitHub

1. Go to: `github.com/Alien979/alienx-desktop/releases/new`
2. Tag version: `v1.3.0`
3. Title: `AlienX Desktop v1.3.0`
4. Upload files from `release-dist/` folder:
   - All Windows files → upload together
   - All macOS files → upload together
   - All Linux files → upload together
5. Click "Publish Release"

---

## Part 3: Windows Code Signing

### Why Sign?

**Without signing:**

- ❌ Windows SmartScreen warning
- ❌ "Unknown Publisher"
- ❌ Users get scared
- ❌ Installation delayed

**With signing:**

- ✅ No warning or delay
- ✅ Shows "AlienX Desktop"
- ✅ Professional appearance
- ✅ User trust

### Setup Process

#### Step 1: Obtain Code Signing Certificate

**Option A: DigiCert (Recommended)**

- Cost: ~$300/year
- Trust Level: Highest
- Website: https://www.digicert.com/code-signing

**Option B: Sectigo/Comodo**

- Cost: ~$100/year
- Trust Level: High
- Website: https://sectigo.com/ssl-certificates/code-signing

**Option C: Free Self-Signed (Testing only)**

```powershell
New-SelfSignedCertificate -CertStoreLocation Cert:\CurrentUser\My `
  -Subject "CN=AlienX Desktop" -KeyUsage DigitalSignature `
  -Type CodeSigningCert -FriendlyName "AlienX Code Signing"
```

#### Step 2: Store Certificate

**For Local Development:**

```powershell
# Save certificate to secure location
# Don't commit to git!

# Add to .gitignore:
*.pfx
*.p12
signing/
```

**For GitHub Actions (CI/CD):**

```powershell
# 1. Convert to base64
[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) | Out-File -NoNewline "cert.b64"

# 2. Add GitHub Secrets
# Settings → Secrets and variables → Actions
# New secret: WINDOWS_CERTIFICATE (paste base64)
# New secret: WINDOWS_CERTIFICATE_PASSWORD (paste password)
```

#### Step 3: Sign Locally

```powershell
# After building:
npm run tauri:build

# Sign all Windows files
.\sign-windows-builds.ps1 `
  -CertificatePath "C:\path\to\cert.pfx" `
  -CertificatePassword "your-password"

# Script will:
# ✓ Find signtool.exe
# ✓ Sign all .exe files
# ✓ Sign all .msi files
# ✓ Verify signatures
# ✓ Show results
```

#### Step 4: Verify Signatures

```powershell
# Check if a file is signed
Get-AuthenticodeSignature "alienx.exe"

# Should show:
# SignerCertificate: CN=AlienX Desktop
# Status: Valid
```

### Signing Results

**Before Signing:**

```
User downloads → SmartScreen appears
"Windows protected your PC"
"Unknown Publisher"
```

**After Signing:**

```
User downloads → No warning
"AlienX Desktop" shown
Instant trust
```

---

## Part 4: Complete Release Workflow

### For Automated Release (GitHub Actions)

```bash
# 1. Make changes, test locally
# 2. Update versions
# 3. Commit and tag
git add .
git commit -m "Release v1.3.0"
git tag v1.3.0
git push origin main --tags

# 4. Wait 5-10 minutes
# GitHub Actions automatically:
# - Builds on all platforms
# - Creates installers
# - Uploads to release

# 5. Go to releases page and verify
# Done! 🎉
```

### For Manual Release (with Signing)

```powershell
# 1. Build locally
npm run tauri:build

# 2. Sign Windows files
.\sign-windows-builds.ps1 `
  -CertificatePath "C:\secure\cert.pfx" `
  -CertificatePassword "password"

# 3. Organize files
.\organize-release-files.ps1

# 4. Create GitHub release manually
# - Upload from release-dist/ folder
# - Add release notes
# - Publish

# Done! 🎉
```

---

## Quick Reference

### Build Commands

```bash
npm run build              # Build frontend
npm run tauri:build        # Build all platforms
npm run tauri dev          # Test in dev mode
```

### Signing Commands

```powershell
.\sign-windows-builds.ps1 -CertificatePath "cert.pfx" -CertificatePassword "pass"
```

### Organization Commands

```powershell
.\organize-release-files.ps1
```

### Tag & Release

```bash
git tag v1.3.0
git push origin main --tags
```

---

## Checklist for Release

### Pre-Release

- [ ] All bug fixes tested
- [ ] Version bumped in both config files
- [ ] CHANGELOG updated
- [ ] Code commited and pushed to main

### Build

- [ ] Application builds without errors (`npm run tauri:build`)
- [ ] All 4 installers created successfully
- [ ] Windows files are signed (if using certificate)
- [ ] Files organized (`organize-release-files.ps1`)

### Release

- [ ] GitHub release created with correct tag
- [ ] All installers uploaded
- [ ] Release notes added
- [ ] Release published

### Post-Release

- [ ] Documentation updated
- [ ] Users notified
- [ ] GitHub release shared
- [ ] Package managers updated (if applicable)

---

## GitHub Actions Troubleshooting

### Build Failed

1. Check: `github.com/Alien979/alienx-desktop/actions`
2. Click failed job
3. Scroll to see error
4. Common causes:
   - Missing dependencies (update apt/brew)
   - Version mismatch (check config files)
   - Rust version issue (update toolchain)

### Files Not Uploading

1. Verify release tag matches (e.g., `v1.3.0` = tag `v1.3.0`)
2. Check GitHub token permissions
3. Restart workflow if needed

### Build Takes Too Long

- First build: ~10-15 min (Rust compilation)
- Subsequent builds: ~5-8 min (cached)
- This is normal!

---

## Signing Troubleshooting

### SignTool Not Found

```powershell
# Install Visual Studio Build Tools:
# https://visualstudio.microsoft.com/downloads/
```

### Certificate Password Error

```powershell
# Verify certificate works:
$cert = Import-PfxCertificate -FilePath "cert.pfx" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -Password (ConvertTo-SecureString "password" -AsPlainText -Force)
```

### Timestamp Server Failed

```powershell
# Try different timestamp server:
# DigiCert: http://timestamp.digicert.com
# Sectigo: http://timestamp.sectigo.com
```

---

## Security Best Practices

✅ **DO THIS:**

- Store certificates outside git repo
- Use `.gitignore` for `.pfx` files
- Store passwords in GitHub Secrets (not code)
- Use trusted Certificate Authority
- Keep certificate password safe

❌ **DON'T DO THIS:**

- Commit certificates to git
- Store passwords in code
- Share certificate files
- Use self-signed for production
- Forget to renew before expiration

---

## Cost Analysis

| Item                      | Cost      | Priority         |
| ------------------------- | --------- | ---------------- |
| **DigiCert Code Signing** | $300/year | Recommended      |
| **Sectigo Code Signing**  | $100/year | Good alternative |
| **GitHub Actions**        | Free      | Included         |
| **GitHub Releases**       | Free      | Included         |

**Total for free CI/CD**: $0 (code signing cert optional)
**Total with certificate**: ~$100-300/year

---

## Resources

- **GitHub Actions Docs**: https://docs.github.com/en/actions
- **Tauri Docs**: https://tauri.app/docs/
- **DigiCert Code Signing**: https://www.digicert.com/code-signing
- **Microsoft SignTool**: https://docs.microsoft.com/en-us/windows/win32/seccrypto/signtool
- **Windows Authenticode**: https://docs.microsoft.com/en-us/windows-hardware/drivers/install/authenticode

---

**Created**: April 5, 2026
**Status**: Ready for production use
