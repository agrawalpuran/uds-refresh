const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from env.local
const envPath = path.join(__dirname, '..', 'env.local')
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8')
  envFile.split('\n').forEach(line => {
    // Skip comments and empty lines
    const trimmedLine = line.trim()
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const match = trimmedLine.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()
        // Remove quotes if present
        value = value.replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Get backup file path from command line argument
const backupFilePath = process.argv[2]

if (!backupFilePath) {
  console.error('❌ Please provide the backup file path')
  console.error('Usage: node scripts/restore-database.js <path-to-backup.json>')
  process.exit(1)
}

if (!fs.existsSync(backupFilePath)) {
  console.error(`❌ Backup file not found: ${backupFilePath}`)
  process.exit(1)
}

async function restoreDatabase() {
  try {
    console.log('Restoring MongoDB database from backup...')
    console.log(`Backup file: ${backupFilePath}`)
    
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Read backup file
    const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'))
    
    const db = mongoose.connection.db
    
    // Restore each collection
    for (const [collectionName, documents] of Object.entries(backupData)) {
      console.log(`\nRestoring collection: ${collectionName}`)
      
      // Drop existing collection (optional - comment out if you want to merge)
      try {
        await db.collection(collectionName).drop()
        console.log(`  ✓ Dropped existing collection`)
      } catch (error) {
        // Collection might not exist, which is fine
      }
      
      // Insert documents
      if (documents.length > 0) {
        await db.collection(collectionName).insertMany(documents)
        console.log(`  ✓ Restored ${documents.length} documents`)
      } else {
        console.log(`  ⚠️ No documents to restore`)
      }
    }
    
    console.log('\n✅ Database restored successfully!')
    
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error restoring database:', error)
    process.exit(1)
  }
}

restoreDatabase()






