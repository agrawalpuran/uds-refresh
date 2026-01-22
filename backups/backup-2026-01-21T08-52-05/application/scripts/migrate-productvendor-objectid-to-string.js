/**
 * Migration Script: Convert ObjectId to String in productvendors Collection
 * 
 * This script converts vendorId and productId fields from ObjectId to string format
 * in the productvendors collection.
 * 
 * Safety Features:
 * - Only updates documents where vendorId or productId are ObjectId types
 * - Preserves all other fields
 * - Logs detailed progress
 * - Includes dry-run mode
 * 
 * Usage:
 *   node scripts/migrate-productvendor-objectid-to-string.js [--dry-run]
 */

// Try to load dotenv if available (optional)
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // dotenv not available, will use environment variables directly
}

const mongoose = require('mongoose')

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Check for dry-run flag
const DRY_RUN = process.argv.includes('--dry-run')

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    })
    console.log('✅ Connected to MongoDB')
    return mongoose.connection.db
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message)
    process.exit(1)
  }
}

async function migrateProductVendors() {
  const db = await connectDB()
  const collection = db.collection('productvendors')
  
  console.log('\n📊 Starting migration: Convert ObjectId to String in productvendors')
  console.log(`🔍 Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be saved)'}`)
  console.log('─'.repeat(60))
  
  try {
    // Fetch all documents
    const allDocs = await collection.find({}).toArray()
    console.log(`📋 Found ${allDocs.length} total documents in productvendors collection`)
    
    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const updates = []
    const showProgress = allDocs.length > 50 // Show progress for large collections
    
    // Helper function to check if a value is an ObjectId
    const isObjectId = (value) => {
      if (!value) return false
      if (value instanceof mongoose.Types.ObjectId) return true
      if (typeof value === 'object' && value._bsontype === 'ObjectId') return true
      if (typeof value === 'object' && value.constructor && value.constructor.name === 'ObjectId') return true
      // Check if it's an ObjectId-like object with toString method that produces 24-char hex string
      if (typeof value === 'object' && typeof value.toString === 'function') {
        const str = value.toString()
        if (typeof str === 'string' && /^[0-9a-fA-F]{24}$/.test(str)) {
          return true
        }
      }
      return false
    }
    
    // Process each document
    for (let i = 0; i < allDocs.length; i++) {
      const doc = allDocs[i]
      
      // Show progress for large collections
      if (showProgress && (i + 1) % 50 === 0) {
        console.log(`  📊 Progress: ${i + 1}/${allDocs.length} documents processed...`)
      }
      const updateFields = {}
      let needsUpdate = false
      
      // Check and convert vendorId
      if (doc.vendorId !== null && doc.vendorId !== undefined) {
        if (isObjectId(doc.vendorId)) {
          // Convert ObjectId to string
          const stringValue = doc.vendorId.toString()
          // Safety check: ensure we got a valid string
          if (typeof stringValue === 'string' && stringValue.length > 0) {
            updateFields.vendorId = stringValue
            needsUpdate = true
            if (!showProgress) { // Only log details for small collections
              console.log(`  🔄 Document ${doc._id}: Converting vendorId from ObjectId to string`)
            }
          } else {
            console.warn(`  ⚠️  Document ${doc._id}: vendorId.toString() returned invalid value: ${stringValue}`)
          }
        } else if (typeof doc.vendorId !== 'string') {
          // If it's not a string and not an ObjectId, try to convert it
          const stringValue = String(doc.vendorId)
          if (stringValue && stringValue !== 'null' && stringValue !== 'undefined') {
            updateFields.vendorId = stringValue
            needsUpdate = true
            console.log(`  🔄 Document ${doc._id}: Converting vendorId from ${typeof doc.vendorId} to string`)
          }
        }
      }
      
      // Check and convert productId
      if (doc.productId !== null && doc.productId !== undefined) {
        if (isObjectId(doc.productId)) {
          // Convert ObjectId to string
          const stringValue = doc.productId.toString()
          // Safety check: ensure we got a valid string
          if (typeof stringValue === 'string' && stringValue.length > 0) {
            updateFields.productId = stringValue
            needsUpdate = true
            if (!showProgress) { // Only log details for small collections
              console.log(`  🔄 Document ${doc._id}: Converting productId from ObjectId to string`)
            }
          } else {
            console.warn(`  ⚠️  Document ${doc._id}: productId.toString() returned invalid value: ${stringValue}`)
          }
        } else if (typeof doc.productId !== 'string') {
          // If it's not a string and not an ObjectId, try to convert it
          const stringValue = String(doc.productId)
          if (stringValue && stringValue !== 'null' && stringValue !== 'undefined') {
            updateFields.productId = stringValue
            needsUpdate = true
            console.log(`  🔄 Document ${doc._id}: Converting productId from ${typeof doc.productId} to string`)
          }
        }
      }
      
      if (needsUpdate) {
        if (DRY_RUN) {
          console.log(`  📝 [DRY RUN] Would update document ${doc._id}:`, updateFields)
          updates.push({ _id: doc._id, updateFields })
        } else {
          try {
            // Safety check: Only update vendorId and productId fields
            const result = await collection.updateOne(
              { _id: doc._id },
              { $set: updateFields }
            )
            
            if (result.modifiedCount === 1) {
              updatedCount++
              console.log(`  ✅ Updated document ${doc._id}`)
            } else {
              console.log(`  ⚠️  Document ${doc._id} was not modified (may have been updated concurrently)`)
            }
          } catch (error) {
            errorCount++
            console.error(`  ❌ Error updating document ${doc._id}:`, error.message)
          }
        }
      } else {
        skippedCount++
        // Only log skipped documents if they're already strings (to avoid too much output)
        if (typeof doc.vendorId === 'string' && typeof doc.productId === 'string') {
          // Skip logging - already correct format
        } else {
          console.log(`  ⏭️  Skipping document ${doc._id}: Fields are not ObjectId types`)
        }
      }
    }
    
    // Summary
    console.log('\n' + '─'.repeat(60))
    console.log('📊 Migration Summary:')
    console.log(`   Total documents processed: ${allDocs.length}`)
    
    if (DRY_RUN) {
      console.log(`   📝 Documents that would be updated: ${updates.length}`)
      console.log(`   ⏭️  Documents that would be skipped: ${skippedCount}`)
      console.log('\n⚠️  DRY RUN MODE - No changes were made to the database')
      console.log('   Run without --dry-run to apply changes')
      
      // Show sample updates in dry-run mode
      if (updates.length > 0) {
        console.log('\n📋 Sample updates that would be made:')
        updates.slice(0, 5).forEach(({ _id, updateFields }) => {
          console.log(`   Document ${_id}:`, JSON.stringify(updateFields, null, 2))
        })
        if (updates.length > 5) {
          console.log(`   ... and ${updates.length - 5} more`)
        }
      }
    } else {
      console.log(`   ✅ Documents updated: ${updatedCount}`)
      console.log(`   ⏭️  Documents skipped: ${skippedCount}`)
      console.log(`   ❌ Errors: ${errorCount}`)
      
      // Verify conversion by checking a few updated documents
      if (updatedCount > 0) {
        console.log('\n🔍 Verification: Checking updated documents...')
        const sampleDocs = await collection.find({
          $or: [
            { vendorId: { $type: 'string' } },
            { productId: { $type: 'string' } }
          ]
        }).limit(3).toArray()
        
        if (sampleDocs.length > 0) {
          console.log('   Sample converted documents:')
          sampleDocs.forEach(doc => {
            console.log(`   - Document ${doc._id}:`)
            console.log(`     vendorId: ${doc.vendorId} (type: ${typeof doc.vendorId})`)
            console.log(`     productId: ${doc.productId} (type: ${typeof doc.productId})`)
          })
        }
        
        // Count remaining ObjectIds (should be 0)
        const remainingObjectIds = await collection.countDocuments({
          $or: [
            { vendorId: { $type: 'objectId' } },
            { productId: { $type: 'objectId' } }
          ]
        })
        
        if (remainingObjectIds === 0) {
          console.log('\n   ✅ All ObjectIds have been converted to strings!')
        } else {
          console.log(`\n   ⚠️  Warning: ${remainingObjectIds} documents still have ObjectId types`)
          console.log('   You may need to run the migration again or check for edge cases')
        }
      }
    }
    
    console.log('\n✅ Migration completed successfully!')
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Disconnected from MongoDB')
  }
}

// Run migration
migrateProductVendors()
  .then(() => {
    console.log('\n✨ Script finished')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error)
    process.exit(1)
  })
