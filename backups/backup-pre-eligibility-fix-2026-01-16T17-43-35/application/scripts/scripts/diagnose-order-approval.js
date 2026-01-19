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

async function diagnoseOrderApproval() {
  try {
    console.log('🔍 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')

    const db = mongoose.connection.db
    const testOrderId = 'ORD-1765639727906-K1ZMZYU1E'

    console.log(`📦 Step 1: Looking up order with ID: ${testOrderId}\n`)

    // Test 1: Find by id field
    console.log('🔍 Query 1: Finding order by id field...')
    const orderById = await db.collection('orders').findOne({ id: testOrderId })
    if (orderById) {
      console.log(`✅ Order found by id:`)
      console.log(`   - id: ${orderById.id}`)
      console.log(`   - parentOrderId: ${orderById.parentOrderId || 'N/A'}`)
      console.log(`   - status: ${orderById.status}`)
      console.log(`   - vendorId: ${orderById.vendorId?.toString()}`)
    } else {
      console.log(`❌ Order NOT found by id field`)
    }
    console.log('')

    // Test 2: Find by parentOrderId field
    console.log('🔍 Query 2: Finding order by parentOrderId field...')
    const orderByParentId = await db.collection('orders').findOne({ parentOrderId: testOrderId })
    if (orderByParentId) {
      console.log(`✅ Order found by parentOrderId:`)
      console.log(`   - id: ${orderByParentId.id}`)
      console.log(`   - parentOrderId: ${orderByParentId.parentOrderId}`)
      console.log(`   - status: ${orderByParentId.status}`)
    } else {
      console.log(`❌ Order NOT found by parentOrderId field`)
    }
    console.log('')

    // Test 3: Find all orders with this parentOrderId
    console.log('🔍 Query 3: Finding all orders with this as parentOrderId...')
    const childOrders = await db.collection('orders').find({ parentOrderId: testOrderId }).toArray()
    console.log(`   Found ${childOrders.length} child orders:`)
    childOrders.forEach((o, i) => {
      console.log(`   [${i+1}] id: ${o.id}, status: ${o.status}, vendorId: ${o.vendorId?.toString()}`)
    })
    console.log('')

    // Test 4: Check if this is a split order ID (has vendor suffix)
    console.log('🔍 Query 4: Checking if this is a split order ID...')
    const splitOrderMatch = testOrderId.match(/^(.+)-([A-Z0-9]{8})$/)
    if (splitOrderMatch) {
      const possibleParentId = splitOrderMatch[1]
      const vendorSuffix = splitOrderMatch[2]
      console.log(`   Detected possible split order format:`)
      console.log(`   - Possible parent ID: ${possibleParentId}`)
      console.log(`   - Vendor suffix: ${vendorSuffix}`)
      
      const ordersWithParent = await db.collection('orders').find({ parentOrderId: possibleParentId }).toArray()
      console.log(`   Found ${ordersWithParent.length} orders with this parentOrderId:`)
      ordersWithParent.forEach((o, i) => {
        console.log(`   [${i+1}] id: ${o.id}, status: ${o.status}`)
      })
    } else {
      console.log(`   Does not match split order pattern`)
    }
    console.log('')

    // Test 5: List all recent orders to see ID patterns
    console.log('🔍 Query 5: Listing recent orders to see ID patterns...')
    const recentOrders = await db.collection('orders').find({}).sort({ orderDate: -1 }).limit(5).toArray()
    console.log(`   Found ${recentOrders.length} recent orders:`)
    recentOrders.forEach((o, i) => {
      console.log(`   [${i+1}] id: ${o.id}`)
      console.log(`       parentOrderId: ${o.parentOrderId || 'N/A'}`)
      console.log(`       status: ${o.status}`)
      console.log('')
    })

    await mongoose.disconnect()
    console.log('✅ Disconnected')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

diagnoseOrderApproval()

