/**
 * Script to check delivery status of specific orders
 * Usage: node scripts/check-order-delivery-status.js <ORDER_ID1> <ORDER_ID2> ...
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
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function checkOrderStatus() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ MongoDB connected successfully.\n')

    const orderIds = process.argv.slice(2)
    
    if (orderIds.length === 0) {
      console.log('Usage: node scripts/check-order-delivery-status.js <ORDER_ID1> <ORDER_ID2> ...')
      console.log('Example: node scripts/check-order-delivery-status.js ORD-1767283150715-K27L2PZ8O-100001')
      process.exit(0)
    }

    const db = mongoose.connection.db
    const ordersCollection = db.collection('orders')
    
    for (const orderId of orderIds) {
      console.log(`\n📋 Checking Order: ${orderId}`)
      console.log('='.repeat(60))
      
      const order = await ordersCollection.findOne({ id: orderId })
      
      if (!order) {
        console.log(`❌ Order not found: ${orderId}`)
        continue
      }
      
      console.log(`Status: ${order.status || 'N/A'}`)
      console.log(`PR Status: ${order.pr_status || 'N/A'}`)
      console.log(`Dispatch Status: ${order.dispatchStatus || 'N/A'}`)
      console.log(`Delivery Status: ${order.deliveryStatus || 'N/A'}`)
      console.log(`Vendor ID: ${order.vendorId || 'N/A'}`)
      console.log(`Items Count: ${(order.items || []).length}`)
      
      const items = order.items || []
      if (items.length > 0) {
        console.log('\n📦 Item Details:')
        items.forEach((item, idx) => {
          console.log(`  Item ${idx + 1}:`)
          console.log(`    Product: ${item.uniformName || 'N/A'} (Size: ${item.size || 'N/A'})`)
          console.log(`    Ordered: ${item.quantity || 0}`)
          console.log(`    Dispatched: ${item.dispatchedQuantity || 0}`)
          console.log(`    Delivered: ${item.deliveredQuantity || 0}`)
          console.log(`    Item Status: ${item.itemShipmentStatus || 'N/A'}`)
          
          const orderedQty = item.quantity || 0
          const deliveredQty = item.deliveredQuantity || 0
          
          if (deliveredQty >= orderedQty && orderedQty > 0) {
            console.log(`    ✅ Item is fully delivered`)
          } else if (deliveredQty > 0) {
            console.log(`    ⚠️ Item is partially delivered (${deliveredQty}/${orderedQty})`)
          } else {
            console.log(`    ❌ Item is not delivered`)
          }
        })
      }
      
      // Check if order is linked to PO
      const poOrdersCollection = db.collection('poorders')
      const poMapping = await poOrdersCollection.findOne({ order_id: order._id })
      
      if (poMapping) {
        const posCollection = db.collection('purchaseorders')
        const po = await posCollection.findOne({ _id: poMapping.purchase_order_id })
        if (po) {
          console.log(`\n📄 Linked to PO: ${po.client_po_number || po.id || 'N/A'}`)
        }
      } else {
        console.log(`\n⚠️ Order is not linked to any PO`)
      }
    }
    
    console.log('\n✅ Check complete')
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Disconnected from MongoDB')
  }
}

checkOrderStatus()

