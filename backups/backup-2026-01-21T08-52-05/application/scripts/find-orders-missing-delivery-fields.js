/**
 * Script to find all orders that are marked as "Delivered" but missing delivery fields
 * Usage: node scripts/find-orders-missing-delivery-fields.js
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

async function findOrdersMissingDeliveryFields() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ MongoDB connected successfully.\n')

    const db = mongoose.connection.db
    const ordersCollection = db.collection('orders')
    
    // Find orders with status = "Delivered" but missing delivery fields
    const orders = await ordersCollection.find({
      status: 'Delivered',
      $or: [
        { deliveryStatus: { $ne: 'DELIVERED' } },
        { deliveredDate: { $exists: false } },
        { 'items.deliveredQuantity': { $exists: false } }
      ]
    }).toArray()
    
    console.log(`📋 Found ${orders.length} order(s) marked as "Delivered" but missing delivery fields:\n`)
    
    if (orders.length === 0) {
      console.log('✅ All delivered orders have proper delivery fields set!')
      process.exit(0)
    }
    
    const orderIds = []
    
    for (const order of orders) {
      const hasDeliveryStatus = order.deliveryStatus === 'DELIVERED'
      const hasDeliveredDate = order.deliveredDate !== null && order.deliveredDate !== undefined
      const items = order.items || []
      const hasItemDelivery = items.some((item) => (item.deliveredQuantity || 0) > 0)
      
      console.log(`Order: ${order.id}`)
      console.log(`   Status: ${order.status}`)
      console.log(`   Delivery Status: ${order.deliveryStatus || 'NOT SET'} ${hasDeliveryStatus ? '✅' : '❌'}`)
      console.log(`   Delivered Date: ${order.deliveredDate ? new Date(order.deliveredDate).toLocaleDateString() : 'NOT SET'} ${hasDeliveredDate ? '✅' : '❌'}`)
      console.log(`   Items with deliveredQuantity: ${items.filter((item) => (item.deliveredQuantity || 0) > 0).length}/${items.length} ${hasItemDelivery ? '✅' : '❌'}`)
      console.log('')
      
      if (!hasDeliveryStatus || !hasDeliveredDate || !hasItemDelivery) {
        orderIds.push(order.id)
      }
    }
    
    if (orderIds.length > 0) {
      console.log(`\n📝 Orders that need fixing (${orderIds.length}):`)
      console.log(orderIds.join(' '))
      console.log(`\n💡 To fix these orders, run:`)
      console.log(`   node scripts/mark-orders-as-delivered.js ${orderIds.join(' ')}`)
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

findOrdersMissingDeliveryFields()

