const mongoose = require('mongoose')

// Local MongoDB connection string
const LOCAL_MONGODB_URI = 'mongodb://localhost:27017/uniform-distribution'

async function checkLocalMongoDB() {
  try {
    console.log('🔌 Connecting to local MongoDB...')
    console.log(`📍 URI: ${LOCAL_MONGODB_URI}\n`)
    
    await mongoose.connect(LOCAL_MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    })
    
    console.log('✅ Connected to local MongoDB successfully!\n')
    
    const db = mongoose.connection.db
    const dbName = db.databaseName
    console.log(`📊 Database: ${dbName}\n`)
    
    // Get all collections
    const collections = await db.listCollections().toArray()
    
    if (collections.length === 0) {
      console.log('⚠️  No collections found in the database!')
      console.log('   The database might be empty or you might be connected to the wrong database.\n')
    } else {
      console.log(`📦 Found ${collections.length} collection(s):\n`)
      console.log('='.repeat(80))
      
      // Get details for each collection
      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name
        const collection = db.collection(collectionName)
        
        // Get document count
        const count = await collection.countDocuments()
        
        // Get sample documents (first 3)
        const sampleDocs = await collection.find({}).limit(3).toArray()
        
        // Get collection stats
        const stats = await db.command({ collStats: collectionName })
        
        console.log(`\n📋 Collection: ${collectionName}`)
        console.log(`   Documents: ${count}`)
        console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`)
        console.log(`   Storage Size: ${(stats.storageSize / 1024).toFixed(2)} KB`)
        
        if (count > 0) {
          console.log(`\n   Sample Documents (first ${Math.min(3, count)}):`)
          sampleDocs.forEach((doc, index) => {
            console.log(`\n   [${index + 1}]`)
            // Show key fields only
            const keys = Object.keys(doc).slice(0, 10) // First 10 keys
            keys.forEach(key => {
              let value = doc[key]
              if (value && typeof value === 'object') {
                if (value instanceof mongoose.Types.ObjectId) {
                  value = `ObjectId("${value}")`
                } else if (Array.isArray(value)) {
                  value = `Array(${value.length} items)`
                } else {
                  value = JSON.stringify(value).substring(0, 100)
                }
              } else if (typeof value === 'string' && value.length > 50) {
                value = value.substring(0, 50) + '...'
              }
              console.log(`      ${key}: ${value}`)
            })
            if (Object.keys(doc).length > 10) {
              console.log(`      ... (${Object.keys(doc).length - 10} more fields)`)
            }
          })
        } else {
          console.log(`   ⚠️  Collection is empty`)
        }
        
        console.log('\n' + '-'.repeat(80))
      }
      
      console.log('\n' + '='.repeat(80))
      console.log(`\n✅ Summary: ${collections.length} collection(s) found`)
      console.log(`   Total Documents: ${collections.reduce((sum, c) => sum + (c.count || 0), 0)}`)
    }
    
    // Also check for expected collections that might be missing
    const expectedCollections = [
      'uniforms',
      'companies',
      'employees',
      'vendors',
      'orders',
      'companyadmins',
      'locationadmins',
      'branches',
      'locations',
      'productcompanies',
      'productvendors',
      'vendorcompanies',
      'vendorinventories',
      'returnrequests',
      'productfeedbacks',
      'productsizecharts',
      'designationproducteligibilities'
    ]
    
    const existingCollectionNames = collections.map(c => c.name)
    const missingCollections = expectedCollections.filter(
      name => !existingCollectionNames.includes(name)
    )
    
    if (missingCollections.length > 0) {
      console.log(`\n⚠️  Expected collections that are missing:`)
      missingCollections.forEach(name => {
        console.log(`   - ${name}`)
      })
    }
    
  } catch (error) {
    console.error('❌ Error checking local MongoDB:')
    console.error(`   ${error.message}`)
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 MongoDB is not running locally.')
      console.error('   Start MongoDB with: mongod')
      console.error('   Or check if MongoDB is running on port 27017')
    } else if (error.message.includes('timeout')) {
      console.error('\n💡 Connection timeout. Check if MongoDB is running.')
    }
  } finally {
    await mongoose.connection.close()
    console.log('\n🔌 Connection closed.')
  }
}

// Run the check
checkLocalMongoDB().catch(console.error)

