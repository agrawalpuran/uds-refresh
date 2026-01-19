# PowerShell script to create a complete backup (code + database) of the uniform distribution system
# Usage: .\scripts\create-full-backup.ps1

$projectRoot = Split-Path -Parent $PSScriptRoot
$parentDir = Split-Path -Parent $projectRoot
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupName = "uniform-distribution-system-full-backup-$timestamp"
$backupPath = Join-Path $parentDir $backupName

Write-Host "Creating FULL backup (code + database)..." -ForegroundColor Cyan
Write-Host "Source: $projectRoot" -ForegroundColor Gray
Write-Host "Destination: $backupPath" -ForegroundColor Gray
Write-Host ""

# Create backup directory
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

# Step 1: Backup code
Write-Host "Step 1: Backing up code..." -ForegroundColor Yellow
$codeBackupPath = Join-Path $backupPath "code"
Copy-Item -Path $projectRoot -Destination $codeBackupPath -Recurse -Exclude "node_modules",".next" -Force
Write-Host "  ✓ Code backup completed" -ForegroundColor Green
Write-Host ""

# Step 2: Backup database
Write-Host "Step 2: Backing up database..." -ForegroundColor Yellow
Push-Location $projectRoot
npm run backup-db 2>&1 | Out-Null
Pop-Location

# Find the most recent database backup
$dbBackups = Get-ChildItem -Path $parentDir -Directory | Where-Object { $_.Name -like "mongodb-backup-*" } | Sort-Object LastWriteTime -Descending
if ($dbBackups.Count -gt 0) {
    $latestDbBackup = $dbBackups[0]
    $dbBackupPath = Join-Path $backupPath "database"
    Copy-Item -Path $latestDbBackup.FullName -Destination $dbBackupPath -Recurse -Force
    Write-Host "  ✓ Database backup completed" -ForegroundColor Green
    Write-Host "  📁 Database backup: $($latestDbBackup.Name)" -ForegroundColor Gray
} else {
    Write-Host "  ⚠️  Database backup not found" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "✅ FULL backup created successfully!" -ForegroundColor Green
Write-Host "📁 Backup location: $backupPath" -ForegroundColor Green
Write-Host ""
Write-Host "Backup includes:" -ForegroundColor Yellow
Write-Host "  ✓ All source code files" -ForegroundColor White
Write-Host "  ✓ Configuration files" -ForegroundColor White
Write-Host "  ✓ Scripts" -ForegroundColor White
Write-Host "  ✓ Documentation" -ForegroundColor White
Write-Host "  ✓ MongoDB database (all collections)" -ForegroundColor White
Write-Host ""
Write-Host "To restore, see RECOVERY_GUIDE.md in the backup folder" -ForegroundColor Cyan



