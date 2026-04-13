#!/usr/bin/env pwsh
# AlienX Desktop - Windows Code Signing Script
# Signs Windows executables and MSI installers with a code signing certificate

param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path $_ })]
    [string]$CertificatePath,
    
    [Parameter(Mandatory = $true)]
    [string]$CertificatePassword,
    
    [string]$SourceDir = "src-tauri/target/release/bundle",
    [string]$TimestampUrl = "http://timestamp.digicert.com",
    [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"

# Color functions
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Error2 { Write-Host $args -ForegroundColor Red }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warn { Write-Host $args -ForegroundColor Yellow }

Write-Info "================================"
Write-Info "AlienX - Windows Code Signing"
Write-Info "================================"
Write-Info ""

# Find SignTool
$possiblePaths = @(
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe",
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\signtool.exe",
    "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe",
    "C:\Program Files (x86)\Microsoft SDKs\Windows\v7.1A\Bin\signtool.exe"
)

$signtoolPath = $null
foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        $signtoolPath = $path
        break
    }
}

if ($null -eq $signtoolPath) {
    Write-Error2 "SignTool.exe not found!"
    Write-Warn "Please install Visual Studio Build Tools or Windows SDK:"
    Write-Warn "https://developer.microsoft.com/en-us/windows/downloads/visual-studio-build-tools/"
    exit 1
}

Write-Success "✓ Found SignTool: $signtoolPath"
Write-Info ""

# Verify certificate
if (-not (Test-Path $CertificatePath)) {
    Write-Error2 "Certificate not found: $CertificatePath"
    exit 1
}

Write-Success "✓ Certificate found: $CertificatePath"
Write-Info ""

if ($VerifyOnly) {
    Write-Info "Running in VERIFY mode - will not sign anything"
    Write-Info ""
}

# Find files to sign
Write-Info "Searching for executables and installers..."
$filesToSign = @()

# Find all exe files
Get-ChildItem -Path $SourceDir -Filter "*.exe" -Recurse | ForEach-Object {
    $filesToSign += $_.FullName
}

# Find all msi files
Get-ChildItem -Path $SourceDir -Filter "*.msi" -Recurse | ForEach-Object {
    $filesToSign += $_.FullName
}

if ($filesToSign.Count -eq 0) {
    Write-Warn "No executables or installers found in: $SourceDir"
    Write-Warn "Make sure you've run: npm run tauri:build"
    exit 1
}

Write-Success "Found $($filesToSign.Count) file(s) to sign:"
Write-Info ""

$filesToSign | ForEach-Object { Write-Info "  • $_" }
Write-Info ""

# Sign each file
$signed = 0
$failed = 0

foreach ($file in $filesToSign) {
    $filename = Split-Path $file -Leaf
    Write-Info "Signing: $filename"
    
    if (-not $VerifyOnly) {
        try {
            # Sign with timestamp
            & $signtoolPath sign /f $CertificatePath `
                /p $CertificatePassword `
                /t $TimestampUrl `
                /v $file | Out-Null
            
            # Verify signature
            $signature = Get-AuthenticodeSignature $file
            if ($signature.Status -eq "Valid") {
                Write-Success "  ✓ Signed successfully"
                $signed++
            }
            else {
                Write-Error2 "  ✗ Signature invalid: $($signature.Status)"
                $failed++
            }
        }
        catch {
            Write-Error2 "  ✗ Signing failed: $_"
            $failed++
        }
    }
    else {
        Write-Info "  [VERIFY MODE - skipping]"
    }
}

Write-Info ""
Write-Info "================================"

if ($VerifyOnly) {
    Write-Info "VERIFY MODE - No files were signed"
} else {
    Write-Success "✓ Signing Complete!"
    Write-Info "Signed: $signed"
    if ($failed -gt 0) {
        Write-Error2 "Failed: $failed"
    }
}

Write-Info "================================"
Write-Info ""

# Verify signatures
Write-Info "Verifying signatures..."
$verificationResults = @()

foreach ($file in $filesToSign) {
    $filename = Split-Path $file -Leaf
    $signature = Get-AuthenticodeSignature $file
    
    if ($signature.Status -eq "Valid") {
        Write-Success "✓ $filename - Valid"
        $verificationResults += @{
            File = $filename
            Status = "Valid"
            Signer = $signature.SignerCertificate.Subject
        }
    }
    elseif ($signature.Status -eq "NotSigned") {
        Write-Warn "⚠ $filename - Not signed"
        $verificationResults += @{
            File = $filename
            Status = "NotSigned"
        }
    }
    else {
        Write-Error2 "✗ $filename - $($signature.Status)"
        $verificationResults += @{
            File = $filename
            Status = $signature.Status
        }
    }
}

Write-Info ""
Write-Info "Signature Details:"
Write-Info ""
$verificationResults | ForEach-Object {
    Write-Info "File: $($_.File)"
    Write-Info "  Status: $($_.Status)"
    if ($_.Signer) {
        Write-Info "  Signer: $($_.Signer)"
    }
}

Write-Info ""

# Summary
$validCount = ($verificationResults | Where-Object { $_.Status -eq "Valid" }).Count
$notSignedCount = ($verificationResults | Where-Object { $_.Status -eq "NotSigned" }).Count

Write-Info "================================"
Write-Info "Summary"
Write-Info "================================"
Write-Info "Total files: $($verificationResults.Count)"
Write-Info "Valid signatures: $validCount"
if ($notSignedCount -gt 0) {
    Write-Warn "Not signed: $notSignedCount"
}
Write-Info ""

if ($validCount -eq $filesToSign.Count) {
    Write-Success "✅ All files successfully signed!"
}
elseif ($validCount -gt 0) {
    Write-Warn "⚠️  Partially signed - some files have issues"
}
else {
    Write-Error2 "❌ No files are signed"
}

Write-Info ""
Write-Info "Next steps:"
Write-Info "  1. Test the signed executable on another PC"
Write-Info "  2. Windows SmartScreen should NOT appear"
Write-Info "  3. Upload to: github.com/Alien979/alienx-desktop/releases"
Write-Info ""
