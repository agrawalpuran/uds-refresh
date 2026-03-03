# =============================================================================
# UDS Full Backup Script (Application + MongoDB)
# =============================================================================
# Creates a timestamped backup of:
#   1. Application code (excluding node_modules, .next, .git, and other build/cache)
#   2. MongoDB database dump (via mongodump)
#
# Prerequisites:
#   - MongoDB Database Tools (mongodump) installed and in PATH
#     Download: https://www.mongodb.com/try/download/database-tools
#   - MONGODB_URI in .env.local (or set environment variable)
#
# Usage:
#   .\scripts\backup-full-uds.ps1
#   .\scripts\backup-full-uds.ps1 -OutputDir "D:\MyBackups"
#   .\scripts\backup-full-uds.ps1 -SkipDb   # Application only (no DB dump)
# =============================================================================

param(
    [string]$OutputDir = "",
    [switch]$SkipDb = $false,
    [switch]$IncludeEnvLocal = $false
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot

# Create backup root if not specified
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $projectRoot "backups"
}
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupName = "uds-full-backup-$timestamp"
$backupPath = Join-Path $OutputDir $backupName
$dbDumpPath = Join-Path $backupPath "db_dump"
$appPath = Join-Path $backupPath "application"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "UDS Full Backup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Project root: $projectRoot" -ForegroundColor Gray
Write-Host "Backup path:  $backupPath" -ForegroundColor Gray
Write-Host ""

# Create backup directory
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
New-Item -ItemType Directory -Path $appPath -Force | Out-Null

# -----------------------------------------------------------------------------
# 1. Load MONGODB_URI from .env.local
# -----------------------------------------------------------------------------
$envLocalPath = Join-Path $projectRoot ".env.local"
$MONGODB_URI = $env:MONGODB_URI
if (-not $MONGODB_URI -and (Test-Path $envLocalPath)) {
    Write-Host "Reading MONGODB_URI from .env.local..." -ForegroundColor Yellow
    Get-Content $envLocalPath | ForEach-Object {
        if ($_ -match '^\s*MONGODB_URI\s*=\s*(.+)\s*$') {
            $MONGODB_URI = $matches[1].Trim().Trim('"').Trim("'")
        }
    }
}
if (-not $MONGODB_URI) {
    $MONGODB_URI = "mongodb://localhost:27017/uniform-distribution"
    Write-Host "MONGODB_URI not set; using default: $MONGODB_URI" -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
# 2. MongoDB dump (unless -SkipDb)
# -----------------------------------------------------------------------------
if (-not $SkipDb) {
    Write-Host "`n[1/2] Backing up MongoDB..." -ForegroundColor Green
    $mongodump = Get-Command mongodump -ErrorAction SilentlyContinue
    if (-not $mongodump) {
        Write-Host "mongodump not found. Using Node.js backup (backup-db.js)..." -ForegroundColor Yellow
        try {
            New-Item -ItemType Directory -Path $dbDumpPath -Force | Out-Null
            $env:MONGODB_URI = $MONGODB_URI
            $backupJs = Join-Path $scriptRoot "backup-db.js"
            if (Test-Path $backupJs) {
                & node $backupJs $dbDumpPath 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "MongoDB backup (Node.js) saved to: $dbDumpPath" -ForegroundColor Green
                } else {
                    throw "backup-db.js exited with code $LASTEXITCODE"
                }
            } else {
                Write-Host "backup-db.js not found. Skipping DB backup." -ForegroundColor Yellow
                Write-Host "To backup DB: Install MongoDB Database Tools (mongodump) or ensure scripts/backup-db.js exists." -ForegroundColor Gray
            }
        } catch {
            Write-Host "Node.js DB backup failed: $_" -ForegroundColor Red
            Write-Host "Continuing with application backup..." -ForegroundColor Yellow
        }
    } else {
        try {
            New-Item -ItemType Directory -Path $dbDumpPath -Force | Out-Null
            & mongodump --uri="$MONGODB_URI" --out="$dbDumpPath" 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw "mongodump exited with code $LASTEXITCODE"
            }
            Write-Host "MongoDB dump saved to: $dbDumpPath" -ForegroundColor Green
        } catch {
            Write-Host "MongoDB backup failed: $_" -ForegroundColor Red
            Write-Host "Continuing with application backup..." -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "`n[1/2] Skipping DB backup (-SkipDb)." -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
# 3. Application backup (copy files, exclude heavy/cache/git)
# -----------------------------------------------------------------------------
Write-Host "`n[2/2] Backing up application..." -ForegroundColor Green
$excludeDirs = @(
    "node_modules",
    ".next",
    "out",
    "build",
    ".git",
    "backups",
    "coverage",
    ".vercel"
)
$excludeFiles = @(
    "*.tsbuildinfo",
    "next-env.d.ts"
)
# Build robocopy exclusion args: /XD dir1 dir2 /XF file1 file2
$xd = ($excludeDirs | ForEach-Object { "/XD", (Join-Path $projectRoot $_) }) -join " "
$xf = ($excludeFiles | ForEach-Object { "/XF", $_ }) -join " "

# Robocopy: copy project root to appPath, exclude dirs/files (don't copy .env.local by default)
$robocopyArgs = @(
    $projectRoot,
    $appPath,
    "/E",           # copy subdirs including empty
    "/XD", "node_modules", ".next", "out", "build", ".git", "backups", "coverage", ".vercel",
    "/XF", "*.tsbuildinfo", "next-env.d.ts",
    "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS", "/NP"  # quiet
)
if (-not $IncludeEnvLocal) {
    $robocopyArgs += "/XF", ".env.local", ".env"
}
& robocopy @robocopyArgs | Out-Null
# Robocopy exit: 0=no copy, 1=files copied, 2+ = extra (e.g. 3 = files + dirs)
if ($LASTEXITCODE -ge 8) {
    Write-Host "Robocopy failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit 1
}
Write-Host "Application files saved to: $appPath" -ForegroundColor Green

# -----------------------------------------------------------------------------
# 4. Create a manifest and optional ZIP
# -----------------------------------------------------------------------------
$manifestPath = Join-Path $backupPath "BACKUP_MANIFEST.txt"
@"
UDS Full Backup
===============
Created: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Project: $projectRoot

Contents:
- db_dump/     : MongoDB dump (restore with: mongorestore --uri=<URI> db_dump/<db_name>)
- application/ : Application source (excluding node_modules, .next, .git, backups)

MONGODB_URI was: $(if ($MONGODB_URI) { "set (see .env.local for restore)" } else { "default" })
Application backup excludes: node_modules, .next, .git, backups, .env.local (use -IncludeEnvLocal to include)

Restore DB: mongorestore --uri="<your-uri>" --drop "db_dump/<database_name>"
Restore app: copy application/* to your project folder, then run npm install
"@ | Set-Content -Path $manifestPath -Encoding UTF8

Write-Host "`nManifest: $manifestPath" -ForegroundColor Gray

# Optional: create ZIP (requires Compress-Archive)
$zipPath = "$backupPath.zip"
Write-Host "`nCreating ZIP archive..." -ForegroundColor Yellow
try {
    Compress-Archive -Path $backupPath -DestinationPath $zipPath -Force
    Write-Host "ZIP created: $zipPath" -ForegroundColor Green
} catch {
    Write-Host "ZIP creation skipped or failed: $_" -ForegroundColor Yellow
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Backup complete: $backupPath" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
