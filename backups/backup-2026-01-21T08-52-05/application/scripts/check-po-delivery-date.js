/**
 * Script to check delivery date for a specific PO
 * Usage: node scripts/check-po-delivery-date.js <PO_NUMBER>
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

async function checkPODeliveryDate() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ MongoDB connected successfully.\n')

    const poNumber = process.argv[2]
    
    if (!poNumber) {
      console.log('Usage: node scripts/check-po-delivery-date.js <PO_NUMBER>')
      console.log('Example: node scripts/check-po-delivery-date.js 01012026900002')
      process.exit(0)
    }

    const db = mongoose.connection.db
    
    // Find PO
    const posCollection = db.collection('purchaseorders')
    const po = await posCollection.findOne({ client_po_number: poNumber })
    
    if (!po) {
      console.log(`❌ PO not found: ${poNumber}`)
      process.exit(1)
    }
    
    console.log(`📋 PO Details:`)
    console.log(`   PO Number: ${po.client_po_number}`)
    console.log(`   PO ID: ${po.id}`)
    console.log(`   Vendor ID: ${po.vendorId}`)
    console.log(`   PO Date: ${po.po_date ? new Date(po.po_date).toLocaleDateString() : 'N/A'}\n`)
    
    // Find linked orders
    const poOrdersCollection = db.collection('poorders')
    const poMappings = await poOrdersCollection.find({ purchase_order_id: po._id }).toArray()
    
    console.log(`📦 Linked Orders (${poMappings.length}):`)
    
    if (poMappings.length === 0) {
      console.log(`   ⚠️ No orders linked to this PO`)
      process.exit(0)
    }
    
    const orderIds = poMappings.map(m => m.order_id)
    const ordersCollection = db.collection('orders')
    const orders = await ordersCollection.find({ _id: { $in: orderIds } }).toArray()
    
    let latestDeliveryDate = null
    
    for (const order of orders) {
      console.log(`\n   Order: ${order.id}`)
      console.log(`   Status: ${order.status || 'N/A'}`)
      console.log(`   Delivery Status: ${order.deliveryStatus || 'N/A'}`)
      console.log(`   Delivered Date: ${order.deliveredDate ? new Date(order.deliveredDate).toLocaleDateString() : 'NOT SET'}`)
      console.log(`   Items: ${(order.items || []).length}`)
      
      // Check item-level delivery
      const items = order.items || []
      items.forEach((item, idx) => {
        console.log(`     Item ${idx + 1}: Ordered=${item.quantity}, Delivered=${item.deliveredQuantity || 0}`)
      })
      
      if (order.deliveredDate) {
        const deliveryDate = new Date(order.deliveredDate)
        if (!latestDeliveryDate || deliveryDate > latestDeliveryDate) {
          latestDeliveryDate = deliveryDate
        }
      }
    }
    
    console.log(`\n📅 Latest Delivery Date: ${latestDeliveryDate ? new Date(latestDeliveryDate).toLocaleDateString() : 'N/A'}`)
    
    if (!latestDeliveryDate) {
      console.log(`\n⚠️ ISSUE: No deliveredDate found in any linked orders`)
      console.log(`   This is why the delivery date shows as "N/A" in the GRN page`)
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

checkPODeliveryDate()

