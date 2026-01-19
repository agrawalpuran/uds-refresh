/**
 * Cleanup script to remove orphaned inventory records
 * 
 * This script will:
 * 1. Find all inventory records where the product doesn't exist
 * 2. Delete those orphaned inventory records
 * 3. Optionally clean up ProductVendor relationships pointing to non-existent products
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

// Minimal schemas
const UniformSchema = new mongoose.Schema({}, { collection: 'uniforms', strict: false })
const VendorInventorySchema = new mongoose.Schema({}, { collection: 'vendorinventories', strict: false })
const ProductVendorSchema = new mongoose.Schema({}, { collection: 'productvendors', strict: false })

const Uniform = mongoose.models.Uniform || mongoose.model('Uniform', UniformSchema)
const VendorInventory = mongoose.models.VendorInventory || mongoose.model('VendorInventory', VendorInventorySchema)
const ProductVendor = mongoose.models.ProductVendor || mongoose.model('ProductVendor', ProductVendorSchema)

async function cleanupOrphanedInventory() {
  try {
    console.log('🔍 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Step 1: Get all inventory records
    console.log('📦 Finding all inventory records...')
    const allInventory = await VendorInventory.find({})
    console.log(`   Found ${allInventory.length} total inventory records\n`)

    if (allInventory.length === 0) {
      console.log('ℹ️ No inventory records found. Nothing to clean up.')
      await mongoose.disconnect()
      return
    }

    // Step 2: Get all product ObjectIds from inventory
    const productObjectIds = [...new Set(allInventory.map(inv => inv.productId?.toString()).filter(Boolean))]
    console.log(`🔍 Checking ${productObjectIds.length} unique product ObjectIds...`)

    // Step 3: Check which products exist
    const products = await Uniform.find({ _id: { $in: productObjectIds.map(id => new mongoose.Types.ObjectId(id)) } })
    const existingProductIds = new Set(products.map(p => p._id.toString()))
    console.log(`   ✅ Found ${products.length} existing products`)
    console.log(`   ❌ Missing ${productObjectIds.length - products.length} products\n`)

    // Step 4: Find orphaned inventory records
    const orphanedInventory = allInventory.filter(inv => {
      const productIdStr = inv.productId?.toString()
      return productIdStr && !existingProductIds.has(productIdStr)
    })

    console.log(`🗑️ Found ${orphanedInventory.length} orphaned inventory records\n`)

    if (orphanedInventory.length === 0) {
      console.log('✅ No orphaned inventory records found. Database is clean!')
      await mongoose.disconnect()
      return
    }

    // Step 5: Show what will be deleted
    console.log('📋 Orphaned inventory records to be deleted:')
    orphanedInventory.forEach((inv, idx) => {
      console.log(`   ${idx + 1}. ${inv.id} - Product ObjectId: ${inv.productId?.toString()}`)
    })
    console.log('')

    // Step 6: Delete orphaned inventory records
    console.log('🗑️ Deleting orphaned inventory records...')
    const deleteResult = await VendorInventory.deleteMany({
      _id: { $in: orphanedInventory.map(inv => inv._id) }
    })
    console.log(`   ✅ Deleted ${deleteResult.deletedCount} orphaned inventory records\n`)

    // Step 7: Optionally clean up ProductVendor relationships
    console.log('🔗 Checking ProductVendor relationships...')
    const allProductVendor = await ProductVendor.find({})
    const orphanedProductVendor = allProductVendor.filter(pv => {
      const productIdStr = pv.productId?.toString()
      return productIdStr && !existingProductIds.has(productIdStr)
    })

    if (orphanedProductVendor.length > 0) {
      console.log(`   ⚠️ Found ${orphanedProductVendor.length} orphaned ProductVendor relationships`)
      console.log('   🗑️ Deleting orphaned ProductVendor relationships...')
      const pvDeleteResult = await ProductVendor.deleteMany({
        _id: { $in: orphanedProductVendor.map(pv => pv._id) }
      })
      console.log(`   ✅ Deleted ${pvDeleteResult.deletedCount} orphaned ProductVendor relationships\n`)
    } else {
      console.log('   ✅ No orphaned ProductVendor relationships found\n')
    }

    // Step 8: Summary
    console.log('📋 CLEANUP SUMMARY:')
    console.log(`   - Orphaned inventory records deleted: ${deleteResult.deletedCount}`)
    console.log(`   - Orphaned ProductVendor relationships deleted: ${orphanedProductVendor.length > 0 ? orphanedProductVendor.length : 0}`)
    console.log('')
    console.log('✅ Cleanup completed successfully!')

  } catch (error) {
    console.error('❌ Error during cleanup:', error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  }
}

// Run the cleanup
cleanupOrphanedInventory()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

