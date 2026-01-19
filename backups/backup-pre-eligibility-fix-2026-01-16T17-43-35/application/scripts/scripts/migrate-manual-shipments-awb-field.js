/**
 * Migration Script: Move AWB/SWB numbers from courierAwbNumber to providerShipmentReference
 * for manual shipments
 * 
 * This script:
 * 1. Finds all manual shipments (shipmentMode = 'MANUAL')
 * 2. Moves courierAwbNumber to providerShipmentReference if providerShipmentReference is empty
 * 3. Preserves existing providerShipmentReference if it already has a value
 * 4. Does NOT modify API shipments (shipmentMode = 'API')
 * 
 * Run with: node scripts/migrate-manual-shipments-awb-field.js
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

async function migrateManualShipments() {
  try {
    console.log('🔄 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Get Shipment model
    const Shipment = mongoose.models.Shipment || mongoose.model('Shipment', new mongoose.Schema({}, { strict: false, collection: 'shipments' }))

    // Find all manual shipments
    console.log('🔍 Finding manual shipments...')
    const manualShipments = await Shipment.find({ shipmentMode: 'MANUAL' }).lean()
    console.log(`📦 Found ${manualShipments.length} manual shipment(s)`)

    if (manualShipments.length === 0) {
      console.log('✅ No manual shipments to migrate')
      await mongoose.disconnect()
      return
    }

    let migratedCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (const shipment of manualShipments) {
      try {
        const shipmentId = shipment.shipmentId || shipment._id?.toString() || 'unknown'
        
        // Check all possible fields where AWB number might be stored
        // Priority: shipmentNumber > trackingNumber > courierAwbNumber
        // For manual shipments, shipmentNumber is the most reliable source
        const awbFromShipmentNumber = shipment.shipmentNumber && shipment.shipmentNumber.trim()
        const awbFromTrackingNumber = shipment.trackingNumber && shipment.trackingNumber.trim()
        const awbFromCourierAwb = shipment.courierAwbNumber && shipment.courierAwbNumber.trim()
        
        // Determine the best AWB number to use
        let awbNumberToMigrate = null
        let awbSource = null
        
        if (awbFromShipmentNumber) {
          awbNumberToMigrate = awbFromShipmentNumber
          awbSource = 'shipmentNumber'
        } else if (awbFromTrackingNumber) {
          awbNumberToMigrate = awbFromTrackingNumber
          awbSource = 'trackingNumber'
        } else if (awbFromCourierAwb) {
          awbNumberToMigrate = awbFromCourierAwb
          awbSource = 'courierAwbNumber'
        }
        
        const hasProviderRef = shipment.providerShipmentReference && shipment.providerShipmentReference.trim()
        
        // Skip if no AWB number found in any field
        if (!awbNumberToMigrate) {
          console.log(`⏭️  Skipping ${shipmentId}: No AWB number found in shipmentNumber, trackingNumber, or courierAwbNumber`)
          skippedCount++
          continue
        }
        
        // If providerShipmentReference already has the same value, skip
        if (hasProviderRef && hasProviderRef === awbNumberToMigrate) {
          console.log(`⏭️  Skipping ${shipmentId}: providerShipmentReference already has correct value: ${hasProviderRef}`)
          skippedCount++
          continue
        }
        
        // If providerShipmentReference has a different value, update it (use the best source)
        if (hasProviderRef && hasProviderRef !== awbNumberToMigrate) {
          console.log(`🔄 Updating ${shipmentId}: providerShipmentReference has "${hasProviderRef}", updating to "${awbNumberToMigrate}" from ${awbSource}`)
        } else {
          console.log(`🔄 Migrating ${shipmentId}: Moving AWB "${awbNumberToMigrate}" from ${awbSource} to providerShipmentReference`)
        }
        
        await Shipment.updateOne(
          { _id: shipment._id },
          {
            $set: {
              providerShipmentReference: awbNumberToMigrate,
            },
            // Keep other fields for backward compatibility - don't unset them
          }
        )

        migratedCount++
        console.log(`✅ Migrated ${shipmentId}`)
      } catch (error) {
        console.error(`❌ Error migrating shipment ${shipment.shipmentId || shipment._id}:`, error.message)
        errorCount++
      }
    }

    console.log('\n📊 Migration Summary:')
    console.log(`   ✅ Migrated: ${migratedCount}`)
    console.log(`   ⏭️  Skipped: ${skippedCount}`)
    console.log(`   ❌ Errors: ${errorCount}`)
    console.log(`   📦 Total: ${manualShipments.length}`)

    if (migratedCount > 0) {
      console.log('\n✅ Migration completed successfully!')
    } else {
      console.log('\n✅ No migrations needed (all shipments already migrated or have no AWB number)')
    }

    await mongoose.disconnect()
    console.log('👋 Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

// Run migration
migrateManualShipments()
  .then(() => {
    console.log('✅ Script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })

