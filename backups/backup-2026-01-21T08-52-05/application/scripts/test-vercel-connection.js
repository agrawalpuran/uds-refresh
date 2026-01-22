/**
 * Test script to verify MongoDB connection for Vercel deployment
 * This simulates what happens in the deployed environment
 */

const mongoose = require('mongoose')

// Get connection string from environment or use the Atlas one
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:Welcome$123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'

// Mask password for logging
const maskedUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')

console.log('🧪 Testing MongoDB Connection for Vercel Deployment')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')
console.log('📍 Connection String:', maskedUri)
console.log('')

async function testConnection() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    
    const opts = {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    }
    
    await mongoose.connect(MONGODB_URI, opts)
    
    console.log('✅ Connection successful!')
    console.log('')
    
    const db = mongoose.connection.db
    console.log(`📊 Database: ${db.databaseName}`)
    console.log('')
    
    // List collections
    const collections = await db.listCollections().toArray()
    console.log(`📁 Collections (${collections.length}):`)
    collections.forEach((col, index) => {
      console.log(`   ${index + 1}. ${col.name}`)
    })
    console.log('')
    
    // Count documents in key collections
    console.log('📈 Document Counts:')
    const keyCollections = ['employees', 'companies', 'uniforms', 'orders', 'vendors']
    for (const colName of keyCollections) {
      try {
        const count = await db.collection(colName).countDocuments()
        console.log(`   ${colName}: ${count} documents`)
      } catch (err) {
        console.log(`   ${colName}: Error - ${err.message}`)
      }
    }
    console.log('')
    
    // Test a sample query
    console.log('🔍 Testing sample queries...')
    try {
      const employee = await db.collection('employees').findOne({})
      if (employee) {
        console.log(`   ✅ Sample employee found: ${employee.firstName} ${employee.lastName}`)
      } else {
        console.log('   ⚠️  No employees found')
      }
    } catch (err) {
      console.log(`   ❌ Query error: ${err.message}`)
    }
    
    console.log('')
    console.log('✅ All tests passed! Connection is ready for Vercel deployment.')
    console.log('')
    console.log('📝 Next Steps:')
    console.log('   1. Verify MONGODB_URI is set in Vercel dashboard')
    console.log('   2. Ensure IP whitelist allows 0.0.0.0/0 in MongoDB Atlas')
    console.log('   3. Check Vercel deployment logs for connection messages')
    console.log('')
    
  } catch (error) {
    console.error('')
    console.error('❌ Connection failed!')
    console.error('')
    console.error('Error Details:')
    console.error(`   Message: ${error.message}`)
    console.error('')
    
    if (error.message.includes('authentication')) {
      console.error('💡 Authentication Error:')
      console.error('   - Check username and password in connection string')
      console.error('   - Verify database user has proper permissions')
      console.error('   - Ensure password is URL-encoded (special characters)')
    } else if (error.message.includes('timeout') || error.message.includes('ENOTFOUND')) {
      console.error('💡 Network Error:')
      console.error('   - Check MongoDB Atlas Network Access settings')
      console.error('   - Ensure IP whitelist includes 0.0.0.0/0 (all IPs)')
      console.error('   - Verify cluster URL is correct')
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      console.error('💡 DNS Error:')
      console.error('   - Check cluster hostname in connection string')
      console.error('   - Verify cluster is active in MongoDB Atlas')
    }
    
    console.error('')
    console.error('🔧 Troubleshooting:')
    console.error('   1. Test connection string in MongoDB Compass')
    console.error('   2. Check MongoDB Atlas dashboard for cluster status')
    console.error('   3. Verify environment variable format in Vercel')
    console.error('')
    
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Disconnected')
  }
}

testConnection()



