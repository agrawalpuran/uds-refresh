/**
 * Migrate vendor IDs from string format (VEND-001) to 6-digit numeric (100001)
 * Updates all related collections: ProductVendor, Orders, Inventory, etc.
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

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
  console.warn('Could not read .env.local')
}

async function migrateVendorIds() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    console.log('='.repeat(80))
    console.log('MIGRATING VENDOR IDs TO 6-DIGIT NUMERIC FORMAT')
    console.log('='.repeat(80))
    console.log()

    // Get all vendors
    const vendors = await db.collection('vendors').find({}).sort({ _id: 1 }).toArray()
    
    if (vendors.length === 0) {
      console.log('No vendors found. Nothing to migrate.')
      await mongoose.disconnect()
      return
    }

    console.log(`Found ${vendors.length} vendor(s) to migrate\n`)

    // Create mapping: old ID -> new 6-digit numeric ID
    const vendorIdMap = new Map()
    let nextNumericId = 100001

    vendors.forEach((vendor, index) => {
      const oldId = vendor.id
      const newId = String(nextNumericId).padStart(6, '0')
      vendorIdMap.set(vendor._id.toString(), { oldId, newId, vendor })
      console.log(`Vendor ${index + 1}: ${vendor.name}`)
      console.log(`   Old ID: ${oldId}`)
      console.log(`   New ID: ${newId}`)
      console.log(`   _id: ${vendor._id}`)
      console.log()
      nextNumericId++
    })

    console.log('='.repeat(80))
    console.log('STEP 1: Updating vendor documents')
    console.log('='.repeat(80))
    console.log()

    // Update vendor documents
    let updatedVendors = 0
    for (const [vendorObjectId, mapping] of vendorIdMap.entries()) {
      try {
        // Use the _id directly from the vendor object (it's already an ObjectId)
        const result = await db.collection('vendors').updateOne(
          { _id: mapping.vendor._id },
          { $set: { id: mapping.newId } }
        )
        if (result.modifiedCount > 0) {
          updatedVendors++
          console.log(`✅ Updated vendor ${mapping.vendor.name}: ${mapping.oldId} → ${mapping.newId}`)
        } else if (result.matchedCount > 0) {
          console.log(`⚠️  Vendor ${mapping.vendor.name} matched but not modified (id may already be ${mapping.newId})`)
        } else {
          console.log(`❌ Vendor ${mapping.vendor.name} not found with _id: ${vendorObjectId}`)
        }
      } catch (error) {
        console.error(`❌ Error updating vendor ${mapping.vendor.name}:`, error.message)
      }
    }

    console.log(`\n✅ Updated ${updatedVendors} vendor document(s)`)
    console.log()

    // Note: ProductVendor, Orders, and Inventory use vendor._id (ObjectId), not vendor.id
    // So we don't need to update those collections - they reference by _id which doesn't change
    // However, we should verify that the code uses vendor.id correctly

    console.log('='.repeat(80))
    console.log('VERIFICATION')
    console.log('='.repeat(80))
    console.log()

    // Verify the updates
    const updatedVendorsCheck = await db.collection('vendors').find({}).toArray()
    console.log('Updated vendor IDs:')
    updatedVendorsCheck.forEach((vendor, index) => {
      const isNumeric = /^\d{6}$/.test(vendor.id)
      const status = isNumeric ? '✅' : '❌'
      console.log(`   ${status} ${vendor.name}: id = "${vendor.id}" ${isNumeric ? '(6-digit numeric)' : '(NOT numeric!)'}`)
    })

    // Check if any non-numeric IDs remain
    const nonNumericVendors = updatedVendorsCheck.filter(v => !/^\d{6}$/.test(v.id))
    if (nonNumericVendors.length > 0) {
      console.log(`\n⚠️  WARNING: ${nonNumericVendors.length} vendor(s) still have non-numeric IDs:`)
      nonNumericVendors.forEach(v => {
        console.log(`   - ${v.name}: "${v.id}"`)
      })
    } else {
      console.log('\n✅ All vendor IDs are now 6-digit numeric!')
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
    console.log('\n🎉 Migration complete!')
    console.log('\nNOTE: ProductVendor, Orders, and Inventory collections use vendor._id (ObjectId)')
    console.log('      which doesn\'t change. Only the vendor.id field was updated.')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

migrateVendorIds()

