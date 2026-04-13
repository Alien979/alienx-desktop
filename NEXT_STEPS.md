# 🎬 Next Steps - Action Items

Your professional release system is ready! Here's what to do next.

---

## Phase 0: Verify Everything Works (5 minutes)

### Check Files Exist

```powershell
# Verify all scripts are in place
ls .github/workflows/build-and-release.yml          # ✅ GitHub Actions
ls organize-release-files.ps1                       # ✅ File organizer
ls sign-windows-builds.ps1                          # ✅ Signing script
ls build-distribution.ps1                           # ✅ Build script
ls src-tauri/tauri.conf.json                        # ✅ Config updated
```

### Check Git Configuration

```bash
# Make sure you can create tags
git config user.name                # Should show your name
git config user.email               # Should show your email
git status                          # Should be clean
```

### Verify Build System

```bash
npm run tauri:build --help          # Check Tauri works
```

---

## Phase 1: First Automated Release (20 minutes)

This is your first test release. Non-breaking changes only!

### Step 1: Update Versions (2 min)

```bash
# Edit package.json
"version": "1.2.1"     # Change from 1.2.0

# Edit src-tauri/tauri.conf.json
"version": "1.2.1"     # Must match package.json
```

### Step 2: Commit Changes (2 min)

```bash
git add package.json src-tauri/tauri.conf.json
git commit -m "Release v1.2.1 - Test automated build"
```

### Step 3: Create Release Tag (2 min)

```bash
git tag v1.2.1
git push origin main --tags
```

### Step 4: Watch GitHub Actions (10 min)

```
Go to: github.com/Alien979/alienx-desktop/actions

Click the latest workflow run and watch:
  ✓ Ubuntu build starting...
  ✓ macOS build starting...
  ✓ Windows build starting...

Wait for all to complete (green checkmarks)
```

### Step 5: Verify Release (2 min)

```
Go to: github.com/Alien979/alienx-desktop/releases

You should see:
  ✓ AlienX_Desktop_1.2.1_x64_en-US.msi
  ✓ AlienX Desktop_1.2.1_x64-setup.exe
  ✓ AlienX_Desktop_1.2.1_x64.dmg (macOS)
  ✓ AlienX_Desktop_1.2.1_x64.AppImage
```

✅ **You've successfully automated releases!**

---

## Phase 2: Local Build + Organize (10 minutes)

Test the file organization script locally.

### Step 1: Build Application (5 min)

```powershell
npm run tauri:build
```

### Step 2: Organize Files (1 min)

```powershell
.\organize-release-files.ps1
```

### Step 3: Verify Output (1 min)

```powershell
# Check organized files
ls release-dist/

# You should see:
# - release-dist/windows/ (2 files)
# - release-dist/macos/ (1 file)
# - release-dist/linux/ (1 file)
```

### Step 4: Manual Upload (3 min - optional)

```
Go to: github.com/Alien979/alienx-desktop/releases/new

Tag version: v1.2.1 (or new version)
Title: AlienX Desktop v1.2.1
Description: Test release

Upload files from release-dist/
Publish!
```

✅ **You've successfully organized and shared release files!**

---

## Phase 3: Windows Code Signing (Optional - 30 minutes)

Only if you want to remove SmartScreen warnings.

### Step 1: Get Certificate (5 min)

Choose one:

- **DigiCert**: https://www.digicert.com/code-signing (~$300/year)
- **Sectigo**: https://sectigo.com/ssl-certificates/code-signing (~$100/year)
- **Self-signed**: Free but won't remove SmartScreen

**Recommendation**: For professional FYP, get real certificate

### Step 2: Store Certificate Safely (5 min)

```powershell
# Save cert.pfx to secure location
# Example: C:\secure\alienx-cert.pfx

# Add to .gitignore
echo "*.pfx" >> .gitignore
echo "*.p12" >> .gitignore
git add .gitignore
git commit -m "chore: add certificate patterns to gitignore"
```

### Step 3: Test Signing (10 min)

```powershell
# After building
npm run tauri:build

# Sign all Windows files
.\sign-windows-builds.ps1 `
  -CertificatePath "C:\secure\alienx-cert.pfx" `
  -CertificatePassword "your-password"

# Verify signatures worked
Get-AuthenticodeSignature src-tauri/target/release/bundle/nsis/*.exe
# Status should show: Valid
```

### Step 4: Optional - GitHub Secrets (5 min)

For GitHub Actions to auto-sign:

```powershell
# Convert certificate to base64
[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) | Out-File -NoNewline cert.b64

# Copy content of cert.b64
```

Then:

1. Go to: github.com/Alien979/alienx-desktop/settings/secrets/actions
2. New secret: `WINDOWS_CERTIFICATE` (paste base64)
3. New secret: `WINDOWS_CERTIFICATE_PASSWORD` (paste password)

✅ **You've set up professional code signing!**

---

## Phase 4: Documentation (Optional - 10 minutes)

Help future users understand your system.

### Step 1: Add to README.md

````markdown
## Building from Source

### Automated Release

```bash
git tag v1.3.0
git push origin --tags
# GitHub Actions builds automatically
```
````

### Manual Build

```bash
npm install
npm run tauri:build
```

See [RELEASE_AND_DISTRIBUTION.md](./RELEASE_AND_DISTRIBUTION.md) for details.

````

### Step 2: Create CHANGELOG.md
```markdown
# Changelog

## [1.2.1] - 2026-04-05

### Added
- GitHub Actions CI/CD automation
- Automated file organization
- Windows code signing support

### Fixed
- 6 critical runtime bugs
- Input validation improved
- Error logging enhanced

## [1.2.0] - 2026-04-05

### Added
- Standalone packaging for all platforms
- Professional installers
````

### Step 3: Update GitHub Release Notes

Edit existing releases to add:

- What changed
- Installation instructions
- Known issues

---

## 📋 Ongoing Maintenance

### Before Each Release

```bash
# 1. Test the application
npm run tauri dev          # Or test the built app

# 2. Update version numbers
# - package.json
# - src-tauri/tauri.conf.json

# 3. Update CHANGELOG.md

# 4. Commit
git add .
git commit -m "Release vX.Y.Z - Description"

# 5. Create tag
git tag vX.Y.Z
git push origin main --tags

# 6. Wait for GitHub Actions (5-10 min)

# 7. Verify release at GitHub Releases

# 8. Share link if needed
# https://github.com/Alien979/alienx-desktop/releases
```

### Annual Tasks

```
Each year:
  ☐ Review and update documentation
  ☐ Renew code signing certificate (if using)
  ☐ Update dependencies (npm audit fix)
  ☐ Test on latest OS versions
  ☐ Review automation logs
```

---

## 🎓 Learning Resources

Bookmark these for reference:

| Resource                                                                                       | Use                  |
| ---------------------------------------------------------------------------------------------- | -------------------- |
| [GitHub Actions Docs](https://docs.github.com/en/actions)                                      | CI/CD details        |
| [Tauri App](https://tauri.app/docs/)                                                           | Building native apps |
| [PowerShell Docs](https://learn.microsoft.com/powershell/)                                     | Scripting help       |
| [Code Signing Guide](https://docs.microsoft.com/windows-hardware/drivers/install/authenticode) | Signing details      |

---

## ✅ Completion Checklist

### Essential ✅

- [ ] Phase 0: Verify everything exists
- [ ] Phase 1: First automated release working
- [ ] Phase 2: File organization tested
- [ ] All scripts executable and tested
- [ ] Documentation reviewed

### Recommended ⭐

- [ ] Phase 3: Windows code signing set up
- [ ] GitHub Secrets configured (if signing)
- [ ] CHANGELOG.md created
- [ ] README.md updated

### Nice to Have 💡

- [ ] Release notes template created
- [ ] Auto-notifications set up (Slack/Discord)
- [ ] Package manager publishing (future)
- [ ] Auto-updates configured (future)

---

## 🆘 Quick Troubleshooting

### GitHub Actions failed

```
→ Check: github.com/Alien979/alienx-desktop/actions
→ View error logs
→ Common: Missing version update
→ Solution: Update package.json and tauri.conf.json
```

### File organization didn't work

```
→ Verify build completed: npm run tauri:build
→ Check: src-tauri/target/release/bundle/ exists
→ Run: .\organize-release-files.ps1
→ Check: release-dist/ folder created
```

### Code signing failed

```
→ Verify certificate path exists
→ Check password is correct
→ Ensure signtool.exe found: install Windows SDK
→ Try: .\sign-windows-builds.ps1 -VerifyOnly
```

---

## 💬 Support

Each phase has detailed documentation:

1. **GitHub Actions**: `.github/workflows/build-and-release.yml`
2. **File Organization**: `organize-release-files.ps1`
3. **Code Signing**: `WINDOWS_CODE_SIGNING_GUIDE.md`
4. **Complete Guide**: `RELEASE_AND_DISTRIBUTION.md`
5. **Visual Workflow**: `VISUAL_WORKFLOW_GUIDE.md`

---

## 🚀 You're Ready!

You now have:

- ✅ Automated CI/CD with GitHub Actions
- ✅ File organization scripts
- ✅ Windows code signing setup
- ✅ Professional documentation
- ✅ Complete release workflow

**Next action**: Follow Phase 1 above to create your first automated release!

---

**Status**: Ready for production 🎉
**Last Updated**: April 5, 2026
