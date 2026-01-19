const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Read .env.local to get connection string
function getMongoUri() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    const match = content.match(/MONGODB_URI=(.+)/)
    if (match) {
      return match[1].trim()
    }
  }
  return process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
}

const MONGODB_URI = getMongoUri()

async function verifyConnection() {
  try {
    console.log('🔌 Testing MongoDB Connection...')
    console.log(`📍 URI: ${MONGODB_URI}\n`)
    
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    })
    
    console.log('✅ Connected successfully!\n')
    
    const db = mongoose.connection.db
    console.log(`📊 Database: ${db.databaseName}\n`)
    
    // Check if it's local or Atlas
    const isLocal = MONGODB_URI.includes('localhost') || MONGODB_URI.includes('127.0.0.1')
    console.log(`📍 Connection Type: ${isLocal ? 'Local MongoDB' : 'MongoDB Atlas'}\n`)
    
    // Get collection count
    const collections = await db.listCollections().toArray()
    console.log(`📦 Collections: ${collections.length}\n`)
    
    // Check critical collections
    const criticalCollections = {
      'employees': 'Login',
      'companies': 'Company Admin Login',
      'companyadmins': 'Company Admin Auth',
      'vendors': 'Vendor Login',
      'locations': 'Location Admin Login',
      'locationadmins': 'Location Admin Auth',
      'uniforms': 'Products',
      'orders': 'Orders',
      'vendorinventories': 'Inventory'
    }
    
    console.log('📊 Critical Collections Status:')
    console.log('='.repeat(60))
    let allPresent = true
    for (const [name, description] of Object.entries(criticalCollections)) {
      const exists = collections.some(c => c.name === name)
      if (exists) {
        const count = await db.collection(name).countDocuments()
        console.log(`✅ ${name.padEnd(25)} ${description.padEnd(25)} (${count} docs)`)
      } else {
        console.log(`❌ ${name.padEnd(25)} ${description.padEnd(25)} (missing)`)
        allPresent = false
      }
    }
    
    console.log('\n' + '='.repeat(60))
    if (allPresent) {
      console.log('\n✅ All critical collections are present!')
      console.log('✅ Application is ready to use local MongoDB')
    } else {
      console.log('\n⚠️  Some critical collections are missing!')
    }
    
  } catch (error) {
    console.error('❌ Connection failed:')
    console.error(`   ${error.message}`)
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 MongoDB is not running locally.')
      console.error('   Start MongoDB with: mongod')
    }
    process.exit(1)
  } finally {
    await mongoose.connection.close()
  }
}

verifyConnection().catch(console.error)

