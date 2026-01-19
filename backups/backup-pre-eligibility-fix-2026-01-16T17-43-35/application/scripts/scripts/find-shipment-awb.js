/**
 * Find Shipment AWB Script
 * 
 * Queries the Shipment collection to find AWB numbers for shipments
 * Usage: node scripts/find-shipment-awb.js [shipmentId] [prNumber] [vendorId]
 */

const mongoose = require('mongoose')
require('dotenv').config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function findShipmentAWB() {
  try {
    const shipmentId = process.argv[2]
    const prNumber = process.argv[3]
    const vendorId = process.argv[4]

    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const Shipment = mongoose.models.Shipment || mongoose.model('Shipment', new mongoose.Schema({}, { strict: false }))

    let query = {}
    if (shipmentId) {
      query.shipmentId = shipmentId
      console.log(`🔍 Searching for shipmentId: ${shipmentId}`)
    } else if (prNumber) {
      query.prNumber = prNumber
      console.log(`🔍 Searching for prNumber: ${prNumber}`)
    } else {
      console.log('🔍 Finding last 10 shipments...')
    }

    if (vendorId) {
      query.vendorId = vendorId
    }

    const shipments = await Shipment.find(query)
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()

    if (shipments.length === 0) {
      console.log('❌ No shipments found')
      return
    }

    console.log(`\n✅ Found ${shipments.length} shipment(s):\n`)
    console.log('='.repeat(100))

    shipments.forEach((shipment, index) => {
      console.log(`\n📦 Shipment #${index + 1}:`)
      console.log(`   Shipment ID: ${shipment.shipmentId}`)
      console.log(`   PR Number: ${shipment.prNumber}`)
      console.log(`   Vendor ID: ${shipment.vendorId}`)
      console.log(`   Shipment Mode: ${shipment.shipmentMode || 'N/A'}`)
      console.log(`   Shipment Status: ${shipment.shipmentStatus || 'N/A'}`)
      console.log(`   Provider ID: ${shipment.providerId || 'N/A'}`)
      console.log(`   Company Shipping Provider ID: ${shipment.companyShippingProviderId || 'N/A'}`)
      console.log(`   Provider Shipment Reference: ${shipment.providerShipmentReference || 'N/A'}`)
      console.log(`   Tracking Number: ${shipment.trackingNumber || 'N/A'}`)
      console.log(`   Tracking URL: ${shipment.trackingUrl || 'N/A'}`)
      console.log(`\n   🚚 COURIER DATA:`)
      console.log(`   Courier AWB Number: ${shipment.courierAwbNumber || '❌ NOT STORED'}`)
      console.log(`   Courier Provider Code: ${shipment.courierProviderCode || 'N/A'}`)
      console.log(`   Courier Status: ${shipment.courierStatus || 'N/A'}`)
      console.log(`   Courier Tracking URL: ${shipment.courierTrackingUrl || 'N/A'}`)
      console.log(`\n   Created: ${shipment.createdAt ? new Date(shipment.createdAt).toISOString() : 'N/A'}`)
      console.log(`   Updated: ${shipment.updatedAt ? new Date(shipment.updatedAt).toISOString() : 'N/A'}`)
      console.log('-'.repeat(100))
    })

    console.log('\n' + '='.repeat(100))
    console.log('\n✅ Query completed\n')

    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

findShipmentAWB()

