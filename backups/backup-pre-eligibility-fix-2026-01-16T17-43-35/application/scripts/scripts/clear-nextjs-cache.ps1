# Clear Next.js Cache Script
# This script clears the .next build cache folder

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Next.js Cache Cleaner" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if .next folder exists
if (-not (Test-Path ".next")) {
    Write-Host "No .next folder found - cache is already clear" -ForegroundColor Green
    Write-Host ""
    exit 0
}

Write-Host "Found .next folder..." -ForegroundColor Yellow

# Check if Node.js processes are running (likely the dev server)
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue

if ($nodeProcesses) {
    Write-Host ""
    Write-Host "WARNING: Node.js processes are running!" -ForegroundColor Red
    Write-Host "This might be the Next.js dev server." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please stop the dev server first:" -ForegroundColor Yellow
    Write-Host "  1. Go to the terminal running npm run dev" -ForegroundColor White
    Write-Host "  2. Press Ctrl+C to stop it" -ForegroundColor White
    Write-Host "  3. Run this script again" -ForegroundColor White
    Write-Host ""
    
    $response = Read-Host "Do you want to try clearing the cache anyway? (y/n)"
    if ($response -ne "y" -and $response -ne "Y") {
        Write-Host "Cancelled. Please stop the server and try again." -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""
Write-Host "Attempting to clear .next folder..." -ForegroundColor Yellow

try {
    # Try to delete the folder
    Remove-Item -Path ".next" -Recurse -Force -ErrorAction Stop
    Write-Host ""
    Write-Host "Successfully cleared Next.js cache!" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now restart the dev server with: npm run dev" -ForegroundColor Cyan
} catch {
    Write-Host ""
    Write-Host "Error clearing cache: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "The .next folder might be locked by:" -ForegroundColor Yellow
    Write-Host "  - Running dev server (npm run dev)" -ForegroundColor White
    Write-Host "  - Another process using the files" -ForegroundColor White
    Write-Host "  - File explorer window open in that folder" -ForegroundColor White
    Write-Host ""
    Write-Host "Please:" -ForegroundColor Yellow
    Write-Host "  1. Stop the dev server (Ctrl+C)" -ForegroundColor White
    Write-Host "  2. Close any file explorer windows in the project" -ForegroundColor White
    Write-Host "  3. Run this script again" -ForegroundColor White
    exit 1
}

Write-Host ""
