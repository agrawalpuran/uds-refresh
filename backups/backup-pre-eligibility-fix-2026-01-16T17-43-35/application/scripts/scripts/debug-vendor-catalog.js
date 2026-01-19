/**
 * Diagnostic script to debug vendor catalog issue
 * Run with: node scripts/debug-vendor-catalog.js <vendorId>
 */

const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')

// Read .env.local file
let MONGODB_URI = 'mongodb://localhost:27017/uniform-distribution'
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
  console.log('Could not read .env.local, using default MongoDB URI')
}

if (process.env.MONGODB_URI) {
  MONGODB_URI = process.env.MONGODB_URI
}

const vendorId = process.argv[2] || '100001'

async function debugVendorCatalog() {
  try {
    console.log(`\n╔════════════════════════════════════════════════════════════╗`)
    console.log(`║  VENDOR CATALOG DIAGNOSTIC - Vendor ID: ${vendorId}        ║`)
    console.log(`╚════════════════════════════════════════════════════════════╝\n`)
    
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')
    
    const db = mongoose.connection.db
    
    // Step 1: Find vendor
    console.log(`[1] Finding vendor with id: ${vendorId}`)
    const vendor = await db.collection('vendors').findOne({ id: vendorId })
    if (!vendor) {
      console.error(`❌ Vendor not found with id: ${vendorId}`)
      const allVendors = await db.collection('vendors').find({}).toArray()
      console.log(`Available vendor IDs: ${allVendors.map(v => v.id).join(', ')}`)
      process.exit(1)
    }
    
    console.log(`✅ Vendor found: ${vendor.name}`)
    console.log(`   _id: ${vendor._id}`)
    console.log(`   _id type: ${vendor._id?.constructor?.name}`)
    console.log(`   _id string: ${vendor._id?.toString()}\n`)
    
    // Step 2: Query ProductVendor relationships
    const vendorDbObjectId = vendor._id instanceof mongoose.Types.ObjectId
      ? vendor._id
      : new mongoose.Types.ObjectId(vendor._id)
    
    console.log(`[2] Querying ProductVendor relationships with vendor _id: ${vendorDbObjectId.toString()}`)
    const productVendorLinks = await db.collection('productvendors').find({ 
      vendorId: vendorDbObjectId 
    }).toArray()
    
    console.log(`✅ Found ${productVendorLinks.length} ProductVendor relationships\n`)
    
    if (productVendorLinks.length === 0) {
      console.log(`⚠️  No ProductVendor relationships found. Checking all relationships...`)
      const allLinks = await db.collection('productvendors').find({}).toArray()
      console.log(`Total ProductVendor relationships in database: ${allLinks.length}`)
      
      if (allLinks.length > 0) {
        console.log(`\nSample ProductVendor relationships (first 3):`)
        allLinks.slice(0, 3).forEach((link, idx) => {
          console.log(`  ${idx + 1}. vendorId: ${link.vendorId?.toString()}, productId: ${link.productId?.toString()}`)
        })
      }
      process.exit(0)
    }
    
    // Step 3: Extract product IDs
    console.log(`[3] Extracting product IDs from ${productVendorLinks.length} relationships`)
    const productIds = productVendorLinks
      .map(link => {
        if (link.productId instanceof mongoose.Types.ObjectId) {
          return link.productId
        } else if (mongoose.Types.ObjectId.isValid(link.productId)) {
          return new mongoose.Types.ObjectId(link.productId)
        } else {
          return null
        }
      })
      .filter(id => id !== null)
    
    console.log(`✅ Extracted ${productIds.length} product ObjectIds`)
    console.log(`   Product IDs: ${productIds.map(id => id.toString()).join(', ')}\n`)
    
    // Step 4: Query products
    console.log(`[4] Querying products by _id`)
    const products = await db.collection('uniforms').find({
      _id: { $in: productIds }
    }).toArray()
    
    console.log(`✅ Found ${products.length} products\n`)
    
    if (products.length === 0) {
      console.log(`⚠️  No products found by _id. Checking if products exist...`)
      const allProducts = await db.collection('uniforms').find({}).limit(5).toArray()
      console.log(`Total products in database: ${await db.collection('uniforms').countDocuments()}`)
      console.log(`Sample products (first 5):`)
      allProducts.forEach((p, idx) => {
        console.log(`  ${idx + 1}. _id: ${p._id?.toString()}, id: ${p.id}, name: ${p.name}`)
      })
      
      // Check if productIds match any products
      const productIdStrings = productIds.map(id => id.toString())
      const matchingProducts = allProducts.filter(p => {
        const pIdStr = p._id?.toString()
        return productIdStrings.includes(pIdStr)
      })
      
      if (matchingProducts.length > 0) {
        console.log(`\n✅ Found ${matchingProducts.length} products by string comparison`)
        matchingProducts.forEach(p => {
          console.log(`   - ${p.name} (id: ${p.id}, _id: ${p._id?.toString()})`)
        })
      } else {
        console.log(`\n❌ Product IDs from ProductVendor do not match any products in database`)
        console.log(`   This indicates orphaned ProductVendor relationships`)
      }
    } else {
      console.log(`✅ Products found:`)
      products.forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.name} (id: ${p.id}, SKU: ${p.sku})`)
      })
    }
    
    await mongoose.disconnect()
    console.log(`\n✅ Diagnostic complete`)
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

debugVendorCatalog()

