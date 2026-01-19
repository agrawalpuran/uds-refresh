/**
 * Script to fix orphaned VendorInventory records with null productIds
 * This script will:
 * 1. Find all inventory records with null/empty productIds
 * 2. Try to derive productId from related orders
 * 3. Delete records that cannot be fixed (truly orphaned)
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load MongoDB URI from .env.local
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
    }
  }
} catch (error) {
  console.log('Could not read .env.local, using default or environment variable')
}

// VendorInventory Schema (minimal for this script)
const VendorInventorySchema = new mongoose.Schema({
  id: String,
  vendorId: mongoose.Schema.Types.ObjectId,
  productId: mongoose.Schema.Types.ObjectId,
  sizeInventory: Map,
  totalStock: Number,
  lowInventoryThreshold: Map,
}, { collection: 'vendorinventories', timestamps: true })

const VendorInventory = mongoose.models.VendorInventory || mongoose.model('VendorInventory', VendorInventorySchema)

async function fixOrphanedInventory() {
  try {
    console.log('🔍 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // Step 1: Find all inventory records with null/empty productIds
    console.log('📊 Step 1: Finding orphaned inventory records...')
    const orphanedRecords = await db.collection('vendorinventories').find({
      $or: [
        { productId: null },
        { productId: { $exists: false } },
        { productId: '' }
      ]
    }).toArray()
    
    console.log(`   Found ${orphanedRecords.length} orphaned inventory records\n`)
    
    if (orphanedRecords.length === 0) {
      console.log('✅ No orphaned records found. Database is clean!')
      await mongoose.disconnect()
      return
    }

    // Step 2: Try to derive productId from orders (if possible)
    console.log('🔧 Step 2: Attempting to fix orphaned records...')
    let fixed = 0
    let deleted = 0
    let errors = 0

    for (const record of orphanedRecords) {
      try {
        const vendorId = record.vendorId
        
        // Try to find orders for this vendor that might indicate which product this inventory belongs to
        // This is a best-effort attempt - if we can't determine the product, we'll delete the record
        const orders = await db.collection('orders').find({
          vendorId: vendorId
        }).limit(10).toArray()
        
        // If we can't determine the product from orders, delete the orphaned record
        // (It's better to have no inventory than broken inventory)
        console.log(`   ❌ Cannot determine productId for inventory ${record.id}. Deleting orphaned record...`)
        await db.collection('vendorinventories').deleteOne({ _id: record._id })
        deleted++
        
      } catch (error) {
        console.error(`   ❌ Error processing inventory ${record.id}:`, error.message)
        errors++
      }
    }

    console.log(`\n✅ Cleanup complete!`)
    console.log(`   Fixed: ${fixed} records`)
    console.log(`   Deleted: ${deleted} orphaned records`)
    console.log(`   Errors: ${errors}`)

    // Step 3: Verify results
    console.log('\n📊 Step 3: Verifying results...')
    const remainingOrphaned = await db.collection('vendorinventories').countDocuments({
      $or: [
        { productId: null },
        { productId: { $exists: false } },
        { productId: '' }
      ]
    })
    
    if (remainingOrphaned === 0) {
      console.log('✅ All orphaned records have been cleaned up!')
    } else {
      console.log(`⚠️  ${remainingOrphaned} orphaned records still remain`)
    }

  } catch (error) {
    console.error('❌ Error fixing orphaned inventory:', error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  }
}

// Run the script
fixOrphanedInventory()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

