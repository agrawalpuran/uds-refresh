# PowerShell script to automate Vercel deployment
# This script handles what can be automated without user credentials

Write-Host "🚀 Starting Vercel Deployment Automation..." -ForegroundColor Cyan
Write-Host ""

# Check if Vercel CLI is installed
Write-Host "📦 Checking Vercel CLI installation..." -ForegroundColor Yellow
$vercelInstalled = Get-Command vercel -ErrorAction SilentlyContinue

if (-not $vercelInstalled) {
    Write-Host "❌ Vercel CLI not found. Installing..." -ForegroundColor Red
    Write-Host "   Run: npm install -g vercel" -ForegroundColor Yellow
    npm install -g vercel
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install Vercel CLI" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Vercel CLI installed" -ForegroundColor Green
} else {
    Write-Host "✅ Vercel CLI is installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "📋 Pre-deployment Checklist:" -ForegroundColor Cyan
Write-Host ""

# Check if .env file exists
if (Test-Path .env) {
    Write-Host "✅ .env file found" -ForegroundColor Green
} else {
    Write-Host "⚠️  .env file not found" -ForegroundColor Yellow
    Write-Host "   You'll need to set MONGODB_URI in Vercel dashboard" -ForegroundColor Yellow
}

# Check if MongoDB URI is set
$mongodbUri = $env:MONGODB_URI
if ($mongodbUri) {
    Write-Host "✅ MONGODB_URI environment variable is set" -ForegroundColor Green
} else {
    Write-Host "⚠️  MONGODB_URI not set in environment" -ForegroundColor Yellow
    Write-Host "   You'll need to set it in Vercel dashboard" -ForegroundColor Yellow
}

# Check if git remote is configured
$gitRemote = git remote -v 2>$null
if ($gitRemote) {
    Write-Host "✅ Git remote configured" -ForegroundColor Green
    Write-Host "   Remote: $($gitRemote -split "`n" | Select-Object -First 1)" -ForegroundColor Gray
} else {
    Write-Host "❌ Git remote not configured" -ForegroundColor Red
    Write-Host "   Please configure git remote first" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "🔍 Checking build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed. Please fix errors before deploying." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build successful" -ForegroundColor Green

Write-Host ""
Write-Host "📤 Pushing to GitHub..." -ForegroundColor Cyan
git push origin master
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Git push failed. Continuing anyway..." -ForegroundColor Yellow
} else {
    Write-Host "✅ Code pushed to GitHub" -ForegroundColor Green
}

Write-Host ""
Write-Host "🌐 Deploying to Vercel..." -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  IMPORTANT: You need to:" -ForegroundColor Yellow
Write-Host "   1. Login to Vercel (will prompt): vercel login" -ForegroundColor Yellow
Write-Host "   2. Set MONGODB_URI in Vercel dashboard after first deploy" -ForegroundColor Yellow
Write-Host ""

# Deploy to Vercel
Write-Host "Running: vercel --prod" -ForegroundColor Gray
vercel --prod

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Deployment initiated!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 Next Steps:" -ForegroundColor Cyan
    Write-Host "   1. Go to https://vercel.com/dashboard" -ForegroundColor White
    Write-Host "   2. Select your project" -ForegroundColor White
    Write-Host "   3. Go to Settings → Environment Variables" -ForegroundColor White
    Write-Host "   4. Add MONGODB_URI with your MongoDB Atlas connection string" -ForegroundColor White
    Write-Host "   5. Redeploy the project" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "❌ Deployment failed. Check errors above." -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Alternative: Deploy via Vercel Dashboard" -ForegroundColor Yellow
    Write-Host "   1. Go to https://vercel.com" -ForegroundColor White
    Write-Host "   2. Import your GitHub repository: $($gitRemote -split "`n" | Select-Object -First 1 | ForEach-Object { $_ -replace '.*@github.com:([^\.]+).*', '$1' })" -ForegroundColor White
    Write-Host "   3. Add MONGODB_URI environment variable" -ForegroundColor White
    Write-Host "   4. Click Deploy" -ForegroundColor White
}



