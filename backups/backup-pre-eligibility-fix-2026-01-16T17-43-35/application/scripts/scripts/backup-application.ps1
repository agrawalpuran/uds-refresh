# UDS Application Backup Script
# Creates a complete backup of the application and database with timestamp

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "backups\backup-$timestamp"

Write-Host "========================================"
Write-Host "UDS Application Backup"
Write-Host "Date: $timestamp"
Write-Host "========================================"
Write-Host ""

# Create backup directory structure
Write-Host "[1/5] Creating backup directories..."
New-Item -ItemType Directory -Path "$backupDir\application" -Force | Out-Null
New-Item -ItemType Directory -Path "$backupDir\database" -Force | Out-Null
Write-Host "✅ Backup directory created: $backupDir"
Write-Host ""

# Backup application files
Write-Host "[2/5] Backing up application files..."
$excludeDirs = @('node_modules', '.next', '.git', 'backups', '.cursor', '.vscode', '__pycache__', 'dist', 'build')
$excludeFiles = @('*.log', '*.tmp', '*.cache', '.DS_Store', 'Thumbs.db')

$fileCount = 0
$dirCount = 0

Get-ChildItem -Path . -Recurse -File | ForEach-Object {
    $excluded = $false
    $relativePath = $_.FullName.Substring((Get-Location).Path.Length + 1)
    
    # Check if file is in excluded directory
    foreach ($excludeDir in $excludeDirs) {
        if ($relativePath -like "*\$excludeDir\*" -or $relativePath -like "$excludeDir\*") {
            $excluded = $true
            break
        }
    }
    
    # Check if file matches excluded pattern
    if (-not $excluded) {
        foreach ($pattern in $excludeFiles) {
            if ($_.Name -like $pattern) {
                $excluded = $true
                break
            }
        }
    }
    
    if (-not $excluded) {
        $destPath = Join-Path "$backupDir\application" $relativePath
        $destDir = Split-Path $destPath -Parent
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            $dirCount++
        }
        Copy-Item $_.FullName -Destination $destPath -Force
        $fileCount++
        if ($fileCount % 100 -eq 0) {
            Write-Host "  Copied $fileCount files..."
        }
    }
}

Write-Host "✅ Application files backed up: $fileCount files, $dirCount directories"
Write-Host ""

# Get MongoDB URI
Write-Host "[3/5] Checking MongoDB connection..."
$mongoUri = $null
$dbName = "uniform-distribution"

if ($env:MONGODB_URI) {
    $mongoUri = $env:MONGODB_URI
    Write-Host "✅ Found MONGODB_URI in environment"
} elseif (Test-Path ".env.local") {
    $envContent = Get-Content ".env.local" -Raw
    if ($envContent -match "MONGODB_URI=(.+)") {
        $mongoUri = $matches[1].Trim()
        Write-Host "✅ Found MONGODB_URI in .env.local"
    }
}

if ($mongoUri) {
    if ($mongoUri -match "/([^/?]+)(\?|$)") {
        $dbName = $matches[1]
    }
    Write-Host "Database name: $dbName"
} else {
    Write-Host "⚠️ MONGODB_URI not found"
}

Write-Host ""

# Attempt database backup
Write-Host "[4/5] Attempting database backup..."
$dbBackupSuccess = $false

if ($mongoUri) {
    if (Get-Command mongodump -ErrorAction SilentlyContinue) {
        Write-Host "Running mongodump..."
        $dumpOutput = mongodump --uri="$mongoUri" --out="$backupDir\database" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Database backup completed successfully"
            $dbBackupSuccess = $true
        } else {
            Write-Host "⚠️ Database backup had issues. Check output:"
            $dumpOutput | ForEach-Object { Write-Host "  $_" }
        }
    } else {
        Write-Host "⚠️ mongodump not found. Install MongoDB Database Tools to backup database."
    }
} else {
    Write-Host "⚠️ Cannot backup database - MONGODB_URI not found"
}

# Create backup instructions if database backup failed
if (-not $dbBackupSuccess) {
    $instructions = @"
DATABASE BACKUP INSTRUCTIONS
============================
Backup created on: $timestamp
Backup location: $backupDir

MongoDB Connection:
$(if ($mongoUri) { "URI found: Yes (connection string available)" } else { "URI found: No - please check .env.local" })

To backup MongoDB database manually:

Option 1: Using mongodump (recommended)
  1. Install MongoDB Database Tools from: https://www.mongodb.com/try/download/database-tools
  2. Run: mongodump --uri="<your-mongodb-uri>" --out="$backupDir\database"
  3. Or if you have the URI in .env.local, extract it and run:
     mongodump --uri="<extracted-uri>" --out="$backupDir\database"

Option 2: Using MongoDB Compass
  1. Open MongoDB Compass
  2. Connect to your MongoDB instance
  3. Select the database: $dbName
  4. Export all collections
  5. Save exports to: $backupDir\database

Database name: $dbName
"@
    $instructions | Out-File -FilePath "$backupDir\database\BACKUP_INSTRUCTIONS.txt" -Encoding UTF8
    Write-Host "✅ Backup instructions saved to: $backupDir\database\BACKUP_INSTRUCTIONS.txt"
}

Write-Host ""

# Create backup summary
Write-Host "[5/5] Creating backup summary..."

$appSize = 0
$dbSize = 0
$appFileCount = 0
$dbFileCount = 0

if (Test-Path "$backupDir\application") {
    $appFiles = Get-ChildItem -Path "$backupDir\application" -Recurse -File -ErrorAction SilentlyContinue
    $appSize = ($appFiles | Measure-Object -Property Length -Sum).Sum / 1MB
    $appFileCount = $appFiles.Count
}

if (Test-Path "$backupDir\database") {
    $dbFiles = Get-ChildItem -Path "$backupDir\database" -Recurse -File -ErrorAction SilentlyContinue
    $dbSize = ($dbFiles | Measure-Object -Property Length -Sum).Sum / 1MB
    $dbFileCount = $dbFiles.Count
}

$summary = @"
BACKUP SUMMARY
==============
Backup Date: $timestamp
Backup Location: $backupDir

Application Files:
  - Location: $backupDir\application
  - Files: $appFileCount
  - Size: $([math]::Round($appSize, 2)) MB
  - Status: ✅ Complete

Database:
  - Location: $backupDir\database
  - Files: $dbFileCount
  - Size: $([math]::Round($dbSize, 2)) MB
  - Status: $(if ($dbBackupSuccess) { "✅ Complete" } else { "⚠️ Manual backup required - see BACKUP_INSTRUCTIONS.txt" })

Backup Contents:
  - Application source code (TypeScript/JavaScript)
  - Configuration files (.env.local excluded for security)
  - Models and schemas
  - API routes
  - Frontend components (React/Next.js)
  - Database backup (if available)
  - Documentation files

Excluded from backup:
  - node_modules (can be restored with npm install)
  - .next build cache (will be regenerated)
  - .git directory (version control)
  - Log files and temporary files

To restore:
  1. Copy application files from: $backupDir\application
  2. Restore database from: $backupDir\database (if available)
  3. Run: npm install
  4. Run: npm run dev

Important Notes:
  - .env.local is NOT included in backup for security reasons
  - Make sure to backup your .env.local separately if needed
  - Database backup requires MongoDB Database Tools (mongodump)
  - This backup is a snapshot at: $timestamp
"@

$summary | Out-File -FilePath "$backupDir\BACKUP_SUMMARY.txt" -Encoding UTF8
Write-Host "✅ Backup summary saved to: $backupDir\BACKUP_SUMMARY.txt"
Write-Host ""

# Final summary
Write-Host "========================================"
Write-Host "✅ BACKUP COMPLETE"
Write-Host "========================================"
Write-Host "Backup location: $backupDir"
Write-Host "Backup date: $timestamp"
Write-Host "Application files: $appFileCount files, $([math]::Round($appSize, 2)) MB"
Write-Host "Database files: $dbFileCount files, $([math]::Round($dbSize, 2)) MB"
Write-Host "Total size: $([math]::Round($appSize + $dbSize, 2)) MB"
Write-Host ""
Write-Host "📄 See $backupDir\BACKUP_SUMMARY.txt for details"
Write-Host ""

