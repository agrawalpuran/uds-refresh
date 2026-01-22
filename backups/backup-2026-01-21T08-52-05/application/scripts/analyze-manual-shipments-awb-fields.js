/**
 * Analysis Script: Analyze AWB number storage in manual shipments
 * 
 * This script:
 * 1. Finds all manual shipments (shipmentMode = 'MANUAL')
 * 2. Analyzes which fields contain AWB numbers
 * 3. Identifies shipments that need migration
 * 4. Shows a detailed report
 * 
 * Run with: node scripts/analyze-manual-shipments-awb-fields.js
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

async function analyzeManualShipments() {
  try {
    console.log('🔄 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Get Shipment model
    const Shipment = mongoose.models.Shipment || mongoose.model('Shipment', new mongoose.Schema({}, { strict: false, collection: 'shipments' }))

    // Find all manual shipments
    console.log('🔍 Finding manual shipments...')
    const manualShipments = await Shipment.find({ shipmentMode: 'MANUAL' })
      .sort({ createdAt: -1 })
      .lean()
    console.log(`📦 Found ${manualShipments.length} manual shipment(s)\n`)

    if (manualShipments.length === 0) {
      console.log('✅ No manual shipments found')
      await mongoose.disconnect()
      return
    }

    // Analysis categories
    const analysis = {
      correct: [], // Has AWB only in providerShipmentReference
      needsMigration: [], // Has AWB in old fields but not in providerShipmentReference
      hasBoth: [], // Has AWB in both old and new fields
      noAWB: [], // No AWB number found
    }

    console.log('📊 Analyzing shipments...\n')
    console.log('='.repeat(80))

    for (const shipment of manualShipments) {
      const shipmentId = shipment.shipmentId || shipment._id?.toString() || 'unknown'
      const prNumber = shipment.prNumber || 'N/A'
      
      // Check all AWB fields
      const providerRef = shipment.providerShipmentReference && shipment.providerShipmentReference.trim()
      const courierAwb = shipment.courierAwbNumber && shipment.courierAwbNumber.trim()
      const trackingNum = shipment.trackingNumber && shipment.trackingNumber.trim()
      const shipmentNum = shipment.shipmentNumber && shipment.shipmentNumber.trim()
      
      // Determine AWB number (priority: shipmentNumber > trackingNumber > courierAwbNumber)
      let awbNumber = null
      let awbSource = null
      
      if (shipmentNum) {
        awbNumber = shipmentNum
        awbSource = 'shipmentNumber'
      } else if (trackingNum) {
        awbNumber = trackingNum
        awbSource = 'trackingNumber'
      } else if (courierAwb) {
        awbNumber = courierAwb
        awbSource = 'courierAwbNumber'
      }
      
      // Categorize
      if (!awbNumber) {
        analysis.noAWB.push({ shipmentId, prNumber, shipment })
      } else if (providerRef && providerRef === awbNumber) {
        // Check if old fields still exist
        if (courierAwb || (trackingNum && trackingNum === awbNumber && awbSource === 'trackingNumber') || (shipmentNum && shipmentNum === awbNumber && awbSource === 'shipmentNumber')) {
          // Has both old and new fields
          analysis.hasBoth.push({
            shipmentId,
            prNumber,
            awbNumber,
            providerRef,
            oldFields: {
              courierAwbNumber: courierAwb || null,
              trackingNumber: trackingNum || null,
              shipmentNumber: shipmentNum || null,
            },
            shipment,
          })
        } else {
          // Correct - only in providerShipmentReference
          analysis.correct.push({ shipmentId, prNumber, awbNumber, shipment })
        }
      } else if (!providerRef || providerRef !== awbNumber) {
        // Needs migration - has AWB in old fields but not in providerShipmentReference
        analysis.needsMigration.push({
          shipmentId,
          prNumber,
          awbNumber,
          awbSource,
          providerRef: providerRef || null,
          oldFields: {
            courierAwbNumber: courierAwb || null,
            trackingNumber: trackingNum || null,
            shipmentNumber: shipmentNum || null,
          },
          shipment,
        })
      }
      
      // Print detailed info for each shipment
      console.log(`\n📦 Shipment: ${shipmentId}`)
      console.log(`   PR Number: ${prNumber}`)
      console.log(`   providerShipmentReference: ${providerRef || '❌ MISSING'}`)
      console.log(`   courierAwbNumber: ${courierAwb || '❌ empty'}`)
      console.log(`   trackingNumber: ${trackingNum || '❌ empty'}`)
      console.log(`   shipmentNumber: ${shipmentNum || '❌ empty'}`)
      
      if (!awbNumber) {
        console.log(`   ⚠️  STATUS: No AWB number found`)
      } else if (!providerRef) {
        console.log(`   🔴 STATUS: NEEDS MIGRATION - AWB "${awbNumber}" found in ${awbSource}, but providerShipmentReference is empty`)
      } else if (providerRef !== awbNumber) {
        console.log(`   🔴 STATUS: NEEDS MIGRATION - AWB "${awbNumber}" in ${awbSource} differs from providerShipmentReference "${providerRef}"`)
      } else if (courierAwb || (trackingNum === awbNumber && awbSource === 'trackingNumber') || (shipmentNum === awbNumber && awbSource === 'shipmentNumber')) {
        console.log(`   🟡 STATUS: HAS BOTH - Correct in providerShipmentReference, but also in old field(s)`)
      } else {
        console.log(`   ✅ STATUS: CORRECT - AWB only in providerShipmentReference`)
      }
    }

    console.log('\n' + '='.repeat(80))
    console.log('\n📊 ANALYSIS SUMMARY:\n')
    console.log(`✅ Correct (AWB only in providerShipmentReference): ${analysis.correct.length}`)
    console.log(`🔴 Needs Migration (AWB in old fields, missing/incorrect in providerShipmentReference): ${analysis.needsMigration.length}`)
    console.log(`🟡 Has Both (Correct in providerShipmentReference, but also in old fields): ${analysis.hasBoth.length}`)
    console.log(`⚠️  No AWB Number: ${analysis.noAWB.length}`)
    console.log(`📦 Total: ${manualShipments.length}\n`)

    // Detailed breakdown
    if (analysis.needsMigration.length > 0) {
      console.log('\n🔴 SHIPMENTS NEEDING MIGRATION:\n')
      analysis.needsMigration.forEach((item, idx) => {
        console.log(`${idx + 1}. Shipment ID: ${item.shipmentId}`)
        console.log(`   PR Number: ${item.prNumber}`)
        console.log(`   AWB Number: "${item.awbNumber}" (found in: ${item.awbSource})`)
        console.log(`   providerShipmentReference: ${item.providerRef || '❌ EMPTY'}`)
        console.log(`   Old Fields:`)
        if (item.oldFields.courierAwbNumber) console.log(`     - courierAwbNumber: "${item.oldFields.courierAwbNumber}"`)
        if (item.oldFields.trackingNumber) console.log(`     - trackingNumber: "${item.oldFields.trackingNumber}"`)
        if (item.oldFields.shipmentNumber) console.log(`     - shipmentNumber: "${item.oldFields.shipmentNumber}"`)
        console.log('')
      })
    }

    if (analysis.hasBoth.length > 0) {
      console.log('\n🟡 SHIPMENTS WITH BOTH OLD AND NEW FIELDS (can clean up old fields):\n')
      analysis.hasBoth.forEach((item, idx) => {
        console.log(`${idx + 1}. Shipment ID: ${item.shipmentId}`)
        console.log(`   PR Number: ${item.prNumber}`)
        console.log(`   AWB Number: "${item.awbNumber}"`)
        console.log(`   providerShipmentReference: ✅ "${item.providerRef}"`)
        console.log(`   Old Fields (can be cleared):`)
        if (item.oldFields.courierAwbNumber) console.log(`     - courierAwbNumber: "${item.oldFields.courierAwbNumber}"`)
        if (item.oldFields.trackingNumber) console.log(`     - trackingNumber: "${item.oldFields.trackingNumber}"`)
        if (item.oldFields.shipmentNumber) console.log(`     - shipmentNumber: "${item.oldFields.shipmentNumber}"`)
        console.log('')
      })
    }

    // Export analysis for migration
    const analysisData = {
      total: manualShipments.length,
      correct: analysis.correct.length,
      needsMigration: analysis.needsMigration.length,
      hasBoth: analysis.hasBoth.length,
      noAWB: analysis.noAWB.length,
      needsMigrationList: analysis.needsMigration.map(item => ({
        shipmentId: item.shipmentId,
        prNumber: item.prNumber,
        awbNumber: item.awbNumber,
        awbSource: item.awbSource,
        currentProviderRef: item.providerRef,
      })),
      hasBothList: analysis.hasBoth.map(item => ({
        shipmentId: item.shipmentId,
        prNumber: item.prNumber,
        awbNumber: item.awbNumber,
        oldFields: item.oldFields,
      })),
    }

    console.log('\n💾 Analysis data prepared for migration')
    console.log(`   - ${analysis.needsMigration.length} shipment(s) need migration`)
    console.log(`   - ${analysis.hasBoth.length} shipment(s) have both old and new fields (optional cleanup)\n`)

    await mongoose.disconnect()
    console.log('👋 Disconnected from MongoDB')
    
    return analysisData
  } catch (error) {
    console.error('❌ Analysis failed:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

// Run analysis
analyzeManualShipments()
  .then((analysisData) => {
    console.log('✅ Analysis completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Analysis failed:', error)
    process.exit(1)
  })

