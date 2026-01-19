/**
 * Diagnostic script to investigate vendor inventory data integrity issue
 * 
 * This script will:
 * 1. Check if products with the ObjectIds exist in the Uniform collection
 * 2. Check if products are linked to the vendor via ProductVendor
 * 3. Identify the root cause of the missing products
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

// Minimal schemas for this diagnostic
const UniformSchema = new mongoose.Schema({}, { collection: 'uniforms', strict: false })
const VendorSchema = new mongoose.Schema({}, { collection: 'vendors', strict: false })
const VendorInventorySchema = new mongoose.Schema({}, { collection: 'vendorinventories', strict: false })
const ProductVendorSchema = new mongoose.Schema({}, { collection: 'productvendors', strict: false })

const Uniform = mongoose.models.Uniform || mongoose.model('Uniform', UniformSchema)
const Vendor = mongoose.models.Vendor || mongoose.model('Vendor', VendorSchema)
const VendorInventory = mongoose.models.VendorInventory || mongoose.model('VendorInventory', VendorInventorySchema)
const ProductVendor = mongoose.models.ProductVendor || mongoose.model('ProductVendor', ProductVendorSchema)

async function diagnoseVendorInventory() {
  try {
    console.log('🔍 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const vendorId = '100001'
    console.log(`📊 Diagnosing vendor inventory for vendor ID: ${vendorId}\n`)

    // Step 1: Get vendor
    const vendor = await Vendor.findOne({ id: vendorId })
    if (!vendor) {
      console.error(`❌ Vendor ${vendorId} not found`)
      await mongoose.disconnect()
      return
    }
    console.log(`✅ Vendor found: ${vendor.name || vendor.id}`)
    console.log(`   Vendor ObjectId: ${vendor._id}\n`)

    // Step 2: Get all inventory records for this vendor
    const inventoryRecords = await VendorInventory.find({ vendorId: vendor._id })
    console.log(`📦 Found ${inventoryRecords.length} inventory records\n`)

    if (inventoryRecords.length === 0) {
      console.log('ℹ️ No inventory records found. This is expected if vendor has no inventory.')
      await mongoose.disconnect()
      return
    }

    // Step 3: Check each inventory record's product
    const productObjectIds = inventoryRecords.map(inv => inv.productId)
    console.log(`🔍 Checking ${productObjectIds.length} product ObjectIds...\n`)

    // Step 4: Query products by ObjectId
    const products = await Uniform.find({ _id: { $in: productObjectIds } })
    console.log(`✅ Found ${products.length} products in Uniform collection`)
    console.log(`❌ Missing ${productObjectIds.length - products.length} products\n`)

    // Step 5: Identify missing products
    const foundProductIds = new Set(products.map(p => p._id.toString()))
    const missingProductIds = productObjectIds.filter(oid => !foundProductIds.has(oid.toString()))

    if (missingProductIds.length > 0) {
      console.log(`❌ MISSING PRODUCTS (${missingProductIds.length}):`)
      missingProductIds.forEach((oid, idx) => {
        console.log(`   ${idx + 1}. ObjectId: ${oid.toString()}`)
      })
      console.log('')
    }

    // Step 6: Check ProductVendor relationships
    console.log(`🔗 Checking ProductVendor relationships for vendor ${vendorId}...`)
    const productVendorLinks = await ProductVendor.find({ vendorId: vendor._id })
    console.log(`✅ Found ${productVendorLinks.length} ProductVendor relationships\n`)

    if (productVendorLinks.length > 0) {
      const linkedProductIds = productVendorLinks.map(pv => pv.productId)
      const linkedProducts = await Uniform.find({ _id: { $in: linkedProductIds } })
      console.log(`✅ Found ${linkedProducts.length} products linked via ProductVendor`)
      console.log(`   Linked product IDs: ${linkedProducts.map(p => p.id || p._id.toString()).join(', ')}\n`)
    } else {
      console.log(`⚠️ No ProductVendor relationships found for vendor ${vendorId}`)
      console.log(`   This means no products are explicitly linked to this vendor\n`)
    }

    // Step 7: Summary and recommendations
    console.log('📋 SUMMARY:')
    console.log(`   - Inventory records: ${inventoryRecords.length}`)
    console.log(`   - Products found in Uniform: ${products.length}`)
    console.log(`   - Missing products: ${missingProductIds.length}`)
    console.log(`   - ProductVendor relationships: ${productVendorLinks.length}`)
    console.log('')

    if (missingProductIds.length > 0) {
      console.log('🔧 RECOMMENDATIONS:')
      console.log('   1. Products with the ObjectIds above do NOT exist in the Uniform collection')
      console.log('   2. These are orphaned inventory records')
      console.log('   3. Options:')
      console.log('      a) Delete the orphaned inventory records (run cleanup script)')
      console.log('      b) Create the missing products if they should exist')
      console.log('      c) Link existing products to the vendor via ProductVendor')
    } else if (productVendorLinks.length === 0) {
      console.log('🔧 RECOMMENDATIONS:')
      console.log('   1. No products are linked to this vendor via ProductVendor')
      console.log('   2. Link products to the vendor to enable inventory management')
    } else {
      console.log('✅ All products exist and are linked correctly')
    }

  } catch (error) {
    console.error('❌ Error diagnosing vendor inventory:', error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  }
}

// Run the diagnostic
diagnoseVendorInventory()
  .then(() => {
    console.log('\n✅ Diagnostic completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Diagnostic failed:', error)
    process.exit(1)
  })

