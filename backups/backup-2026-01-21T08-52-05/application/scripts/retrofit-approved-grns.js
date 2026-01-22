/**
 * Retrofit script to update existing approved GRNs
 * Sets grnStatus = 'APPROVED' for GRNs that were approved via old workflow
 * but don't have grnStatus field set
 */

const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')

// Load environment variables from .env.local (same pattern as update-pr-po-statuses.js)
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

async function retrofitApprovedGRNs() {
  try {
    // Connect to MongoDB

    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Get GRN collection directly
    const db = mongoose.connection.db
    const grnCollection = db.collection('grns')

    // Find GRNs that are approved but don't have grnStatus = 'APPROVED'
    const query = {
      $and: [
        {
          $or: [
            { grnAcknowledgedByCompany: true },
            { status: 'ACKNOWLEDGED' }
          ]
        },
        {
          $or: [
            { grnStatus: { $ne: 'APPROVED' } },
            { grnStatus: { $exists: false } },
            { grnStatus: null }
          ]
        }
      ]
    }

    const grns = await grnCollection.find(query).toArray()
    console.log(`\n📋 Found ${grns.length} GRN(s) that need retrofitting`)

    if (grns.length === 0) {
      console.log('✅ No GRNs need retrofitting. All approved GRNs already have grnStatus = APPROVED')
      await mongoose.disconnect()
      return
    }

    let updated = 0
    let skipped = 0

    for (const grn of grns) {
      try {
        const updateData = {
          grnStatus: 'APPROVED'
        }

        // Copy acknowledgment data to approval fields if not already set
        if (!grn.approvedBy && grn.grnAcknowledgedBy) {
          updateData.approvedBy = grn.grnAcknowledgedBy
        }
        if (!grn.approvedAt && grn.grnAcknowledgedDate) {
          updateData.approvedAt = grn.grnAcknowledgedDate
        }

        await grnCollection.updateOne(
          { _id: grn._id },
          { $set: updateData }
        )

        console.log(`✅ Updated GRN ${grn.id || grn.grnNumber}: Set grnStatus = APPROVED`)
        updated++
      } catch (error) {
        console.error(`❌ Error updating GRN ${grn.id || grn.grnNumber}:`, error.message)
        skipped++
      }
    }

    console.log(`\n📊 Retrofit Summary:`)
    console.log(`   ✅ Updated: ${updated}`)
    console.log(`   ⚠️  Skipped: ${skipped}`)
    console.log(`   📋 Total: ${grns.length}`)

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

// Run the script
retrofitApprovedGRNs()

