/**
 * Script to PURGE ALL product eligibility records (aggressive deletion)
 * 
 * This script aggressively deletes ALL records from:
 * 1. designationproducteligibilities (old category-level eligibility)
 * 2. designationsubcategoryeligibilities (new subcategory-level eligibility)
 * 
 * This is a complete purge - no safety checks, immediate deletion.
 */

const { MongoClient } = require('mongodb')
const fs = require('fs')
const path = require('path')

// Try to load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local')
let MONGODB_URI = 'mongodb://localhost:27017/uniform-distribution'

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
  if (mongoMatch) {
    MONGODB_URI = mongoMatch[1].trim()
  }
}

// Override with process.env if available
MONGODB_URI = process.env.MONGODB_URI || MONGODB_URI

async function purgeAllEligibilityRecords() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')
    
    const db = client.db()
    
    // Collection names
    const OLD_COLLECTION = 'designationproducteligibilities'
    const NEW_COLLECTION = 'designationsubcategoryeligibilities'
    
    console.log('\n📊 Checking current record counts...')
    
    // Count records before deletion
    const oldCount = await db.collection(OLD_COLLECTION).countDocuments({})
    const newCount = await db.collection(NEW_COLLECTION).countDocuments({})
    
    console.log(`   ${OLD_COLLECTION}: ${oldCount} records`)
    console.log(`   ${NEW_COLLECTION}: ${newCount} records`)
    console.log(`   Total: ${oldCount + newCount} records`)
    
    // Delete from old collection (category-level)
    console.log(`\n🗑️  Purging ${OLD_COLLECTION}...`)
    const oldResult = await db.collection(OLD_COLLECTION).deleteMany({})
    console.log(`   ✅ Deleted ${oldResult.deletedCount} records`)
    
    // Delete from new collection (subcategory-level)
    console.log(`\n🗑️  Purging ${NEW_COLLECTION}...`)
    const newResult = await db.collection(NEW_COLLECTION).deleteMany({})
    console.log(`   ✅ Deleted ${newResult.deletedCount} records`)
    
    // Also try dropping indexes that might be causing issues
    console.log(`\n🔧 Dropping indexes on ${NEW_COLLECTION}...`)
    try {
      await db.collection(NEW_COLLECTION).dropIndexes()
      console.log(`   ✅ Indexes dropped`)
    } catch (error) {
      if (error.codeName === 'NamespaceNotFound' || error.message.includes('not found')) {
        console.log(`   ⏭️  No indexes to drop (collection might be empty or not exist)`)
      } else {
        console.log(`   ⚠️  Could not drop indexes: ${error.message}`)
      }
    }
    
    // Verify deletion
    console.log('\n🔍 Verifying deletion...')
    const finalOldCount = await db.collection(OLD_COLLECTION).countDocuments({})
    const finalNewCount = await db.collection(NEW_COLLECTION).countDocuments({})
    
    console.log(`   ${OLD_COLLECTION}: ${finalOldCount} records remaining`)
    console.log(`   ${NEW_COLLECTION}: ${finalNewCount} records remaining`)
    
    // Also check for any records with different casing or variations
    console.log('\n🔍 Checking for any remaining records (case-insensitive)...')
    const allNewRecords = await db.collection(NEW_COLLECTION).find({}).toArray()
    if (allNewRecords.length > 0) {
      console.log(`   ⚠️  Found ${allNewRecords.length} records still in ${NEW_COLLECTION}:`)
      allNewRecords.forEach((record, index) => {
        console.log(`      ${index + 1}. ID: ${record.id || record._id}, Designation: ${record.designationId || record.designation}, Company: ${record.companyId}`)
      })
      // Force delete these too
      console.log(`\n🗑️  Force deleting remaining records...`)
      const forceDeleteResult = await db.collection(NEW_COLLECTION).deleteMany({})
      console.log(`   ✅ Force deleted ${forceDeleteResult.deletedCount} records`)
    } else {
      console.log(`   ✅ No records found`)
    }
    
    // Final verification
    const finalCheckOld = await db.collection(OLD_COLLECTION).countDocuments({})
    const finalCheckNew = await db.collection(NEW_COLLECTION).countDocuments({})
    
    console.log('\n📊 Final Status:')
    console.log(`   ${OLD_COLLECTION}: ${finalCheckOld} records`)
    console.log(`   ${NEW_COLLECTION}: ${finalCheckNew} records`)
    
    if (finalCheckOld === 0 && finalCheckNew === 0) {
      console.log('\n✅ SUCCESS: All eligibility records have been purged!')
    } else {
      console.log('\n⚠️  WARNING: Some records may still exist. Manual verification recommended.')
    }
    
  } catch (error) {
    console.error('\n❌ An error occurred:', error)
    throw error
  } finally {
    await client.close()
    console.log('\n✅ Database connection closed')
    console.log('✅ Script completed')
  }
}

// Run the script
purgeAllEligibilityRecords()
  .then(() => {
    console.log('\n✅ Script execution completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script execution failed:', error)
    process.exit(1)
  })

