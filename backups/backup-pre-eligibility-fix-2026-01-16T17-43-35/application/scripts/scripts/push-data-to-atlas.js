/**
 * Push remaining data from local MongoDB to MongoDB Atlas
 * This script intelligently merges data - only adds new documents, doesn't overwrite existing ones
 * 
 * Usage:
 *   MONGODB_URI_ATLAS="mongodb+srv://admin:Welcome%24123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority" \
 *   MONGODB_URI_LOCAL="mongodb://localhost:27017/uniform-distribution" \
 *   node scripts/push-data-to-atlas.js
 */

const { MongoClient } = require('mongodb')

const MONGODB_URI_LOCAL = process.env.MONGODB_URI_LOCAL || 'mongodb://localhost:27017/uniform-distribution'
const MONGODB_URI_ATLAS = process.env.MONGODB_URI_ATLAS || 'mongodb+srv://admin:Welcome%24123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'

async function pushDataToAtlas() {
  let localClient = null
  let atlasClient = null

  try {
    console.log('🚀 Starting data push to MongoDB Atlas...')
    console.log('')
    
    // Connect to Atlas first
    console.log('📡 Connecting to MongoDB Atlas...')
    atlasClient = new MongoClient(MONGODB_URI_ATLAS)
    await atlasClient.connect()
    const atlasDb = atlasClient.db()
    console.log('✅ Connected to MongoDB Atlas')
    console.log(`   Database: ${atlasDb.databaseName}`)
    console.log('')

    // Check if local MongoDB is available
    let localDb = null
    try {
      console.log('📡 Connecting to local database...')
      localClient = new MongoClient(MONGODB_URI_LOCAL)
      await localClient.connect()
      localDb = localClient.db()
      console.log('✅ Connected to local database')
      console.log(`   Database: ${localDb.databaseName}`)
      console.log('')
    } catch (localError) {
      console.log('⚠️  Local MongoDB not accessible:', localError.message)
      console.log('   Will only check Atlas for missing data')
      console.log('')
    }

    // Get collections from Atlas
    const atlasCollections = await atlasDb.listCollections().toArray()
    console.log(`📁 Found ${atlasCollections.length} collections in Atlas:`)
    atlasCollections.forEach((col, index) => {
      console.log(`   ${index + 1}. ${col.name}`)
    })
    console.log('')

    // If local DB is available, get its collections
    let localCollections = []
    if (localDb) {
      localCollections = await localDb.listCollections().toArray()
      console.log(`📁 Found ${localCollections.length} collections in local database`)
      console.log('')
    }

    // Merge collections list (union of both)
    const allCollectionNames = new Set()
    atlasCollections.forEach(c => allCollectionNames.add(c.name))
    if (localDb) {
      localCollections.forEach(c => allCollectionNames.add(c.name))
    }

    let totalPushed = 0
    let totalSkipped = 0

    // Process each collection
    for (const collectionName of Array.from(allCollectionNames).sort()) {
      console.log(`📦 Processing ${collectionName}...`)
      
      const atlasCollection = atlasDb.collection(collectionName)
      const atlasCount = await atlasCollection.countDocuments()
      console.log(`   Atlas: ${atlasCount} documents`)

      // If local DB is available, check for new data
      if (localDb) {
        try {
          const localCollection = localDb.collection(collectionName)
          const localCount = await localCollection.countDocuments()
          console.log(`   Local: ${localCount} documents`)

          if (localCount === 0) {
            console.log(`   ⚠️  No documents in local ${collectionName}, skipping`)
            continue
          }

          // Get all documents from local
          const localDocuments = await localCollection.find({}).toArray()
          
          // Get existing IDs from Atlas (using 'id' field or '_id')
          const atlasDocs = await atlasCollection.find({}).toArray()
          const existingIds = new Set()
          atlasDocs.forEach(doc => {
            if (doc.id) existingIds.add(String(doc.id))
            if (doc._id) existingIds.add(String(doc._id))
          })

          // Filter out documents that already exist in Atlas
          const newDocuments = localDocuments.filter(doc => {
            const docId = doc.id ? String(doc.id) : String(doc._id)
            return !existingIds.has(docId)
          })

          if (newDocuments.length === 0) {
            console.log(`   ✅ All ${localCount} documents already exist in Atlas, skipping`)
            totalSkipped += localCount
            continue
          }

          // Prepare documents for insertion (remove _id to let MongoDB generate new ones, but keep 'id' field)
          const documentsToInsert = newDocuments.map(doc => {
            const { _id, ...rest } = doc
            return rest
          })

          // Insert new documents into Atlas
          if (documentsToInsert.length > 0) {
            try {
              await atlasCollection.insertMany(documentsToInsert, { ordered: false })
              const newAtlasCount = await atlasCollection.countDocuments()
              console.log(`   ✅ Pushed ${documentsToInsert.length} new documents (Total in Atlas: ${newAtlasCount})`)
              totalPushed += documentsToInsert.length
            } catch (insertError) {
              // Handle duplicate key errors gracefully
              if (insertError.code === 11000) {
                console.log(`   ⚠️  Some documents already exist (duplicate key), skipped`)
                totalSkipped += documentsToInsert.length
              } else {
                throw insertError
              }
            }
          }
        } catch (error) {
          console.log(`   ⚠️  Error processing local ${collectionName}:`, error.message)
        }
      } else {
        // No local DB, just report Atlas status
        console.log(`   ✅ Atlas has ${atlasCount} documents`)
      }
    }

    console.log('')
    console.log('🎉 Data push completed!')
    console.log('')
    console.log('📊 Summary:')
    console.log(`   ✅ Documents pushed: ${totalPushed}`)
    console.log(`   ⏭️  Documents skipped (already exist): ${totalSkipped}`)
    console.log('')
    console.log('📊 Final Atlas Collection Counts:')
    for (const collectionInfo of atlasCollections) {
      const collectionName = collectionInfo.name
      const atlasCollection = atlasDb.collection(collectionName)
      const count = await atlasCollection.countDocuments()
      if (count > 0) {
        console.log(`   ${collectionName}: ${count} documents`)
      }
    }

  } catch (error) {
    console.error('❌ Data push failed:', error.message)
    console.error('')
    console.error('💡 Troubleshooting:')
    console.error('   1. Verify Atlas connection string is correct')
    console.error('   2. Check MongoDB Atlas network access (0.0.0.0/0)')
    console.error('   3. Verify database user has write permissions')
    console.error('   4. Check if local MongoDB is running (if using local source)')
    throw error
  } finally {
    // Close connections
    if (localClient) {
      await localClient.close()
      console.log('')
      console.log('🔌 Closed local database connection')
    }
    if (atlasClient) {
      await atlasClient.close()
      console.log('🔌 Closed Atlas database connection')
    }
  }
}

// Run migration
pushDataToAtlas()
  .then(() => {
    console.log('')
    console.log('✅ Data push script completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('')
    console.error('❌ Data push script failed:', error.message)
    process.exit(1)
  })

