#!/usr/bin/env pwsh
# AlienX - Automated Release Watcher
# Monitors GitHub for v1.2.1 release and auto-downloads + organizes when ready

param(
    [int]$CheckInterval = 30,  # Check every 30 seconds
    [int]$MaxChecks = 20       # Check for max 10 minutes (20 x 30s)
)

$Owner = "Alien979"
$Repo = "alienx-desktop"
$Tag = "v1.2.1"
$OutputDir = "release-dist"

Write-Host "================================" -ForegroundColor Cyan
Write-Host "AlienX - Release Watcher" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Monitoring for v1.2.1 release..." -ForegroundColor Yellow
Write-Host "Check interval: $CheckInterval seconds" -ForegroundColor Gray
Write-Host "Max wait: $($CheckInterval * $MaxChecks) seconds" -ForegroundColor Gray
Write-Host ""

$ProgressPreference = 'SilentlyContinue'
$CheckCount = 0
$ReleaseFound = $false

while ($CheckCount -lt $MaxChecks -and -not $ReleaseFound) {
    $CheckCount++
    
    try {
        $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/releases" -ErrorAction Stop
        $release = $releases | Where-Object { $_.tag_name -eq $Tag } | Select-Object -First 1
        
        if ($release -and $release.assets.Count -gt 0) {
            $ReleaseFound = $true
            Write-Host ""
            Write-Host "[OK] Release v1.2.1 found!" -ForegroundColor Green
            Write-Host "Assets: $($release.assets.Count) files" -ForegroundColor Green
            Write-Host ""
            break
        } else {
            $timeWaited = $CheckCount * $CheckInterval
            Write-Host "[$CheckCount/$MaxChecks] Checking... ($timeWaited seconds) Release not ready yet" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[$CheckCount/$MaxChecks] Network check... (waiting for GitHub)" -ForegroundColor DarkGray
    }
    
    Start-Sleep -Seconds $CheckInterval
}

if (-not $ReleaseFound) {
    Write-Host ""
    Write-Host "[X] Release not ready after $($CheckCount * $CheckInterval) seconds" -ForegroundColor Red
    Write-Host "Check manually: https://github.com/$Owner/$Repo/releases/tag/$Tag" -ForegroundColor Yellow
    exit 1
}

# Release found! Now download and organize
Write-Host "Starting automated download and organization..." -ForegroundColor Green
Write-Host ""

$DownloadDir = "github-downloads-$Tag"
$null = New-Item -ItemType Directory -Force -Path $DownloadDir

Write-Host "Downloading artifacts..." -ForegroundColor Yellow
$DownloadedFiles = @()

foreach ($asset in $release.assets) {
    $fileName = $asset.name
    $downloadUrl = $asset.browser_download_url
    $outputPath = Join-Path $DownloadDir $fileName
    
    Write-Host "  Downloading: $fileName..." -ForegroundColor Cyan
    
    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $outputPath -ErrorAction Stop
        $fileSize = [math]::Round((Get-Item $outputPath).Length / 1MB, 2)
        Write-Host "    [OK] $fileSize MB" -ForegroundColor Green
        $DownloadedFiles += $outputPath
    } catch {
        Write-Host "    [X] Failed" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Organizing files..." -ForegroundColor Yellow

$null = New-Item -ItemType Directory -Force -Path "$OutputDir/windows"
$null = New-Item -ItemType Directory -Force -Path "$OutputDir/macos"
$null = New-Item -ItemType Directory -Force -Path "$OutputDir/linux"

$organized = @{ windows = @(); macos = @(); linux = @() }

foreach ($file in $DownloadedFiles) {
    $fileName = Split-Path -Leaf $file
    
    if ($fileName -match '\.(msi|exe)$') {
        Copy-Item $file "$OutputDir/windows/$fileName" -Force
        $organized.windows += $fileName
    }
    elseif ($fileName -match '\.dmg$') {
        Copy-Item $file "$OutputDir/macos/$fileName" -Force
        $organized.macos += $fileName
    }
    elseif ($fileName -match '\.AppImage$' -or $fileName -match '\.appimage$') {
        Copy-Item $file "$OutputDir/linux/$fileName" -Force
        $organized.linux += $fileName
    }
}

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "[OK] Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""

Write-Host "release-dist/" -ForegroundColor Cyan
Write-Host "  |-- windows ($($organized.windows.Count))" -ForegroundColor Green
Write-Host "  |-- macos ($($organized.macos.Count))" -ForegroundColor Green
Write-Host "  |-- linux ($($organized.linux.Count))" -ForegroundColor Green

Write-Host ""
Write-Host "Files ready in: release-dist/" -ForegroundColor Cyan
Write-Host "Downloaded from: $DownloadDir/" -ForegroundColor Gray
Write-Host ""
