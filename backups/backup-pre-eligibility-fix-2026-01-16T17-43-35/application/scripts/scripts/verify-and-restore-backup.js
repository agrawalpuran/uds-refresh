const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8')
  envFile.split('\n').forEach(line => {
    const trimmedLine = line.trim()
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const match = trimmedLine.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim().replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
const BACKUP_PATH = 'C:\\Users\\pagrawal\\OneDrive - CSG Systems Inc\\Personal\\Cursor AI\\mongodb-backup-2025-11-28T15-25-12\\database-backup.json'

async function verifyAndRestore() {
  try {
    console.log('📦 Checking backup file...')
    if (!fs.existsSync(BACKUP_PATH)) {
      console.error(`❌ Backup file not found: ${BACKUP_PATH}`)
      process.exit(1)
    }
    
    const backupData = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'))
    console.log('✅ Backup file loaded\n')
    
    console.log('📊 Backup Collections:')
    Object.keys(backupData).forEach(col => {
      console.log(`   ${col}: ${backupData[col].length} documents`)
    })
    
    if (backupData.employees) {
      console.log('\n📋 Sample employees from backup:')
      backupData.employees.slice(0, 5).forEach(emp => {
        console.log(`   - ${emp.employeeId || emp.id}: ${emp.firstName || 'N/A'} ${emp.lastName || 'N/A'} (Company: ${emp.companyName || 'N/A'})`)
      })
    }
    
    console.log('\n🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')
    
    const db = mongoose.connection.db
    
    console.log('📊 Current Database Collections:')
    const collections = await db.listCollections().toArray()
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments()
      console.log(`   ${col.name}: ${count} documents`)
    }
    
    // Check employees
    const currentEmployees = await db.collection('employees').find({}).toArray()
    console.log(`\n📋 Current employees in database: ${currentEmployees.length}`)
    if (currentEmployees.length > 0) {
      console.log('Sample employees:')
      currentEmployees.slice(0, 5).forEach(emp => {
        console.log(`   - ${emp.employeeId || emp.id}: ${emp.firstName || 'N/A'} ${emp.lastName || 'N/A'}`)
      })
    }
    
    // Check if we need to restore
    const needsRestore = currentEmployees.length === 0 || currentEmployees.length < backupData.employees.length
    
    if (needsRestore) {
      console.log('\n🔄 Restoring data from backup...')
      
      // Restore each collection
      for (const [collectionName, documents] of Object.entries(backupData)) {
        if (documents.length > 0) {
          console.log(`\nRestoring collection: ${collectionName}`)
          
          // Drop existing collection
          try {
            await db.collection(collectionName).drop()
            console.log(`   ✓ Dropped existing collection`)
          } catch (error) {
            // Collection might not exist, which is fine
          }
          
          // Insert documents
          await db.collection(collectionName).insertMany(documents)
          console.log(`   ✓ Restored ${documents.length} documents`)
        }
      }
      
      console.log('\n✅ Database restored successfully!')
    } else {
      console.log('\n✅ Database already has data. No restoration needed.')
    }
    
    // Verify final state
    console.log('\n📊 Final Database State:')
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments()
      console.log(`   ${col.name}: ${count} documents`)
    }
    
    const finalEmployees = await db.collection('employees').find({}).toArray()
    console.log(`\n📋 Final employee count: ${finalEmployees.length}`)
    
    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

verifyAndRestore()






