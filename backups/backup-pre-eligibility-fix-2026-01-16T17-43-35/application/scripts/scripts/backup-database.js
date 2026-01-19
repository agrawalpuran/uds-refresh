const mongoose = require('mongoose')
const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Extract database name from URI
const dbName = MONGODB_URI.split('/').pop().split('?')[0] || 'uniform-distribution'
const dbHost = MONGODB_URI.includes('@') 
  ? MONGODB_URI.split('@')[1].split('/')[0] 
  : MONGODB_URI.split('//')[1].split('/')[0].split('?')[0] || 'localhost:27017'

async function backupDatabase() {
  try {
    console.log('Creating MongoDB database backup...')
    console.log(`Database: ${dbName}`)
    console.log(`Host: ${dbHost}`)

    // Create backup directory
    const projectRoot = path.resolve(__dirname, '..')
    const parentDir = path.resolve(projectRoot, '..')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupDir = path.join(parentDir, `mongodb-backup-${timestamp}`)
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    console.log(`Backup directory: ${backupDir}`)

    // Check if mongodump is available
    exec('mongodump --version', (error) => {
      if (error) {
        console.error('❌ mongodump not found. Please install MongoDB Database Tools.')
        console.error('   Download from: https://www.mongodb.com/try/download/database-tools')
        console.error('\nAlternatively, you can use the code-based backup method...')
        codeBasedBackup(backupDir)
        return
      }

      // Use mongodump for backup
      const dumpCommand = `mongodump --uri="${MONGODB_URI}" --out="${backupDir}"`
      
      console.log('\nRunning mongodump...')
      exec(dumpCommand, (error, stdout, stderr) => {
        if (error) {
          console.error('❌ Error running mongodump:', error.message)
          console.error('Trying code-based backup method...')
          codeBasedBackup(backupDir)
          return
        }
        
        console.log(stdout)
        if (stderr) console.error(stderr)
        
        console.log('\n✅ MongoDB backup created successfully!')
        console.log(`📁 Backup location: ${backupDir}`)
        console.log('\nTo restore, use:')
        console.log(`mongorestore --uri="${MONGODB_URI}" "${path.join(backupDir, dbName)}"`)
        
        process.exit(0)
      })
    })
  } catch (error) {
    console.error('❌ Error creating database backup:', error)
    process.exit(1)
  }
}

async function codeBasedBackup(backupDir) {
  try {
    console.log('\nUsing code-based backup method...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Get all collections
    const db = mongoose.connection.db
    const collections = await db.listCollections().toArray()
    
    const backupData = {}
    
    for (const collection of collections) {
      const collectionName = collection.name
      console.log(`Backing up collection: ${collectionName}`)
      
      const data = await db.collection(collectionName).find({}).toArray()
      backupData[collectionName] = data
      
      console.log(`  ✓ Backed up ${data.length} documents`)
    }

    // Save to JSON file
    const backupFile = path.join(backupDir, 'database-backup.json')
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2))
    
    console.log(`\n✅ Database backup saved to: ${backupFile}`)
    console.log(`📊 Total collections: ${collections.length}`)
    
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error in code-based backup:', error)
    process.exit(1)
  }
}

backupDatabase()






