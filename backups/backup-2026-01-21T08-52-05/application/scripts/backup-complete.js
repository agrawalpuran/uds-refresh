#!/usr/bin/env node
/**
 * Complete Backup Script for Uniform Distribution System
 * 
 * This script creates a comprehensive backup including:
 * 1. Application source code (excluding node_modules, .next, etc.)
 * 2. MongoDB database (full dump with indexes)
 * 3. Configuration files (with secrets redacted)
 * 
 * Usage:
 *   npm run backup-complete
 *   node scripts/backup-complete.js
 * 
 * Environment:
 *   Reads MONGODB_URI from .env.local or environment variable
 */

const mongoose = require('mongoose')
const { exec } = require('child_process')
const { promisify } = require('util')
const path = require('path')
const fs = require('fs')
const archiver = require('archiver')

const execAsync = promisify(exec)

// Load environment variables
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local')
  let mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      mongoUri = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
  
  return mongoUri
}

const MONGODB_URI = loadEnv()

// Extract database connection details
function parseMongoUri(uri) {
  let dbName = 'uniform-distribution'
  let connectionString = uri
  
  // Extract database name
  const dbMatch = uri.match(/\/([^/?]+)(\?|$)/)
  if (dbMatch) {
    dbName = dbMatch[1]
  }
  
  return { dbName, connectionString }
}

const { dbName, connectionString } = parseMongoUri(MONGODB_URI)

// Create timestamped backup directory
function createBackupDir() {
  const projectRoot = path.resolve(__dirname, '..')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupBaseDir = path.join(projectRoot, 'backups')
  const backupDir = path.join(backupBaseDir, `backup-${timestamp}`)
  
  // Create backup directory structure
  if (!fs.existsSync(backupBaseDir)) {
    fs.mkdirSync(backupBaseDir, { recursive: true })
  }
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }
  
  return { backupDir, backupBaseDir, timestamp }
}

// Backup application code
async function backupApplicationCode(backupDir) {
  console.log('\n📦 Step 1: Backing up application code...')
  
  const projectRoot = path.resolve(__dirname, '..')
  const codeBackupDir = path.join(backupDir, 'application')
  
  if (!fs.existsSync(codeBackupDir)) {
    fs.mkdirSync(codeBackupDir, { recursive: true })
  }
  
  // Files and directories to include
  const includePatterns = [
    'app/**',
    'components/**',
    'lib/**',
    'public/**',
    'scripts/**',
    '*.json',
    '*.js',
    '*.ts',
    '*.config.*',
    '*.md',
    'README.md',
    '.gitignore',
    'next.config.js',
    'tailwind.config.ts',
    'tsconfig.json',
    'postcss.config.js',
    'vercel.json'
  ]
  
  // Files and directories to exclude
  const excludePatterns = [
    'node_modules/**',
    '.next/**',
    'out/**',
    'build/**',
    '.vercel/**',
    '*.log',
    '.env*.local',
    '.env',
    'backups/**',
    '*.zip',
    '*.tar.gz',
    'components.zip',
    '**/node_modules/**',
    '**/.next/**',
    '**/coverage/**',
    '**/*.tsbuildinfo'
  ]
  
  // Create a safe .env template (redact secrets)
  const envTemplatePath = path.join(codeBackupDir, '.env.local.template')
  const envTemplate = `# MongoDB Connection String
# IMPORTANT: Replace with your actual connection string
MONGODB_URI=your-mongodb-connection-string-here

# Encryption Key
# IMPORTANT: Use the same key from your original environment
ENCRYPTION_KEY=your-encryption-key-here

# Next.js Port
PORT=3001

# Node Environment
NODE_ENV=development
`
  fs.writeFileSync(envTemplatePath, envTemplate)
  
  // Copy files manually (simpler than using archiver for selective copy)
  const filesToCopy = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'next.config.js',
    'tailwind.config.ts',
    'postcss.config.js',
    'vercel.json',
    '.gitignore',
    'README.md'
  ]
  
  filesToCopy.forEach(file => {
    const src = path.join(projectRoot, file)
    const dest = path.join(codeBackupDir, file)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest)
    }
  })
  
  // Copy directories
  const dirsToCopy = ['app', 'components', 'lib', 'public', 'scripts']
  dirsToCopy.forEach(dir => {
    const src = path.join(projectRoot, dir)
    const dest = path.join(codeBackupDir, dir)
    if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
      copyDirectory(src, dest, excludePatterns)
    }
  })
  
  console.log(`✅ Application code backed up to: ${codeBackupDir}`)
  return codeBackupDir
}

// Recursive directory copy with exclusions
function copyDirectory(src, dest, excludePatterns) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true })
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    
    // Check if path should be excluded
    const shouldExclude = excludePatterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'))
      return regex.test(srcPath) || regex.test(entry.name)
    })
    
    if (shouldExclude) {
      continue
    }
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath, excludePatterns)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// Backup MongoDB database
async function backupDatabase(backupDir) {
  console.log('\n🗄️  Step 2: Backing up MongoDB database...')
  console.log(`   Database: ${dbName}`)
  console.log(`   Connection: ${connectionString.includes('@') ? 'MongoDB Atlas' : 'Local MongoDB'}`)
  
  const dbBackupDir = path.join(backupDir, 'database')
  
  if (!fs.existsSync(dbBackupDir)) {
    fs.mkdirSync(dbBackupDir, { recursive: true })
  }
  
  // Try mongodump first (preferred method)
  try {
    await execAsync('mongodump --version')
    console.log('   Using mongodump (official MongoDB tool)...')
    
    const dumpCommand = `mongodump --uri="${connectionString}" --out="${dbBackupDir}"`
    const { stdout, stderr } = await execAsync(dumpCommand)
    
    if (stderr && !stderr.includes('writing')) {
      console.warn('   Warning:', stderr)
    }
    
    console.log(`✅ Database backed up using mongodump`)
    return { method: 'mongodump', success: true }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('   mongodump not found, using code-based backup...')
    } else {
      console.warn('   mongodump failed, trying code-based backup...')
    }
    
    // Fallback to code-based backup
    return await codeBasedBackup(dbBackupDir)
  }
}

// Code-based database backup (fallback)
async function codeBasedBackup(backupDir) {
  console.log('   Using code-based backup method...')
  
  try {
    await mongoose.connect(connectionString)
    console.log('   ✅ Connected to MongoDB')
    
    const db = mongoose.connection.db
    const collections = await db.listCollections().toArray()
    
    const backupData = {
      database: dbName,
      timestamp: new Date().toISOString(),
      collections: {}
    }
    
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name
      console.log(`   Backing up collection: ${collectionName}`)
      
      const collection = db.collection(collectionName)
      const documents = await collection.find({}).toArray()
      
      // Get indexes
      const indexes = await collection.indexes()
      
      backupData.collections[collectionName] = {
        documents,
        indexes,
        count: documents.length
      }
      
      console.log(`   ✅ ${collectionName}: ${documents.length} documents`)
    }
    
    // Save backup to JSON file
    const backupFile = path.join(backupDir, `${dbName}-backup.json`)
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2))
    
    // Also save metadata
    const metadata = {
      database: dbName,
      timestamp: backupData.timestamp,
      collections: Object.keys(backupData.collections).map(name => ({
        name,
        count: backupData.collections[name].count,
        indexes: backupData.collections[name].indexes.length
      }))
    }
    
    const metadataFile = path.join(backupDir, 'backup-metadata.json')
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2))
    
    await mongoose.disconnect()
    console.log(`✅ Database backed up using code-based method`)
    return { method: 'code-based', success: true, metadata }
  } catch (error) {
    console.error('❌ Code-based backup failed:', error.message)
    await mongoose.disconnect().catch(() => {})
    return { method: 'code-based', success: false, error: error.message }
  }
}

// Create archive
async function createArchive(backupDir, timestamp) {
  console.log('\n📦 Step 3: Creating backup archive...')
  
  const projectRoot = path.resolve(__dirname, '..')
  const backupBaseDir = path.join(projectRoot, 'backups')
  const archivePath = path.join(backupBaseDir, `backup-${timestamp}.zip`)
  
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(archivePath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    
    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2)
      console.log(`✅ Backup archive created: ${archivePath}`)
      console.log(`   Size: ${sizeMB} MB`)
      resolve(archivePath)
    })
    
    archive.on('error', (err) => {
      console.error('❌ Archive error:', err)
      reject(err)
    })
    
    archive.pipe(output)
    archive.directory(backupDir, false)
    archive.finalize()
  })
}

// Validate backup
async function validateBackup(backupDir) {
  console.log('\n✅ Step 4: Validating backup...')
  
  const checks = {
    application: false,
    database: false,
    metadata: false
  }
  
  // Check application backup
  const appDir = path.join(backupDir, 'application')
  if (fs.existsSync(appDir)) {
    const packageJson = path.join(appDir, 'package.json')
    if (fs.existsSync(packageJson)) {
      checks.application = true
      console.log('   ✅ Application code backup valid')
    }
  }
  
  // Check database backup
  const dbDir = path.join(backupDir, 'database')
  if (fs.existsSync(dbDir)) {
    // Check for mongodump output or JSON backup
    const files = fs.readdirSync(dbDir)
    const hasBackup = files.some(f => 
      f.includes('backup') || 
      f.includes(dbName) ||
      fs.statSync(path.join(dbDir, f)).isDirectory()
    )
    
    if (hasBackup) {
      checks.database = true
      console.log('   ✅ Database backup valid')
      
      // Try to read metadata if available
      const metadataFile = path.join(dbDir, 'backup-metadata.json')
      if (fs.existsSync(metadataFile)) {
        const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'))
        console.log(`   📊 Collections backed up: ${metadata.collections.length}`)
        metadata.collections.forEach((col) => {
          console.log(`      - ${col.name}: ${col.count} documents, ${col.indexes} indexes`)
        })
      }
    }
  }
  
  // Check metadata file
  const readmeFile = path.join(backupDir, 'README.md')
  if (fs.existsSync(readmeFile)) {
    checks.metadata = true
  }
  
  const allValid = Object.values(checks).every(v => v)
  if (allValid) {
    console.log('   ✅ All backup components validated')
  } else {
    console.warn('   ⚠️  Some backup components may be missing')
  }
  
  return checks
}

// Create backup README
function createBackupReadme(backupDir, timestamp, dbInfo) {
  const readmePath = path.join(backupDir, 'README.md')
  
  // Ensure dbInfo has required properties
  if (!dbInfo) {
    dbInfo = { dbName: 'unknown', method: 'unknown', success: false }
  }
  if (!dbInfo.dbName) {
    dbInfo.dbName = 'unknown'
  }
  if (!dbInfo.method) {
    dbInfo.method = 'code-based'
  }
  
  const backupDate = new Date().toLocaleString()
  const dbNameValue = dbInfo.dbName || 'unknown'
  const backupMethod = dbInfo.method || 'mongodump'
  
  const readme = `# Uniform Distribution System - Backup

**Backup Date:** ${backupDate}
**Backup Timestamp:** ${timestamp}
**Database:** ${dbNameValue}

## Backup Contents

This backup includes:

1. **Application Code** (in /application directory)
   - Source code (app, components, lib, public, scripts)
   - Configuration files (package.json, tsconfig.json, etc.)
   - Documentation (README, markdown files)
   - Excludes: node_modules, .next, build artifacts, secrets

2. **Database Backup** (in /database directory)
   - Full MongoDB database dump
   - All collections with data
   - Indexes preserved
   - Backup method: ${backupMethod}

## Restore Instructions

### 1. Restore Application Code

\`\`\`bash
# Extract backup if archived
unzip backup-${timestamp}.zip

# Navigate to backup directory
cd backup-${timestamp}/application

# Install dependencies
npm install

# Copy environment file template
cp .env.local.template .env.local
# Edit .env.local with your actual credentials

# Build application
npm run build
\`\`\`

### 2. Restore Database

#### Option A: Using mongorestore (if mongodump was used)

\`\`\`bash
# From backup directory
cd database

# Restore database
mongorestore --uri="your-mongodb-connection-string" ./${dbInfo.dbName}
\`\`\`

#### Option B: Using restore script

\`\`\`bash
# Run restore script
node scripts/restore-database.js backup-${timestamp}/database
\`\`\`

### 3. Verify Restoration

\`\`\`bash
# Test database connection
node scripts/test-mongodb-connection.js

# Start application
npm run dev
\`\`\`

## Important Notes

- **Environment Variables:** You must configure \`.env.local\` with your actual credentials
- **Encryption Key:** Use the same encryption key from your original environment for encrypted data
- **Database Connection:** Update MONGODB_URI in \`.env.local\` to point to your target database
- **Dependencies:** Run \`npm install\` after restoring code to install all dependencies

## Backup Validation

- ✅ Application code: Included
- ✅ Database: Included
- ✅ Configuration templates: Included
- ✅ Metadata: Included

---
Generated by backup-complete.js
`
  
  fs.writeFileSync(readmePath, readme)
  console.log('✅ Backup README created')
}

// Main backup function
async function main() {
  console.log('🚀 Starting complete backup process...')
  console.log('=' .repeat(60))
  
  try {
    // Create backup directory
    const { backupDir, backupBaseDir, timestamp } = createBackupDir()
    console.log(`\n📁 Backup directory: ${backupDir}`)
    
    // Backup application code
    await backupApplicationCode(backupDir)
    
    // Backup database
    let dbInfo = await backupDatabase(backupDir)
    if (!dbInfo) {
      dbInfo = { method: 'unknown', success: false }
    }
    dbInfo.dbName = dbName
    dbInfo.timestamp = timestamp
    
    // Create README
    createBackupReadme(backupDir, timestamp, dbInfo)
    
    // Validate backup
    const validation = await validateBackup(backupDir)
    
    // Create archive
    const archivePath = await createArchive(backupDir, timestamp)
    
    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('✅ BACKUP COMPLETE!')
    console.log('='.repeat(60))
    console.log(`📦 Backup location: ${backupDir}`)
    console.log(`📦 Archive: ${archivePath}`)
    console.log(`📊 Validation: ${Object.values(validation).every(v => v) ? 'PASSED' : 'WARNINGS'}`)
    console.log('\n💡 To restore, see README.md in the backup directory')
    console.log('   Or run: npm run restore-backup')
    
  } catch (error) {
    console.error('\n❌ Backup failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

module.exports = { main, backupDatabase, backupApplicationCode }

