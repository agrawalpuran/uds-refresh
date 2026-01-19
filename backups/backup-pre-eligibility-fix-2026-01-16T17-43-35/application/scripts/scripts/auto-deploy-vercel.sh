#!/bin/bash
# Bash script to automate Vercel deployment (for Linux/Mac)

echo "🚀 Starting Vercel Deployment Automation..."
echo ""

# Check if Vercel CLI is installed
echo "📦 Checking Vercel CLI installation..."
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install Vercel CLI"
        exit 1
    fi
    echo "✅ Vercel CLI installed"
else
    echo "✅ Vercel CLI is installed"
fi

echo ""
echo "📋 Pre-deployment Checklist:"
echo ""

# Check if .env file exists
if [ -f .env ]; then
    echo "✅ .env file found"
else
    echo "⚠️  .env file not found"
    echo "   You'll need to set MONGODB_URI in Vercel dashboard"
fi

# Check if MongoDB URI is set
if [ -n "$MONGODB_URI" ]; then
    echo "✅ MONGODB_URI environment variable is set"
else
    echo "⚠️  MONGODB_URI not set in environment"
    echo "   You'll need to set it in Vercel dashboard"
fi

# Check if git remote is configured
if git remote -v &> /dev/null; then
    echo "✅ Git remote configured"
    git remote -v | head -1
else
    echo "❌ Git remote not configured"
    echo "   Please configure git remote first"
    exit 1
fi

echo ""
echo "🔍 Checking build..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix errors before deploying."
    exit 1
fi
echo "✅ Build successful"

echo ""
echo "📤 Pushing to GitHub..."
git push origin master || git push origin main
if [ $? -ne 0 ]; then
    echo "⚠️  Git push failed. Continuing anyway..."
else
    echo "✅ Code pushed to GitHub"
fi

echo ""
echo "🌐 Deploying to Vercel..."
echo ""
echo "⚠️  IMPORTANT: You need to:"
echo "   1. Login to Vercel (will prompt): vercel login"
echo "   2. Set MONGODB_URI in Vercel dashboard after first deploy"
echo ""

# Deploy to Vercel
echo "Running: vercel --prod"
vercel --prod

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment initiated!"
    echo ""
    echo "📝 Next Steps:"
    echo "   1. Go to https://vercel.com/dashboard"
    echo "   2. Select your project"
    echo "   3. Go to Settings → Environment Variables"
    echo "   4. Add MONGODB_URI with your MongoDB Atlas connection string"
    echo "   5. Redeploy the project"
else
    echo ""
    echo "❌ Deployment failed. Check errors above."
    echo ""
    echo "💡 Alternative: Deploy via Vercel Dashboard"
    echo "   1. Go to https://vercel.com"
    echo "   2. Import your GitHub repository"
    echo "   3. Add MONGODB_URI environment variable"
    echo "   4. Click Deploy"
fi



