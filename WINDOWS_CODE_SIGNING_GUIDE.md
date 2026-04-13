# Windows Code Signing Setup for AlienX Desktop

This guide explains how to set up code signing for your Windows executables. Code signing makes your application trusted and prevents security warnings.

---

## Why Code Signing Matters

When users download an unsigned `.exe` or `.msi`:

- ❌ Windows SmartScreen warning appears
- ❌ Users see "Unknown Publisher"
- ❌ Installation delayed by warning popup
- ❌ Some antivirus software may flag it

With code signing:

- ✅ No SmartScreen warning
- ✅ Shows your organization name
- ✅ Users trust the download
- ✅ Professional appearance

---

## Step 1: Obtain a Code Signing Certificate

### Option A: DigiCert (Recommended, ~$300/year)

1. Go to: https://www.digicert.com/code-signing
2. Choose "EV Code Signing Certificate" (most trusted)
3. Verify your identity and business
4. Download the certificate (`.pfx` file)
5. Keep the password safe

### Option B: Sectigo/Comodo (~$100/year)

1. Go to: https://sectigo.com/ssl-certificates/code-signing
2. Follow the purchase process
3. Download `.pfx` certificate

### Option C: Self-Signed (Free, not recommended)

```powershell
# Only for testing - self-signed certs don't prevent SmartScreen
New-SelfSignedCertificate -CertStoreLocation Cert:\CurrentUser\My `
  -Subject "CN=AlienX Desktop" -KeyUsage DigitalSignature `
  -Type CodeSigningCert -FriendlyName "AlienX Code Signing"
```

---

## Step 2: Store Certificate Securely

### Local Development

1. Save `.pfx` file to secure location (NOT in git!)
2. Add to `.gitignore`:
   ```
   # Code signing certificates
   *.pfx
   *.p12
   .signing/
   signing-certs/
   ```

### GitHub Secrets (for CI/CD)

For automated signing in GitHub Actions:

1. Convert `.pfx` to base64:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\cert.pfx")) | Out-File -NoNewline "cert.b64"
   ```

2. Copy the base64 content

3. Add to GitHub repository secrets:
   - Go: Settings → Secrets and variables → Actions
   - New secret: `WINDOWS_CERTIFICATE`
   - Paste base64 content
   - Also add: `WINDOWS_CERTIFICATE_PASSWORD` with the password

---

## Step 3: Sign Executables Locally

### Download SignTool (Windows SDK)

Already included with Visual Studio. If not present:

```powershell
# Download from Windows SDK
# https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/

# Find signtool.exe (usually at):
# "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\signtool.exe"
```

### PowerShell Signing Script

Create `sign-executable.ps1`:

```powershell
param(
    [Parameter(Mandatory=$true)]
    [string]$ExePath,

    [Parameter(Mandatory=$true)]
    [string]$CertPath,

    [Parameter(Mandatory=$true)]
    [string]$CertPassword,

    [string]$TimeStampUrl = "http://timestamp.digicert.com"
)

$signtoolPath = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\signtool.exe"

if (-not (Test-Path $signtoolPath)) {
    Write-Error "signtool.exe not found. Install Windows SDK."
    exit 1
}

Write-Host "Signing: $ExePath" -ForegroundColor Yellow

# Sign the executable
& $signtoolPath sign /f $CertPath /p $CertPassword /t $TimeStampUrl /v $ExePath

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Successfully signed!" -ForegroundColor Green
} else {
    Write-Host "✗ Signing failed!" -ForegroundColor Red
    exit 1
}
```

### Usage

```powershell
./sign-executable.ps1 -ExePath "alienx.exe" `
  -CertPath "C:\path\to\cert.pfx" `
  -CertPassword "your-password"
```

---

## Step 4: Automate Signing During Build

### Option A: Manual Signing After Build

```powershell
# 1. Build
npm run tauri:build

# 2. Sign all executables
Get-ChildItem -Path "src-tauri/target/release/bundle" -Filter "*.exe" -Recurse | ForEach-Object {
    ./sign-executable.ps1 -ExePath $_.FullName `
      -CertPath "C:\secure\cert.pfx" `
      -CertPassword "password"
}
```

### Option B: Auto-Sign in Tauri Config

This requires a build hook. Create `src-tauri/build.rs`:

```rust
fn main() {
    // This runs before the build
    // You can add code signing here

    #[cfg(windows)]
    {
        // Could shell out to signing script here
        println!("cargo:warning=Remember to sign the executables!");
    }
}
```

---

## Step 5: GitHub Actions Auto-Signing

Update `.github/workflows/build-and-release.yml` to add signing:

```yaml
build:
  # ... existing config ...

  steps:
    # ... existing steps ...

    - name: Sign Windows executables
      if: matrix.platform == 'windows'
      run: |
        # Decode certificate from base64
        [IO.File]::WriteAllBytes("cert.pfx", `
          [Convert]::FromBase64String("${{ secrets.WINDOWS_CERTIFICATE }}"))

        # Import certificate
        $cert = Import-PfxCertificate -FilePath "cert.pfx" `
          -CertStoreLocation "Cert:\CurrentUser\My" `
          -Password (ConvertTo-SecureString "${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}" -AsPlainText -Force)

        # Sign executables
        $signtoolPath = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\signtool.exe"
        Get-ChildItem "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/**/*.exe" -Recurse | ForEach-Object {
          & $signtoolPath sign /f cert.pfx /p "${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}" `
            /t http://timestamp.digicert.com /v $_.FullName
        }

        # Clean up
        Remove-Item cert.pfx
```

---

## Step 6: Verify Signing

### Check if file is signed

```powershell
Get-AuthenticodeSignature "C:\path\to\alienx.exe"

# Output should show:
# SignerCertificate: [Your certificate]
# Status: Valid
```

### Test SmartScreen warning

1. Download signed executable on another computer
2. Windows SmartScreen should NOT appear
3. You'll see publisher name instead of "Unknown Publisher"

---

## Troubleshooting

### "Unable to find signing certificate"

```powershell
# Check available certificates
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert
```

### "Timestamp server connection failed"

- Try different timestamp server
- DigiCert: `http://timestamp.digicert.com`
- Sectigo: `http://timestamp.sectigo.com`

### "SignTool not found"

- Install Visual Studio with C++ development tools
- Or: Windows SDK: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/

### Certificate password incorrect

- Verify with: `Test-Path cert.pfx`
- Try in Explorer: double-click → should prompt for password

---

## Microsoft Authenticode Best Practices

1. **Keep certificate secure** - Don't commit to git
2. **Use timestamp server** - Makes cert valid after expiration
3. **Sign all executables** - Both `.exe` and `.msi`
4. **Test on clean PC** - Verify no SmartScreen warning
5. **Renew certificate annually** - Before expiration

---

## Cost vs Benefit Analysis

| Certificate Type            | Cost           | Benefits                               |
| --------------------------- | -------------- | -------------------------------------- |
| **Paid (DigiCert/Sectigo)** | ~$100-500/year | Full trust, no warnings                |
| **Free (Self-signed)**      | $0             | Testing only                           |
| **No cert**                 | $0             | SmartScreen warnings (not recommended) |

For a professional FYP project, **paid certificate is recommended**.

---

## Example: Complete Signing Workflow

```powershell
# 1. Build the application
npm run tauri:build

# 2. Sign all Windows files
$files = Get-ChildItem "src-tauri/target/release/bundle" -Include "*.exe", "*.msi" -Recurse
$files | ForEach-Object {
    ./sign-executable.ps1 `
      -ExePath $_.FullName `
      -CertPath "C:\secure\cert.pfx" `
      -CertPassword "your-password"
}

# 3. Verify signing
$files | ForEach-Object {
    $sig = Get-AuthenticodeSignature $_
    Write-Host "Signed: $($_.Name) - Status: $($sig.Status)"
}

# 4. Create release
./organize-release-files.ps1

# 5. Upload to GitHub Releases
# (manual upload via UI)
```

---

## Security Checklist

- [ ] Certificate obtained from trusted CA
- [ ] Certificate stored outside repository
- [ ] Certificate added to `.gitignore`
- [ ] Password stored securely (GitHub Secrets for CI/CD)
- [ ] All executables are signed
- [ ] Signature verified before release
- [ ] Timestamp server working
- [ ] Certificate renewed before expiration

---

## References

- Microsoft Authenticode: https://docs.microsoft.com/en-us/windows-hardware/drivers/install/authenticode
- SignTool documentation: https://docs.microsoft.com/en-us/windows/win32/seccrypto/signtool
- DigiCert Code Signing: https://www.digicert.com/code-signing
- Sectigo Code Signing: https://sectigo.com/ssl-certificates/code-signing

---

**Last Updated**: April 5, 2026
