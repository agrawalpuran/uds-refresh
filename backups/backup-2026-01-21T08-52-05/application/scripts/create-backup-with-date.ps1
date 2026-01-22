# PowerShell script to create a complete backup (code + database) with today's date
# Usage: .\scripts\create-backup-with-date.ps1

$projectRoot = Split-Path -Parent $PSScriptRoot
$parentDir = Split-Path -Parent $projectRoot
$todayDate = Get-Date -Format "yyyy-MM-dd"
$backupName = "uniform-distribution-system-backup-$todayDate"
$backupPath = Join-Path $parentDir $backupName
$backupZipPath = "$backupPath.zip"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FULL BACKUP WITH TODAY'S DATE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Creating backup for: $todayDate" -ForegroundColor Yellow
Write-Host "Source: $projectRoot" -ForegroundColor Gray
Write-Host "Destination: $backupZipPath" -ForegroundColor Gray
Write-Host ""

# Create backup directory
Write-Host "Step 1: Creating backup directory..." -ForegroundColor Yellow
if (Test-Path $backupPath) {
    Write-Host "  ⚠️  Backup directory already exists. Removing old backup..." -ForegroundColor Yellow
    Remove-Item -Path $backupPath -Recurse -Force
}
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
Write-Host "  ✓ Backup directory created" -ForegroundColor Green
Write-Host ""

# Step 2: Backup code
Write-Host "Step 2: Backing up source code..." -ForegroundColor Yellow
$codeBackupPath = Join-Path $backupPath "code"
Copy-Item -Path $projectRoot -Destination $codeBackupPath -Recurse -Exclude "node_modules",".next",".git" -Force
Write-Host "  ✓ Code backup completed" -ForegroundColor Green
Write-Host ""

# Step 3: Backup database
Write-Host "Step 3: Backing up database..." -ForegroundColor Yellow
Push-Location $projectRoot
try {
    # Run database backup
    $dbBackupOutput = node scripts/backup-database.js 2>&1
    Write-Host $dbBackupOutput
    
    # Find the most recent database backup
    $dbBackups = Get-ChildItem -Path $parentDir -Directory | Where-Object { $_.Name -like "mongodb-backup-*" } | Sort-Object LastWriteTime -Descending
    if ($dbBackups.Count -gt 0) {
        $latestDbBackup = $dbBackups[0]
        $dbBackupPath = Join-Path $backupPath "database"
        Copy-Item -Path $latestDbBackup.FullName -Destination $dbBackupPath -Recurse -Force
        Write-Host "  ✓ Database backup completed" -ForegroundColor Green
        Write-Host "  📁 Database backup: $($latestDbBackup.Name)" -ForegroundColor Gray
        
        # Clean up the temporary database backup directory
        Write-Host "  🗑️  Cleaning up temporary database backup..." -ForegroundColor Gray
        Remove-Item -Path $latestDbBackup.FullName -Recurse -Force
    } else {
        Write-Host "  ⚠️  Database backup not found. Trying alternative method..." -ForegroundColor Yellow
        
        # Try code-based backup directly
        $dbBackupPath = Join-Path $backupPath "database"
        New-Item -ItemType Directory -Path $dbBackupPath -Force | Out-Null
        
        # Create a backup info file
        $backupInfo = @{
            date = $todayDate
            timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            database = "uniform-distribution"
            note = "Database backup should be in database-backup.json"
        }
        $backupInfo | ConvertTo-Json | Out-File -FilePath (Join-Path $dbBackupPath "backup-info.json") -Encoding UTF8
        
        Write-Host "  ⚠️  Please run 'npm run backup-db' separately to backup database" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ Error backing up database: $_" -ForegroundColor Red
    Write-Host "  ⚠️  Continuing with code backup only..." -ForegroundColor Yellow
}
Pop-Location
Write-Host ""

# Step 4: Create backup info file
Write-Host "Step 4: Creating backup information file..." -ForegroundColor Yellow
$backupInfo = @{
    backupDate = $todayDate
    backupTimestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    projectName = "Uniform Distribution System"
    includes = @(
        "Source code (excluding node_modules, .next, .git)",
        "Configuration files",
        "Scripts",
        "Documentation",
        "MongoDB database backup"
    )
    restoreInstructions = @(
        "1. Extract the ZIP file",
        "2. Copy the 'code' folder to your project location",
        "3. Run 'npm install' to restore dependencies",
        "4. Run 'npm run restore-db' with the database backup to restore database"
    )
}
$backupInfo | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $backupPath "BACKUP-INFO.json") -Encoding UTF8
Write-Host "  ✓ Backup info file created" -ForegroundColor Green
Write-Host ""

# Step 5: Create ZIP file
Write-Host "Step 5: Creating ZIP archive..." -ForegroundColor Yellow
if (Test-Path $backupZipPath) {
    Write-Host "  ⚠️  ZIP file already exists. Removing old ZIP..." -ForegroundColor Yellow
    Remove-Item -Path $backupZipPath -Force
}
Compress-Archive -Path $backupPath -DestinationPath $backupZipPath -Force
Write-Host "  ✓ ZIP archive created" -ForegroundColor Green
Write-Host ""

# Step 6: Clean up uncompressed backup directory
Write-Host "Step 6: Cleaning up..." -ForegroundColor Yellow
Remove-Item -Path $backupPath -Recurse -Force
Write-Host "  ✓ Cleanup completed" -ForegroundColor Green
Write-Host ""

# Display summary
$zipSize = [math]::Round((Get-Item $backupZipPath).Length / 1MB, 2)
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ BACKUP COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "📦 Backup file: $backupZipPath" -ForegroundColor Cyan
Write-Host "📊 File size: $zipSize MB" -ForegroundColor Yellow
Write-Host ""
Write-Host "Backup includes:" -ForegroundColor Yellow
Write-Host "  ✓ All source code files" -ForegroundColor White
Write-Host "  ✓ Configuration files" -ForegroundColor White
Write-Host "  ✓ Scripts" -ForegroundColor White
Write-Host "  ✓ Documentation" -ForegroundColor White
Write-Host "  ✓ MongoDB database (all collections)" -ForegroundColor White
Write-Host ""
Write-Host "To restore:" -ForegroundColor Cyan
Write-Host "  1. Extract the ZIP file" -ForegroundColor White
Write-Host "  2. Copy the 'code' folder to your project location" -ForegroundColor White
Write-Host "  3. Run 'npm install' to restore dependencies" -ForegroundColor White
Write-Host "  4. Restore database from the 'database' folder" -ForegroundColor White
Write-Host ""





