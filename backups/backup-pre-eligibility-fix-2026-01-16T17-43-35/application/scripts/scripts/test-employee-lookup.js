/**
 * Test employee lookup to see why it's failing
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const trimmedLine = line.trim()
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=')
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim()
        process.env[key.trim()] = value
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found')
  process.exit(1)
}

async function testEmployeeLookup() {
  try {
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    console.log('\n🔍 Testing employee lookup...\n')
    
    // Get the admin record
    const admin = await db.collection('companyadmins').findOne({})
    if (!admin) {
      console.log('No admin records found')
      await mongoose.disconnect()
      return
    }
    
    console.log(`Admin record:`)
    console.log(`  _id: ${admin._id}`)
    console.log(`  employeeId: ${admin.employeeId}`)
    console.log(`  employeeId type: ${admin.employeeId?.constructor?.name}`)
    console.log(`  employeeId toString: ${admin.employeeId?.toString()}\n`)
    
    // Try to find employee
    console.log('Trying to find employee...\n')
    
    // Method 1: Raw collection with ObjectId
    const employee1 = await db.collection('employees').findOne({ _id: admin.employeeId })
    console.log(`Method 1 (raw collection with ObjectId): ${employee1 ? 'FOUND' : 'NOT FOUND'}`)
    if (employee1) {
      console.log(`  Employee: ${employee1.employeeId || employee1.id} - ${employee1.firstName} ${employee1.lastName}`)
    }
    
    // Method 2: Raw collection with string
    const employee2 = await db.collection('employees').findOne({ _id: new mongoose.Types.ObjectId(admin.employeeId) })
    console.log(`Method 2 (raw collection with new ObjectId): ${employee2 ? 'FOUND' : 'NOT FOUND'}`)
    
    // Method 3: Find all employees and check
    const allEmployees = await db.collection('employees').find({}).toArray()
    console.log(`\nTotal employees in collection: ${allEmployees.length}`)
    
    const matchingEmployee = allEmployees.find(e => e._id.toString() === admin.employeeId.toString())
    console.log(`Method 3 (find all and match): ${matchingEmployee ? 'FOUND' : 'NOT FOUND'}`)
    if (matchingEmployee) {
      console.log(`  Employee: ${matchingEmployee.employeeId || matchingEmployee.id} - ${matchingEmployee.firstName} ${matchingEmployee.lastName}`)
      console.log(`  _id: ${matchingEmployee._id}`)
      console.log(`  Admin employeeId: ${admin.employeeId}`)
      console.log(`  Match: ${matchingEmployee._id.toString() === admin.employeeId.toString()}`)
    }
    
    await mongoose.disconnect()
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    await mongoose.disconnect()
    process.exit(1)
  }
}

testEmployeeLookup()





