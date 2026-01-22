/**
 * Debug script to check order status for a specific order
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        process.env[key] = value
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI_LOCAL

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found')
  process.exit(1)
}

async function debugOrderStatus() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')
    
    const db = mongoose.connection.db
    const orderId = 'ORD-1766910479412-QSCFLYG8O'
    
    console.log(`🔍 Checking order: ${orderId}\n`)
    
    // Find order by ID
    const order = await db.collection('orders').findOne({ id: orderId })
    
    if (!order) {
      console.log('❌ Order not found by ID, checking by parentOrderId...')
      const ordersByParent = await db.collection('orders').find({ parentOrderId: orderId }).toArray()
      console.log(`Found ${ordersByParent.length} child order(s) with parentOrderId: ${orderId}`)
      
      if (ordersByParent.length > 0) {
        ordersByParent.forEach((childOrder, idx) => {
          console.log(`\n📦 Child Order ${idx + 1}:`)
          console.log(`   ID: ${childOrder.id}`)
          console.log(`   Status: ${childOrder.status}`)
          console.log(`   Vendor: ${childOrder.vendorName || 'N/A'}`)
          console.log(`   VendorId: ${childOrder.vendorId?.toString() || 'N/A'}`)
          console.log(`   Items: ${childOrder.items?.length || 0}`)
          console.log(`   Created: ${childOrder.createdAt || 'N/A'}`)
          console.log(`   Updated: ${childOrder.updatedAt || 'N/A'}`)
        })
      }
    } else {
      console.log('✅ Order found:')
      console.log(`   ID: ${order.id}`)
      console.log(`   Status: ${order.status}`)
      console.log(`   ParentOrderId: ${order.parentOrderId || 'N/A'}`)
      console.log(`   Vendor: ${order.vendorName || 'N/A'}`)
      console.log(`   VendorId: ${order.vendorId?.toString() || 'N/A'}`)
      console.log(`   Items: ${order.items?.length || 0}`)
      console.log(`   Created: ${order.createdAt || 'N/A'}`)
      console.log(`   Updated: ${order.updatedAt || 'N/A'}`)
      
      // If this is a parent order, find child orders
      if (!order.parentOrderId) {
        console.log('\n🔍 Checking for child orders...')
        const childOrders = await db.collection('orders').find({ parentOrderId: order.id }).toArray()
        console.log(`Found ${childOrders.length} child order(s)`)
        
        childOrders.forEach((childOrder, idx) => {
          console.log(`\n📦 Child Order ${idx + 1}:`)
          console.log(`   ID: ${childOrder.id}`)
          console.log(`   Status: ${childOrder.status}`)
          console.log(`   Vendor: ${childOrder.vendorName || 'N/A'}`)
          console.log(`   VendorId: ${childOrder.vendorId?.toString() || 'N/A'}`)
          console.log(`   Items: ${childOrder.items?.length || 0}`)
        })
      }
    }
    
    // Check for any shipment records
    console.log('\n🔍 Checking for shipment/dispatch records...')
    const shipments = await db.collection('shipments').find({ orderId: orderId }).toArray()
    console.log(`Found ${shipments.length} shipment record(s)`)
    
    if (shipments.length > 0) {
      shipments.forEach((shipment, idx) => {
        console.log(`\n📦 Shipment ${idx + 1}:`)
        console.log(`   OrderId: ${shipment.orderId}`)
        console.log(`   Status: ${shipment.status || 'N/A'}`)
        console.log(`   Dispatched: ${shipment.dispatched || false}`)
        console.log(`   Created: ${shipment.createdAt || 'N/A'}`)
      })
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected')
  }
}

debugOrderStatus()


