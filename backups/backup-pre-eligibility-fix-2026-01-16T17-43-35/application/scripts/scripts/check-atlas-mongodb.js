const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Read .env.local file manually
function getMongoUri() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    const match = content.match(/MONGODB_URI=(.+)/)
    if (match) {
      return match[1].trim()
    }
  }
  // Fallback to environment variable
  return process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
}

// Get MongoDB URI
const MONGODB_URI = getMongoUri()

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env.local')
  process.exit(1)
}

// Mask password in URI for display
const maskedUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')

async function checkAtlasMongoDB() {
  try {
    console.log('🔌 Connecting to MongoDB Atlas...')
    console.log(`📍 URI: ${maskedUri}\n`)
    
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    })
    
    console.log('✅ Connected to MongoDB Atlas successfully!\n')
    
    const db = mongoose.connection.db
    const dbName = db.databaseName
    console.log(`📊 Database: ${dbName}\n`)
    
    // Get all collections
    const collections = await db.listCollections().toArray()
    
    if (collections.length === 0) {
      console.log('⚠️  No collections found in the database!')
    } else {
      console.log(`📦 Found ${collections.length} collection(s):\n`)
      console.log('='.repeat(80))
      
      let totalDocs = 0
      
      // Get details for each collection
      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name
        const collection = db.collection(collectionName)
        
        // Get document count
        const count = await collection.countDocuments()
        totalDocs += count
        
        // Get collection stats
        let stats = { size: 0, storageSize: 0 }
        try {
          stats = await db.command({ collStats: collectionName })
        } catch (e) {
          // Stats might fail for some collections, continue
        }
        
        console.log(`\n📋 Collection: ${collectionName}`)
        console.log(`   Documents: ${count}`)
        if (stats.size > 0) {
          console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`)
          console.log(`   Storage Size: ${(stats.storageSize / 1024).toFixed(2)} KB`)
        }
        
        if (count > 0) {
          // Get sample document
          const sampleDoc = await collection.findOne({})
          if (sampleDoc) {
            const keys = Object.keys(sampleDoc).slice(0, 8) // First 8 keys
            console.log(`   Sample fields: ${keys.join(', ')}${Object.keys(sampleDoc).length > 8 ? ', ...' : ''}`)
          }
        } else {
          console.log(`   ⚠️  Collection is empty`)
        }
        
        console.log('\n' + '-'.repeat(80))
      }
      
      console.log('\n' + '='.repeat(80))
      console.log(`\n✅ Summary: ${collections.length} collection(s) found`)
      console.log(`   Total Documents: ${totalDocs}`)
    }
    
    // Check for critical collections
    const criticalCollections = {
      'employees': 'Required for login',
      'companies': 'Required for company admin login',
      'companyadmins': 'Required for company admin authentication',
      'vendors': 'Required for vendor login',
      'locations': 'Required for location admin login',
      'locationadmins': 'Required for location admin authentication',
      'uniforms': 'Product catalog',
      'orders': 'Order management',
      'vendorinventories': 'Inventory tracking'
    }
    
    const existingCollectionNames = collections.map(c => c.name)
    
    console.log(`\n📊 Critical Collections Status:`)
    console.log('='.repeat(80))
    for (const [name, description] of Object.entries(criticalCollections)) {
      const exists = existingCollectionNames.includes(name)
      const count = exists ? await db.collection(name).countDocuments() : 0
      const status = exists ? (count > 0 ? '✅' : '⚠️') : '❌'
      console.log(`${status} ${name.padEnd(25)} ${description.padEnd(40)} ${exists ? `(${count} docs)` : '(missing)'}`)
    }
    
  } catch (error) {
    console.error('❌ Error checking MongoDB Atlas:')
    console.error(`   ${error.message}`)
    
    if (error.message.includes('authentication')) {
      console.error('\n💡 Authentication failed. Check your username and password.')
    } else if (error.message.includes('timeout')) {
      console.error('\n💡 Connection timeout. Check network access or IP whitelist in MongoDB Atlas.')
    } else if (error.message.includes('ENOTFOUND')) {
      console.error('\n💡 Cannot resolve hostname. Check your MongoDB Atlas cluster URL.')
    }
  } finally {
    await mongoose.connection.close()
    console.log('\n🔌 Connection closed.')
  }
}

// Run the check
checkAtlasMongoDB().catch(console.error)

