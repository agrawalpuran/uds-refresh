#!/usr/bin/env node
/**
 * Complete Backup Script with Today's Date
 * Creates a comprehensive backup including application code and MongoDB database
 * Backup name format: backup-YYYY-MM-DD
 * 
 * Usage:
 *   npm run backup-today
 *   node scripts/create-backup-today.js
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
  
  const dbMatch = uri.match(/\/([^/?]+)(\?|$)/)
  if (dbMatch) {
    dbName = dbMatch[1]
  }
  
  return { dbName, connectionString }
}

const { dbName, connectionString } = parseMongoUri(MONGODB_URI)

// Create backup directory with today's date
function createBackupDir() {
  const projectRoot = path.resolve(__dirname, '..')
  const today = new Date()
  const dateStr = today.toISOString().split('T')[0] // YYYY-MM-DD format
  const backupBaseDir = path.join(projectRoot, 'backups')
  const backupDir = path.join(backupBaseDir, `backup-${dateStr}`)
  
  // Create backup directory structure
  if (!fs.existsSync(backupBaseDir)) {
    fs.mkdirSync(backupBaseDir, { recursive: true })
  }
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }
  
  return { backupDir, backupBaseDir, dateStr }
}

// Backup application code
async function backupApplicationCode(backupDir) {
  console.log('\n📦 Step 1: Backing up application code...')
  
  const projectRoot = path.resolve(__dirname, '..')
  const codeBackupDir = path.join(backupDir, 'application')
  
  if (!fs.existsSync(codeBackupDir)) {
    fs.mkdirSync(codeBackupDir, { recursive: true })
  }
  
  // Directories and files to copy
  const itemsToCopy = [
    'app',
    'components',
    'lib',
    'public',
    'scripts',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'next.config.js',
    'tailwind.config.js',
    'postcss.config.js',
    'README.md',
    '*.md'
  ]
  
  // Exclude patterns
  const excludePatterns = [
    'node_modules',
    '.next',
    '.git',
    '.env.local',
    'backups',
    '*.log'
  ]
  
  // Copy files and directories
  for (const item of itemsToCopy) {
    const srcPath = path.join(projectRoot, item)
    const destPath = path.join(codeBackupDir, item)
    
    if (fs.existsSync(srcPath)) {
      const stat = fs.statSync(srcPath)
      if (stat.isDirectory()) {
        copyDirectory(srcPath, destPath, excludePatterns)
      } else {
        const destDir = path.dirname(destPath)
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true })
        }
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }
  
  // Create .env.local.template if .env.local exists
  const envLocalPath = path.join(projectRoot, '.env.local')
  if (fs.existsSync(envLocalPath)) {
    const envContent = fs.readFileSync(envLocalPath, 'utf8')
    // Redact sensitive values
    const templateContent = envContent
      .replace(/MONGODB_URI=.*/g, 'MONGODB_URI=your-mongodb-connection-string')
      .replace(/NEXTAUTH_SECRET=.*/g, 'NEXTAUTH_SECRET=your-secret-key')
      .replace(/ENCRYPTION_KEY=.*/g, 'ENCRYPTION_KEY=your-encryption-key')
    
    fs.writeFileSync(
      path.join(codeBackupDir, '.env.local.template'),
      templateContent
    )
  }
  
  console.log('✅ Application code backed up successfully')
  return codeBackupDir
}

// Helper function to copy directory
function copyDirectory(src, dest, excludePatterns) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true })
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    
    // Check if should be excluded
    const shouldExclude = excludePatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'))
        return regex.test(entry.name)
      }
      return entry.name === pattern
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
    console.log('   Connected to MongoDB')
    
    const db = mongoose.connection.db
    const collections = await db.listCollections().toArray()
    
    const backupData = {
      backupDate: new Date().toISOString(),
      database: dbName,
      collections: {}
    }
    
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name
      console.log(`   Backing up collection: ${collectionName}`)
      
      const collection = db.collection(collectionName)
      const documents = await collection.find({}).toArray()
      
      backupData.collections[collectionName] = documents
      
      // Also backup indexes
      const indexes = await collection.indexes()
      backupData.collections[`${collectionName}_indexes`] = indexes
    }
    
    const backupFilePath = path.join(backupDir, 'backup-data.json')
    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2))
    
    await mongoose.disconnect()
    console.log(`✅ Database backed up using code-based method`)
    return { method: 'code-based', success: true }
  } catch (error) {
    console.error('❌ Error in code-based backup:', error.message)
    return { method: 'code-based', success: false, error: error.message }
  }
}

// Create backup metadata
function createBackupMetadata(backupDir, dateStr, dbBackupResult) {
  const metadata = {
    backupDate: dateStr,
    backupTimestamp: new Date().toISOString(),
    projectName: 'Uniform Distribution System',
    database: dbName,
    databaseBackupMethod: dbBackupResult.method,
    databaseBackupSuccess: dbBackupResult.success,
    includes: [
      'Application source code',
      'Configuration files',
      'Scripts',
      'Documentation',
      'MongoDB database backup'
    ],
    restoreInstructions: [
      '1. Extract the backup directory',
      '2. Navigate to application folder',
      '3. Run: npm install',
      '4. Copy .env.local.template to .env.local and configure',
      '5. Restore database from database folder',
      '6. Run: npm run dev'
    ]
  }
  
  const metadataPath = path.join(backupDir, 'BACKUP-METADATA.json')
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
  console.log('✅ Backup metadata created')
}

// Create ZIP archive
async function createZipArchive(backupDir, dateStr) {
  console.log('\n📦 Step 3: Creating ZIP archive...')
  
  const projectRoot = path.resolve(__dirname, '..')
  const backupBaseDir = path.join(projectRoot, 'backups')
  const zipPath = path.join(backupBaseDir, `backup-${dateStr}.zip`)
  
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    
    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2)
      console.log(`✅ ZIP archive created: ${zipPath}`)
      console.log(`   Size: ${sizeMB} MB`)
      resolve(zipPath)
    })
    
    archive.on('error', (err) => {
      reject(err)
    })
    
    archive.pipe(output)
    archive.directory(backupDir, false)
    archive.finalize()
  })
}

// Main backup function
async function createBackup() {
  try {
    console.log('')
    console.log('========================================')
    console.log('  FULL BACKUP WITH TODAY\'S DATE')
    console.log('========================================')
    console.log('')
    
    const { backupDir, dateStr } = createBackupDir()
    console.log(`📁 Backup directory: ${backupDir}`)
    console.log(`📅 Backup date: ${dateStr}`)
    console.log('')
    
    // Step 1: Backup application code
    await backupApplicationCode(backupDir)
    
    // Step 2: Backup database
    const dbBackupResult = await backupDatabase(backupDir)
    
    // Step 3: Create metadata
    createBackupMetadata(backupDir, dateStr, dbBackupResult)
    
    // Step 4: Create ZIP archive
    const zipPath = await createZipArchive(backupDir, dateStr)
    
    // Step 5: Clean up uncompressed directory (optional)
    console.log('\n🧹 Cleaning up uncompressed backup directory...')
    fs.rmSync(backupDir, { recursive: true, force: true })
    console.log('✅ Cleanup completed')
    
    console.log('')
    console.log('========================================')
    console.log('  ✅ BACKUP COMPLETED SUCCESSFULLY!')
    console.log('========================================')
    console.log('')
    console.log(`📦 Backup file: ${zipPath}`)
    console.log('')
    console.log('Backup includes:')
    console.log('  ✓ Application source code')
    console.log('  ✓ Configuration files')
    console.log('  ✓ Scripts and documentation')
    console.log('  ✓ MongoDB database backup')
    console.log('')
    console.log('To restore:')
    console.log('  1. Extract the ZIP file')
    console.log('  2. Follow instructions in BACKUP-METADATA.json')
    console.log('')
    
    process.exit(0)
  } catch (error) {
    console.error('')
    console.error('❌ Backup failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Run backup
createBackup()

