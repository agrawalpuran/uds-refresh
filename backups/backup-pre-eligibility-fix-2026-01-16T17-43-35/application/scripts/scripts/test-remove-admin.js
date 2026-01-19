const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8')
  envFile.split('\n').forEach(line => {
    const trimmedLine = line.trim()
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const match = trimmedLine.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim().replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function testRemoveAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')

    const db = mongoose.connection.db
    
    // Get a company admin to test with
    const company = await db.collection('companies').findOne({ id: 'COMP-INDIGO' })
    const admins = await db.collection('companyadmins').find({ companyId: company._id }).toArray()
    
    if (admins.length === 0) {
      console.log('No admins found to test removal')
      await mongoose.disconnect()
      return
    }
    
    const admin = admins[0]
    console.log('Found admin to test:')
    console.log(`  companyId: ${admin.companyId}`)
    console.log(`  employeeId: ${admin.employeeId}`)
    console.log(`  canApproveOrders: ${admin.canApproveOrders}\n`)
    
    // Get the employee
    const employee = await db.collection('employees').findOne({ _id: admin.employeeId })
    if (employee) {
      console.log('Employee found:')
      console.log(`  _id: ${employee._id}`)
      console.log(`  id: ${employee.id}`)
      console.log(`  employeeId: ${employee.employeeId}\n`)
      
      console.log('Testing removal with different employeeId formats:')
      console.log(`  1. employee.id: ${employee.id}`)
      console.log(`  2. employee.employeeId: ${employee.employeeId}`)
      console.log(`  3. employee._id: ${employee._id}`)
    }
    
    await mongoose.disconnect()
    console.log('\n✅ Done')
  } catch (error) {
    console.error('❌ Error:', error.message)
    await mongoose.disconnect()
    process.exit(1)
  }
}

testRemoveAdmin()






