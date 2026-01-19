# PowerShell script to create a ZIP backup of the uniform distribution system
# Usage: .\scripts\create-backup-zip.ps1

$projectRoot = Split-Path -Parent $PSScriptRoot
$parentDir = Split-Path -Parent $projectRoot
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupZipName = "uniform-distribution-system-backup-$timestamp.zip"
$backupZipPath = Join-Path $parentDir $backupZipName

Write-Host "Creating ZIP backup..." -ForegroundColor Cyan
Write-Host "Source: $projectRoot" -ForegroundColor Gray
Write-Host "Destination: $backupZipPath" -ForegroundColor Gray

# Create a temporary directory for the backup
$tempBackupDir = Join-Path $env:TEMP "uniform-backup-$timestamp"
New-Item -ItemType Directory -Path $tempBackupDir -Force | Out-Null

# Copy the project, excluding node_modules and .next
Copy-Item -Path $projectRoot -Destination $tempBackupDir -Recurse -Exclude "node_modules",".next" -Force

# Create ZIP file
Compress-Archive -Path "$tempBackupDir\uniform-distribution-system" -DestinationPath $backupZipPath -Force

# Clean up temporary directory
Remove-Item -Path $tempBackupDir -Recurse -Force

Write-Host ""
Write-Host "✅ ZIP backup created successfully!" -ForegroundColor Green
Write-Host "📦 Backup file: $backupZipPath" -ForegroundColor Green
Write-Host ""
Write-Host "File size: $([math]::Round((Get-Item $backupZipPath).Length / 1MB, 2)) MB" -ForegroundColor Yellow
Write-Host ""
Write-Host "⚠️  Database NOT included in this backup!" -ForegroundColor Yellow
Write-Host "   To backup database, run: npm run backup-db" -ForegroundColor White

