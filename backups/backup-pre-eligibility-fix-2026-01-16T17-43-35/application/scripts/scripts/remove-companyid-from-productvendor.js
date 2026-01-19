/**
 * Migration script to remove companyId field from ProductVendor collection
 * 
 * ProductVendor relationships no longer need companyId because:
 * - Company access is validated via ProductCompany relationships
 * - A product-vendor relationship is independent of company
 * - This simplifies the data model and reduces redundancy
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

async function removeCompanyIdFromProductVendor() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    const collection = db.collection('productvendors')
    
    // Count documents with companyId
    const totalDocs = await collection.countDocuments({})
    const docsWithCompanyId = await collection.countDocuments({ companyId: { $exists: true, $ne: null } })
    
    console.log(`Total ProductVendor documents: ${totalDocs}`)
    console.log(`Documents with companyId: ${docsWithCompanyId}\n`)

    if (docsWithCompanyId === 0) {
      console.log('✅ No documents have companyId field - nothing to remove')
      await mongoose.disconnect()
      process.exit(0)
    }

    // Check for duplicate product-vendor combinations that would violate unique index
    console.log('Checking for potential duplicate product-vendor combinations...')
    const allDocs = await collection.find({}).toArray()
    const productVendorMap = new Map()
    const duplicates = []

    for (const doc of allDocs) {
      const key = `${doc.productId?.toString()}_${doc.vendorId?.toString()}`
      if (productVendorMap.has(key)) {
        duplicates.push({
          existing: productVendorMap.get(key),
          duplicate: doc
        })
      } else {
        productVendorMap.set(key, doc)
      }
    }

    if (duplicates.length > 0) {
      console.log(`⚠️  WARNING: Found ${duplicates.length} duplicate product-vendor combinations:`)
      duplicates.forEach((dup, idx) => {
        console.log(`  ${idx + 1}. Product: ${dup.existing.productId}, Vendor: ${dup.existing.vendorId}`)
        console.log(`     Existing _id: ${dup.existing._id}`)
        console.log(`     Duplicate _id: ${dup.duplicate._id}`)
      })
      console.log('\nThese duplicates will be removed (keeping the first occurrence)')
    }

    // Remove duplicates first (keep the first occurrence)
    if (duplicates.length > 0) {
      const duplicateIds = duplicates.map(d => d.duplicate._id)
      const deleteResult = await collection.deleteMany({ _id: { $in: duplicateIds } })
      console.log(`✅ Removed ${deleteResult.deletedCount} duplicate document(s)\n`)
    }

    // Remove companyId field from all documents
    console.log('Removing companyId field from ProductVendor documents...')
    const updateResult = await collection.updateMany(
      { companyId: { $exists: true } },
      { $unset: { companyId: '' } }
    )
    
    console.log(`✅ Removed companyId from ${updateResult.modifiedCount} document(s)\n`)

    // Verify removal
    const remainingWithCompanyId = await collection.countDocuments({ companyId: { $exists: true, $ne: null } })
    if (remainingWithCompanyId === 0) {
      console.log('✅ Verification: All companyId fields have been removed')
    } else {
      console.log(`⚠️  WARNING: ${remainingWithCompanyId} document(s) still have companyId field`)
    }

    // Drop the old compound index that includes companyId
    console.log('\nDropping old compound index (productId, vendorId, companyId)...')
    try {
      await collection.dropIndex('productId_1_vendorId_1_companyId_1')
      console.log('✅ Dropped old compound index')
    } catch (error) {
      if (error.code === 27 || error.message.includes('index not found')) {
        console.log('ℹ️  Index does not exist (may have been dropped already)')
      } else {
        console.log(`⚠️  Could not drop index: ${error.message}`)
      }
    }

    // Drop companyId index if it exists
    console.log('Dropping companyId index...')
    try {
      await collection.dropIndex('companyId_1')
      console.log('✅ Dropped companyId index')
    } catch (error) {
      if (error.code === 27 || error.message.includes('index not found')) {
        console.log('ℹ️  Index does not exist (may have been dropped already)')
      } else {
        console.log(`⚠️  Could not drop index: ${error.message}`)
      }
    }

    // Create new compound index without companyId
    console.log('\nCreating new compound index (productId, vendorId)...')
    try {
      await collection.createIndex({ productId: 1, vendorId: 1 }, { unique: true })
      console.log('✅ Created new compound index')
    } catch (error) {
      if (error.code === 85 || error.message.includes('duplicate key')) {
        console.log('ℹ️  Index already exists')
      } else {
        console.log(`⚠️  Could not create index: ${error.message}`)
      }
    }

    console.log('\n✅ Migration completed successfully!')
    console.log('\nSummary:')
    console.log(`  - Total documents: ${totalDocs}`)
    console.log(`  - Documents with companyId removed: ${updateResult.modifiedCount}`)
    console.log(`  - Duplicates removed: ${duplicates.length}`)
    console.log(`  - Remaining documents: ${await collection.countDocuments({})}`)

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

removeCompanyIdFromProductVendor()

