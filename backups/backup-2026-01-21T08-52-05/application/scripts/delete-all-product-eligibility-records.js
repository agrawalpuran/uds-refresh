/**
 * Script to delete ALL product eligibility records for ALL employees for ALL companies
 * 
 * This script deletes records from:
 * 1. designationproducteligibilities (old category-level eligibility)
 * 2. designationsubcategoryeligibilities (new subcategory-level eligibility)
 * 
 * WARNING: This is a destructive operation. All eligibility rules will be permanently deleted.
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

async function deleteAllProductEligibilityRecords() {
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
    
    if (oldCount === 0 && newCount === 0) {
      console.log('\n✅ No eligibility records found. Nothing to delete.')
      return
    }
    
    console.log('\n⚠️  WARNING: This will permanently delete ALL product eligibility records!')
    console.log('   This includes:')
    console.log('   - All designation-based eligibility rules')
    console.log('   - All category-level eligibility rules')
    console.log('   - All subcategory-level eligibility rules')
    console.log('   - All company-specific eligibility configurations')
    console.log('\n   Press Ctrl+C to cancel, or wait 10 seconds to proceed...')
    
    // Wait 10 seconds for user to cancel
    await new Promise(resolve => setTimeout(resolve, 10000))
    
    console.log('\n🗑️  Starting deletion...')
    
    // Delete from old collection (category-level)
    if (oldCount > 0) {
      console.log(`\n   Deleting from ${OLD_COLLECTION}...`)
      const oldResult = await db.collection(OLD_COLLECTION).deleteMany({})
      console.log(`   ✅ Deleted ${oldResult.deletedCount} records from ${OLD_COLLECTION}`)
    } else {
      console.log(`\n   ⏭️  Skipping ${OLD_COLLECTION} (no records found)`)
    }
    
    // Delete from new collection (subcategory-level)
    if (newCount > 0) {
      console.log(`\n   Deleting from ${NEW_COLLECTION}...`)
      const newResult = await db.collection(NEW_COLLECTION).deleteMany({})
      console.log(`   ✅ Deleted ${newResult.deletedCount} records from ${NEW_COLLECTION}`)
    } else {
      console.log(`\n   ⏭️  Skipping ${NEW_COLLECTION} (no records found)`)
    }
    
    // Verify deletion
    console.log('\n🔍 Verifying deletion...')
    const finalOldCount = await db.collection(OLD_COLLECTION).countDocuments({})
    const finalNewCount = await db.collection(NEW_COLLECTION).countDocuments({})
    
    console.log(`   ${OLD_COLLECTION}: ${finalOldCount} records remaining`)
    console.log(`   ${NEW_COLLECTION}: ${finalNewCount} records remaining`)
    
    if (finalOldCount === 0 && finalNewCount === 0) {
      console.log('\n✅ Successfully deleted all product eligibility records!')
    } else {
      console.log('\n⚠️  Warning: Some records may still exist. Please verify manually.')
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
deleteAllProductEligibilityRecords()
  .then(() => {
    console.log('\n✅ Script execution completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script execution failed:', error)
    process.exit(1)
  })

