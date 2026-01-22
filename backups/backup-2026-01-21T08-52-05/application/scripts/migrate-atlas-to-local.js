const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Read .env.local to get Atlas connection string
function getMongoUri() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    const match = content.match(/MONGODB_URI=(.+)/)
    if (match) {
      return match[1].trim()
    }
  }
  return process.env.MONGODB_URI
}

const ATLAS_URI = getMongoUri()
const LOCAL_URI = 'mongodb://localhost:27017/uniform-distribution'

if (!ATLAS_URI) {
  console.error('❌ MONGODB_URI not found in .env.local')
  process.exit(1)
}

const maskedAtlasUri = ATLAS_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')

async function migrateData() {
  let atlasConnection = null
  let localConnection = null
  
  try {
    console.log('🔄 Starting Migration: MongoDB Atlas → Local MongoDB\n')
    console.log('='.repeat(80))
    
    // Step 1: Connect to Atlas
    console.log('\n📡 Step 1: Connecting to MongoDB Atlas...')
    console.log(`   URI: ${maskedAtlasUri}`)
    atlasConnection = await mongoose.createConnection(ATLAS_URI, {
      serverSelectionTimeoutMS: 10000,
    }).asPromise()
    console.log('   ✅ Connected to Atlas\n')
    
    const atlasDb = atlasConnection.db
    
    // Step 2: Connect to Local MongoDB
    console.log('💻 Step 2: Connecting to Local MongoDB...')
    console.log(`   URI: ${LOCAL_URI}`)
    localConnection = await mongoose.createConnection(LOCAL_URI, {
      serverSelectionTimeoutMS: 5000,
    }).asPromise()
    console.log('   ✅ Connected to Local MongoDB\n')
    
    const localDb = localConnection.db
    
    // Step 3: Get all collections from Atlas
    console.log('📦 Step 3: Fetching collections from Atlas...')
    const collections = await atlasDb.listCollections().toArray()
    console.log(`   Found ${collections.length} collection(s)\n`)
    
    // Step 4: Migrate each collection
    console.log('🚀 Step 4: Migrating collections...\n')
    console.log('='.repeat(80))
    
    let totalMigrated = 0
    let totalSkipped = 0
    
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name
      const atlasCollection = atlasDb.collection(collectionName)
      const localCollection = localDb.collection(collectionName)
      
      try {
        // Get document count from Atlas
        const atlasCount = await atlasCollection.countDocuments()
        
        if (atlasCount === 0) {
          console.log(`⏭️  ${collectionName.padEnd(35)} Skipped (empty)`)
          continue
        }
        
        // Drop existing collection in local (to avoid duplicates)
        try {
          await localCollection.drop()
          console.log(`🗑️  ${collectionName.padEnd(35)} Dropped existing local collection`)
        } catch (e) {
          // Collection might not exist, that's fine
        }
        
        // Fetch all documents from Atlas
        const documents = await atlasCollection.find({}).toArray()
        
        if (documents.length === 0) {
          console.log(`⏭️  ${collectionName.padEnd(35)} Skipped (no documents)`)
          continue
        }
        
        // Insert into local MongoDB
        if (documents.length > 0) {
          await localCollection.insertMany(documents, { ordered: false })
        }
        
        // Verify count
        const localCount = await localCollection.countDocuments()
        
        if (localCount === atlasCount) {
          console.log(`✅ ${collectionName.padEnd(35)} Migrated ${atlasCount} document(s)`)
          totalMigrated += atlasCount
        } else {
          console.log(`⚠️  ${collectionName.padEnd(35)} Migrated ${localCount}/${atlasCount} document(s)`)
          totalMigrated += localCount
          totalSkipped += (atlasCount - localCount)
        }
        
      } catch (error) {
        console.error(`❌ ${collectionName.padEnd(35)} Error: ${error.message}`)
      }
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('\n📊 Migration Summary:')
    console.log(`   ✅ Total Documents Migrated: ${totalMigrated}`)
    if (totalSkipped > 0) {
      console.log(`   ⚠️  Documents Skipped: ${totalSkipped}`)
    }
    console.log(`   📦 Collections Processed: ${collections.length}`)
    
    // Step 5: Verify critical collections
    console.log('\n🔍 Step 5: Verifying critical collections...\n')
    const criticalCollections = [
      'employees',
      'companies',
      'companyadmins',
      'vendors',
      'locations',
      'locationadmins',
      'uniforms',
      'orders',
      'vendorinventories'
    ]
    
    for (const collName of criticalCollections) {
      const atlasCount = await atlasDb.collection(collName).countDocuments()
      const localCount = await localDb.collection(collName).countDocuments()
      const status = atlasCount === localCount ? '✅' : '⚠️'
      console.log(`   ${status} ${collName.padEnd(25)} Atlas: ${atlasCount.toString().padStart(3)} | Local: ${localCount.toString().padStart(3)}`)
    }
    
    console.log('\n✅ Migration completed successfully!')
    
  } catch (error) {
    console.error('\n❌ Migration failed:')
    console.error(`   ${error.message}`)
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Local MongoDB is not running.')
      console.error('   Start MongoDB with: mongod')
      console.error('   Or check if MongoDB is running on port 27017')
    } else if (error.message.includes('authentication')) {
      console.error('\n💡 Authentication failed. Check your Atlas credentials.')
    } else if (error.message.includes('timeout')) {
      console.error('\n💡 Connection timeout. Check network access.')
    }
    
    process.exit(1)
  } finally {
    if (atlasConnection) {
      await atlasConnection.close()
      console.log('\n🔌 Atlas connection closed.')
    }
    if (localConnection) {
      await localConnection.close()
      console.log('🔌 Local connection closed.')
    }
  }
}

// Run migration
migrateData().catch(console.error)

