#!/usr/bin/env pwsh
# AlienX Desktop - Release File Organizer
# Organizes built files into platform-specific directories for easy upload to GitHub Releases

param(
    [string]$SourceDir = "src-tauri/target/release/bundle",
    [string]$OutputDir = "release-dist"
)

$ErrorActionPreference = "Stop"

function Format-FileSize {
    param([long]$bytes)
    $units = @('B', 'KB', 'MB', 'GB')
    $size = [double]$bytes
    $unitIndex = 0
    
    while ($size -ge 1024 -and $unitIndex -lt $units.Length - 1) {
        $size /= 1024
        $unitIndex++
    }
    
    return "{0:N2} {1}" -f $size, $units[$unitIndex]
}

Write-Host "================================" -ForegroundColor Cyan
Write-Host "AlienX - Release File Organizer" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if source directory exists
if (-not (Test-Path $SourceDir)) {
    Write-Host "✗ Error: Source directory not found: $SourceDir" -ForegroundColor Red
    Write-Host "Make sure you've run: npm run tauri:build" -ForegroundColor Yellow
    exit 1
}

# Create output directory
$null = New-Item -ItemType Directory -Force -Path $OutputDir
$null = New-Item -ItemType Directory -Force -Path "$OutputDir/windows"
$null = New-Item -ItemType Directory -Force -Path "$OutputDir/macos"
$null = New-Item -ItemType Directory -Force -Path "$OutputDir/linux"

Write-Host "Organizing release files..." -ForegroundColor Yellow
Write-Host ""

$filesCopied = 0
$filesSkipped = 0

# Windows files
$windowsPatterns = @("*.exe", "*.msi")
foreach ($pattern in $windowsPatterns) {
    Get-ChildItem -Path "$SourceDir/nsis/$pattern" -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination "$OutputDir/windows/" -Force
        $size = Format-FileSize $_.Length
        Write-Host "✓ Windows: $($_.Name) [$size]" -ForegroundColor Green
        $filesCopied++
    }
    Get-ChildItem -Path "$SourceDir/msi/$pattern" -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination "$OutputDir/windows/" -Force
        $size = Format-FileSize $_.Length
        Write-Host "✓ Windows: $($_.Name) [$size]" -ForegroundColor Green
        $filesCopied++
    }
}

# macOS files
Get-ChildItem -Path "$SourceDir/dmg/*.dmg" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination "$OutputDir/macos/" -Force
    $size = Format-FileSize $_.Length
    Write-Host "✓ macOS: $($_.Name) [$size]" -ForegroundColor Green
    $filesCopied++
}

# Copy the .app bundle if it exists
if (Test-Path "$SourceDir/macos/AlienX Desktop.app") {
    $appPath = "$SourceDir/macos/AlienX Desktop.app"
    $destPath = "$OutputDir/macos/AlienX Desktop.app"
    
    if (Test-Path $destPath) {
        Remove-Item -Path $destPath -Recurse -Force
    }
    
    Copy-Item -Path $appPath -Destination $destPath -Recurse -Force
    Write-Host "✓ macOS: AlienX Desktop.app" -ForegroundColor Green
    $filesCopied++
}

# Linux files
Get-ChildItem -Path "$SourceDir/appimage/*.AppImage" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination "$OutputDir/linux/" -Force
    $size = Format-FileSize $_.Length
    Write-Host "✓ Linux: $($_.Name) [$size]" -ForegroundColor Green
    $filesCopied++
}

Get-ChildItem -Path "$SourceDir/deb/*.deb" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination "$OutputDir/linux/" -Force
    $size = Format-FileSize $_.Length
    Write-Host "✓ Linux: $($_.Name) [$size]" -ForegroundColor Green
    $filesCopied++
}

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "Organization Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "📦 Release Structure:" -ForegroundColor Cyan
Write-Host ""
Get-ChildItem -Path $OutputDir -Recurse -File | ForEach-Object {
    $relPath = $_.FullName -replace [regex]::Escape($OutputDir), ""
    $size = Format-FileSize $_.Length
    Write-Host "  $relPath ($size)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "📁 Directory structure:" -ForegroundColor Cyan
Write-Host "  release-dist/" -ForegroundColor White
Write-Host "    ├── windows/" -ForegroundColor White
Write-Host "    │   ├── *.exe" -ForegroundColor Gray
Write-Host "    │   └── *.msi" -ForegroundColor Gray
Write-Host "    ├── macos/" -ForegroundColor White
Write-Host "    │   └── *.dmg" -ForegroundColor Gray
Write-Host "    └── linux/" -ForegroundColor White
Write-Host "        ├── *.AppImage" -ForegroundColor Gray
Write-Host "        └── *.deb" -ForegroundColor Gray
Write-Host ""

Write-Host "✅ Ready for GitHub Release upload!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Go to: https://github.com/Alien979/alienx-desktop/releases"
Write-Host "  2. Create a new release for tag v*"
Write-Host "  3. Upload files from $OutputDir/ directory"
Write-Host "  4. Publish the release"
Write-Host ""
