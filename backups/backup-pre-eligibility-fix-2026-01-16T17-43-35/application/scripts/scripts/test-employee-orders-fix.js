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

async function testEmployeeOrdersFix() {
  try {
    console.log('🔍 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')

    const db = mongoose.connection.db

    // Get employee with orders (from previous diagnostic)
    console.log('📦 Step 1: Finding employee with orders...')
    const employeeWithOrders = await db.collection('employees').findOne({ employeeId: '300003' })
    if (!employeeWithOrders) {
      console.log('❌ Employee 300003 not found')
      await mongoose.disconnect()
      process.exit(1)
    }

    console.log(`✅ Found employee: ${employeeWithOrders.email}`)
    console.log(`   - _id: ${employeeWithOrders._id?.toString()}`)
    console.log(`   - employeeId: ${employeeWithOrders.employeeId}`)
    console.log('')

    // Test the new query logic
    console.log('🔍 Step 2: Testing new query logic...\n')
    
    const employeeIdNum = employeeWithOrders.employeeId || employeeWithOrders.id
    const orderQuery = {
      $or: [
        { employeeId: employeeWithOrders._id },
        { employeeIdNum: employeeIdNum },
        { employeeIdNum: String(employeeIdNum) }
      ]
    }

    console.log('Query:', JSON.stringify(orderQuery, null, 2))
    console.log('')

    const orders = await db.collection('orders').find(orderQuery).toArray()
    console.log(`✅ Found ${orders.length} orders using new query logic:`)
    orders.forEach((o, i) => {
      console.log(`   [${i+1}] Order ID: ${o.id}`)
      console.log(`       - Status: ${o.status}`)
      console.log(`       - employeeId: ${o.employeeId?.toString()}`)
      console.log(`       - employeeIdNum: ${o.employeeIdNum}`)
      console.log('')
    })

    // Compare with old query
    console.log('🔍 Step 3: Comparing with old query (employeeId only)...')
    const oldQueryOrders = await db.collection('orders').find({ 
      employeeId: employeeWithOrders._id 
    }).toArray()
    console.log(`   Old query found: ${oldQueryOrders.length} orders`)
    console.log(`   New query found: ${orders.length} orders`)
    console.log(`   Improvement: ${orders.length - oldQueryOrders.length} additional orders found\n`)

    await mongoose.disconnect()
    console.log('✅ Disconnected')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

testEmployeeOrdersFix()

