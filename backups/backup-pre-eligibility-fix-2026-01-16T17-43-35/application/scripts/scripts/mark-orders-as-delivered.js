/**
 * Script to mark orders as delivered
 * This sets deliveredQuantity = quantity for all items and updates order status
 * 
 * Usage: node scripts/mark-orders-as-delivered.js <ORDER_ID1> <ORDER_ID2> ...
 * Example: node scripts/mark-orders-as-delivered.js ORD-1767283150715-K27L2PZ8O-100001 ORD-1767264184429-R1CY18RIY-100001
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

async function markOrdersAsDelivered() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ MongoDB connected successfully.\n')

    const orderIds = process.argv.slice(2)
    
    if (orderIds.length === 0) {
      console.log('Usage: node scripts/mark-orders-as-delivered.js <ORDER_ID1> <ORDER_ID2> ...')
      console.log('Example: node scripts/mark-orders-as-delivered.js ORD-1767283150715-K27L2PZ8O-100001')
      process.exit(0)
    }

    const db = mongoose.connection.db
    const ordersCollection = db.collection('orders')
    
    let updated = 0
    let errors = 0
    
    for (const orderId of orderIds) {
      try {
        console.log(`\n📋 Processing Order: ${orderId}`)
        
        const order = await ordersCollection.findOne({ id: orderId })
        
        if (!order) {
          console.log(`❌ Order not found: ${orderId}`)
          errors++
          continue
        }
        
        const items = order.items || []
        if (items.length === 0) {
          console.log(`⚠️ Order has no items, skipping`)
          continue
        }
        
        // Update items: set deliveredQuantity = quantity for all items
        const updatedItems = items.map((item) => ({
          ...item,
          deliveredQuantity: item.quantity || 0,
          dispatchedQuantity: item.dispatchedQuantity || item.quantity || 0, // Also set dispatched if not set
          itemShipmentStatus: 'DELIVERED'
        }))
        
        // Update order status
        const updateResult = await ordersCollection.updateOne(
          { id: orderId },
          {
            $set: {
              status: 'Delivered',
              deliveryStatus: 'DELIVERED',
              dispatchStatus: 'SHIPPED',
              deliveredDate: new Date(),
              items: updatedItems
            }
          }
        )
        
        if (updateResult.modifiedCount > 0) {
          console.log(`✅ Order ${orderId} marked as delivered`)
          console.log(`   - Status: Delivered`)
          console.log(`   - Delivery Status: DELIVERED`)
          console.log(`   - Items updated: ${items.length}`)
          updated++
        } else {
          console.log(`⚠️ Order ${orderId} was not updated (may already be delivered)`)
        }
      } catch (error) {
        console.error(`❌ Error processing order ${orderId}:`, error.message)
        errors++
      }
    }
    
    console.log(`\n✅ Update complete:`)
    console.log(`   - ${updated} order(s) updated`)
    console.log(`   - ${errors} error(s)`)
    
    if (updated > 0) {
      console.log(`\n💡 Next steps:`)
      console.log(`   1. Run: node scripts/update-pr-po-statuses.js`)
      console.log(`   2. Check GRN page - POs should now be eligible for GRN creation`)
    }
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

markOrdersAsDelivered()

