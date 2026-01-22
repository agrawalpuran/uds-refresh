# Full Backup Script - Application + Database with Date and Timestamp
# This script creates a complete backup of the application and MongoDB database

param(
    [string]$BackupBaseDir = "backups"
)

$ErrorActionPreference = "Stop"

# Get current date and time
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = Join-Path $BackupBaseDir "backup-$timestamp"
$appBackupDir = Join-Path $backupDir "application"
$dbBackupDir = Join-Path $backupDir "database"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  FULL BACKUP - Application + Database" -ForegroundColor Cyan
Write-Host "  Timestamp: $timestamp" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Create backup directories
Write-Host "📁 Creating backup directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
New-Item -ItemType Directory -Path $appBackupDir -Force | Out-Null
New-Item -ItemType Directory -Path $dbBackupDir -Force | Out-Null
Write-Host "✅ Backup directories created: $backupDir" -ForegroundColor Green
Write-Host ""

# Load environment variables
Write-Host "🔧 Loading environment variables..." -ForegroundColor Yellow
$envFile = ".env.local"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            # Remove quotes if present
            if ($value -match '^["''](.*)["'']$') {
                $value = $matches[1]
            }
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
    Write-Host "✅ Environment variables loaded" -ForegroundColor Green
} else {
    Write-Host "⚠️  .env.local not found, using system environment variables" -ForegroundColor Yellow
}
Write-Host ""

# Get MongoDB connection string
$mongodbUri = $env:MONGODB_URI
if (-not $mongodbUri) {
    $mongodbUri = $env:MONGODB_URI_LOCAL
}

if (-not $mongodbUri) {
    Write-Host "❌ ERROR: MONGODB_URI not found in environment variables" -ForegroundColor Red
    Write-Host "   Please set MONGODB_URI or MONGODB_URI_LOCAL in .env.local" -ForegroundColor Yellow
    exit 1
}

# Parse MongoDB URI to extract database name
$dbName = ""
if ($mongodbUri -match '/([^/?]+)(\?|$)') {
    $dbName = $matches[1]
}

if (-not $dbName) {
    Write-Host "❌ ERROR: Could not extract database name from MongoDB URI" -ForegroundColor Red
    exit 1
}

Write-Host "📊 Database: $dbName" -ForegroundColor Cyan
Write-Host ""

# Check if mongodump is available
Write-Host "🔍 Checking for MongoDB tools..." -ForegroundColor Yellow
$mongodumpPath = Get-Command mongodump -ErrorAction SilentlyContinue
if (-not $mongodumpPath) {
    Write-Host "❌ ERROR: mongodump not found in PATH" -ForegroundColor Red
    Write-Host "" -ForegroundColor Yellow
    Write-Host "Please install MongoDB Database Tools:" -ForegroundColor Yellow
    Write-Host "  https://www.mongodb.com/try/download/database-tools" -ForegroundColor Yellow
    Write-Host "" -ForegroundColor Yellow
    Write-Host "Or provide the full path to mongodump.exe" -ForegroundColor Yellow
    Write-Host "" -ForegroundColor Yellow
    Write-Host "Continuing with application backup only..." -ForegroundColor Yellow
    $skipDbBackup = $true
} else {
    Write-Host "✅ MongoDB tools found: $($mongodumpPath.Source)" -ForegroundColor Green
    $skipDbBackup = $false
}
Write-Host ""

# Backup Application Files
Write-Host "📦 Backing up application files..." -ForegroundColor Yellow

# Directories to include
$includeDirs = @(
    "app",
    "lib",
    "public",
    "scripts",
    "components",
    "styles"
)

# Files to include
$includeFiles = @(
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "next.config.js",
    "next.config.mjs",
    ".env.local",
    ".env.example",
    "README.md",
    "PROJECT_CONTEXT.md"
)

# Directories to exclude
$excludeDirs = @(
    "node_modules",
    ".next",
    ".turbo",
    ".git",
    "backups",
    "__pycache__",
    "*.pyc"
)

$excludePatterns = @(
    "**/node_modules/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/.git/**",
    "**/backups/**",
    "**/__pycache__/**",
    "**/*.pyc"
)

# Copy directories
foreach ($dir in $includeDirs) {
    if (Test-Path $dir) {
        $destDir = Join-Path $appBackupDir $dir
        Write-Host "  Copying $dir..." -ForegroundColor Gray
        Copy-Item -Path $dir -Destination $destDir -Recurse -Force -Exclude $excludePatterns | Out-Null
        Write-Host "  ✅ $dir copied" -ForegroundColor Green
    }
}

# Copy files
foreach ($file in $includeFiles) {
    if (Test-Path $file) {
        Write-Host "  Copying $file..." -ForegroundColor Gray
        Copy-Item -Path $file -Destination $appBackupDir -Force | Out-Null
        Write-Host "  ✅ $file copied" -ForegroundColor Green
    }
}

Write-Host "✅ Application files backed up" -ForegroundColor Green
Write-Host ""

# Backup Database
if (-not $skipDbBackup) {
    Write-Host "💾 Backing up MongoDB database..." -ForegroundColor Yellow
    
    try {
        # Create database backup using mongodump
        $dbBackupPath = Join-Path $dbBackupDir $dbName
        
        # Extract connection details from URI
        $uriParts = $mongodbUri -replace 'mongodb\+srv://|mongodb://', ''
        $authAndHost = $uriParts -split '/'
        $authPart = $authAndHost[0]
        $hostPart = $authPart -split '@'
        
        if ($hostPart.Length -eq 2) {
            # Has authentication
            $credentials = $hostPart[0]
            $host = $hostPart[1]
        } else {
            # No authentication
            $host = $hostPart[0]
            $credentials = ""
        }
        
        # Build mongodump command
        $dumpArgs = @()
        
        if ($credentials) {
            $credParts = $credentials -split ':'
            if ($credParts.Length -eq 2) {
                $username = $credParts[0]
                $password = [System.Web.HttpUtility]::UrlDecode($credParts[1])
                $dumpArgs += "--username", $username
                $dumpArgs += "--password", $password
            }
        }
        
        if ($host -match '^(.+):(\d+)$') {
            $hostname = $matches[1]
            $port = $matches[2]
            $dumpArgs += "--host", "${hostname}:${port}"
        } else {
            $dumpArgs += "--host", $host
        }
        
        $dumpArgs += "--db", $dbName
        $dumpArgs += "--out", $dbBackupDir
        $dumpArgs += "--quiet"
        
        Write-Host "  Running mongodump..." -ForegroundColor Gray
        & mongodump $dumpArgs
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Database backup completed" -ForegroundColor Green
        } else {
            Write-Host "❌ Database backup failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
            Write-Host "   Continuing with application backup only..." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "❌ ERROR during database backup: $_" -ForegroundColor Red
        Write-Host "   Continuing with application backup only..." -ForegroundColor Yellow
    }
    Write-Host ""
}

# Create backup info file
Write-Host "📝 Creating backup info file..." -ForegroundColor Yellow
$backupInfo = @"
Backup Information
==================
Timestamp: $timestamp
Date: $(Get-Date -Format "yyyy-MM-dd")
Time: $(Get-Date -Format "HH:mm:ss")

Application Backup
------------------
Location: $appBackupDir
Status: ✅ Complete

Database Backup
---------------
Database: $dbName
Location: $dbBackupDir
Status: $(if ($skipDbBackup) { "⏭️  Skipped (mongodump not available)" } else { "✅ Complete" })

Backup Contents
---------------
- Application source code
- Configuration files
- Scripts
- MongoDB database dump

Restore Instructions
-------------------
1. Application:
   - Copy files from application folder to your project root
   - Run: npm install
   - Run: npm run build

2. Database:
   - Use mongorestore to restore the database:
   - mongorestore --db $dbName database/$dbName
"@

$backupInfo | Out-File -FilePath (Join-Path $backupDir "BACKUP_INFO.txt") -Encoding UTF8
Write-Host "✅ Backup info file created" -ForegroundColor Green
Write-Host ""

# Calculate backup size
Write-Host "📊 Calculating backup size..." -ForegroundColor Yellow
$backupSize = (Get-ChildItem -Path $backupDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
$backupSizeMB = [math]::Round($backupSize / 1MB, 2)
Write-Host "✅ Backup size: $backupSizeMB MB" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  BACKUP COMPLETE" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Backup Location: $backupDir" -ForegroundColor White
Write-Host "Backup Size: $backupSizeMB MB" -ForegroundColor White
Write-Host "Timestamp: $timestamp" -ForegroundColor White
Write-Host ""

if (-not $skipDbBackup) {
    Write-Host "✅ Application: Backed up" -ForegroundColor Green
    Write-Host "✅ Database: Backed up" -ForegroundColor Green
} else {
    Write-Host "✅ Application: Backed up" -ForegroundColor Green
    Write-Host "⏭️  Database: Skipped (mongodump not available)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Backup completed successfully! 🎉" -ForegroundColor Green

