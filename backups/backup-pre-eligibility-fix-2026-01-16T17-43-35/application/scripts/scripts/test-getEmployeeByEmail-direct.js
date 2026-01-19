/**
 * Test getEmployeeByEmail function directly (simulating API call)
 */

// Set environment variables
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:Welcome%24123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'

// Import after setting env vars
const { getEmployeeByEmail } = require('../lib/db/data-access')

async function testEmailLookup() {
  const email = 'anjali.sharma@icicibank.com'
  
  console.log(`🔍 Testing getEmployeeByEmail for: ${email}`)
  console.log('')
  
  try {
    const employee = await getEmployeeByEmail(email)
    
    if (employee) {
      console.log('✅ Employee found!')
      console.log('')
      console.log('Employee details:')
      console.log(`  ID: ${employee.id || employee.employeeId || 'N/A'}`)
      console.log(`  Email: ${employee.email || 'N/A'}`)
      console.log(`  Name: ${employee.firstName || ''} ${employee.lastName || ''}`)
      console.log(`  CompanyId: ${employee.companyId || 'N/A'} (type: ${typeof employee.companyId})`)
      console.log(`  CompanyName: ${employee.companyName || 'N/A'}`)
      console.log(`  LocationId: ${employee.locationId || 'N/A'}`)
      console.log('')
      console.log('All fields:', Object.keys(employee))
    } else {
      console.log('❌ Employee NOT found')
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error('Stack:', error.stack)
  } finally {
    // Close MongoDB connection
    const mongoose = require('mongoose')
    await mongoose.disconnect()
    console.log('')
    console.log('🔌 Disconnected from MongoDB')
  }
}

testEmailLookup()

