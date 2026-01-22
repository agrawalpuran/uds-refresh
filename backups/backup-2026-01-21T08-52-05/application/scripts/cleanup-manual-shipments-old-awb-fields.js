/**
 * Cleanup Script: Remove old AWB fields (courierAwbNumber, trackingNumber) 
 * from manual shipments where they match providerShipmentReference
 * 
 * This script:
 * 1. Finds all manual shipments with providerShipmentReference
 * 2. Clears courierAwbNumber if it matches providerShipmentReference
 * 3. Clears trackingNumber if it matches providerShipmentReference
 * 4. Keeps shipmentNumber as-is (it's a separate field for manual shipments)
 * 
 * Run with: node scripts/cleanup-manual-shipments-old-awb-fields.js
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/uniform-distribution'

// Try to read .env.local
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
  console.warn('Could not read .env.local, using default connection string')
}

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function cleanupManualShipments() {
  try {
    console.log('🔄 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Get Shipment model
    const Shipment = mongoose.models.Shipment || mongoose.model('Shipment', new mongoose.Schema({}, { strict: false, collection: 'shipments' }))

    // Find all manual shipments with providerShipmentReference
    console.log('🔍 Finding manual shipments with providerShipmentReference...')
    const manualShipments = await Shipment.find({ 
      shipmentMode: 'MANUAL',
      providerShipmentReference: { $exists: true, $ne: null, $ne: '' }
    })
      .sort({ createdAt: -1 })
      .lean()
    console.log(`📦 Found ${manualShipments.length} manual shipment(s) with providerShipmentReference\n`)

    if (manualShipments.length === 0) {
      console.log('✅ No manual shipments to cleanup')
      await mongoose.disconnect()
      return
    }

    let cleanedCount = 0
    let skippedCount = 0
    let errorCount = 0

    console.log('📋 Analyzing shipments for cleanup...\n')
    console.log('='.repeat(80))

    for (const shipment of manualShipments) {
      try {
        const shipmentId = shipment.shipmentId || shipment._id?.toString() || 'unknown'
        const prNumber = shipment.prNumber || 'N/A'
        const providerRef = shipment.providerShipmentReference && shipment.providerShipmentReference.trim()
        
        if (!providerRef) {
          console.log(`⏭️  Skipping ${shipmentId}: No providerShipmentReference`)
          skippedCount++
          continue
        }

        const courierAwb = shipment.courierAwbNumber && shipment.courierAwbNumber.trim()
        const trackingNum = shipment.trackingNumber && shipment.trackingNumber.trim()
        
        // Check what needs to be cleared
        const shouldClearCourierAwb = courierAwb && courierAwb === providerRef
        const shouldClearTrackingNum = trackingNum && trackingNum === providerRef
        
        if (!shouldClearCourierAwb && !shouldClearTrackingNum) {
          console.log(`⏭️  Skipping ${shipmentId}: No matching old fields to clear`)
          console.log(`   providerShipmentReference: "${providerRef}"`)
          console.log(`   courierAwbNumber: ${courierAwb || 'empty'} ${courierAwb === providerRef ? '✅ matches' : ''}`)
          console.log(`   trackingNumber: ${trackingNum || 'empty'} ${trackingNum === providerRef ? '✅ matches' : ''}`)
          skippedCount++
          continue
        }

        // Prepare update
        const updateFields = {}
        const unsetFields = {}
        
        if (shouldClearCourierAwb) {
          unsetFields.courierAwbNumber = ""
          console.log(`   🗑️  Will clear courierAwbNumber: "${courierAwb}"`)
        }
        
        if (shouldClearTrackingNum) {
          unsetFields.trackingNumber = ""
          console.log(`   🗑️  Will clear trackingNumber: "${trackingNum}"`)
        }

        console.log(`\n📦 Shipment: ${shipmentId}`)
        console.log(`   PR Number: ${prNumber}`)
        console.log(`   providerShipmentReference: ✅ "${providerRef}" (keeping)`)
        
        // Perform cleanup
        const updateOp = { $unset: unsetFields }
        if (Object.keys(unsetFields).length > 0) {
          await Shipment.updateOne(
            { _id: shipment._id },
            updateOp
          )
          
          cleanedCount++
          console.log(`   ✅ Cleaned up old fields`)
        }
        
      } catch (error) {
        console.error(`❌ Error cleaning shipment ${shipment.shipmentId || shipment._id}:`, error.message)
        errorCount++
      }
    }

    console.log('\n' + '='.repeat(80))
    console.log('\n📊 Cleanup Summary:')
    console.log(`   ✅ Cleaned: ${cleanedCount}`)
    console.log(`   ⏭️  Skipped: ${skippedCount}`)
    console.log(`   ❌ Errors: ${errorCount}`)
    console.log(`   📦 Total: ${manualShipments.length}\n`)

    if (cleanedCount > 0) {
      console.log('✅ Cleanup completed successfully!')
      console.log('   Old AWB fields (courierAwbNumber, trackingNumber) have been cleared')
      console.log('   AWB numbers are now only in providerShipmentReference')
    } else {
      console.log('✅ No cleanup needed (all shipments already clean)')
    }

    await mongoose.disconnect()
    console.log('👋 Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Cleanup failed:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

// Run cleanup
cleanupManualShipments()
  .then(() => {
    console.log('✅ Script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })

