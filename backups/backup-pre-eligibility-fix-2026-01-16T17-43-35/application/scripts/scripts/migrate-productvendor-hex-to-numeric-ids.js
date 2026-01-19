/**
 * Migration Script: Convert ObjectId Hex Strings to 6-Digit Numeric IDs
 * 
 * This script converts vendorId and productId fields from ObjectId hex strings
 * (24-character) to 6-digit numeric IDs by looking up the actual vendor/product records.
 * 
 * Safety Features:
 * - Only updates documents where IDs are ObjectId hex strings
 * - Looks up actual vendor/product records to get numeric IDs
 * - Preserves all other fields
 * - Logs detailed progress
 * - Includes dry-run mode
 * 
 * Usage:
 *   node scripts/migrate-productvendor-hex-to-numeric-ids.js [--dry-run]
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
  const productvendorsCollection = db.collection('productvendors')
  const uniformsCollection = db.collection('uniforms')
  const vendorsCollection = db.collection('vendors')
  
  console.log('\n📊 Starting migration: Convert ObjectId hex strings to 6-digit numeric IDs')
  console.log(`🔍 Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be saved)'}`)
  console.log('─'.repeat(60))
  
  try {
    // Fetch all documents
    const allDocs = await productvendorsCollection.find({}).toArray()
    console.log(`📋 Found ${allDocs.length} total documents in productvendors collection\n`)
    
    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const updates = []
    const notFound = []
    
    // Helper function to check if a string is an ObjectId hex string
    const isObjectIdHex = (value) => {
      return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)
    }
    
    // Helper function to check if a string is a 6-digit numeric ID
    const isNumericId = (value) => {
      return typeof value === 'string' && /^\d{6}$/.test(value)
    }
    
    // Process each document
    for (let i = 0; i < allDocs.length; i++) {
      const doc = allDocs[i]
      const updateFields = {}
      let needsUpdate = false
      const docErrors = []
      
      // Check and convert vendorId
      if (doc.vendorId) {
        if (isObjectIdHex(doc.vendorId)) {
          // Try to find vendor by _id
          try {
            const vendorObjectId = new mongoose.Types.ObjectId(doc.vendorId)
            const vendor = await vendorsCollection.findOne({ _id: vendorObjectId })
            
            if (vendor && vendor.id && isNumericId(vendor.id)) {
              updateFields.vendorId = vendor.id
              needsUpdate = true
              console.log(`  🔄 Document ${doc._id}: vendorId "${doc.vendorId}" → "${vendor.id}" (${vendor.name || 'N/A'})`)
            } else {
              docErrors.push(`vendorId "${doc.vendorId}": Vendor not found or missing numeric ID`)
              notFound.push({
                documentId: doc._id,
                field: 'vendorId',
                hexValue: doc.vendorId,
                reason: vendor ? 'Vendor found but missing numeric ID' : 'Vendor not found'
              })
            }
          } catch (error) {
            docErrors.push(`vendorId "${doc.vendorId}": ${error.message}`)
            errorCount++
          }
        } else if (!isNumericId(doc.vendorId)) {
          docErrors.push(`vendorId "${doc.vendorId}": Unknown format (not ObjectId hex or 6-digit numeric)`)
        }
      }
      
      // Check and convert productId
      if (doc.productId) {
        if (isObjectIdHex(doc.productId)) {
          // Try to find product by _id
          try {
            const productObjectId = new mongoose.Types.ObjectId(doc.productId)
            const product = await uniformsCollection.findOne({ _id: productObjectId })
            
            if (product && product.id && isNumericId(product.id)) {
              updateFields.productId = product.id
              needsUpdate = true
              console.log(`  🔄 Document ${doc._id}: productId "${doc.productId}" → "${product.id}" (${product.name || 'N/A'})`)
            } else {
              docErrors.push(`productId "${doc.productId}": Product not found or missing numeric ID`)
              notFound.push({
                documentId: doc._id,
                field: 'productId',
                hexValue: doc.productId,
                reason: product ? 'Product found but missing numeric ID' : 'Product not found'
              })
            }
          } catch (error) {
            docErrors.push(`productId "${doc.productId}": ${error.message}`)
            errorCount++
          }
        } else if (!isNumericId(doc.productId)) {
          docErrors.push(`productId "${doc.productId}": Unknown format (not ObjectId hex or 6-digit numeric)`)
        }
      }
      
      if (needsUpdate) {
        if (DRY_RUN) {
          console.log(`  📝 [DRY RUN] Would update document ${doc._id}:`, updateFields)
          updates.push({ _id: doc._id, updateFields, errors: docErrors })
        } else {
          try {
            // Safety check: Only update vendorId and productId fields
            const result = await productvendorsCollection.updateOne(
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
        if (docErrors.length === 0) {
          skippedCount++
          // Document already has correct format
        } else {
          errorCount++
          console.error(`  ❌ Document ${doc._id} has errors:`, docErrors.join(', '))
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
      console.log(`   ⚠️  Documents with lookup errors: ${notFound.length}`)
      console.log('\n⚠️  DRY RUN MODE - No changes were made to the database')
      console.log('   Run without --dry-run to apply changes')
      
      // Show sample updates
      if (updates.length > 0) {
        console.log('\n📋 Sample updates that would be made:')
        updates.slice(0, 5).forEach(({ _id, updateFields }) => {
          console.log(`   Document ${_id}:`, JSON.stringify(updateFields, null, 2))
        })
        if (updates.length > 5) {
          console.log(`   ... and ${updates.length - 5} more`)
        }
      }
      
      // Show not found items
      if (notFound.length > 0) {
        console.log('\n⚠️  Items that could not be mapped:')
        notFound.forEach(({ documentId, field, hexValue, reason }) => {
          console.log(`   Document ${documentId}, ${field} "${hexValue}": ${reason}`)
        })
      }
    } else {
      console.log(`   ✅ Documents updated: ${updatedCount}`)
      console.log(`   ⏭️  Documents skipped: ${skippedCount}`)
      console.log(`   ❌ Errors: ${errorCount}`)
      
      // Verify conversion
      if (updatedCount > 0) {
        console.log('\n🔍 Verification: Checking updated documents...')
        const sampleDocs = await productvendorsCollection.find({
          $or: [
            { vendorId: { $regex: /^\d{6}$/ } },
            { productId: { $regex: /^\d{6}$/ } }
          ]
        }).limit(3).toArray()
        
        if (sampleDocs.length > 0) {
          console.log('   Sample converted documents:')
          sampleDocs.forEach(doc => {
            console.log(`   - Document ${doc._id}:`)
            console.log(`     vendorId: ${doc.vendorId} (${isNumericId(doc.vendorId) ? '✅ numeric' : '❌ not numeric'})`)
            console.log(`     productId: ${doc.productId} (${isNumericId(doc.productId) ? '✅ numeric' : '❌ not numeric'})`)
          })
        }
        
        // Count remaining hex strings
        const remainingHex = await productvendorsCollection.countDocuments({
          $or: [
            { vendorId: { $regex: /^[0-9a-fA-F]{24}$/ } },
            { productId: { $regex: /^[0-9a-fA-F]{24}$/ } }
          ]
        })
        
        if (remainingHex === 0) {
          console.log('\n   ✅ All ObjectId hex strings have been converted to numeric IDs!')
        } else {
          console.log(`\n   ⚠️  Warning: ${remainingHex} documents still have ObjectId hex strings`)
          console.log('   Some vendors/products may not exist in the database')
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
