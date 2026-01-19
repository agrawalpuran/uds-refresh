# Fix Server Environment Variables
# This script stops the server and ensures clean environment

Write-Host "🔧 Fixing Server Environment Variables..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop all Node processes
Write-Host "1️⃣ Stopping all Node.js processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "   Found $($nodeProcesses.Count) Node.js process(es)"
    $nodeProcesses | Stop-Process -Force
    Write-Host "   ✅ Stopped all Node.js processes"
    Start-Sleep -Seconds 2
} else {
    Write-Host "   ✅ No Node.js processes running"
}

# Step 2: Verify env.local file
Write-Host ""
Write-Host "2️⃣ Verifying env.local file..." -ForegroundColor Yellow
if (Test-Path "env.local") {
    $content = Get-Content env.local -Raw
    $mongodbLine = ($content -split "`r?`n") | Where-Object { $_ -match '^MONGODB_URI=' -and $_ -notmatch '^#' }
    
    if ($mongodbLine) {
        $uri = ($mongodbLine -split '=', 2)[1].Trim()
        Write-Host "   ✅ Found MONGODB_URI: $($uri.Substring(0, [Math]::Min(50, $uri.Length)))..."
        
        if ($uri -match '^mongodb(\+srv)?://') {
            Write-Host "   ✅ Format is valid"
        } else {
            Write-Host "   ❌ Format is INVALID!" -ForegroundColor Red
            Write-Host "   Current value: '$uri'" -ForegroundColor Red
            exit 1
        }
        
        if ($uri.Length -lt 20) {
            Write-Host "   ❌ Connection string is too short!" -ForegroundColor Red
            Write-Host "   This might be the problem!" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "   ❌ No active MONGODB_URI found in env.local!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   ❌ env.local file not found!" -ForegroundColor Red
    exit 1
}

# Step 3: Clear any system environment variables that might interfere
Write-Host ""
Write-Host "3️⃣ Checking system environment variables..." -ForegroundColor Yellow
if ($env:MONGODB_URI) {
    Write-Host "   ⚠️  System MONGODB_URI is set: $($env:MONGODB_URI.Substring(0, [Math]::Min(50, $env:MONGODB_URI.Length)))..."
    Write-Host "   💡 This might override env.local. Consider unsetting it."
} else {
    Write-Host "   ✅ No system MONGODB_URI variable"
}

# Step 4: Instructions
Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Environment check complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Yellow
Write-Host "   1. Start the server with: npm run dev"
Write-Host "   2. Watch for this message in the console:"
Write-Host "      ✅ MongoDB Connected Successfully" -ForegroundColor Green
Write-Host ""
Write-Host "   3. If you see errors about 123 or _mongodb._tcp.123:"
Write-Host "      - The server is still using a cached value"
Write-Host "      - Close ALL terminal windows"
Write-Host "      - Restart your IDE/editor"
Write-Host "      - Then run: npm run dev"
Write-Host ""
Write-Host "   4. If the error persists, check:"
Write-Host "      - Is there a .env file (not .env.local)?"
Write-Host "      - Are there any other environment files?"
Write-Host "      - Try: Get-ChildItem -Filter .env*"
Write-Host ""

