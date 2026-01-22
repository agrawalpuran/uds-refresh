/**
 * Full Application and Database Backup Script
 * 
 * This script creates a complete backup of:
 * - Application source code (excluding node_modules, .next, etc.)
 * - MongoDB database dump
 * - Configuration files
 * 
 * Backup is stored in: backups/backup-YYYY-MM-DD_HH-MM-SS/
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const mongoose = require('mongoose')

// Get current date/time for backup folder name
const now = new Date()
const timestamp = now.toISOString().replace(/:/g, '-').split('.')[0].replace('T', '_')
const dateStr = now.toISOString().split('T')[0] // YYYY-MM-DD

// Backup directory structure
const backupRoot = path.join(__dirname, '..', 'backups')
const backupDir = path.join(backupRoot, `backup-${timestamp}`)
const appBackupDir = path.join(backupDir, 'application')
const dbBackupDir = path.join(backupDir, 'database')

// Load environment variables
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
let DB_NAME = 'uniform-distribution'

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
      // Extract database name from URI
      const dbMatch = MONGODB_URI.match(/\/([^/?]+)(\?|$)/)
      if (dbMatch) {
        DB_NAME = dbMatch[1]
      }
    }
  }
} catch (error) {
  console.log('Could not read .env.local, using defaults')
}

// Extract connection details for mongodump
function getMongoConnectionDetails() {
  try {
    const uri = new URL(MONGODB_URI)
    return {
      host: uri.hostname || 'localhost',
      port: uri.port || '27017',
      database: DB_NAME,
      username: uri.username || null,
      password: uri.password || null,
      authSource: uri.searchParams.get('authSource') || 'admin'
    }
  } catch (error) {
    // If URI parsing fails, assume local connection
    return {
      host: 'localhost',
      port: '27017',
      database: DB_NAME,
      username: null,
      password: null,
      authSource: 'admin'
    }
  }
}

// Files and directories to exclude from backup
const excludePatterns = [
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  '.git',
  '.DS_Store',
  '*.log',
  '*.tsbuildinfo',
  'coverage',
  '.env.local',
  '.env',
  'backups',
  '.cache',
  'tmp',
  'temp'
]

// Directories to include (relative to project root)
const includeDirs = [
  'app',
  'components',
  'lib',
  'public',
  'scripts',
  'styles',
  'types',
  'config',
  'middleware',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'next.config.js',
  'next.config.ts',
  'tailwind.config.js',
  'tailwind.config.ts',
  'postcss.config.js',
  'README.md',
  '.gitignore',
  '.eslintrc.json',
  '.eslintrc.js',
  '.prettierrc',
  '.prettierignore'
]

function shouldExclude(filePath, rootPath) {
  const relativePath = path.relative(rootPath, filePath)
  return excludePatterns.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'))
      return regex.test(relativePath) || relativePath.includes(pattern.replace('*', ''))
    }
    return relativePath.includes(pattern) || relativePath.split(path.sep).includes(pattern)
  })
}

function copyDirectory(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`⚠️  Source directory does not exist: ${src}`)
    return
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }

  const entries = fs.readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (shouldExclude(srcPath, path.dirname(src))) {
      console.log(`⏭️  Excluding: ${entry.name}`)
      continue
    }

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath)
    } else {
      try {
        fs.copyFileSync(srcPath, destPath)
        console.log(`✅ Copied: ${entry.name}`)
      } catch (error) {
        console.error(`❌ Error copying ${entry.name}:`, error.message)
      }
    }
  }
}

function backupApplication() {
  console.log('\n📦 Starting Application Backup...')
  console.log(`📁 Backup directory: ${backupDir}`)

  // Create backup directories
  if (!fs.existsSync(backupRoot)) {
    fs.mkdirSync(backupRoot, { recursive: true })
  }
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }
  if (!fs.existsSync(appBackupDir)) {
    fs.mkdirSync(appBackupDir, { recursive: true })
  }

  const projectRoot = path.join(__dirname, '..')

  // Copy included directories and files
  console.log('\n📋 Copying application files...')
  for (const item of includeDirs) {
    const srcPath = path.join(projectRoot, item)
    const destPath = path.join(appBackupDir, item)

    if (fs.existsSync(srcPath)) {
      const stat = fs.statSync(srcPath)
      if (stat.isDirectory()) {
        console.log(`📁 Copying directory: ${item}`)
        copyDirectory(srcPath, destPath)
      } else {
        console.log(`📄 Copying file: ${item}`)
        try {
          fs.copyFileSync(srcPath, destPath)
          console.log(`✅ Copied: ${item}`)
        } catch (error) {
          console.error(`❌ Error copying ${item}:`, error.message)
        }
      }
    } else {
      console.log(`⚠️  Not found: ${item}`)
    }
  }

  // Create backup info file
  const backupInfo = {
    timestamp: timestamp,
    date: dateStr,
    backupType: 'full',
    includes: {
      application: true,
      database: true
    },
    excluded: excludePatterns,
    included: includeDirs,
    nodeVersion: process.version,
    platform: process.platform
  }

  fs.writeFileSync(
    path.join(backupDir, 'backup-info.json'),
    JSON.stringify(backupInfo, null, 2)
  )

  console.log('\n✅ Application backup completed!')
  return true
}

async function backupDatabase() {
  console.log('\n🗄️  Starting Database Backup...')

  if (!fs.existsSync(dbBackupDir)) {
    fs.mkdirSync(dbBackupDir, { recursive: true })
  }

  const connDetails = getMongoConnectionDetails()
  console.log(`📊 Database: ${connDetails.database}`)
  console.log(`🔌 Host: ${connDetails.host}:${connDetails.port}`)

  try {
    // Build mongodump command
    let mongodumpCmd = `mongodump --db ${connDetails.database} --out "${dbBackupDir}"`

    if (connDetails.host !== 'localhost' || connDetails.port !== '27017') {
      mongodumpCmd += ` --host ${connDetails.host}`
      if (connDetails.port) {
        mongodumpCmd += `:${connDetails.port}`
      }
    }

    if (connDetails.username && connDetails.password) {
      mongodumpCmd += ` --username ${connDetails.username} --password ${connDetails.password} --authenticationDatabase ${connDetails.authSource}`
    }

    console.log(`\n🔄 Running mongodump...`)
    console.log(`Command: ${mongodumpCmd.replace(/--password\s+\S+/, '--password ***')}`)

    execSync(mongodumpCmd, { stdio: 'inherit' })

    console.log('\n✅ Database backup completed!')
    return true
  } catch (error) {
    console.error('\n❌ Database backup failed:', error.message)
    console.log('\n⚠️  Attempting alternative backup method...')

    // Alternative: Try using mongoose to export data
    try {
      await mongoose.connect(MONGODB_URI)
      console.log('✅ Connected to MongoDB via Mongoose')

      const db = mongoose.connection.db
      const collections = await db.listCollections().toArray()

      console.log(`📊 Found ${collections.length} collections`)

      const collectionBackupDir = path.join(dbBackupDir, 'collections')
      if (!fs.existsSync(collectionBackupDir)) {
        fs.mkdirSync(collectionBackupDir, { recursive: true })
      }

      for (const collection of collections) {
        const collectionName = collection.name
        console.log(`📦 Backing up collection: ${collectionName}`)

        const data = await db.collection(collectionName).find({}).toArray()
        const backupPath = path.join(collectionBackupDir, `${collectionName}.json`)

        fs.writeFileSync(
          backupPath,
          JSON.stringify(data, null, 2)
        )

        console.log(`✅ Backed up ${data.length} documents from ${collectionName}`)
      }

      await mongoose.connection.close()
      console.log('\n✅ Alternative database backup completed!')
      return true
    } catch (altError) {
      console.error('\n❌ Alternative backup method also failed:', altError.message)
      return false
    }
  }
}

async function createBackupArchive() {
  console.log('\n📦 Creating backup archive...')

  try {
    const archiveName = `backup-${timestamp}.zip`
    const archivePath = path.join(backupRoot, archiveName)

    // Check if zip command is available
    try {
      execSync('zip --version', { stdio: 'ignore' })
      
      const zipCmd = `cd "${backupDir}" && zip -r "${archivePath}" . -x "*.log" "*.tmp"`
      console.log(`🔄 Creating ZIP archive: ${archiveName}`)
      execSync(zipCmd, { stdio: 'inherit' })
      
      console.log(`✅ Archive created: ${archivePath}`)
      return archivePath
    } catch (error) {
      console.log('⚠️  ZIP command not available, skipping archive creation')
      return null
    }
  } catch (error) {
    console.error('❌ Archive creation failed:', error.message)
    return null
  }
}

async function main() {
  console.log('🚀 Starting Full Application and Database Backup')
  console.log(`📅 Date: ${dateStr}`)
  console.log(`⏰ Timestamp: ${timestamp}`)
  console.log('=' .repeat(60))

  try {
    // Backup application
    const appBackupSuccess = backupApplication()

    // Backup database
    const dbBackupSuccess = await backupDatabase()

    // Create archive (optional)
    const archivePath = await createBackupArchive()

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 BACKUP SUMMARY')
    console.log('='.repeat(60))
    console.log(`📁 Backup Location: ${backupDir}`)
    console.log(`📦 Application: ${appBackupSuccess ? '✅ Success' : '❌ Failed'}`)
    console.log(`🗄️  Database: ${dbBackupSuccess ? '✅ Success' : '❌ Failed'}`)
    if (archivePath) {
      console.log(`📦 Archive: ✅ ${archivePath}`)
    }
    console.log(`\n💾 Backup Size: ${getDirectorySize(backupDir)}`)

    if (appBackupSuccess && dbBackupSuccess) {
      console.log('\n✅ Full backup completed successfully!')
      process.exit(0)
    } else {
      console.log('\n⚠️  Backup completed with some errors')
      process.exit(1)
    }
  } catch (error) {
    console.error('\n❌ Backup failed:', error)
    process.exit(1)
  }
}

function getDirectorySize(dirPath) {
  let totalSize = 0
  try {
    function calculateSize(currentPath) {
      const stat = fs.statSync(currentPath)
      if (stat.isFile()) {
        totalSize += stat.size
      } else if (stat.isDirectory()) {
        const files = fs.readdirSync(currentPath)
        files.forEach(file => {
          calculateSize(path.join(currentPath, file))
        })
      }
    }
    calculateSize(dirPath)
    return formatBytes(totalSize)
  } catch (error) {
    return 'Unknown'
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

// Run the backup
if (require.main === module) {
  main()
}

module.exports = { main, backupApplication, backupDatabase }

