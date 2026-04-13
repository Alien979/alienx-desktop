#!/usr/bin/env pwsh
# AlienX Desktop - Build for Distribution Script
# This script builds the application as a standalone executable

param(
    [switch]$Clean,
    [switch]$SkipTests,
    [ValidateSet("windows", "all")]
    [string]$Platform = "windows"
)

$ErrorActionPreference = "Stop"

Write-Host "================================" -ForegroundColor Cyan
Write-Host "AlienX Desktop - Build Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Clean previous builds if requested
if ($Clean) {
    Write-Host "[1/5] Cleaning previous builds..." -ForegroundColor Yellow
    Remove-Item -Path "src-tauri/target/release" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "dist" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✓ Clean complete" -ForegroundColor Green
    Write-Host ""
}

# Step 2: Install dependencies
Write-Host "[2/5] Installing dependencies..." -ForegroundColor Yellow
$npmInstallOutput = npm install 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ npm install failed" -ForegroundColor Red
    Write-Host $npmInstallOutput
    exit 1
}
Write-Host "✓ Dependencies installed" -ForegroundColor Green
Write-Host ""

# Step 3: Lint and type check (unless skipped)
if (-not $SkipTests) {
    Write-Host "[3/5] Type checking..." -ForegroundColor Yellow
    $typeCheckOutput = npx tsc --noEmit 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠ TypeScript errors found (non-blocking):" -ForegroundColor Yellow
        Write-Host $typeCheckOutput
    } else {
        Write-Host "✓ Type check passed" -ForegroundColor Green
    }
    Write-Host ""
}

# Step 4: Build frontend and backend
Write-Host "[4/5] Building application..." -ForegroundColor Yellow
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Frontend built successfully" -ForegroundColor Green
Write-Host ""

# Step 5: Build Tauri distributables
Write-Host "[5/5] Creating distribution packages..." -ForegroundColor Yellow
npm run tauri:build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Tauri build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Distribution packages created" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "================================" -ForegroundColor Green
Write-Host "Build Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "Distribution packages created at:" -ForegroundColor Cyan
Write-Host ""

$bundlePath = "src-tauri/target/release/bundle"

Get-ChildItem -Path $bundlePath -Recurse -File | ForEach-Object {
    $size = [math]::Round($_.Length / 1MB, 2)
    Write-Host "  ✓ $($_.FullName)" -ForegroundColor Green
    Write-Host "    Size: $size MB" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Test the application:"
Write-Host "     - Windows: Run the .exe or .msi installer"
Write-Host "     - macOS: Open the .dmg file or .app bundle"
Write-Host "     - Linux: Run the .AppImage"
Write-Host ""
Write-Host "  2. Create a GitHub release:"
Write-Host "     git tag v1.2.0"
Write-Host "     git push origin v1.2.0"
Write-Host ""
Write-Host "  3. Upload to: https://github.com/Alien979/alienx-desktop/releases"
Write-Host ""
