/**
 * Check why order ORD-1768295151720-VPX7AO659 is not showing for Anjali Singh
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (error) {
  console.warn('Could not read .env.local')
}

async function checkOrder() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    const ordersCollection = db.collection('orders')
    const employeesCollection = db.collection('employees')
    const locationsCollection = db.collection('locations')
    const companiesCollection = db.collection('companies')

    // Try multiple variants of the order ID
    const orderIdVariants = [
      'ORD-1768295151720-VPX7AO659',
      'ORD-1768295151720-VPX7AO659-100001',
      'ORD-1768295151720-VPX7AO659-100004'
    ]
    
    let order = null
    let orderId = null
    
    for (const variant of orderIdVariants) {
      order = await ordersCollection.findOne({ id: variant })
      if (order) {
        orderId = variant
        break
      }
    }
    
    if (!order) {
      // Try partial match
      order = await ordersCollection.findOne({ id: { $regex: /ORD-1768295151720-VPX7AO659/ } })
      if (order) {
        orderId = order.id
      }
    }
    
    if (!order) {
      console.log('❌ Order not found with any variant!')
      await mongoose.disconnect()
      return
    }
    
    console.log(`🔍 Found order: ${orderId}\n`)

    console.log('✅ Order found!')
    console.log(`   Order ID: ${order.id}`)
    console.log(`   Status: ${order.status}`)
    console.log(`   PR Status: ${order.pr_status || 'N/A'}`)
    console.log(`   Employee ID: ${order.employeeId || 'N/A'}`)
    console.log(`   Company ID: ${order.companyId || 'N/A'}`)
    console.log(`   Order Date: ${order.orderDate || 'N/A'}\n`)

    // Find the employee
    let employee = null
    if (order.employeeId) {
      // Try to find by employeeId (string)
      employee = await employeesCollection.findOne({ 
        $or: [
          { employeeId: order.employeeId },
          { id: order.employeeId }
        ]
      })
      
      if (!employee) {
        // Try by _id if employeeId is ObjectId
        if (mongoose.Types.ObjectId.isValid(order.employeeId)) {
          employee = await employeesCollection.findOne({ _id: new mongoose.Types.ObjectId(order.employeeId) })
        }
      }
    }

    if (!employee) {
      console.log('❌ Employee not found for this order!')
      await mongoose.disconnect()
      return
    }

    console.log('✅ Employee found!')
    console.log(`   Employee ID: ${employee.employeeId || employee.id}`)
    console.log(`   Location ID: ${employee.locationId || 'N/A'}`)
    console.log(`   Company ID: ${employee.companyId || 'N/A'}\n`)

    // Find the location
    let location = null
    if (employee.locationId) {
      // Try string ID first
      location = await locationsCollection.findOne({ id: employee.locationId })
      
      if (!location) {
        // Try ObjectId
        if (mongoose.Types.ObjectId.isValid(employee.locationId)) {
          location = await locationsCollection.findOne({ _id: new mongoose.Types.ObjectId(employee.locationId) })
        }
      }
    }

    if (!location) {
      console.log('❌ Location not found for this employee!')
      await mongoose.disconnect()
      return
    }

    console.log('✅ Location found!')
    console.log(`   Location ID: ${location.id || location._id}`)
    console.log(`   Location Name: ${location.name || 'N/A'}`)
    console.log(`   Admin ID: ${location.adminId || 'N/A'}\n`)

    // Find Anjali Singh (employeeId: 300032)
    const anjali = await employeesCollection.findOne({ employeeId: '300032' })
    if (!anjali) {
      console.log('❌ Anjali Singh (employeeId: 300032) not found!')
      await mongoose.disconnect()
      return
    }

    console.log('✅ Anjali Singh found!')
    console.log(`   Employee ID: ${anjali.employeeId}`)
    console.log(`   MongoDB _id: ${anjali._id}`)
    console.log(`   Location ID: ${anjali.locationId || 'N/A'}\n`)

    // Check if Anjali is the location admin
    const anjaliId = anjali._id.toString()
    const locationAdminId = location.adminId ? location.adminId.toString() : null

    console.log('🔍 Checking Location Admin Assignment:')
    console.log(`   Anjali's _id: ${anjaliId}`)
    console.log(`   Location's adminId: ${locationAdminId}`)
    console.log(`   Match: ${anjaliId === locationAdminId ? '✅ YES' : '❌ NO'}\n`)

    // Check order status and PR status
    console.log('🔍 Checking Order Status:')
    console.log(`   Status: ${order.status}`)
    console.log(`   PR Status: ${order.pr_status || 'null'}`)
    console.log(`   Should show for Site Admin: ${order.status === 'Awaiting approval' && order.pr_status === 'PENDING_SITE_ADMIN_APPROVAL' ? '✅ YES' : '❌ NO'}\n`)

    // Check if employee is in the same location as Anjali
    const employeeLocationId = employee.locationId ? employee.locationId.toString() : null
    const anjaliLocationId = anjali.locationId ? anjali.locationId.toString() : null

    console.log('🔍 Checking Location Match:')
    console.log(`   Order Employee Location ID: ${employeeLocationId}`)
    console.log(`   Anjali's Location ID: ${anjaliLocationId}`)
    console.log(`   Match: ${employeeLocationId === anjaliLocationId ? '✅ YES' : '❌ NO'}\n`)

    // Summary
    console.log('📋 SUMMARY:')
    console.log('='.repeat(50))
    if (anjaliId === locationAdminId) {
      console.log('✅ Anjali Singh IS the location admin')
    } else {
      console.log('❌ Anjali Singh is NOT the location admin')
    }
    
    if (order.status === 'Awaiting approval' && order.pr_status === 'PENDING_SITE_ADMIN_APPROVAL') {
      console.log('✅ Order status is correct for Site Admin approval')
    } else {
      console.log('❌ Order status is NOT correct for Site Admin approval')
      console.log(`   Expected: status='Awaiting approval', pr_status='PENDING_SITE_ADMIN_APPROVAL'`)
      console.log(`   Actual: status='${order.status}', pr_status='${order.pr_status || 'null'}'`)
    }
    
    if (employeeLocationId === anjaliLocationId) {
      console.log('✅ Order employee is in the same location as Anjali')
    } else {
      console.log('❌ Order employee is NOT in the same location as Anjali')
    }
    console.log('='.repeat(50))

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

checkOrder()
  .then(() => {
    console.log('\n✅ Script completed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })
