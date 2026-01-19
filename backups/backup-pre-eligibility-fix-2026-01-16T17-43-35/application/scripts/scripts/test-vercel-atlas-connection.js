/**
 * Test script to verify MongoDB Atlas connection for Vercel deployment
 * This simulates what happens in Vercel environment
 */

const { MongoClient } = require('mongodb')

// Get connection string from environment (same as Vercel would)
const MONGODB_URI = process.env.MONGODB_URI

console.log('🔍 Testing Vercel MongoDB Atlas Connection...\n')
console.log('='.repeat(60))

// Check if environment variable is set
if (!MONGODB_URI) {
  console.error('❌ ERROR: MONGODB_URI environment variable is NOT set!')
  console.error('')
  console.error('💡 This is why you don\'t see connection logs in Vercel.')
  console.error('')
  console.error('📝 Solution:')
  console.error('   1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables')
  console.error('   2. Add MONGODB_URI with value:')
  console.error('      mongodb+srv://admin:Welcome%40123@cluster0.5g85nve.mongodb.net/uniform-distribution?retryWrites=true&w=majority')
  console.error('   3. Select all environments (Production, Preview, Development)')
  console.error('   4. Click Save')
  console.error('   5. Redeploy your application')
  console.error('')
  process.exit(1)
}

// Check format
if (!MONGODB_URI.match(/^mongodb(\+srv)?:\/\//)) {
  console.error('❌ ERROR: Invalid connection string format!')
  console.error(`   Current value: ${MONGODB_URI.substring(0, 50)}...`)
  console.error('   Must start with: mongodb:// or mongodb+srv://')
  process.exit(1)
}

// Mask password for logging
const maskedUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')
console.log('✅ MONGODB_URI is set')
console.log(`📍 Connection string: ${maskedUri}`)
console.log('')

// Test connection
async function testConnection() {
  let client = null
  
  try {
    console.log('🔌 Attempting MongoDB connection...')
    client = new MongoClient(MONGODB_URI)
    
    await client.connect()
    const db = client.db()
    
    console.log('✅ MongoDB Connected Successfully!')
    console.log(`📊 Database: ${db.databaseName}`)
    console.log('')
    
    // Test collections
    const collections = await db.listCollections().toArray()
    console.log(`📁 Found ${collections.length} collections`)
    console.log('')
    
    // Check key collections
    const keyCollections = ['employees', 'companies', 'uniforms', 'orders', 'vendors']
    console.log('📊 Key Collections Status:')
    for (const colName of keyCollections) {
      const col = db.collection(colName)
      const count = await col.countDocuments()
      const icon = count > 0 ? '✅' : '⚠️'
      console.log(`   ${icon} ${colName.padEnd(20)} ${count} documents`)
    }
    
    console.log('')
    console.log('='.repeat(60))
    console.log('')
    console.log('✅ Connection test PASSED!')
    console.log('')
    console.log('💡 If Vercel still doesn\'t show data:')
    console.log('   1. Verify environment variables are set in Vercel Dashboard')
    console.log('   2. Ensure you REDEPLOYED after adding variables')
    console.log('   3. Check Function Logs (not just Build Logs)')
    console.log('   4. Test API endpoint: https://your-project.vercel.app/api/products')
    console.log('')
    
  } catch (error) {
    console.error('❌ Connection FAILED!')
    console.error(`   Error: ${error.message}`)
    console.error('')
    
    if (error.message.includes('authentication')) {
      console.error('💡 Authentication Error:')
      console.error('   - Check username and password')
      console.error('   - Ensure password is URL-encoded (@ = %40)')
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('querySrv')) {
      console.error('💡 DNS/Network Error:')
      console.error('   - Check cluster URL is correct')
      console.error('   - Verify network access in Atlas (0.0.0.0/0)')
    } else if (error.message.includes('timeout')) {
      console.error('💡 Timeout Error:')
      console.error('   - Check network access in Atlas')
      console.error('   - Verify IP whitelist includes 0.0.0.0/0')
    }
    
    console.error('')
    process.exit(1)
  } finally {
    if (client) {
      await client.close()
      console.log('🔌 Connection closed')
    }
  }
}

testConnection()

