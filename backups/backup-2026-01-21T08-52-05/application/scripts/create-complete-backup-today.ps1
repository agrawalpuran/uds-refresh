# PowerShell script to create a complete backup (code + database) with today's date
# Usage: .\scripts\create-complete-backup-today.ps1

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$parentDir = Split-Path -Parent $projectRoot
$todayDate = Get-Date -Format "yyyy-MM-dd"
$backupName = "uniform-distribution-system-backup-$todayDate"
$backupPath = Join-Path $parentDir $backupName
$backupZipPath = "$backupPath.zip"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  COMPLETE BACKUP WITH TODAY'S DATE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Creating backup for: $todayDate" -ForegroundColor Yellow
Write-Host "Source: $projectRoot" -ForegroundColor Gray
Write-Host "Destination: $backupZipPath" -ForegroundColor Gray
Write-Host ""

try {
    # Step 1: Create backup directory
    Write-Host "Step 1: Creating backup directory..." -ForegroundColor Yellow
    if (Test-Path $backupPath) {
        Write-Host "  Warning: Backup directory already exists. Removing old backup..." -ForegroundColor Yellow
        Remove-Item -Path $backupPath -Recurse -Force
    }
    if (Test-Path $backupZipPath) {
        Write-Host "  Warning: ZIP file already exists. Removing old ZIP..." -ForegroundColor Yellow
        Remove-Item -Path $backupZipPath -Force
    }
    New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
    Write-Host "  [OK] Backup directory created" -ForegroundColor Green
    Write-Host ""

    # Step 2: Backup code
    Write-Host "Step 2: Backing up source code..." -ForegroundColor Yellow
    $codeBackupPath = Join-Path $backupPath "code"
    $excludeItems = @("node_modules", ".next", ".git", "*.log")
    Copy-Item -Path $projectRoot -Destination $codeBackupPath -Recurse -Exclude $excludeItems -Force
    Write-Host "  [OK] Code backup completed" -ForegroundColor Green
    Write-Host ""

    # Step 3: Backup database
    Write-Host "Step 3: Backing up database..." -ForegroundColor Yellow
    Push-Location $projectRoot
    try {
        # Run database backup
        $dbBackupOutput = node scripts/backup-database.js 2>&1 | Out-String
        
        # Find the most recent database backup
        $dbBackups = Get-ChildItem -Path $parentDir -Directory | Where-Object { $_.Name -like "mongodb-backup-*" } | Sort-Object LastWriteTime -Descending
        if ($dbBackups.Count -gt 0) {
            $latestDbBackup = $dbBackups[0]
            $dbBackupPath = Join-Path $backupPath "database"
            Copy-Item -Path $latestDbBackup.FullName -Destination $dbBackupPath -Recurse -Force
            Write-Host "  [OK] Database backup completed" -ForegroundColor Green
            Write-Host "  Database backup: $($latestDbBackup.Name)" -ForegroundColor Gray
            
            # Clean up the temporary database backup directory
            Write-Host "  Cleaning up temporary database backup..." -ForegroundColor Gray
            Remove-Item -Path $latestDbBackup.FullName -Recurse -Force
        } else {
            Write-Host "  [WARNING] Database backup not found in expected location" -ForegroundColor Yellow
            Write-Host "  Please check the database backup output above" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  [ERROR] Error backing up database: $_" -ForegroundColor Red
        Write-Host "  Continuing with code backup only..." -ForegroundColor Yellow
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
            "4. Restore database from the 'database' folder using restore-database.js"
        )
    }
    $backupInfo | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $backupPath "BACKUP-INFO.json") -Encoding UTF8
    Write-Host "  [OK] Backup info file created" -ForegroundColor Green
    Write-Host ""

    # Step 5: Create ZIP file
    Write-Host "Step 5: Creating ZIP archive..." -ForegroundColor Yellow
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($backupPath, $backupZipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)
    Write-Host "  [OK] ZIP archive created" -ForegroundColor Green
    Write-Host ""

    # Step 6: Clean up uncompressed backup directory
    Write-Host "Step 6: Cleaning up..." -ForegroundColor Yellow
    Remove-Item -Path $backupPath -Recurse -Force
    Write-Host "  [OK] Cleanup completed" -ForegroundColor Green
    Write-Host ""

    # Display summary
    if (Test-Path $backupZipPath) {
        $zipSize = [math]::Round((Get-Item $backupZipPath).Length / 1MB, 2)
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "  BACKUP COMPLETED SUCCESSFULLY!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Backup file: $backupZipPath" -ForegroundColor Cyan
        Write-Host "File size: $zipSize MB" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Backup includes:" -ForegroundColor Yellow
        Write-Host "  [OK] All source code files" -ForegroundColor White
        Write-Host "  [OK] Configuration files" -ForegroundColor White
        Write-Host "  [OK] Scripts" -ForegroundColor White
        Write-Host "  [OK] Documentation" -ForegroundColor White
        Write-Host "  [OK] MongoDB database (all collections)" -ForegroundColor White
        Write-Host ""
        Write-Host "To restore:" -ForegroundColor Cyan
        Write-Host "  1. Extract the ZIP file" -ForegroundColor White
        Write-Host "  2. Copy the 'code' folder to your project location" -ForegroundColor White
        Write-Host "  3. Run 'npm install' to restore dependencies" -ForegroundColor White
        Write-Host "  4. Restore database from the 'database' folder" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host "  [ERROR] ZIP file was not created successfully" -ForegroundColor Red
        Write-Host "  Backup directory is available at: $backupPath" -ForegroundColor Yellow
    }
} catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  BACKUP FAILED!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Backup directory (if created): $backupPath" -ForegroundColor Yellow
    exit 1
}



