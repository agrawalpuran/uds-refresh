/**
 * Script to fetch AWB for a shipment
 * 
 * Usage:
 *   node scripts/fetch-shipment-awb.js <shipmentId>
 *   node scripts/fetch-shipment-awb.js --list  (list recent shipments)
 */

const mongoose = require('mongoose')

// Import models
const Shipment = require('../lib/models/Shipment').default

async function connectDB() {
  // Try to load .env if available, but don't fail if not
  try {
    require('dotenv').config()
  } catch (e) {
    // dotenv not available, use defaults
  }
  
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/uds'
  await mongoose.connect(mongoUri)
  console.log('✅ Connected to MongoDB')
}

async function listRecentShipments() {
  await connectDB()
  
  const shipments = await Shipment.find({ shipmentMode: 'API' })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean()
  
  console.log('\n📦 Recent API Shipments:')
  console.log('='.repeat(80))
  shipments.forEach((s, i) => {
    console.log(`${i + 1}. Shipment ID: ${s.shipmentId}`)
    console.log(`   PR Number: ${s.prNumber}`)
    console.log(`   Provider: ${s.providerId}`)
    console.log(`   AWB: ${s.courierAwbNumber || 'NOT SET'}`)
    console.log(`   Status: ${s.shipmentStatus}`)
    console.log(`   Created: ${s.createdAt}`)
    console.log('')
  })
  
  await mongoose.disconnect()
}

async function fetchAWB(shipmentId) {
  await connectDB()
  
  const shipment = await Shipment.findOne({ shipmentId }).lean()
  
  if (!shipment) {
    console.error(`❌ Shipment not found: ${shipmentId}`)
    await mongoose.disconnect()
    return
  }
  
  if (shipment.shipmentMode !== 'API') {
    console.error(`❌ This shipment is not an API shipment (mode: ${shipment.shipmentMode})`)
    await mongoose.disconnect()
    return
  }
  
  console.log(`\n📦 Shipment Details:`)
  console.log(`   Shipment ID: ${shipment.shipmentId}`)
  console.log(`   PR Number: ${shipment.prNumber}`)
  console.log(`   Provider: ${shipment.providerId}`)
  console.log(`   Provider Reference: ${shipment.providerShipmentReference}`)
  console.log(`   Current AWB: ${shipment.courierAwbNumber || 'NOT SET'}`)
  console.log(`\n🔄 Fetching AWB from provider...`)
  
  // Call the API endpoint using built-in fetch (Node 18+)
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
  const url = `${baseUrl}/api/shipments/${shipmentId}/fetch-awb`
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    const data = await response.json()
    
    if (response.ok && data.success) {
      console.log(`\n✅ Success!`)
      console.log(`   AWB Number: ${data.awbNumber}`)
      console.log(`   Message: ${data.message}`)
    } else {
      console.error(`\n❌ Error:`)
      console.error(`   ${data.error || 'Unknown error'}`)
    }
  } catch (error) {
    console.error(`\n❌ Failed to call API:`)
    console.error(`   ${error.message}`)
    console.error(`\n💡 Make sure the server is running: npm run dev`)
  }
  
  await mongoose.disconnect()
}

// Main
const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
Usage:
  node scripts/fetch-shipment-awb.js <shipmentId>    Fetch AWB for a specific shipment
  node scripts/fetch-shipment-awb.js --list          List recent API shipments
  
Examples:
  node scripts/fetch-shipment-awb.js --list
  node scripts/fetch-shipment-awb.js SHIP_L8K2M1ABC
`)
  process.exit(0)
}

if (args[0] === '--list') {
  listRecentShipments()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Error:', err)
      process.exit(1)
    })
} else {
  fetchAWB(args[0])
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Error:', err)
      process.exit(1)
    })
}

