/**
 * Simple migration script to copy all data from local MongoDB to MongoDB Atlas
 * Uses native MongoDB driver to avoid TypeScript import issues
 */

const { MongoClient } = require('mongodb')

const MONGODB_URI_LOCAL = process.env.MONGODB_URI_LOCAL || 'mongodb://localhost:27017/uniform-distribution'
const MONGODB_URI_ATLAS = process.env.MONGODB_URI_ATLAS

if (!MONGODB_URI_ATLAS) {
  console.error('❌ Error: MONGODB_URI_ATLAS environment variable is required')
  console.error('Usage: MONGODB_URI_ATLAS="your-atlas-connection-string" node scripts/migrate-data-to-atlas.js')
  process.exit(1)
}

async function migrateData() {
  let localClient = null
  let atlasClient = null

  try {
    console.log('🚀 Starting data migration to MongoDB Atlas...')
    console.log('')
    console.log('📡 Connecting to local database...')
    
    // Connect to local database
    localClient = new MongoClient(MONGODB_URI_LOCAL)
    await localClient.connect()
    const localDb = localClient.db()
    console.log('✅ Connected to local database')
    console.log(`   Database: ${localDb.databaseName}`)
    console.log('')

    console.log('📡 Connecting to MongoDB Atlas...')
    
    // Connect to Atlas
    atlasClient = new MongoClient(MONGODB_URI_ATLAS)
    await atlasClient.connect()
    const atlasDb = atlasClient.db()
    console.log('✅ Connected to MongoDB Atlas')
    console.log(`   Database: ${atlasDb.databaseName}`)
    console.log('')

    // Get all collections from local database
    const collections = await localDb.listCollections().toArray()
    console.log(`📁 Found ${collections.length} collections to migrate:`)
    collections.forEach((col, index) => {
      console.log(`   ${index + 1}. ${col.name}`)
    })
    console.log('')

    // Migrate each collection
    let totalMigrated = 0
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name
      console.log(`📦 Migrating ${collectionName}...`)
      
      const localCollection = localDb.collection(collectionName)
      const atlasCollection = atlasDb.collection(collectionName)
      
      // Count documents in local
      const localCount = await localCollection.countDocuments()
      
      if (localCount === 0) {
        console.log(`   ⚠️  No documents in ${collectionName}, skipping`)
        continue
      }

      // Get all documents from local
      const documents = await localCollection.find({}).toArray()
      
      if (documents.length === 0) {
        console.log(`   ⚠️  No documents to migrate`)
        continue
      }

      // Clear existing data in Atlas (optional - uncomment if you want fresh data)
      const existingCount = await atlasCollection.countDocuments()
      if (existingCount > 0) {
        console.log(`   🗑️  Clearing ${existingCount} existing documents in Atlas...`)
        await atlasCollection.deleteMany({})
      }

      // Prepare documents (remove _id to let MongoDB generate new ones, but keep 'id' field)
      const documentsToInsert = documents.map(doc => {
        const { _id, ...rest } = doc
        return rest
      })

      // Insert into Atlas
      if (documentsToInsert.length > 0) {
        await atlasCollection.insertMany(documentsToInsert, { ordered: false })
        const atlasCount = await atlasCollection.countDocuments()
        console.log(`   ✅ Migrated ${documents.length} documents (Total in Atlas: ${atlasCount})`)
        totalMigrated += documents.length
      }
    }

    console.log('')
    console.log('🎉 Migration completed successfully!')
    console.log('')
    console.log('📊 Final Summary:')
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name
      const atlasCollection = atlasDb.collection(collectionName)
      const count = await atlasCollection.countDocuments()
      if (count > 0) {
        console.log(`   ${collectionName}: ${count} documents`)
      }
    }
    console.log('')
    console.log(`✅ Total documents migrated: ${totalMigrated}`)
    console.log('')
    console.log('🔍 Verifying migration...')
    
    // Verify by checking a few key collections
    const keyCollections = ['employees', 'companies', 'uniforms', 'orders', 'vendors']
    for (const colName of keyCollections) {
      try {
        const col = atlasDb.collection(colName)
        const count = await col.countDocuments()
        if (count > 0) {
          const sample = await col.findOne({})
          console.log(`   ✅ ${colName}: ${count} documents (Sample ID: ${sample?.id || sample?._id || 'N/A'})`)
        }
      } catch (err) {
        // Collection might not exist, that's okay
      }
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.error('')
    console.error('💡 Troubleshooting:')
    console.error('   1. Check local MongoDB is running')
    console.error('   2. Verify Atlas connection string is correct')
    console.error('   3. Check MongoDB Atlas network access (0.0.0.0/0)')
    console.error('   4. Verify database user has write permissions')
    throw error
  } finally {
    // Close connections
    if (localClient) {
      await localClient.close()
      console.log('🔌 Closed local database connection')
    }
    if (atlasClient) {
      await atlasClient.close()
      console.log('🔌 Closed Atlas database connection')
    }
  }
}

// Run migration
migrateData()
  .then(() => {
    console.log('')
    console.log('✅ Migration script completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('')
    console.error('❌ Migration script failed:', error.message)
    process.exit(1)
  })



