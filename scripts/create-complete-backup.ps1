# ============================================================================
# Complete Backup Script - Application + Database
# Creates a timestamped backup with both application files and MongoDB database
# ============================================================================

param(
    [switch]$Compress = $true,
    [string]$BackupLocation = ""
)

# Get script directory and project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

# Set backup location
if ([string]::IsNullOrEmpty($BackupLocation)) {
    $BackupLocation = Join-Path $projectRoot "backups"
}

# Create timestamp
$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$backupDirName = "backup-$timestamp"
$backupRoot = Join-Path $BackupLocation $backupDirName

# MongoDB connection from environment
$mongodbUri = $env:MONGODB_URI
if ([string]::IsNullOrEmpty($mongodbUri)) {
    $mongodbUri = "mongodb://localhost:27017/uniform-distribution"
}

Write-Host ""
$separator = [string]::new('=', 80)
Write-Host $separator -ForegroundColor Cyan
Write-Host "COMPLETE BACKUP - APPLICATION + DATABASE" -ForegroundColor Cyan
Write-Host $separator -ForegroundColor Cyan
Write-Host ""
Write-Host "Backup Directory: $backupDirName" -ForegroundColor Yellow
Write-Host "Timestamp: $timestamp" -ForegroundColor Yellow
Write-Host "Full Path: $backupRoot" -ForegroundColor Yellow
Write-Host ""

# Create backup directory structure
Write-Host "[1/5] Creating backup directory structure..." -ForegroundColor Green
$applicationDir = Join-Path $backupRoot "application"
$databaseDir = Join-Path $backupRoot "database"

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
New-Item -ItemType Directory -Path $applicationDir -Force | Out-Null
New-Item -ItemType Directory -Path $databaseDir -Force | Out-Null

Write-Host "  [OK] Backup directory structure created" -ForegroundColor Green
Write-Host ""

# Directories/files to exclude from backup
$excludePatterns = @(
    "node_modules",
    ".next",
    ".git",
    "backups",
    ".env.local",
    ".env",
    "*.log",
    ".DS_Store",
    "*.pem",
    ".vercel",
    "dist",
    "build",
    "coverage",
    ".pnp",
    ".pnp.js",
    "*.zip",
    "*.tar.gz"
)

# Function to check if path should be excluded
function Should-Exclude {
    param([string]$filePath, [string]$rootPath)
    
    $relativePath = $filePath.Replace($rootPath, "").TrimStart("\")
    
    foreach ($pattern in $excludePatterns) {
        if ($pattern -like "*.*") {
            # File extension pattern
            if ($filePath -like $pattern) {
                return $true
            }
        } else {
            # Directory or file name pattern
            if ($relativePath -like "*\$pattern\*" -or $relativePath -like "*\$pattern" -or $relativePath -eq $pattern) {
                return $true
            }
        }
    }
    
    return $false
}

# Backup application filesystem
Write-Host "[2/5] Backing up application filesystem..." -ForegroundColor Green
$startTime = Get-Date

$filesCopied = 0
$dirsCopied = 0

Get-ChildItem -Path $projectRoot -Recurse | ForEach-Object {
    $relativePath = $_.FullName.Replace($projectRoot, "").TrimStart("\")
    $destPath = Join-Path $applicationDir $relativePath
    
    if (-not (Should-Exclude $_.FullName $projectRoot)) {
        try {
            if ($_.PSIsContainer) {
                if (-not (Test-Path $destPath)) {
                    New-Item -ItemType Directory -Path $destPath -Force | Out-Null
                    $dirsCopied++
                }
            } else {
                $destDir = Split-Path -Parent $destPath
                if (-not (Test-Path $destDir)) {
                    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                }
                Copy-Item -Path $_.FullName -Destination $destPath -Force
                $filesCopied++
            }
        } catch {
            Write-Warning "  [WARN] Could not copy $relativePath"
        }
    }
}

$duration = ((Get-Date) - $startTime).TotalSeconds
Write-Host "  [OK] Application backup completed in $([math]::Round($duration, 2))s" -ForegroundColor Green
Write-Host "       Files copied: $filesCopied" -ForegroundColor Gray
Write-Host "       Directories copied: $dirsCopied" -ForegroundColor Gray
Write-Host ""

# Backup MongoDB database
Write-Host "[3/5] Backing up MongoDB database..." -ForegroundColor Green

# Check if mongodump is available
$mongodumpAvailable = $false
try {
    $null = Get-Command mongodump -ErrorAction Stop
    $mongodumpAvailable = $true
} catch {
    Write-Host "       mongodump not found, using Node.js backup method..." -ForegroundColor Yellow
}

if ($mongodumpAvailable) {
    # Use mongodump
    Write-Host "       Using mongodump..." -ForegroundColor Gray
    
    $dumpDir = Join-Path $databaseDir "dump"
    $dumpCommand = "mongodump --uri=`"$mongodbUri`" --out=`"$databaseDir`""
    
    try {
        Invoke-Expression $dumpCommand
        Write-Host "  [OK] Database backup completed using mongodump" -ForegroundColor Green
    } catch {
        Write-Warning "  [WARN] mongodump failed, trying Node.js method..."
        $mongodumpAvailable = $false
    }
}

if (-not $mongodumpAvailable) {
    # Use Node.js backup script
    Write-Host "       Using Node.js backup method..." -ForegroundColor Gray
    
    $backupScript = Join-Path $scriptDir "backup-database.js"
    if (Test-Path $backupScript) {
        $env:MONGODB_URI = $mongodbUri
        $env:BACKUP_OUTPUT_DIR = $databaseDir
        $output = node $backupScript 2>&1
        Write-Host $output
        Write-Host "  [OK] Database backup completed using Node.js method" -ForegroundColor Green
    } else {
        Write-Warning "  [WARN] backup-database.js not found, skipping database backup"
    }
}

Write-Host ""

# Create backup manifest
Write-Host "[4/5] Creating backup manifest..." -ForegroundColor Green

$manifest = @{
    backupType = "complete"
    timestamp = $timestamp
    backupDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    backupDateReadable = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    application = @{
        source = $projectRoot
        destination = $applicationDir
        excluded = $excludePatterns
    }
    database = @{
        destination = $databaseDir
        method = if ($mongodumpAvailable) { "mongodump" } else { "nodejs" }
    }
    system = @{
        nodeVersion = (node --version)
        platform = $PSVersionTable.PSVersion.ToString()
        os = [System.Environment]::OSVersion.ToString()
    }
}

$manifestFile = Join-Path $backupRoot "BACKUP_MANIFEST.json"
$manifest | ConvertTo-Json -Depth 10 | Set-Content -Path $manifestFile -Encoding UTF8

Write-Host "  [OK] Manifest created" -ForegroundColor Green
Write-Host ""

# Calculate backup size
Write-Host "[5/5] Calculating backup size..." -ForegroundColor Green
$backupSize = (Get-ChildItem -Path $backupRoot -Recurse -File | Measure-Object -Property Length -Sum).Sum

function Format-Size {
    param([long]$bytes)
    $units = @("B", "KB", "MB", "GB", "TB")
    $size = $bytes
    $unitIndex = 0
    
    while ($size -ge 1024 -and $unitIndex -lt $units.Length - 1) {
        $size /= 1024
        $unitIndex++
    }
    
    return "{0:N2} {1}" -f $size, $units[$unitIndex]
}

$formattedSize = Format-Size $backupSize
Write-Host "       Total backup size: $formattedSize" -ForegroundColor Gray
Write-Host ""

# Create compressed archive if requested
$zipFile = $null
if ($Compress) {
    Write-Host "[EXTRA] Creating compressed archive..." -ForegroundColor Green
    
    $zipFileName = "$backupDirName.zip"
    $zipFilePath = Join-Path $BackupLocation $zipFileName
    
    try {
        # Remove existing zip if it exists
        if (Test-Path $zipFilePath) {
            Remove-Item $zipFilePath -Force
        }
        
        # Create zip archive
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::CreateFromDirectory($backupRoot, $zipFilePath)
        
        $zipSize = (Get-Item $zipFilePath).Length
        $zipFormattedSize = Format-Size $zipSize
        
        Write-Host "  [OK] Compressed archive created: $zipFileName" -ForegroundColor Green
        Write-Host "       Archive size: $zipFormattedSize" -ForegroundColor Gray
        Write-Host "       Compression ratio: $([math]::Round((1 - ($zipSize / $backupSize)) * 100, 2))%" -ForegroundColor Gray
        Write-Host ""
        
        $zipFile = $zipFilePath
    } catch {
        Write-Warning "  [WARN] Failed to create compressed archive"
    }
}

# Summary
$totalDuration = ((Get-Date) - $startTime).TotalSeconds

$separator = [string]::new('=', 80)
Write-Host $separator -ForegroundColor Cyan
Write-Host "COMPLETE BACKUP COMPLETED SUCCESSFULLY" -ForegroundColor Green
Write-Host $separator -ForegroundColor Cyan
Write-Host ""
Write-Host "Backup Location: $backupRoot" -ForegroundColor Yellow
Write-Host "Backup Size: $formattedSize" -ForegroundColor Yellow
Write-Host "Duration: $([math]::Round($totalDuration, 2))s" -ForegroundColor Yellow
Write-Host "Timestamp: $timestamp" -ForegroundColor Yellow
Write-Host ""
Write-Host "Backup Contents:" -ForegroundColor Cyan
Write-Host "  [Application] $applicationDir" -ForegroundColor White
Write-Host "  [Database] $databaseDir" -ForegroundColor White
Write-Host "  [Manifest] $manifestFile" -ForegroundColor White
if ($zipFile) {
    Write-Host "  [Archive] $zipFile" -ForegroundColor White
}
Write-Host ""
Write-Host $separator -ForegroundColor Cyan
Write-Host ""
