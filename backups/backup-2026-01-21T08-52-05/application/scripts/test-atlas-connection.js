const mongoose = require('mongoose')

// Connection string with database name
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:Welcome$123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'

console.log('🔌 Testing MongoDB Atlas Connection...')
console.log('📍 Connection String:', MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'))
console.log('')

async function testConnection() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, // 10 second timeout
    })
    
    console.log('✅ Successfully connected to MongoDB Atlas!')
    console.log('')
    
    // Get database name
    const dbName = mongoose.connection.db.databaseName
    console.log(`📊 Database: ${dbName}`)
    console.log('')
    
    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray()
    console.log(`📁 Collections (${collections.length}):`)
    collections.forEach((col, index) => {
      console.log(`   ${index + 1}. ${col.name}`)
    })
    console.log('')
    
    // Count documents in each collection
    console.log('📈 Document Counts:')
    for (const col of collections) {
      try {
        const count = await mongoose.connection.db.collection(col.name).countDocuments()
        console.log(`   ${col.name}: ${count} documents`)
      } catch (err) {
        console.log(`   ${col.name}: Error counting (${err.message})`)
      }
    }
    console.log('')
    
    // Test specific collections
    console.log('🔍 Testing Collections:')
    
    const db = mongoose.connection.db
    
    // Test Employee collection
    try {
      const employeeCount = await db.collection('employees').countDocuments()
      const sampleEmployee = await db.collection('employees').findOne({})
      console.log(`   ✅ Employees: ${employeeCount} records`)
      if (sampleEmployee) {
        console.log(`      Sample: ${sampleEmployee.firstName || sampleEmployee.name || 'N/A'} (ID: ${sampleEmployee.id || sampleEmployee._id})`)
      }
    } catch (err) {
      console.log(`   ⚠️  Employees: ${err.message}`)
    }
    
    // Test Company collection
    try {
      const companyCount = await db.collection('companies').countDocuments()
      const sampleCompany = await db.collection('companies').findOne({})
      console.log(`   ✅ Companies: ${companyCount} records`)
      if (sampleCompany) {
        console.log(`      Sample: ${sampleCompany.name || 'N/A'} (ID: ${sampleCompany.id || sampleCompany._id})`)
      }
    } catch (err) {
      console.log(`   ⚠️  Companies: ${err.message}`)
    }
    
    // Test Uniform collection
    try {
      const uniformCount = await db.collection('uniforms').countDocuments()
      const sampleUniform = await db.collection('uniforms').findOne({})
      console.log(`   ✅ Uniforms: ${uniformCount} records`)
      if (sampleUniform) {
        console.log(`      Sample: ${sampleUniform.name || 'N/A'} (ID: ${sampleUniform.id || sampleUniform._id})`)
      }
    } catch (err) {
      console.log(`   ⚠️  Uniforms: ${err.message}`)
    }
    
    // Test Order collection
    try {
      const orderCount = await db.collection('orders').countDocuments()
      const sampleOrder = await db.collection('orders').findOne({})
      console.log(`   ✅ Orders: ${orderCount} records`)
      if (sampleOrder) {
        console.log(`      Sample: Order ${sampleOrder.id || sampleOrder._id} - Status: ${sampleOrder.status || 'N/A'}`)
      }
    } catch (err) {
      console.log(`   ⚠️  Orders: ${err.message}`)
    }
    
    console.log('')
    console.log('✅ Connection test completed successfully!')
    console.log('')
    console.log('📝 Connection String for Vercel:')
    console.log(`   ${MONGODB_URI}`)
    console.log('')
    console.log('✅ Ready for Vercel deployment!')
    
  } catch (error) {
    console.error('❌ Connection failed!')
    console.error('Error:', error.message)
    console.error('')
    console.error('💡 Troubleshooting:')
    console.error('   1. Check if MongoDB Atlas cluster is running')
    console.error('   2. Verify network access (allow 0.0.0.0/0)')
    console.error('   3. Check database user credentials')
    console.error('   4. Ensure password is correct (special characters may need encoding)')
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Disconnected from MongoDB')
  }
}

testConnection()



