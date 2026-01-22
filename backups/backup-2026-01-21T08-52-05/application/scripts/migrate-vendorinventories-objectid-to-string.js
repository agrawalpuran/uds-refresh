/**
 * Migration Script: Convert ObjectId to String ID in vendorinventories Collection
 * 
 * This script converts vendorId and productId fields from ObjectId (or hex strings) 
 * to their corresponding string IDs (6-digit numeric strings) by looking up the 
 * vendor/product records.
 * 
 * Safety Features:
 * - Only updates documents where vendorId or productId are ObjectId types or hex strings
 * - Looks up actual vendor/product IDs from their collections
 * - Preserves all other fields
 * - Logs detailed progress
 * - Includes dry-run mode
 * 
 * Usage:
 *   node scripts/migrate-vendorinventories-objectid-to-string.js [--dry-run]
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

console.log('🚀 Starting migration script...')
console.log(`📋 Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
console.log(`🔗 MongoDB URI: ${MONGODB_URI ? (MONGODB_URI.substring(0, 20) + '...') : 'NOT SET'}`)
console.log('📝 Script will convert ObjectId hex strings to 6-digit numeric IDs')
process.stdout.write('') // Force flush

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

async function migrateVendorInventories() {
  const db = await connectDB()
  const collection = db.collection('vendorinventories')
  const vendorsCollection = db.collection('vendors')
  const uniformsCollection = db.collection('uniforms')
  
  console.log('\n📊 Starting migration: Convert ObjectId to String ID in vendorinventories')
  console.log(`🔍 Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be saved)'}`)
  console.log('─'.repeat(60))
  
  try {
    // Fetch all documents
    const allDocs = await collection.find({}).toArray()
    console.log(`📋 Found ${allDocs.length} total documents in vendorinventories collection`)
    
    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const updates = []
    const showProgress = allDocs.length > 50 // Show progress for large collections
    
    // Helper function to check if a value is an ObjectId or hex string
    const isObjectIdOrHex = (value) => {
      if (!value) return false
      if (value instanceof mongoose.Types.ObjectId) return true
      if (typeof value === 'object' && value._bsontype === 'ObjectId') return true
      if (typeof value === 'object' && value.constructor && value.constructor.name === 'ObjectId') return true
      // Check if it's a hex string (24 characters, all hex)
      if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
        return true
      }
      // Check if it's an ObjectId-like object with toString method that produces 24-char hex string
      if (typeof value === 'object' && typeof value.toString === 'function') {
        const str = value.toString()
        if (typeof str === 'string' && /^[0-9a-fA-F]{24}$/.test(str)) {
          return true
        }
      }
      return false
    }
    
    // Helper function to check if a value is already a 6-digit numeric string ID
    const isNumericId = (value) => {
      return typeof value === 'string' && /^\d{6}$/.test(value)
    }
    
    // Helper function to convert ObjectId/hex to actual ObjectId for lookup
    const toObjectId = (value) => {
      if (value instanceof mongoose.Types.ObjectId) {
        return value
      }
      if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
        return new mongoose.Types.ObjectId(value)
      }
      if (typeof value === 'object' && value.toString) {
        const str = value.toString()
        if (mongoose.Types.ObjectId.isValid(str)) {
          return new mongoose.Types.ObjectId(str)
        }
      }
      return null
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
        // Skip if already a 6-digit numeric ID
        if (!isNumericId(doc.vendorId)) {
          if (isObjectIdOrHex(doc.vendorId)) {
            // Convert ObjectId/hex to ObjectId and look up vendor
            const vendorObjectId = toObjectId(doc.vendorId)
            if (vendorObjectId) {
              const vendor = await vendorsCollection.findOne({ _id: vendorObjectId })
              if (vendor && vendor.id) {
                updateFields.vendorId = String(vendor.id)
                needsUpdate = true
                console.log(`  ✅ Document ${doc._id}: vendorId ${doc.vendorId} → ${vendor.id}`)
              } else {
                console.warn(`  ⚠️  Document ${doc._id}: Vendor not found for ObjectId ${doc.vendorId}`)
                errorCount++
              }
            } else {
              console.warn(`  ⚠️  Document ${doc._id}: Invalid vendorId format: ${doc.vendorId}`)
              errorCount++
            }
          } else {
            // Not ObjectId and not numeric ID - might be invalid
            console.warn(`  ⚠️  Document ${doc._id}: vendorId is neither ObjectId nor numeric ID: ${doc.vendorId}`)
          }
        }
      }
      
      // Check and convert productId
      if (doc.productId !== null && doc.productId !== undefined) {
        // Skip if already a 6-digit numeric ID
        if (!isNumericId(doc.productId)) {
          if (isObjectIdOrHex(doc.productId)) {
            // Convert ObjectId/hex to ObjectId and look up product
            const productObjectId = toObjectId(doc.productId)
            if (productObjectId) {
              const product = await uniformsCollection.findOne({ _id: productObjectId })
              if (product && product.id) {
                updateFields.productId = String(product.id)
                needsUpdate = true
                console.log(`  ✅ Document ${doc._id}: productId ${doc.productId} → ${product.id}`)
              } else {
                console.warn(`  ⚠️  Document ${doc._id}: Product not found for ObjectId ${doc.productId}`)
                errorCount++
              }
            } else {
              console.warn(`  ⚠️  Document ${doc._id}: Invalid productId format: ${doc.productId}`)
              errorCount++
            }
          } else {
            // Not ObjectId and not numeric ID - might be invalid
            console.warn(`  ⚠️  Document ${doc._id}: productId is neither ObjectId nor numeric ID: ${doc.productId}`)
          }
        }
      }
      
      // Only update if at least one field needs conversion
      if (needsUpdate) {
        if (DRY_RUN) {
          console.log(`  🔍 [DRY RUN] Would update document ${doc._id}:`, updateFields)
          updatedCount++
        } else {
          try {
            await collection.updateOne(
              { _id: doc._id },
              { $set: updateFields }
            )
            updatedCount++
            updates.push({
              _id: doc._id,
              id: doc.id,
              changes: updateFields
            })
          } catch (error) {
            console.error(`  ❌ Error updating document ${doc._id}:`, error.message)
            errorCount++
          }
        }
      } else {
        skippedCount++
      }
    }
    
    // Summary
    console.log('\n' + '─'.repeat(60))
    console.log('📊 Migration Summary:')
    console.log(`  ✅ Updated: ${updatedCount} documents`)
    console.log(`  ⏭️  Skipped: ${skippedCount} documents (already have numeric string IDs)`)
    console.log(`  ❌ Errors: ${errorCount} documents`)
    console.log(`  📋 Total: ${allDocs.length} documents`)
    
    if (updatedCount > 0 && !DRY_RUN) {
      console.log('\n📝 Sample updates:')
      updates.slice(0, 5).forEach(update => {
        console.log(`  - Document ${update._id} (id: ${update.id}):`, update.changes)
      })
      if (updates.length > 5) {
        console.log(`  ... and ${updates.length - 5} more`)
      }
    }
    
    if (DRY_RUN) {
      console.log('\n⚠️  DRY RUN MODE: No changes were made to the database')
      console.log('   Run without --dry-run to apply changes')
    } else {
      console.log('\n✅ Migration completed successfully!')
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    throw error
  } finally {
    await mongoose.connection.close()
    console.log('\n🔌 Database connection closed')
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled rejection:', error)
  process.exit(1)
})

// Run migration
migrateVendorInventories()
  .then(() => {
    console.log('\n✅ Script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    console.error('Error stack:', error.stack)
    process.exit(1)
  })
