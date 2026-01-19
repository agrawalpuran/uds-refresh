const mongoose = require('mongoose')
const readline = require('readline')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function question(query) {
  return new Promise(resolve => rl.question(query, resolve))
}

async function setupMongoDBAtlas() {
  console.log('🌐 MongoDB Atlas Connection Setup')
  console.log('=====================================\n')
  
  console.log('📋 You need to provide your MongoDB Atlas connection string.')
  console.log('   Format: mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority\n')
  
  const connectionString = await question('Enter your MongoDB Atlas connection string: ')
  
  if (!connectionString || !connectionString.includes('mongodb+srv://')) {
    console.log('\n❌ Invalid connection string. Must start with mongodb+srv://')
    rl.close()
    process.exit(1)
  }
  
  // Ensure database name is included
  let finalConnectionString = connectionString
  if (!connectionString.includes('/uniform-distribution')) {
    if (connectionString.includes('?')) {
      finalConnectionString = connectionString.replace('?', '/uniform-distribution?')
    } else {
      finalConnectionString = connectionString + '/uniform-distribution?retryWrites=true&w=majority'
    }
  }
  
  console.log('\n🔌 Testing connection to MongoDB Atlas...')
  console.log('📍 Connection String:', finalConnectionString.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'))
  console.log('')
  
  try {
    // Test connection
    await mongoose.connect(finalConnectionString, {
      serverSelectionTimeoutMS: 10000,
    })
    
    console.log('✅ Successfully connected to MongoDB Atlas!')
    console.log('')
    
    // Get database info
    const dbName = mongoose.connection.db.databaseName
    console.log(`📊 Database: ${dbName}`)
    console.log('')
    
    // List collections
    const collections = await mongoose.connection.db.listCollections().toArray()
    console.log(`📁 Collections (${collections.length}):`)
    collections.forEach((col, index) => {
      console.log(`   ${index + 1}. ${col.name}`)
    })
    console.log('')
    
    // Count documents
    console.log('📈 Document Counts:')
    for (const col of collections) {
      try {
        const count = await mongoose.connection.db.collection(col.name).countDocuments()
        console.log(`   ${col.name}: ${count} documents`)
      } catch (err) {
        console.log(`   ${col.name}: Error counting`)
      }
    }
    
    console.log('')
    console.log('✅ Connection verified successfully!')
    console.log('')
    console.log('📝 Next Steps:')
    console.log('   1. Save this connection string to .env.local file:')
    console.log(`      MONGODB_URI="${finalConnectionString}"`)
    console.log('')
    console.log('   2. For Vercel deployment, add this as environment variable:')
    console.log(`      Name: MONGODB_URI`)
    console.log(`      Value: ${finalConnectionString}`)
    console.log('')
    
    // Ask if user wants to save to .env.local
    const saveToEnv = await question('Save connection string to .env.local? (y/n): ')
    
    if (saveToEnv.toLowerCase() === 'y' || saveToEnv.toLowerCase() === 'yes') {
      const fs = require('fs')
      const envContent = `MONGODB_URI=${finalConnectionString}\n`
      fs.writeFileSync('.env.local', envContent)
      console.log('✅ Saved to .env.local')
    }
    
  } catch (error) {
    console.error('❌ Connection failed!')
    console.error('Error:', error.message)
    console.error('')
    console.error('💡 Troubleshooting:')
    console.error('   1. Check if connection string is correct')
    console.error('   2. Verify network access in MongoDB Atlas (allow 0.0.0.0/0)')
    console.error('   3. Check database user credentials')
    console.error('   4. Ensure cluster is running')
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Disconnected from MongoDB')
    rl.close()
  }
}

setupMongoDBAtlas()



