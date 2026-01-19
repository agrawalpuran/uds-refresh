# PowerShell script to create a clean code backup (excluding node_modules, .next, .git)
# Usage: .\scripts\create-code-backup.ps1

$projectRoot = Split-Path -Parent $PSScriptRoot
$parentDir = Split-Path -Parent $projectRoot
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupName = "uniform-distribution-system-code-backup-$timestamp"
$backupPath = Join-Path $parentDir $backupName

Write-Host "📦 Creating code backup..." -ForegroundColor Cyan
Write-Host "Source: $projectRoot" -ForegroundColor Gray
Write-Host "Destination: $backupPath" -ForegroundColor Gray
Write-Host ""

# Create backup directory
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

# Copy root files (excluding logs and zips)
Get-ChildItem -Path $projectRoot -File | Where-Object {
    $_.Name -notlike "*.log" -and
    $_.Name -notlike "*.zip" -and
    $_.Name -ne ".DS_Store"
} | Copy-Item -Destination $backupPath -Force

# Copy directories (excluding node_modules, .next, .git, backups)
Get-ChildItem -Path $projectRoot -Directory | Where-Object {
    $_.Name -notin @('node_modules', '.next', '.git') -and
    $_.Name -notlike "*.zip" -and
    $_.Name -notlike "*backup*"
} | ForEach-Object {
    $destPath = Join-Path $backupPath $_.Name
    Write-Host "  Copying: $($_.Name)..." -ForegroundColor Gray
    Copy-Item -Path $_.FullName -Destination $destPath -Recurse -Exclude "node_modules",".next",".git","*.zip","*.log" -Force
}

Write-Host ""
Write-Host "✅ Code backup created successfully!" -ForegroundColor Green
Write-Host "📁 Backup location: $backupPath" -ForegroundColor Green
Write-Host ""

# Calculate backup size
$fileCount = (Get-ChildItem -Path $backupPath -Recurse -File).Count
$totalSize = (Get-ChildItem -Path $backupPath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB

Write-Host "📊 Backup Statistics:" -ForegroundColor Yellow
Write-Host "   Files: $fileCount" -ForegroundColor White
Write-Host "   Size: $([math]::Round($totalSize, 2)) MB" -ForegroundColor White
Write-Host ""
Write-Host "Included:" -ForegroundColor Yellow
Write-Host "   - All source code files" -ForegroundColor White
Write-Host "   - Configuration files" -ForegroundColor White
Write-Host "   - Scripts" -ForegroundColor White
Write-Host "   - Documentation" -ForegroundColor White
Write-Host "   - Public assets" -ForegroundColor White
Write-Host ""
Write-Host "Excluded (can be regenerated):" -ForegroundColor Yellow
Write-Host "   - node_modules (run npm install to restore)" -ForegroundColor White
Write-Host "   - .next (run npm run build to regenerate)" -ForegroundColor White
Write-Host "   - .git (version control)" -ForegroundColor White
Write-Host ""
Write-Host "Note: Database NOT included in this backup!" -ForegroundColor Yellow
Write-Host "To backup database, run: npm run backup-db" -ForegroundColor White
