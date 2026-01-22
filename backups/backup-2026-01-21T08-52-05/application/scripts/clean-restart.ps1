# Clean Restart Script for UDS Application
# This script ensures a clean server restart by:
# 1. Stopping all Node.js processes
# 2. Clearing build cache
# 3. Clearing port 3001
# 4. Starting the server fresh

Write-Host "=== UDS Clean Restart Script ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop all Node.js processes
Write-Host "[1/4] Stopping all Node.js processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    $nodeProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "   Stopped $($nodeProcesses.Count) Node.js process(es)" -ForegroundColor Green
    Start-Sleep -Seconds 2
} else {
    Write-Host "   No Node.js processes found" -ForegroundColor Gray
}

# Step 2: Clear port 3001
Write-Host "[2/4] Clearing port 3001..." -ForegroundColor Yellow
$portProcesses = netstat -ano | Select-String ":3001" | ForEach-Object {
    $parts = $_.ToString().Split() | Where-Object { $_ -ne "" }
    if ($parts.Length -gt 0) {
        $pid = $parts[-1]
        if ($pid -match '^\d+$' -and $pid -ne "0") {
            try {
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                $pid
            } catch {
                $null
            }
        }
    }
}
if ($portProcesses) {
    Write-Host "   Cleared port 3001" -ForegroundColor Green
} else {
    Write-Host "   Port 3001 is free" -ForegroundColor Gray
}
Start-Sleep -Seconds 1

# Step 3: Clear build cache
Write-Host "[3/4] Clearing build cache..." -ForegroundColor Yellow
if (Test-Path ".next") {
    try {
        # Try to remove .next directory
        Remove-Item -Path ".next" -Recurse -Force -ErrorAction Stop
        Write-Host "   Cleared .next directory" -ForegroundColor Green
    } catch {
        Write-Host "   Warning: Could not fully clear .next directory (some files may be locked)" -ForegroundColor Yellow
        Write-Host "   This is usually safe - Next.js will rebuild on next start" -ForegroundColor Gray
    }
} else {
    Write-Host "   .next directory does not exist" -ForegroundColor Gray
}

if (Test-Path "node_modules/.cache") {
    try {
        Remove-Item -Path "node_modules/.cache" -Recurse -Force -ErrorAction Stop
        Write-Host "   Cleared node_modules/.cache" -ForegroundColor Green
    } catch {
        Write-Host "   Warning: Could not clear node_modules/.cache" -ForegroundColor Yellow
    }
} else {
    Write-Host "   node_modules/.cache does not exist" -ForegroundColor Gray
}

# Step 4: Start the server
Write-Host "[4/4] Starting development server..." -ForegroundColor Yellow
Write-Host ""

# Ensure we're in the correct directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "Working directory: $scriptPath" -ForegroundColor Gray
Write-Host "Server will start on http://localhost:3001" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host ""

# Start the server
npm run dev

