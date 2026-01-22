/**
 * Fix script to correct incorrect "Dispatched" status
 * This script finds orders with "Dispatched" status that shouldn't be dispatched
 * and resets them to "Awaiting fulfilment" if they haven't been actually dispatched
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

async function fixIncorrectDispatchedStatus() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')
    
    const db = mongoose.connection.db
    
    // Find all orders with "Dispatched" status
    console.log('🔍 Finding orders with "Dispatched" status...')
    const dispatchedOrders = await db.collection('orders').find({ status: 'Dispatched' }).toArray()
    console.log(`Found ${dispatchedOrders.length} order(s) with "Dispatched" status\n`)
    
    if (dispatchedOrders.length === 0) {
      console.log('✅ No orders with "Dispatched" status found')
      await mongoose.disconnect()
      return
    }
    
    // Check each order for shipment records
    const ordersToFix = []
    
    for (const order of dispatchedOrders) {
      // Check for shipment records
      const shipments = await db.collection('shipments').find({ orderId: order.id }).toArray()
      
      // If no shipment records exist, this order shouldn't be "Dispatched"
      if (shipments.length === 0) {
        console.log(`⚠️  Order ${order.id} has "Dispatched" status but NO shipment records`)
        console.log(`   Vendor: ${order.vendorName || 'N/A'}`)
        console.log(`   Created: ${order.createdAt || 'N/A'}`)
        console.log(`   Updated: ${order.updatedAt || 'N/A'}`)
        console.log(`   Status should be: "Awaiting fulfilment" (no shipment records found)`)
        ordersToFix.push(order)
      } else {
        console.log(`✅ Order ${order.id} has "Dispatched" status with ${shipments.length} shipment record(s) - OK`)
      }
    }
    
    if (ordersToFix.length === 0) {
      console.log('\n✅ All "Dispatched" orders have valid shipment records')
      await mongoose.disconnect()
      return
    }
    
    console.log(`\n📋 Found ${ordersToFix.length} order(s) with incorrect "Dispatched" status`)
    console.log('⚠️  These orders will be reset to "Awaiting fulfilment" status\n')
    
    // Fix the orders
    for (const order of ordersToFix) {
      console.log(`🔧 Fixing order ${order.id}...`)
      const result = await db.collection('orders').updateOne(
        { id: order.id },
        { 
          $set: { 
            status: 'Awaiting fulfilment',
            updatedAt: new Date()
          } 
        }
      )
      
      if (result.modifiedCount > 0) {
        console.log(`   ✅ Fixed: ${order.id} -> "Awaiting fulfilment"`)
      } else {
        console.log(`   ⚠️  No changes made to ${order.id}`)
      }
    }
    
    console.log(`\n✅ Fixed ${ordersToFix.length} order(s)`)
    
  } catch (error) {
    console.error('❌ Error:', error)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected')
  }
}

fixIncorrectDispatchedStatus()


