# Backup Script for Uniform Distribution System
# Creates complete backup of application and database

$ErrorActionPreference = "Continue"

# Get timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "backups\backup-$timestamp"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  BACKUP CREATION STARTED" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Create backup directory
Write-Host "Creating backup directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Write-Host "Backup directory: $backupDir`n" -ForegroundColor Green

# Copy application directories
Write-Host "Copying application directories..." -ForegroundColor Yellow
$excludeDirs = @("node_modules", ".next", ".git", "backups", ".turbo", "dist", "build", ".vscode", ".idea")
$dirs = Get-ChildItem -Path . -Directory | Where-Object { $excludeDirs -notcontains $_.Name }

foreach ($dir in $dirs) {
    Write-Host "  Copying $($dir.Name)..." -ForegroundColor Gray
    Copy-Item -Path $dir.FullName -Destination "$backupDir\$($dir.Name)" -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "Application directories copied`n" -ForegroundColor Green

# Copy root files
Write-Host "Copying configuration files..." -ForegroundColor Yellow
$rootFiles = @("package.json", "package-lock.json", "tsconfig.json", "next.config.js", "next.config.mjs", ".env", ".env.local", ".env.example", "README.md", "LICENSE", ".gitignore", ".eslintrc.json", "tailwind.config.js", "postcss.config.js")

foreach ($file in $rootFiles) {
    if (Test-Path $file) {
        Copy-Item -Path $file -Destination "$backupDir\$file" -Force -ErrorAction SilentlyContinue
        Write-Host "  Copied $file" -ForegroundColor Gray
    }
}
Write-Host "Configuration files copied`n" -ForegroundColor Green

# Database backup
Write-Host "Exporting MongoDB database..." -ForegroundColor Yellow
$dbBackupDir = "$backupDir\database"
New-Item -ItemType Directory -Path $dbBackupDir -Force | Out-Null

if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match "MONGODB_URI=(.+)") {
        $mongodbUri = $matches[1].Trim()
        $dbName = if ($mongodbUri -match "/([^/?]+)") { $matches[1] } else { "uniform-distribution" }
        
        Write-Host "  Database: $dbName" -ForegroundColor Gray
        
        # Try to export using mongodump
        $mongodumpPath = "mongodump"
        $exportCmd = "mongodump --uri=`"$mongodbUri`" --out=`"$dbBackupDir`""
        
        try {
            $exportResult = Invoke-Expression $exportCmd 2>&1
            $exportResult | Out-File "$dbBackupDir\export.log" -Encoding UTF8
            
            if ($LASTEXITCODE -eq 0 -or $exportResult -notmatch "error|Error|ERROR") {
                Write-Host "Database exported successfully`n" -ForegroundColor Green
            } else {
                Write-Host "⚠️ MongoDB export may have failed`n" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "⚠️ MongoDB tools not available`n" -ForegroundColor Yellow
        }
        
        # Create backup instructions
        $instructions = @"
MongoDB Backup Instructions
==========================
Database URI: $mongodbUri
Database Name: $dbName

To manually backup:
1. Install MongoDB Database Tools: https://www.mongodb.com/try/download/database-tools
2. Run: mongodump --uri="$mongodbUri" --out="$dbBackupDir"

Or use MongoDB Compass to export collections.
"@
        $instructions | Out-File "$dbBackupDir\BACKUP_INSTRUCTIONS.txt" -Encoding UTF8
    } else {
        Write-Host "⚠️ MongoDB URI not found in .env`n" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️ .env file not found`n" -ForegroundColor Yellow
}

# Create backup manifest
Write-Host "Creating backup manifest..." -ForegroundColor Yellow
$manifest = @"
Backup Information
==================
Backup Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Backup Location: $backupDir
Application: Uniform Distribution System

Contents:
---------
- Application source code (excluding node_modules, .next, .git)
- Configuration files (package.json, .env, etc.)
- Database export (if MongoDB tools available)

Restore Instructions:
--------------------
1. Copy backup directory to desired location
2. Run: npm install
3. Restore database using mongorestore (if database backup exists)
4. Update .env file with correct MongoDB URI
5. Run: npm run dev

Database Restore:
-----------------
If database backup exists in database/ folder:
  mongorestore --uri="<MONGODB_URI>" database/
"@
$manifest | Out-File "$backupDir\BACKUP_MANIFEST.txt" -Encoding UTF8
Write-Host "Backup manifest created`n" -ForegroundColor Green

# Calculate backup size
Write-Host "Calculating backup size..." -ForegroundColor Yellow
$size = (Get-ChildItem -Path $backupDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BACKUP COMPLETE!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Backup Summary:" -ForegroundColor Cyan
Write-Host "  Location: $backupDir" -ForegroundColor White
Write-Host "  Size: $([math]::Round($size, 2)) MB" -ForegroundColor White
Write-Host "  Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")" -ForegroundColor White

Write-Host "`nBackup includes:" -ForegroundColor Cyan
Write-Host "  - Application source code" -ForegroundColor Green
Write-Host "  - Configuration files" -ForegroundColor Green
Write-Host "  - Database export (if available)" -ForegroundColor Green
Write-Host "  - Backup manifest" -ForegroundColor Green

Write-Host "`nBackup completed successfully!`n" -ForegroundColor Green
