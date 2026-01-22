# PowerShell script to push changes to GitHub dev branch
# Repository: https://github.com/agrawalpuran/uds-refresh
# Branch: dev
# Usage: .\push-to-dev.ps1 [commit-message]
# Example: .\push-to-dev.ps1 "Fix nodemailer build error"

param(
    [string]$CommitMessage = "Update project files"
)

# Configuration
$RemoteName = "origin"
$BranchName = "dev"
$RepoUrl = "https://github.com/agrawalpuran/uds-refresh"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "GitHub Push Script - DEV Branch" -ForegroundColor Cyan
Write-Host "Repository: $RepoUrl" -ForegroundColor Cyan
Write-Host "Branch: $BranchName" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if git is available
try {
    git --version | Out-Null
} catch {
    Write-Host "Git is not installed or not in PATH." -ForegroundColor Red
    exit 1
}

# Check if we're in a git repository
if (-not (Test-Path ".git")) {
    Write-Host "Not a git repository. Initializing..." -ForegroundColor Yellow
    git init
}

# Check if remote exists, if not add it
$remoteExists = git remote | Select-String -Pattern "^$RemoteName$"
if (-not $remoteExists) {
    Write-Host "Adding remote '$RemoteName'..." -ForegroundColor Yellow
    git remote add $RemoteName $RepoUrl
}

# Fetch latest from remote to ensure we have branch info
Write-Host "`nFetching from remote..." -ForegroundColor Yellow
git fetch $RemoteName 2>$null

# Check if local dev branch exists
$localBranchExists = git branch --list $BranchName
if (-not $localBranchExists) {
    Write-Host "`nCreating local '$BranchName' branch..." -ForegroundColor Yellow
    # Check if remote dev branch exists
    $remoteBranchExists = git branch -r | Select-String -Pattern "$RemoteName/$BranchName"
    if ($remoteBranchExists) {
        git checkout -b $BranchName $RemoteName/$BranchName
    } else {
        git checkout -b $BranchName
    }
} else {
    # Switch to dev branch if not already on it
    $currentBranch = git branch --show-current
    if ($currentBranch -ne $BranchName) {
        Write-Host "`nSwitching to '$BranchName' branch..." -ForegroundColor Yellow
        git checkout $BranchName
    }
}

Write-Host "`nCurrent branch: $(git branch --show-current)" -ForegroundColor Green

Write-Host "`nChecking git status..." -ForegroundColor Yellow
git status --short

Write-Host "`nStaging all changes..." -ForegroundColor Yellow
git add .

# Check if there are changes to commit
$hasChanges = git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "`nNo changes to commit. Checking if there are commits to push..." -ForegroundColor Yellow
    
    # Check if there are unpushed commits
    $unpushed = git log $RemoteName/$BranchName..HEAD 2>$null
    if (-not $unpushed) {
        Write-Host "Everything is up to date." -ForegroundColor Green
        exit 0
    }
} else {
    Write-Host "`nCommitting changes with message: '$CommitMessage'" -ForegroundColor Yellow
    git commit -m $CommitMessage
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Commit failed." -ForegroundColor Red
        exit 1
    }
}

Write-Host "`nPushing to GitHub ($RemoteName/$BranchName)..." -ForegroundColor Yellow
git push -u $RemoteName $BranchName

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "Successfully pushed to GitHub!" -ForegroundColor Green
    Write-Host "   Repository: $RepoUrl" -ForegroundColor Green
    Write-Host "   Branch: $BranchName" -ForegroundColor Green
    Write-Host "   View at: $RepoUrl/tree/$BranchName" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "`nPush failed. Trying with --force-with-lease..." -ForegroundColor Yellow
    git push --set-upstream $RemoteName $BranchName
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nSuccessfully pushed to GitHub!" -ForegroundColor Green
    } else {
        Write-Host "`n========================================" -ForegroundColor Red
        Write-Host "Push failed. Please check:" -ForegroundColor Red
        Write-Host "   1. Your GitHub credentials are configured" -ForegroundColor Red
        Write-Host "   2. You have write access to the repository" -ForegroundColor Red
        Write-Host "   3. Network connection is working" -ForegroundColor Red
        Write-Host "" -ForegroundColor Red
        Write-Host "Try running manually:" -ForegroundColor Yellow
        Write-Host "   git push -u origin dev" -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
