/**
 * Debug script to check product ID mismatches
 * Run: node scripts/debug-product-ids.js
 */

const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')

let MONGODB_URI = process.env.MONGODB_URI

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
  console.log('⚠️  Could not read .env.local')
}

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found')
  process.exit(1)
}

async function debugProductIds() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    const vendorId = '100001'

    // Find vendor
    const vendor = await db.collection('vendors').findOne({ id: vendorId })
    if (!vendor) {
      console.error('❌ Vendor not found!')
      await mongoose.disconnect()
      return
    }

    console.log(`✅ Found vendor: ${vendor.name} (_id: ${vendor._id})\n`)

    // Get ProductVendor links
    const productVendorLinks = await db.collection('productvendors').find({ 
      vendorId: vendor._id 
    }).toArray()

    console.log(`Found ${productVendorLinks.length} ProductVendor links\n`)

    // Get all products
    const allProducts = await db.collection('uniforms').find({}).toArray()
    console.log(`Total products in DB: ${allProducts.length}\n`)

    // Check each link
    console.log('=== PRODUCT ID MATCHING ===')
    const productIdMap = new Map()
    allProducts.forEach(p => {
      productIdMap.set(p._id.toString(), p)
    })

    let matchedCount = 0
    let unmatchedCount = 0

    productVendorLinks.forEach((link, index) => {
      const linkProductId = link.productId?.toString()
      const product = productIdMap.get(linkProductId)
      
      if (product) {
        matchedCount++
        console.log(`✅ Link ${index + 1}: Product found - ${product.name} (ID: ${product.id}, _id: ${linkProductId})`)
      } else {
        unmatchedCount++
        console.log(`❌ Link ${index + 1}: Product NOT found - _id: ${linkProductId}`)
      }
    })

    console.log(`\n=== SUMMARY ===`)
    console.log(`Matched: ${matchedCount}`)
    console.log(`Unmatched: ${unmatchedCount}`)

    // Try to fetch products using the IDs from links
    console.log(`\n=== TESTING PRODUCT QUERY ===`)
    const productIds = productVendorLinks
      .map(link => {
        const productId = link.productId
        if (productId instanceof mongoose.Types.ObjectId) {
          return productId
        }
        if (mongoose.Types.ObjectId.isValid(productId)) {
          return new mongoose.Types.ObjectId(productId)
        }
        return null
      })
      .filter(id => id !== null)

    console.log(`Querying with ${productIds.length} product IDs...`)
    const Uniform = mongoose.models.Uniform || mongoose.model('Uniform', new mongoose.Schema({}, { strict: false }))
    const products = await Uniform.find({
      _id: { $in: productIds },
    }).lean()

    console.log(`Found ${products.length} products via Mongoose query`)
    if (products.length > 0) {
      products.forEach(p => {
        console.log(`  - ${p.name} (ID: ${p.id}, _id: ${p._id})`)
      })
    } else {
      console.log('❌ No products found! This is the issue.')
      console.log('\nTrying raw MongoDB query...')
      const rawProducts = await db.collection('uniforms').find({
        _id: { $in: productIds },
      }).toArray()
      console.log(`Raw MongoDB query found: ${rawProducts.length} products`)
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

debugProductIds()

