#!/usr/bin/env pwsh
# AlienX Desktop - Download GitHub Release & Organize Files
# Automatically downloads v1.2.1 release artifacts from GitHub and organizes them by platform

param(
    [string]$Owner = "Alien979",
    [string]$Repo = "alienx-desktop",
    [string]$Tag = "v1.2.1",
    [string]$OutputDir = "release-dist"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = 'SilentlyContinue'

Write-Host "================================" -ForegroundColor Cyan
Write-Host "AlienX - Release Downloader & Organizer" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check GitHub Release Status
Write-Host "Checking GitHub release: $Tag..." -ForegroundColor Yellow

try {
    $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/releases" -ErrorAction Stop
    $release = $releases | Where-Object { $_.tag_name -eq $Tag } | Select-Object -First 1
    
    if (-not $release) {
        Write-Host "[X] Release $Tag not found!" -ForegroundColor Red
        Write-Host "Waiting for GitHub Actions (5-10 min)..." -ForegroundColor Yellow
        Write-Host "Check: https://github.com/$Owner/$Repo/actions" -ForegroundColor Cyan
        exit 1
    }
    
    if ($release.assets.Count -eq 0) {
        Write-Host "[X] No artifacts yet!" -ForegroundColor Red
        Write-Host "Check: https://github.com/$Owner/$Repo/releases/tag/$Tag" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "[OK] Release found with $($release.assets.Count) artifacts!" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "[Error] GitHub API error: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Create download directory
$DownloadDir = "github-downloads-$Tag"
$null = New-Item -ItemType Directory -Force -Path $DownloadDir

Write-Host "Downloading to: $DownloadDir" -ForegroundColor Yellow
Write-Host ""

# Step 3: Download all assets
$DownloadedFiles = @()
foreach ($asset in $release.assets) {
    $fileName = $asset.name
    $downloadUrl = $asset.browser_download_url
    $outputPath = Join-Path $DownloadDir $fileName
    
    Write-Host "Downloading: $fileName..." -ForegroundColor Yellow
    
    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $outputPath -ErrorAction Stop
        $fileSize = [math]::Round((Get-Item $outputPath).Length / 1MB, 2)
        Write-Host "  [OK] $fileSize MB" -ForegroundColor Green
        $DownloadedFiles += $outputPath
    } catch {
        Write-Host "  [X] Failed: $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "[OK] Downloaded $($DownloadedFiles.Count) files!" -ForegroundColor Green
Write-Host ""

# Step 4: Organize files by platform
Write-Host "Organizing files by platform..." -ForegroundColor Yellow
Write-Host ""

$null = New-Item -ItemType Directory -Force -Path "$OutputDir/windows"
$null = New-Item -ItemType Directory -Force -Path "$OutputDir/macos"
$null = New-Item -ItemType Directory -Force -Path "$OutputDir/linux"

$organized = @{ windows = @(); macos = @(); linux = @() }

foreach ($file in $DownloadedFiles) {
    $fileName = Split-Path -Leaf $file
    
    if ($fileName -match '\.(msi|exe)$') {
        Copy-Item $file "$OutputDir/windows/$fileName" -Force
        $organized.windows += $fileName
        Write-Host "  [WIN] $fileName" -ForegroundColor Green
    }
    elseif ($fileName -match '\.dmg$') {
        Copy-Item $file "$OutputDir/macos/$fileName" -Force
        $organized.macos += $fileName
        Write-Host "  [MAC] $fileName" -ForegroundColor Green
    }
    elseif ($fileName -match '\.AppImage$' -or $fileName -match '\.appimage$') {
        Copy-Item $file "$OutputDir/linux/$fileName" -Force
        $organized.linux += $fileName
        Write-Host "  [LNX] $fileName" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "[OK] Organization Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""

# Display structure
Write-Host "release-dist/" -ForegroundColor Cyan
Write-Host "  |-- windows ($($organized.windows.Count) files)" -ForegroundColor Green
foreach ($f in $organized.windows) { Write-Host "  |   |-- $f" }
Write-Host "  |-- macos ($($organized.macos.Count) files)" -ForegroundColor Green
foreach ($f in $organized.macos) { Write-Host "  |   |-- $f" }
Write-Host "  |-- linux ($($organized.linux.Count) files)" -ForegroundColor Green
foreach ($f in $organized.linux) { Write-Host "  |   |-- $f" }

Write-Host ""
Write-Host "Total Files: $($organized.windows.Count + $organized.macos.Count + $organized.linux.Count)" -ForegroundColor Cyan

$totalSize = 0
Get-ChildItem -Recurse $OutputDir -File -ErrorAction SilentlyContinue | ForEach-Object { $totalSize += $_.Length }
$totalSizeMB = [math]::Round($totalSize / 1MB, 2)
Write-Host "Total Size: $totalSizeMB MB" -ForegroundColor Cyan

Write-Host ""
Write-Host "Next: Test installers and upload to distribution platforms" -ForegroundColor Yellow
Write-Host ""
Write-Host "[OK] Phase 2 Complete!" -ForegroundColor Green
