/**
 * Debug Script: Check why order is not appearing in Location Admin approval list
 * 
 * Order ID: ORD-1768295151720-VPX7AO659-100001
 */

// Try to load dotenv if available
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // dotenv not available
}

const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    })
    console.log('✅ Connected to MongoDB')
    return mongoose.connection.db
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message)
    process.exit(1)
  }
}

async function debugOrder() {
  const db = await connectDB()
  const ordersCollection = db.collection('orders')
  const employeesCollection = db.collection('employees')
  const locationsCollection = db.collection('locations')
  
  const orderId = 'ORD-1768295151720-VPX7AO659-100001'
  
  console.log(`\n🔍 Debugging order: ${orderId}`)
  console.log('─'.repeat(60))
  
  try {
    // Find the order
    const order = await ordersCollection.findOne({ id: orderId })
    
    if (!order) {
      console.log(`❌ Order not found: ${orderId}`)
      return
    }
    
    console.log(`\n📋 Order Details:`)
    console.log(`   id: ${order.id}`)
    console.log(`   employeeId: ${order.employeeId} (type: ${typeof order.employeeId})`)
    console.log(`   employeeIdNum: ${order.employeeIdNum}`)
    console.log(`   pr_status: ${order.pr_status || 'null/undefined'}`)
    console.log(`   status: ${order.status}`)
    console.log(`   createdAt: ${order.createdAt}`)
    
    // Check if employeeId is ObjectId or String
    const isObjectId = order.employeeId instanceof mongoose.Types.ObjectId || 
                      (typeof order.employeeId === 'object' && order.employeeId !== null)
    const isString = typeof order.employeeId === 'string'
    
    console.log(`\n🔍 employeeId Analysis:`)
    console.log(`   Is ObjectId: ${isObjectId}`)
    console.log(`   Is String: ${isString}`)
    console.log(`   Value: ${JSON.stringify(order.employeeId)}`)
    
    // Find the employee by string ID
    const employeeStringId = String(order.employeeId)
    console.log(`\n👤 Employee Lookup:`)
    console.log(`   Searching for employee with id or employeeId: ${employeeStringId}`)
    
    const employee = await employeesCollection.findOne({ 
      $or: [
        { id: employeeStringId },
        { employeeId: employeeStringId }
      ]
    })
    
    if (!employee) {
      console.log(`   ❌ Employee not found!`)
      return
    }
    
    console.log(`   ✅ Employee found:`)
    console.log(`      _id: ${employee._id}`)
    console.log(`      id: ${employee.id}`)
    console.log(`      employeeId: ${employee.employeeId}`)
    console.log(`      locationId: ${employee.locationId} (type: ${typeof employee.locationId})`)
    console.log(`      email: ${employee.email}`)
    
    // Check location
    if (!employee.locationId) {
      console.log(`\n⚠️  Employee has no locationId!`)
      return
    }
    
    const locationId = employee.locationId
    console.log(`\n📍 Location Lookup:`)
    console.log(`   Employee locationId: ${locationId} (type: ${typeof locationId})`)
    
    let location = null
    if (typeof locationId === 'string' && /^\d{6}$/.test(locationId)) {
      location = await locationsCollection.findOne({ id: locationId })
      console.log(`   Searching by string ID: ${locationId}`)
    } else if (mongoose.Types.ObjectId.isValid(locationId)) {
      const locationObjectId = locationId instanceof mongoose.Types.ObjectId 
        ? locationId 
        : new mongoose.Types.ObjectId(locationId)
      location = await locationsCollection.findOne({ _id: locationObjectId })
      console.log(`   Searching by ObjectId: ${locationObjectId}`)
    }
    
    if (!location) {
      console.log(`   ❌ Location not found!`)
      return
    }
    
    console.log(`   ✅ Location found:`)
    console.log(`      _id: ${location._id}`)
    console.log(`      id: ${location.id}`)
    console.log(`      name: ${location.name}`)
    console.log(`      adminEmail: ${location.adminEmail || 'N/A'}`)
    
    // Simulate the query from getPendingApprovalsForSiteAdmin
    console.log(`\n🔍 Query Simulation:`)
    console.log(`   Current query in getPendingApprovalsForSiteAdmin:`)
    console.log(`   {`)
    console.log(`     employeeId: { $in: [ObjectId("${employee._id}")] },`)
    console.log(`     pr_status: 'PENDING_SITE_ADMIN_APPROVAL'`)
    console.log(`   }`)
    console.log(`\n   Order's employeeId: ${JSON.stringify(order.employeeId)}`)
    console.log(`   Employee's _id: ${employee._id}`)
    console.log(`   Employee's id: ${employee.id}`)
    
    const orderEmployeeIdStr = String(order.employeeId)
    const employeeIdStr = String(employee.id)
    const employeeObjectIdStr = String(employee._id)
    
    console.log(`\n   Comparison:`)
    console.log(`   Order.employeeId === Employee._id: ${orderEmployeeIdStr === employeeObjectIdStr}`)
    console.log(`   Order.employeeId === Employee.id: ${orderEmployeeIdStr === employeeIdStr}`)
    
    // Test the actual query
    console.log(`\n🧪 Testing Query:`)
    const queryWithObjectId = {
      employeeId: { $in: [employee._id] },
      pr_status: 'PENDING_SITE_ADMIN_APPROVAL'
    }
    const resultWithObjectId = await ordersCollection.findOne(queryWithObjectId)
    console.log(`   Query with ObjectId: ${resultWithObjectId ? '✅ FOUND' : '❌ NOT FOUND'}`)
    
    const queryWithStringId = {
      employeeId: employee.id,
      pr_status: 'PENDING_SITE_ADMIN_APPROVAL'
    }
    const resultWithStringId = await ordersCollection.findOne(queryWithStringId)
    console.log(`   Query with String ID: ${resultWithStringId ? '✅ FOUND' : '❌ NOT FOUND'}`)
    
    if (orderEmployeeIdStr === employeeIdStr) {
      console.log(`\n   ✅ Order.employeeId matches Employee.id (string ID)`)
      console.log(`   ❌ BUT query uses Employee._id (ObjectId) - THIS IS THE BUG!`)
      console.log(`\n   🔧 FIX: Change query to use Employee.id instead of Employee._id`)
    } else if (orderEmployeeIdStr === employeeObjectIdStr) {
      console.log(`\n   ✅ Order.employeeId matches Employee._id (ObjectId)`)
      console.log(`   ⚠️  Order schema expects string ID, but order has ObjectId`)
    } else {
      console.log(`\n   ❌ Order.employeeId doesn't match either Employee._id or Employee.id`)
    }
    
    // Check pr_status
    console.log(`\n🔍 PR Status Check:`)
    console.log(`   Order pr_status: ${order.pr_status || 'null/undefined'}`)
    console.log(`   Required pr_status: PENDING_SITE_ADMIN_APPROVAL`)
    console.log(`   Match: ${order.pr_status === 'PENDING_SITE_ADMIN_APPROVAL'}`)
    
  } catch (error) {
    console.error('\n❌ Error:', error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

debugOrder()
  .then(() => {
    console.log('\n✨ Script finished')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error)
    process.exit(1)
  })
