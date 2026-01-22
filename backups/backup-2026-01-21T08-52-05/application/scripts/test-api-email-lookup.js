const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function testEmailLookup() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
    console.log('')

    const Employee = require('../lib/models/Employee').default
    
    const testEmail = 'rajesh.kumar@goindigo.in'
    console.log(`🔍 Testing email lookup: ${testEmail}`)
    console.log('')

    // Test 1: Direct findOne
    const employee1 = await Employee.findOne({ email: testEmail }).lean()
    console.log('Test 1 - Direct findOne:')
    console.log(employee1 ? `✅ Found: ${employee1.firstName} ${employee1.lastName}` : '❌ Not found')
    console.log('')

    // Test 2: Case insensitive
    const employee2 = await Employee.findOne({ 
      email: { $regex: new RegExp(`^${testEmail}$`, 'i') } 
    }).lean()
    console.log('Test 2 - Case insensitive:')
    console.log(employee2 ? `✅ Found: ${employee2.firstName} ${employee2.lastName}` : '❌ Not found')
    console.log('')

    // Test 3: Trim and check
    const employee3 = await Employee.findOne({ 
      email: testEmail.trim() 
    }).lean()
    console.log('Test 3 - With trim:')
    console.log(employee3 ? `✅ Found: ${employee3.firstName} ${employee3.lastName}` : '❌ Not found')
    console.log('')

    // Test 4: Check all emails in database
    const allEmployees = await Employee.find({}).lean()
    console.log('📧 All emails in database:')
    allEmployees.forEach(emp => {
      console.log(`   "${emp.email}" (length: ${emp.email?.length}, has spaces: ${emp.email?.includes(' ')})`)
    })
    console.log('')

    // Test 5: Check if email field exists and is indexed
    const indexes = await Employee.collection.getIndexes()
    console.log('📊 Indexes on Employee collection:')
    console.log(JSON.stringify(indexes, null, 2))
    console.log('')

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Disconnected')
  }
}

testEmailLookup()



