# Full System Backup Script
# Creates a timestamped backup of application files and database

$timestamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$backupName = "backup-pre-eligibility-fix-$timestamp"
$backupDir = "backups/$backupName"

Write-Host "=============================================="
Write-Host "FULL SYSTEM BACKUP"
Write-Host "Timestamp: $timestamp"
Write-Host "Backup Directory: $backupDir"
Write-Host "=============================================="

# Create backup directories
Write-Host "`n[1/5] Creating backup directories..."
New-Item -ItemType Directory -Force -Path "$backupDir/application/app" | Out-Null
New-Item -ItemType Directory -Force -Path "$backupDir/application/lib" | Out-Null
New-Item -ItemType Directory -Force -Path "$backupDir/application/components" | Out-Null
New-Item -ItemType Directory -Force -Path "$backupDir/application/public" | Out-Null
New-Item -ItemType Directory -Force -Path "$backupDir/application/scripts" | Out-Null
New-Item -ItemType Directory -Force -Path "$backupDir/database" | Out-Null
Write-Host "   [OK] Directories created"

# Copy application files
Write-Host "`n[2/5] Copying application source files..."

# Copy app directory
if (Test-Path "app") {
    Copy-Item -Path "app" -Destination "$backupDir/application/app" -Recurse -Force
    Write-Host "   [OK] app/ copied"
}

# Copy lib directory
if (Test-Path "lib") {
    Copy-Item -Path "lib" -Destination "$backupDir/application/lib" -Recurse -Force
    Write-Host "   [OK] lib/ copied"
}

# Copy components directory
if (Test-Path "components") {
    Copy-Item -Path "components" -Destination "$backupDir/application/components" -Recurse -Force
    Write-Host "   [OK] components/ copied"
}

# Copy public directory
if (Test-Path "public") {
    Copy-Item -Path "public" -Destination "$backupDir/application/public" -Recurse -Force
    Write-Host "   [OK] public/ copied"
}

# Copy scripts directory
if (Test-Path "scripts") {
    Copy-Item -Path "scripts" -Destination "$backupDir/application/scripts" -Recurse -Force
    Write-Host "   [OK] scripts/ copied"
}

# Copy config files
Write-Host "`n[3/5] Copying configuration files..."
$configFiles = @(
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "next.config.js",
    "postcss.config.js",
    "tailwind.config.js",
    "vercel.json",
    ".env.local",
    "env.local.template"
)

foreach ($file in $configFiles) {
    if (Test-Path $file) {
        Copy-Item -Path $file -Destination "$backupDir/application/" -Force
        Write-Host "   [OK] $file copied"
    }
}

# Copy migrations directory if exists
if (Test-Path "migrations") {
    Copy-Item -Path "migrations" -Destination "$backupDir/application/migrations" -Recurse -Force
    Write-Host "   [OK] migrations/ copied"
}

# Copy tests directory if exists
if (Test-Path "tests") {
    Copy-Item -Path "tests" -Destination "$backupDir/application/tests" -Recurse -Force
    Write-Host "   [OK] tests/ copied"
}

# Create backup manifest
Write-Host "`n[4/5] Creating backup manifest..."
$manifest = @{
    backupName = $backupName
    timestamp = $timestamp
    description = "Pre-eligibility-fix backup - Full system backup before implementing eligibility and vendor inventory sync fixes"
    createdAt = (Get-Date).ToString("o")
    contents = @{
        application = @(
            "app/",
            "lib/",
            "components/",
            "public/",
            "scripts/",
            "migrations/",
            "tests/",
            "Configuration files"
        )
        database = "MongoDB collections export"
    }
    businessRulesContext = @{
        purpose = "Backup before implementing eligibility and inventory sync fixes"
        issues = @(
            "Missing eligibility validation on order creation",
            "Double-counting replacement orders against eligibility",
            "No eligibility restoration for returns",
            "Incomplete inventory handling for non-replacement returns"
        )
    }
}

$manifest | ConvertTo-Json -Depth 5 | Out-File -FilePath "$backupDir/BACKUP_MANIFEST.json" -Encoding UTF8
Write-Host "   [OK] Manifest created"

# Export database collections
Write-Host "`n[5/5] Exporting database collections..."
Write-Host "   Note: Database export requires MongoDB connection"
Write-Host "   Creating database export script..."

$dbExportScript = @"
// Database Export Script
// Run with: node scripts/export-db-backup.js

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution';
const BACKUP_DIR = '$($backupDir -replace '\\', '/')/database';

async function exportCollections() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log('Found ' + collections.length + ' collections');
    
    for (const collInfo of collections) {
        const collName = collInfo.name;
        console.log('Exporting: ' + collName + '...');
        
        const collection = db.collection(collName);
        const documents = await collection.find({}).toArray();
        
        const outputPath = path.join(BACKUP_DIR, collName + '.json');
        fs.writeFileSync(outputPath, JSON.stringify(documents, null, 2));
        
        console.log('   Exported ' + documents.length + ' documents to ' + collName + '.json');
    }
    
    console.log('\\nDatabase export complete!');
    await mongoose.disconnect();
}

exportCollections().catch(err => {
    console.error('Export failed:', err);
    process.exit(1);
});
"@

$dbExportScript | Out-File -FilePath "$backupDir/export-db.js" -Encoding UTF8
Write-Host "   [OK] Database export script created at $backupDir/export-db.js"

Write-Host "`n=============================================="
Write-Host "BACKUP COMPLETE!"
Write-Host "=============================================="
Write-Host "Backup Location: $backupDir"
Write-Host ""
Write-Host "To export database, run:"
Write-Host "  cd $backupDir"
Write-Host "  node export-db.js"
Write-Host ""
Write-Host "Or use mongodump directly if available:"
Write-Host "  mongodump --uri=`"<MONGODB_URI>`" --out=$backupDir/database"
Write-Host "=============================================="

# Return the backup directory path
Write-Output $backupDir
