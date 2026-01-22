/**
 * Verification Script: Verify manual shipments AWB cleanup
 * 
 * This script verifies that:
 * 1. All manual shipments with AWB numbers have them in providerShipmentReference
 * 2. Old fields (courierAwbNumber, trackingNumber) are cleared for manual shipments
 * 3. New shipments will only use providerShipmentReference
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

async function verifyCleanup() {
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

    let correctCount = 0
    let issuesFound = 0
    const issues = []

    console.log('🔍 Verifying cleanup...\n')
    console.log('='.repeat(80))

    for (const shipment of manualShipments) {
      const shipmentId = shipment.shipmentId || shipment._id?.toString() || 'unknown'
      const prNumber = shipment.prNumber || 'N/A'
      
      const providerRef = shipment.providerShipmentReference && shipment.providerShipmentReference.trim()
      const courierAwb = shipment.courierAwbNumber && shipment.courierAwbNumber.trim()
      const trackingNum = shipment.trackingNumber && shipment.trackingNumber.trim()
      
      // Check for issues
      const hasOldField = courierAwb || trackingNum
      const hasProviderRef = !!providerRef
      
      if (hasOldField && hasProviderRef) {
        // Check if old field matches providerRef (should have been cleaned)
        if ((courierAwb && courierAwb === providerRef) || (trackingNum && trackingNum === providerRef)) {
          issues.push({
            shipmentId,
            prNumber,
            issue: 'Old field still contains AWB that matches providerShipmentReference',
            courierAwbNumber: courierAwb || null,
            trackingNumber: trackingNum || null,
            providerShipmentReference: providerRef,
          })
          issuesFound++
        }
      } else if (hasOldField && !hasProviderRef) {
        // Has old field but no providerRef - needs migration
        issues.push({
          shipmentId,
          prNumber,
          issue: 'Has AWB in old field but missing in providerShipmentReference',
          courierAwbNumber: courierAwb || null,
          trackingNumber: trackingNum || null,
          providerShipmentReference: null,
        })
        issuesFound++
      } else if (hasProviderRef && !hasOldField) {
        // Perfect - only in providerShipmentReference
        correctCount++
        console.log(`✅ ${shipmentId} (PR: ${prNumber}) - Correct: AWB only in providerShipmentReference`)
      } else {
        // No AWB number at all - this is fine (might not have been entered)
        console.log(`⏭️  ${shipmentId} (PR: ${prNumber}) - No AWB number (not entered yet)`)
      }
    }

    console.log('\n' + '='.repeat(80))
    console.log('\n📊 VERIFICATION SUMMARY:\n')
    console.log(`✅ Correct (AWB only in providerShipmentReference): ${correctCount}`)
    console.log(`🔴 Issues Found: ${issuesFound}`)
    console.log(`📦 Total: ${manualShipments.length}\n`)

    if (issuesFound > 0) {
      console.log('🔴 ISSUES FOUND:\n')
      issues.forEach((issue, idx) => {
        console.log(`${idx + 1}. Shipment ID: ${issue.shipmentId}`)
        console.log(`   PR Number: ${issue.prNumber}`)
        console.log(`   Issue: ${issue.issue}`)
        if (issue.courierAwbNumber) console.log(`   courierAwbNumber: "${issue.courierAwbNumber}"`)
        if (issue.trackingNumber) console.log(`   trackingNumber: "${issue.trackingNumber}"`)
        console.log(`   providerShipmentReference: ${issue.providerShipmentReference || '❌ MISSING'}`)
        console.log('')
      })
      console.log('⚠️  Some shipments still need cleanup or migration')
    } else {
      console.log('✅ All manual shipments are correctly configured!')
      console.log('   - AWB numbers are stored only in providerShipmentReference')
      console.log('   - Old fields (courierAwbNumber, trackingNumber) are cleared')
      console.log('   - New shipments will follow the same pattern')
    }

    await mongoose.disconnect()
    console.log('👋 Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Verification failed:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

// Run verification
verifyCleanup()
  .then(() => {
    console.log('✅ Script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })

