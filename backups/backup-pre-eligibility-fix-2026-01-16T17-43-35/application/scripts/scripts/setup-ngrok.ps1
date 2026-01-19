# Ngrok Setup Script for WhatsApp Webhook Testing
# This script helps set up ngrok tunnel for WhatsApp webhook testing

param(
    [string]$Port = "3001",
    [string]$NgrokPath = ""
)

Write-Host "`n🚀 Ngrok Setup for WhatsApp Webhook" -ForegroundColor Cyan
Write-Host "====================================`n" -ForegroundColor Cyan

# Check if ngrok is installed
$ngrokInstalled = $false
$ngrokExe = ""

if ($NgrokPath -and (Test-Path $NgrokPath)) {
    $ngrokExe = $NgrokPath
    $ngrokInstalled = $true
    Write-Host "✅ Using ngrok from: $NgrokPath" -ForegroundColor Green
} else {
    # Check common locations
    $commonPaths = @(
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\ngrok.ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe",
        "$env:ProgramFiles\ngrok\ngrok.exe",
        "$env:ProgramFiles(x86)\ngrok\ngrok.exe",
        ".\ngrok.exe",
        "ngrok"
    )
    
    foreach ($path in $commonPaths) {
        if (Get-Command $path -ErrorAction SilentlyContinue) {
            $ngrokExe = $path
            $ngrokInstalled = $true
            Write-Host "✅ Found ngrok at: $path" -ForegroundColor Green
            break
        }
    }
}

if (-not $ngrokInstalled) {
    Write-Host "❌ ngrok is not installed or not found in PATH" -ForegroundColor Red
    Write-Host "`nPlease install ngrok:" -ForegroundColor Yellow
    Write-Host "1. Download from: https://ngrok.com/download" -ForegroundColor White
    Write-Host "2. Extract to a folder (e.g., C:\ngrok\)" -ForegroundColor White
    Write-Host "3. Add to PATH or provide path with -NgrokPath parameter" -ForegroundColor White
    Write-Host "`nOr install via winget:" -ForegroundColor Yellow
    Write-Host "   winget install ngrok.ngrok" -ForegroundColor White
    Write-Host "`nAfter installation, run this script again." -ForegroundColor Yellow
    exit 1
}

# Check if ngrok is authenticated
Write-Host "`nChecking ngrok authentication..." -ForegroundColor Yellow
$authCheck = & $ngrokExe config check 2>&1

if ($LASTEXITCODE -ne 0 -or $authCheck -match "not found" -or $authCheck -match "No authtoken") {
    Write-Host "⚠️  Ngrok is not authenticated" -ForegroundColor Yellow
    Write-Host "`nTo authenticate ngrok:" -ForegroundColor Yellow
    Write-Host "1. Sign up at: https://dashboard.ngrok.com/signup" -ForegroundColor White
    Write-Host "2. Get your authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken" -ForegroundColor White
    Write-Host "3. Run: ngrok config add-authtoken YOUR_TOKEN" -ForegroundColor White
    Write-Host "`nOr run this command:" -ForegroundColor Yellow
    Write-Host "   $ngrokExe config add-authtoken YOUR_AUTH_TOKEN" -ForegroundColor Cyan
    exit 1
}

Write-Host "✅ Ngrok is authenticated" -ForegroundColor Green

# Check if port is in use
Write-Host "`nChecking if port $Port is in use..." -ForegroundColor Yellow
$portInUse = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue

if (-not $portInUse) {
    Write-Host "⚠️  Port $Port is not in use. Make sure your Next.js app is running on port $Port" -ForegroundColor Yellow
    Write-Host "   Start it with: npm run dev" -ForegroundColor White
} else {
    Write-Host "✅ Port $Port is in use (Next.js app is running)" -ForegroundColor Green
}

# Start ngrok
Write-Host "`n🚀 Starting ngrok tunnel on port $Port..." -ForegroundColor Cyan
Write-Host "   Public URL will be displayed below" -ForegroundColor Yellow
Write-Host "   Press Ctrl+C to stop ngrok`n" -ForegroundColor Yellow

# Start ngrok in foreground
& $ngrokExe http $Port

