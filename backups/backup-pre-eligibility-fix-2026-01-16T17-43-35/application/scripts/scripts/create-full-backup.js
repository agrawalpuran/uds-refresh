/**
 * Full Backup Script for Uniform Distribution System (UDS)
 * 
 * This script creates a complete backup of:
 * 1. Application source code
 * 2. Configuration files
 * 3. MongoDB database (full dump)
 * 
 * Backup is stored in: backups/backup-YYYY-MM-DD-HHMMSS/
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const mongoose = require('mongoose')

// Load MongoDB URI from .env.local
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
    }
  }
} catch (error) {
  console.log('Could not read .env.local, using default or environment variable')
}

// Extract database name from URI
const getDbName = (uri) => {
  const match = uri.match(/\/([^/?]+)(\?|$)/)
  return match ? match[1] : 'uniform-distribution'
}

const dbName = getDbName(MONGODB_URI)

async function createFullBackup() {
  try {
    console.log('📦 Starting Full Backup of UDS Application and Database...\n')

    // Step 1: Create backup directory with timestamp
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5) // YYYY-MM-DDTHH-MM-SS
    const dateStr = now.toISOString().split('T')[0] // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '') // HHMMSS
    
    const backupDir = path.join(__dirname, '..', 'backups', `backup-${dateStr}-${timeStr}`)
    const codeBackupDir = path.join(backupDir, 'application')
    const dbBackupDir = path.join(backupDir, 'database')
    
    // Create directories
    if (!fs.existsSync(path.join(__dirname, '..', 'backups'))) {
      fs.mkdirSync(path.join(__dirname, '..', 'backups'), { recursive: true })
    }
    fs.mkdirSync(backupDir, { recursive: true })
    fs.mkdirSync(codeBackupDir, { recursive: true })
    fs.mkdirSync(dbBackupDir, { recursive: true })
    
    console.log(`✅ Created backup directory: ${backupDir}\n`)

    // Step 2: Backup application code
    console.log('📁 Step 1: Backing up application code...')
    const appRoot = path.join(__dirname, '..')
    
    // Directories to include
    const includeDirs = [
      'app',
      'components',
      'lib',
      'public',
      'scripts',
      'styles',
      'types'
    ]
    
    // Files to include
    const includeFiles = [
      'package.json',
      'package-lock.json',
      'next.config.js',
      'tsconfig.json',
      'tailwind.config.js',
      'postcss.config.js',
      '.eslintrc.json',
      'README.md'
    ]
    
    // Copy directories
    let filesCopied = 0
    for (const dir of includeDirs) {
      const srcDir = path.join(appRoot, dir)
      const destDir = path.join(codeBackupDir, dir)
      if (fs.existsSync(srcDir)) {
        copyDirectory(srcDir, destDir)
        filesCopied += countFiles(srcDir)
        console.log(`   ✅ Copied ${dir}/`)
      }
    }
    
    // Copy files
    for (const file of includeFiles) {
      const srcFile = path.join(appRoot, file)
      const destFile = path.join(codeBackupDir, file)
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, destFile)
        filesCopied++
        console.log(`   ✅ Copied ${file}`)
      }
    }
    
    // Copy .env.local (if exists) - sanitize sensitive data
    const envFile = path.join(appRoot, '.env.local')
    if (fs.existsSync(envFile)) {
      let envContent = fs.readFileSync(envFile, 'utf8')
      // Replace actual values with placeholders for security
      envContent = envContent.replace(/MONGODB_URI=(.+)/, 'MONGODB_URI=<REDACTED>')
      envContent = envContent.replace(/NEXTAUTH_SECRET=(.+)/, 'NEXTAUTH_SECRET=<REDACTED>')
      envContent = envContent.replace(/NEXTAUTH_URL=(.+)/, 'NEXTAUTH_URL=<REDACTED>')
      fs.writeFileSync(path.join(codeBackupDir, '.env.local.example'), envContent)
      console.log(`   ✅ Copied .env.local (sanitized)`)
    }
    
    console.log(`   ✅ Application code backup complete: ${filesCopied} files\n`)

    // Step 3: Backup MongoDB database
    console.log('🗄️  Step 2: Backing up MongoDB database...')
    console.log(`   Database: ${dbName}`)
    console.log(`   URI: ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`)
    
    try {
      // Try using mongodump if available
      const mongodumpPath = 'mongodump' // Assume it's in PATH
      
      // Extract connection details for mongodump
      let mongodumpUri = MONGODB_URI
      let mongodumpArgs = []
      
      // Build mongodump command
      if (mongodumpUri.includes('@')) {
        // Has authentication
        mongodumpArgs.push(`--uri="${mongodumpUri}"`)
      } else {
        // No authentication
        const hostMatch = mongodumpUri.match(/\/\/([^\/]+)/)
        if (hostMatch) {
          const host = hostMatch[1]
          mongodumpArgs.push(`--host="${host}"`)
        }
        mongodumpArgs.push(`--db="${dbName}"`)
      }
      
      mongodumpArgs.push(`--out="${dbBackupDir}"`)
      mongodumpArgs.push('--gzip') // Compress backup
      
      console.log(`   Running: mongodump ${mongodumpArgs.join(' ')}`)
      
      try {
        execSync(`mongodump ${mongodumpArgs.join(' ')}`, {
          stdio: 'inherit',
          cwd: appRoot
        })
        console.log(`   ✅ MongoDB backup complete using mongodump\n`)
      } catch (mongodumpError) {
        console.log(`   ⚠️  mongodump not available or failed: ${mongodumpError.message}`)
        console.log(`   🔄 Falling back to code-based backup...`)
        
        // Fallback: Code-based backup
        await codeBasedDbBackup(dbBackupDir, MONGODB_URI, dbName)
      }
    } catch (error) {
      console.error(`   ❌ Database backup failed: ${error.message}`)
      throw error
    }

    // Step 4: Create backup manifest
    console.log('📋 Step 3: Creating backup manifest...')
    const manifest = {
      timestamp: now.toISOString(),
      date: dateStr,
      time: timeStr,
      backupType: 'full',
      application: {
        filesCopied: filesCopied,
        directories: includeDirs,
        files: includeFiles
      },
      database: {
        name: dbName,
        backupMethod: fs.existsSync(path.join(dbBackupDir, dbName)) ? 'mongodump' : 'code-based',
        collections: []
      },
      restoreInstructions: {
        application: 'Copy files from application/ directory to project root',
        database: 'Use mongorestore to restore database from database/ directory',
        notes: 'See RESTORE_INSTRUCTIONS.md for detailed steps'
      }
    }
    
    // List database collections if backup exists
    const dbBackupPath = path.join(dbBackupDir, dbName)
    if (fs.existsSync(dbBackupPath)) {
      const collections = fs.readdirSync(dbBackupPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
      manifest.database.collections = collections
    }
    
    fs.writeFileSync(
      path.join(backupDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    )
    console.log(`   ✅ Manifest created\n`)

    // Step 5: Create restore instructions
    console.log('📝 Step 4: Creating restore instructions...')
    const restoreInstructions = `# UDS Backup Restore Instructions

## Backup Information
- **Date:** ${dateStr} ${now.toTimeString().split(' ')[0]}
- **Backup Type:** Full (Application + Database)
- **Database:** ${dbName}

## Restore Application Code

1. Navigate to project root
2. Copy files from \`backups/backup-${dateStr}-${timeStr}/application/\` to project root
3. Restore \`.env.local\` from \`.env.local.example\` (update with actual values)
4. Run \`npm install\` to restore dependencies
5. Restart the application

## Restore Database

### Option 1: Using mongorestore (Recommended)

\`\`\`bash
mongorestore --uri="${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//<username>:<password>@')}" --db="${dbName}" --dir="backups/backup-${dateStr}-${timeStr}/database/${dbName}" --gzip
\`\`\`

### Option 2: Using MongoDB Compass

1. Open MongoDB Compass
2. Connect to your database
3. Use the Import feature to import collections from the backup directory

### Option 3: Manual Collection Import

If you need to restore specific collections, use:

\`\`\`bash
mongorestore --uri="${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//<username>:<password>@')}" --db="${dbName}" --collection="<collection_name>" --dir="backups/backup-${dateStr}-${timeStr}/database/${dbName}/<collection_name>" --gzip
\`\`\`

## Verification

After restore, verify:
1. Application starts without errors
2. Database collections are restored
3. Data integrity is maintained
4. All indexes are recreated

## Notes

- This backup includes application code and database
- Configuration files are sanitized (sensitive data removed)
- Database backup is compressed (gzip)
- Always test restore in a non-production environment first
`
    
    fs.writeFileSync(
      path.join(backupDir, 'RESTORE_INSTRUCTIONS.md'),
      restoreInstructions
    )
    console.log(`   ✅ Restore instructions created\n`)

    // Step 6: Calculate backup size
    const backupSize = getDirectorySize(backupDir)
    const backupSizeMB = (backupSize / (1024 * 1024)).toFixed(2)
    
    console.log('📊 Backup Summary:')
    console.log(`   ✅ Backup Location: ${backupDir}`)
    console.log(`   ✅ Application Files: ${filesCopied} files`)
    console.log(`   ✅ Database: ${dbName}`)
    console.log(`   ✅ Backup Size: ${backupSizeMB} MB`)
    console.log(`   ✅ Timestamp: ${now.toISOString()}`)
    console.log('')
    console.log('✅ Full backup completed successfully!')
    console.log('')
    console.log('📋 Next Steps:')
    console.log(`   1. Verify backup at: ${backupDir}`)
    console.log(`   2. Review restore instructions: ${path.join(backupDir, 'RESTORE_INSTRUCTIONS.md')}`)
    console.log(`   3. Store backup in a safe location`)

  } catch (error) {
    console.error('\n❌ Backup failed:', error)
    throw error
  }
}

// Helper function to copy directory recursively
function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true })
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    
    // Skip node_modules, .next, and other build artifacts
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git' || entry.name === 'backups') {
      continue
    }
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// Helper function to count files
function countFiles(dir) {
  let count = 0
  if (!fs.existsSync(dir)) return 0
  
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== '.git' && entry.name !== 'backups') {
        count += countFiles(path.join(dir, entry.name))
      }
    } else {
      count++
    }
  }
  return count
}

// Helper function to get directory size
function getDirectorySize(dir) {
  let size = 0
  if (!fs.existsSync(dir)) return 0
  
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      size += getDirectorySize(entryPath)
    } else {
      try {
        const stats = fs.statSync(entryPath)
        size += stats.size
      } catch (err) {
        // Ignore errors
      }
    }
  }
  return size
}

// Code-based database backup (fallback when mongodump is not available)
async function codeBasedDbBackup(backupDir, uri, dbName) {
  try {
    console.log(`   Connecting to MongoDB...`)
    await mongoose.connect(uri)
    console.log(`   ✅ Connected to MongoDB`)
    
    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }
    
    // Get all collections
    const collections = await db.listCollections().toArray()
    console.log(`   Found ${collections.length} collections`)
    
    const dbBackupPath = path.join(backupDir, dbName)
    fs.mkdirSync(dbBackupPath, { recursive: true })
    
    let totalDocuments = 0
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name
      console.log(`   Backing up collection: ${collectionName}...`)
      
      const collection = db.collection(collectionName)
      const documents = await collection.find({}).toArray()
      
      // Save as JSON
      const jsonPath = path.join(dbBackupPath, `${collectionName}.json`)
      fs.writeFileSync(jsonPath, JSON.stringify(documents, null, 2))
      
      totalDocuments += documents.length
      console.log(`     ✅ ${collectionName}: ${documents.length} documents`)
    }
    
    console.log(`   ✅ Code-based backup complete: ${totalDocuments} total documents`)
    await mongoose.disconnect()
  } catch (error) {
    console.error(`   ❌ Code-based backup failed: ${error.message}`)
    throw error
  }
}

// Run the backup
createFullBackup()
  .then(() => {
    console.log('\n✅ Backup script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Backup script failed:', error)
    process.exit(1)
  })

