const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

try {
  const envPath = path.join(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (e) {
  console.error('Error reading .env.local:', e.message)
}

async function diagnoseEmployeeOrders() {
  try {
    console.log('🔍 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')

    const db = mongoose.connection.db

    // Get a sample employee
    console.log('📦 Step 1: Finding sample employees...')
    const employees = await db.collection('employees').find({}).limit(3).toArray()
    console.log(`Found ${employees.length} employees:\n`)
    employees.forEach((e, i) => {
      console.log(`[${i+1}] Employee:`)
      console.log(`   - _id: ${e._id?.toString()}`)
      console.log(`   - id: ${e.id}`)
      console.log(`   - employeeId: ${e.employeeId}`)
      console.log(`   - email: ${e.email}`)
      console.log('')
    })

    if (employees.length === 0) {
      console.log('❌ No employees found!')
      await mongoose.disconnect()
      process.exit(1)
    }

    const testEmployee = employees[0]
    console.log(`\n🔍 Step 2: Testing order lookup for employee: ${testEmployee.email}`)
    console.log(`   Using employeeId: ${testEmployee.employeeId}`)
    console.log(`   Using _id: ${testEmployee._id?.toString()}\n`)

    // Test query 1: Find orders by employeeId ObjectId (current implementation)
    console.log('📋 Query 1: Finding orders by employeeId ObjectId...')
    const ordersByObjectId = await db.collection('orders').find({ 
      employeeId: testEmployee._id 
    }).toArray()
    console.log(`   Found ${ordersByObjectId.length} orders using employeeId ObjectId`)
    if (ordersByObjectId.length > 0) {
      ordersByObjectId.forEach((o, i) => {
        console.log(`   [${i+1}] Order ID: ${o.id}, Status: ${o.status}, Date: ${o.orderDate}`)
      })
    }
    console.log('')

    // Test query 2: Find orders by employeeIdNum (if exists)
    if (testEmployee.employeeId) {
      console.log(`📋 Query 2: Finding orders by employeeIdNum (${testEmployee.employeeId})...`)
      const ordersByEmployeeIdNum = await db.collection('orders').find({ 
        employeeIdNum: testEmployee.employeeId 
      }).toArray()
      console.log(`   Found ${ordersByEmployeeIdNum.length} orders using employeeIdNum`)
      if (ordersByEmployeeIdNum.length > 0) {
        ordersByEmployeeIdNum.forEach((o, i) => {
          console.log(`   [${i+1}] Order ID: ${o.id}, Status: ${o.status}, Date: ${o.orderDate}`)
        })
      }
      console.log('')
    }

    // Test query 3: Check all orders to see what employeeId values they have
    console.log('📋 Query 3: Checking all orders in database...')
    const allOrders = await db.collection('orders').find({}).limit(5).toArray()
    console.log(`   Found ${allOrders.length} sample orders:\n`)
    allOrders.forEach((o, i) => {
      console.log(`   [${i+1}] Order ID: ${o.id}`)
      console.log(`       - employeeId (type): ${typeof o.employeeId}, value: ${o.employeeId?.toString()}`)
      console.log(`       - employeeIdNum: ${o.employeeIdNum}`)
      console.log(`       - Status: ${o.status}`)
      console.log('')
    })

    // Test query 4: Try to match using string comparison
    if (testEmployee.employeeId) {
      console.log(`📋 Query 4: Finding orders where employeeIdNum matches "${testEmployee.employeeId}"...`)
      const ordersByString = await db.collection('orders').find({ 
        $or: [
          { employeeIdNum: testEmployee.employeeId },
          { employeeIdNum: String(testEmployee.employeeId) },
          { employeeIdNum: parseInt(testEmployee.employeeId) }
        ]
      }).toArray()
      console.log(`   Found ${ordersByString.length} orders using employeeIdNum string matching`)
      if (ordersByString.length > 0) {
        ordersByString.forEach((o, i) => {
          console.log(`   [${i+1}] Order ID: ${o.id}, Status: ${o.status}`)
        })
      }
      console.log('')
    }

    await mongoose.disconnect()
    console.log('✅ Disconnected')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

diagnoseEmployeeOrders()

