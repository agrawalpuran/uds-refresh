/**
 * Debug script for order ORD-1766743458270-3AUQHTKR6-100002
 * This script queries the database directly to check order visibility
 */

require('dotenv').config({ path: '.env.local' })
const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI_LOCAL

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function debugOrder() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }))
    const Vendor = mongoose.model('Vendor', new mongoose.Schema({}, { strict: false }))

    const parentOrderId = 'ORD-1766743458270-3AUQHTKR6'
    
    console.log(`📋 Searching for orders with parentOrderId: ${parentOrderId}\n`)
    
    // Find all orders with this parentOrderId
    const orders = await Order.find({ parentOrderId: parentOrderId }).lean()
    
    console.log(`✅ Found ${orders.length} orders with parentOrderId: ${parentOrderId}\n`)
    
    if (orders.length === 0) {
      console.log('⚠️ No orders found. Trying to find by order ID pattern...')
      const orderById = await Order.find({ id: { $regex: parentOrderId } }).lean()
      console.log(`Found ${orderById.length} orders matching pattern`)
      if (orderById.length > 0) {
        orderById.forEach((o, idx) => {
          console.log(`  ${idx + 1}. Order ID: ${o.id}, Status: ${o.status}, VendorId: ${o.vendorId}`)
        })
      }
    } else {
      // Display order details
      for (let i = 0; i < orders.length; i++) {
        const order = orders[i]
        console.log(`\n📦 Order ${i + 1}:`)
        console.log(`   Order ID: ${order.id}`)
        console.log(`   Status: ${order.status}`)
        console.log(`   Parent Order ID: ${order.parentOrderId}`)
        console.log(`   Vendor ID (ObjectId): ${order.vendorId}`)
        console.log(`   Vendor Name: ${order.vendorName || 'N/A'}`)
        console.log(`   Company ID: ${order.companyId}`)
        console.log(`   Employee ID: ${order.employeeId}`)
        console.log(`   Items: ${order.items?.length || 0}`)
        console.log(`   Total: ₹${order.total || 0}`)
        
        // Try to find vendor by ObjectId
        if (order.vendorId) {
          const vendor = await Vendor.findById(order.vendorId).lean()
          if (vendor) {
            console.log(`   ✅ Vendor found by ObjectId: ${vendor.name} (ID: ${vendor.id})`)
          } else {
            console.log(`   ❌ Vendor NOT found by ObjectId: ${order.vendorId}`)
            // Try to find by id field
            const vendorById = await Vendor.findOne({ id: order.vendorId }).lean()
            if (vendorById) {
              console.log(`   ⚠️ Vendor found by id field (mismatch): ${vendorById.name}`)
            }
          }
        }
      }
      
      // Check vendor visibility
      console.log(`\n🔍 Checking vendor visibility...\n`)
      
      const vendors = await Vendor.find({}).select('id name _id').lean()
      console.log(`Found ${vendors.length} vendors in database\n`)
      
      for (const vendor of vendors) {
        console.log(`\n📊 Checking orders for vendor: ${vendor.name} (ID: ${vendor.id})`)
        const vendorOrders = await Order.find({ vendorId: vendor._id }).select('id status parentOrderId vendorName').lean()
        console.log(`   Found ${vendorOrders.length} orders for this vendor`)
        
        // Check if any of our target orders are in this list
        const targetOrders = vendorOrders.filter(o => o.parentOrderId === parentOrderId)
        if (targetOrders.length > 0) {
          console.log(`   ✅ Found ${targetOrders.length} order(s) from parent ${parentOrderId}:`)
          targetOrders.forEach(o => {
            console.log(`      - ${o.id} (Status: ${o.status})`)
          })
        } else {
          console.log(`   ❌ No orders found for parent ${parentOrderId}`)
        }
      }
    }
    
    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

debugOrder()

