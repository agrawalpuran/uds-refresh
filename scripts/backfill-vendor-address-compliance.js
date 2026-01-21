/**
 * Migration script to backfill existing vendors with address and compliance fields
 * 
 * This script populates dummy/default values for all mandatory newly added fields
 * for existing vendor records to ensure backward compatibility.
 * 
 * Fields being backfilled:
 * - Address: address_line_1, city, state, pincode, country (mandatory)
 * - Address: address_line_2, address_line_3 (optional, set to empty)
 * - Compliance: gst_number (mandatory)
 * - Banking: registration_number, bank_name, branch_address, ifsc_code, account_number (optional, set to empty)
 * 
 * Usage:
 *   node scripts/backfill-vendor-address-compliance.js
 *   
 * Or with custom MongoDB URI:
 *   MONGODB_URI="your-connection-string" node scripts/backfill-vendor-address-compliance.js
 */

const { MongoClient } = require('mongodb')

// Default MongoDB URI - uses environment variable or falls back to local
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Default values for mandatory fields
const DEFAULT_VALUES = {
  // Address fields
  address_line_1: 'To Be Updated',
  address_line_2: '',
  address_line_3: '',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400001',
  country: 'India',
  // Compliance fields
  registration_number: '',
  gst_number: '27AAPFU0939F1ZV', // Default valid GST format for Maharashtra
  // Banking fields
  bank_name: '',
  branch_address: '',
  ifsc_code: '',
  account_number: ''
}

async function backfillVendors() {
  let client = null
  
  try {
    console.log('🚀 Starting vendor data backfill migration...')
    console.log('')
    console.log('📡 Connecting to MongoDB...')
    
    // Connect to database
    client = new MongoClient(MONGODB_URI)
    await client.connect()
    const db = client.db()
    console.log('✅ Connected to MongoDB')
    console.log(`   Database: ${db.databaseName}`)
    console.log('')

    // Get vendors collection
    const vendorsCollection = db.collection('vendors')
    
    // Count total vendors
    const totalVendors = await vendorsCollection.countDocuments()
    console.log(`📊 Found ${totalVendors} vendors in database`)
    console.log('')

    if (totalVendors === 0) {
      console.log('⚠️  No vendors found. Nothing to migrate.')
      return
    }

    // Find vendors that need backfilling (missing any mandatory field)
    const vendorsNeedingUpdate = await vendorsCollection.find({
      $or: [
        { address_line_1: { $exists: false } },
        { address_line_1: null },
        { address_line_1: '' },
        { city: { $exists: false } },
        { city: null },
        { city: '' },
        { state: { $exists: false } },
        { state: null },
        { state: '' },
        { pincode: { $exists: false } },
        { pincode: null },
        { pincode: '' },
        { country: { $exists: false } },
        { country: null },
        { country: '' },
        { gst_number: { $exists: false } },
        { gst_number: null },
        { gst_number: '' }
      ]
    }).toArray()

    console.log(`🔍 Found ${vendorsNeedingUpdate.length} vendors needing backfill`)
    console.log('')

    if (vendorsNeedingUpdate.length === 0) {
      console.log('✅ All vendors already have required fields. No updates needed.')
      return
    }

    // Process each vendor
    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (const vendor of vendorsNeedingUpdate) {
      try {
        console.log(`📦 Processing vendor: ${vendor.name} (ID: ${vendor.id})...`)
        
        // Build update object - only update fields that are missing or empty
        const updateFields = {}
        
        // Address fields
        if (!vendor.address_line_1) {
          updateFields.address_line_1 = DEFAULT_VALUES.address_line_1
        }
        if (vendor.address_line_2 === undefined) {
          updateFields.address_line_2 = DEFAULT_VALUES.address_line_2
        }
        if (vendor.address_line_3 === undefined) {
          updateFields.address_line_3 = DEFAULT_VALUES.address_line_3
        }
        if (!vendor.city) {
          updateFields.city = DEFAULT_VALUES.city
        }
        if (!vendor.state) {
          updateFields.state = DEFAULT_VALUES.state
        }
        if (!vendor.pincode) {
          updateFields.pincode = DEFAULT_VALUES.pincode
        }
        if (!vendor.country) {
          updateFields.country = DEFAULT_VALUES.country
        }
        
        // Compliance fields
        if (vendor.registration_number === undefined) {
          updateFields.registration_number = DEFAULT_VALUES.registration_number
        }
        if (!vendor.gst_number) {
          // Generate a unique GST number based on vendor ID to avoid duplicates
          // Using vendor ID's last 4 digits if numeric, otherwise generate from name hash
          const vendorIdNum = parseInt(vendor.id, 10)
          const suffix = !isNaN(vendorIdNum) 
            ? String(vendorIdNum).padStart(4, '0').slice(-4)
            : String(Math.abs(hashCode(vendor.id || vendor.name))).slice(-4).padStart(4, '0')
          updateFields.gst_number = `27AAPFU${suffix}F1ZV`
        }
        
        // Banking fields (optional - set to empty if not present)
        if (vendor.bank_name === undefined) {
          updateFields.bank_name = DEFAULT_VALUES.bank_name
        }
        if (vendor.branch_address === undefined) {
          updateFields.branch_address = DEFAULT_VALUES.branch_address
        }
        if (vendor.ifsc_code === undefined) {
          updateFields.ifsc_code = DEFAULT_VALUES.ifsc_code
        }
        if (vendor.account_number === undefined) {
          updateFields.account_number = DEFAULT_VALUES.account_number
        }
        
        // Only update if there are fields to update
        if (Object.keys(updateFields).length === 0) {
          console.log(`   ⏭️  Skipped - no fields need updating`)
          skippedCount++
          continue
        }
        
        // Perform the update
        const result = await vendorsCollection.updateOne(
          { _id: vendor._id },
          { $set: updateFields }
        )
        
        if (result.modifiedCount > 0) {
          console.log(`   ✅ Updated ${Object.keys(updateFields).length} fields`)
          updatedCount++
        } else {
          console.log(`   ⚠️  No changes made`)
          skippedCount++
        }
        
      } catch (error) {
        console.error(`   ❌ Error updating vendor ${vendor.id}: ${error.message}`)
        errorCount++
      }
    }

    console.log('')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('📊 Migration Summary')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`   Total vendors processed: ${vendorsNeedingUpdate.length}`)
    console.log(`   ✅ Successfully updated: ${updatedCount}`)
    console.log(`   ⏭️  Skipped (no changes needed): ${skippedCount}`)
    console.log(`   ❌ Errors: ${errorCount}`)
    console.log('')
    
    // Verify the migration
    console.log('🔍 Verifying migration...')
    const vendorsStillNeedingUpdate = await vendorsCollection.countDocuments({
      $or: [
        { address_line_1: { $exists: false } },
        { address_line_1: null },
        { address_line_1: '' },
        { gst_number: { $exists: false } },
        { gst_number: null },
        { gst_number: '' }
      ]
    })
    
    if (vendorsStillNeedingUpdate === 0) {
      console.log('   ✅ All vendors now have required fields!')
    } else {
      console.log(`   ⚠️  ${vendorsStillNeedingUpdate} vendors still missing required fields`)
    }
    
    // Sample verification
    console.log('')
    console.log('📝 Sample vendor data after migration:')
    const sampleVendor = await vendorsCollection.findOne({})
    if (sampleVendor) {
      console.log(`   Vendor: ${sampleVendor.name} (ID: ${sampleVendor.id})`)
      console.log(`   Address: ${sampleVendor.address_line_1}, ${sampleVendor.city}, ${sampleVendor.state} - ${sampleVendor.pincode}`)
      console.log(`   GST: ${sampleVendor.gst_number}`)
    }

  } catch (error) {
    console.error('')
    console.error('❌ Migration failed:', error.message)
    console.error('')
    console.error('💡 Troubleshooting:')
    console.error('   1. Check MongoDB is running')
    console.error('   2. Verify connection string is correct')
    console.error('   3. Check database user has write permissions')
    throw error
  } finally {
    // Close connection
    if (client) {
      await client.close()
      console.log('')
      console.log('🔌 Closed database connection')
    }
  }
}

// Simple hash function for generating unique values
function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash
}

// Run migration
backfillVendors()
  .then(() => {
    console.log('')
    console.log('🎉 Vendor backfill migration completed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('')
    console.error('❌ Migration script failed:', error.message)
    process.exit(1)
  })
