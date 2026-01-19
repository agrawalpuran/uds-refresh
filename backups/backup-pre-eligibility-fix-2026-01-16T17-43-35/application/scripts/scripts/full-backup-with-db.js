/**
 * Full Backup Script - Application Filesystem + MongoDB Database
 * Creates a complete backup with timestamp: backup-YYYY-MM-DD_HH-MM-SS
 * 
 * Usage: node scripts/full-backup-with-db.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { MongoClient } = require('mongodb')

// Get timestamp for backup folder name
const now = new Date()
const timestamp = now.toISOString().replace(/:/g, '-').split('.')[0].replace('T', '_')
const backupDirName = `backup-${timestamp}`
const backupRoot = path.join(__dirname, '..', 'backups', backupDirName)

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Directories/files to exclude from backup
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.next',
  '.git',
  'backups',
  '.env.local',
  '.env',
  '*.log',
  'npm-debug.log*',
  'yarn-debug.log*',
  'yarn-error.log*',
  '.DS_Store',
  '*.pem',
  '.vercel',
  'dist',
  'build',
  'coverage',
  '.pnp',
  '.pnp.js'
]

console.log('='.repeat(80))
console.log('FULL BACKUP - APPLICATION + DATABASE')
console.log('='.repeat(80))
console.log('')
console.log(`Backup Directory: ${backupDirName}`)
console.log(`Timestamp: ${timestamp}`)
console.log(`Full Path: ${backupRoot}`)
console.log('')

// Create backup directory structure
function createBackupStructure() {
  console.log('📁 Creating backup directory structure...')
  
  if (!fs.existsSync(backupRoot)) {
    fs.mkdirSync(backupRoot, { recursive: true })
  }
  
  const applicationDir = path.join(backupRoot, 'application')
  const databaseDir = path.join(backupRoot, 'database')
  
  if (!fs.existsSync(applicationDir)) {
    fs.mkdirSync(applicationDir, { recursive: true })
  }
  
  if (!fs.existsSync(databaseDir)) {
    fs.mkdirSync(databaseDir, { recursive: true })
  }
  
  console.log('✅ Backup directory structure created')
  console.log('')
  
  return { applicationDir, databaseDir }
}

// Check if path should be excluded
function shouldExclude(filePath, rootPath) {
  const relativePath = path.relative(rootPath, filePath)
  
  for (const pattern of EXCLUDE_PATTERNS) {
    // Handle wildcards
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'))
      if (regex.test(relativePath) || regex.test(path.basename(filePath))) {
        return true
      }
    } else {
      // Exact match or directory match
      if (relativePath.includes(pattern) || path.basename(filePath) === pattern) {
        return true
      }
    }
  }
  
  return false
}

// Copy directory recursively
function copyDirectory(src, dest, rootPath) {
  if (!fs.existsSync(src)) {
    return
  }
  
  const stats = fs.statSync(src)
  
  if (stats.isDirectory()) {
    // Create destination directory
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true })
    }
    
    // Copy contents
    const entries = fs.readdirSync(src)
    for (const entry of entries) {
      const srcPath = path.join(src, entry)
      const destPath = path.join(dest, entry)
      
      if (!shouldExclude(srcPath, rootPath)) {
        copyDirectory(srcPath, destPath, rootPath)
      }
    }
  } else {
    // Copy file
    fs.copyFileSync(src, dest)
  }
}

// Backup application filesystem
function backupApplication(applicationDir) {
  console.log('📦 Backing up application filesystem...')
  
  const projectRoot = path.join(__dirname, '..')
  const startTime = Date.now()
  
  // Copy all files and directories
  const entries = fs.readdirSync(projectRoot)
  let filesCopied = 0
  let dirsCopied = 0
  
  for (const entry of entries) {
    const srcPath = path.join(projectRoot, entry)
    const destPath = path.join(applicationDir, entry)
    
    if (!shouldExclude(srcPath, projectRoot)) {
      try {
        const stats = fs.statSync(srcPath)
        if (stats.isDirectory()) {
          copyDirectory(srcPath, destPath, projectRoot)
          dirsCopied++
        } else {
          fs.copyFileSync(srcPath, destPath)
          filesCopied++
        }
      } catch (error) {
        console.warn(`⚠️  Warning: Could not copy ${entry}: ${error.message}`)
      }
    }
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(`✅ Application backup completed in ${duration}s`)
  console.log(`   Files copied: ${filesCopied}`)
  console.log(`   Directories copied: ${dirsCopied}`)
  console.log('')
}

// Backup MongoDB database
async function backupDatabase(databaseDir) {
  console.log('💾 Backing up MongoDB database...')
  
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    const db = client.db()
    const dbName = db.databaseName
    
    console.log(`   Database: ${dbName}`)
    console.log(`   URI: ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`)
    console.log('')
    
    // Get all collections
    const collections = await db.listCollections().toArray()
    console.log(`   Found ${collections.length} collections`)
    console.log('')
    
    const backupData = {
      database: dbName,
      timestamp: timestamp,
      backupDate: now.toISOString(),
      collections: []
    }
    
    let totalDocuments = 0
    
    // Backup each collection
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name
      console.log(`   📄 Backing up collection: ${collectionName}...`)
      
      const collection = db.collection(collectionName)
      const documents = await collection.find({}).toArray()
      const count = documents.length
      totalDocuments += count
      
      // Save to JSON file
      const collectionFile = path.join(databaseDir, `${collectionName}.json`)
      fs.writeFileSync(collectionFile, JSON.stringify(documents, null, 2), 'utf8')
      
      backupData.collections.push({
        name: collectionName,
        documentCount: count,
        file: `${collectionName}.json`
      })
      
      console.log(`      ✅ ${count} documents backed up`)
    }
    
    // Save backup metadata
    const metadataFile = path.join(databaseDir, 'backup-metadata.json')
    fs.writeFileSync(metadataFile, JSON.stringify(backupData, null, 2), 'utf8')
    
    console.log('')
    console.log(`✅ Database backup completed`)
    console.log(`   Total collections: ${collections.length}`)
    console.log(`   Total documents: ${totalDocuments}`)
    console.log('')
    
    return backupData
    
  } catch (error) {
    console.error('❌ Database backup failed:', error.message)
    throw error
  } finally {
    await client.close()
  }
}

// Create backup manifest
function createManifest(applicationDir, databaseDir, dbInfo) {
  console.log('📋 Creating backup manifest...')
  
  const manifest = {
    backupType: 'full',
    timestamp: timestamp,
    backupDate: now.toISOString(),
    backupDateReadable: now.toLocaleString(),
    application: {
      source: path.join(__dirname, '..'),
      destination: applicationDir,
      excluded: EXCLUDE_PATTERNS
    },
    database: {
      uri: MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'),
      destination: databaseDir,
      ...dbInfo
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    }
  }
  
  const manifestFile = path.join(backupRoot, 'BACKUP_MANIFEST.json')
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8')
  
  console.log('✅ Manifest created')
  console.log('')
  
  return manifest
}

// Calculate backup size
function calculateBackupSize(dir) {
  let totalSize = 0
  
  function getSize(filePath) {
    const stats = fs.statSync(filePath)
    if (stats.isDirectory()) {
      const entries = fs.readdirSync(filePath)
      for (const entry of entries) {
        getSize(path.join(filePath, entry))
      }
    } else {
      totalSize += stats.size
    }
  }
  
  try {
    getSize(dir)
  } catch (error) {
    // Ignore errors
  }
  
  return totalSize
}

// Format file size
function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`
}

// Main backup function
async function performFullBackup() {
  const startTime = Date.now()
  
  try {
    // Create backup structure
    const { applicationDir, databaseDir } = createBackupStructure()
    
    // Backup application
    backupApplication(applicationDir)
    
    // Backup database
    const dbInfo = await backupDatabase(databaseDir)
    
    // Create manifest
    const manifest = createManifest(applicationDir, databaseDir, dbInfo)
    
    // Calculate backup size
    console.log('📊 Calculating backup size...')
    const backupSize = calculateBackupSize(backupRoot)
    console.log(`   Total backup size: ${formatSize(backupSize)}`)
    console.log('')
    
    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    
    console.log('='.repeat(80))
    console.log('✅ FULL BACKUP COMPLETED SUCCESSFULLY')
    console.log('='.repeat(80))
    console.log('')
    console.log(`Backup Location: ${backupRoot}`)
    console.log(`Backup Size: ${formatSize(backupSize)}`)
    console.log(`Duration: ${duration}s`)
    console.log(`Timestamp: ${timestamp}`)
    console.log('')
    console.log('Backup Contents:')
    console.log(`  📦 Application: ${applicationDir}`)
    console.log(`  💾 Database: ${databaseDir}`)
    console.log(`  📋 Manifest: ${path.join(backupRoot, 'BACKUP_MANIFEST.json')}`)
    console.log('')
    console.log('='.repeat(80))
    
  } catch (error) {
    console.error('')
    console.error('='.repeat(80))
    console.error('❌ BACKUP FAILED')
    console.error('='.repeat(80))
    console.error('')
    console.error('Error:', error.message)
    console.error('')
    console.error('Stack:', error.stack)
    console.error('')
    process.exit(1)
  }
}

// Run backup
performFullBackup()

