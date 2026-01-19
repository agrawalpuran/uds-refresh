# PowerShell script to push changes to GitHub
# Repository: https://github.com/agrawalpuran/uds
# Usage: .\push-to-github.ps1 [commit-message]
# Example: .\push-to-github.ps1 "Fix ObjectId casting issues"

param(
    [string]$CommitMessage = "Update project files"
)

# Remote name for the repository
$RemoteName = "origin"
$BranchName = "main"
$RepoUrl = "https://github.com/agrawalpuran/uds"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "GitHub Push Script" -ForegroundColor Cyan
Write-Host "Repository: $RepoUrl" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Checking git status..." -ForegroundColor Yellow
git status --short

Write-Host "`nStaging all changes..." -ForegroundColor Yellow
git add .

Write-Host "`nCommitting changes with message: '$CommitMessage'" -ForegroundColor Yellow
$staged = git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "No changes to commit." -ForegroundColor Yellow
    exit 0
}

git commit -m $CommitMessage
if ($LASTEXITCODE -ne 0) {
    Write-Host "Commit failed." -ForegroundColor Red
    exit 1
}

Write-Host "`nPushing to GitHub ($RemoteName/$BranchName)..." -ForegroundColor Yellow
git push -u $RemoteName $BranchName

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSuccessfully pushed to GitHub!" -ForegroundColor Green
    Write-Host "   Repository: $RepoUrl" -ForegroundColor Green
    Write-Host "   Branch: $BranchName" -ForegroundColor Green
} else {
    Write-Host "Push failed. Trying alternative method..." -ForegroundColor Red
    git push --set-upstream $RemoteName $BranchName
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nSuccessfully pushed to GitHub!" -ForegroundColor Green
    } else {
        Write-Host "`nPush failed. Please check:" -ForegroundColor Red
        Write-Host "   1. Git configuration" -ForegroundColor Red
        Write-Host "   2. Network connection" -ForegroundColor Red
        Write-Host "   3. Remote repository access" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
