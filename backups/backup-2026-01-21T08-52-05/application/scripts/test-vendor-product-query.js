/**
 * Test script to verify getProductsByVendor query logic
 * Run: node scripts/test-vendor-product-query.js
 */

const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')

let MONGODB_URI = process.env.MONGODB_URI

// Try to read from .env.local file directly
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
      console.log('✅ Loaded MONGODB_URI from .env.local')
    }
  }
} catch (error) {
  console.log('⚠️  Could not read .env.local')
}

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found')
  process.exit(1)
}

async function testVendorProductQuery() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    const vendorId = '100001'

    // Step 1: Find vendor
    console.log('=== STEP 1: Find Vendor ===')
    const Vendor = mongoose.models.Vendor || mongoose.model('Vendor', new mongoose.Schema({}, { strict: false }))
    let vendor = await Vendor.findOne({ id: vendorId })
    
    if (!vendor) {
      console.error('❌ Vendor not found!')
      await mongoose.disconnect()
      return
    }
    
    console.log(`✅ Found vendor: ${vendor.name}`)
    console.log(`   ID: ${vendor.id}`)
    console.log(`   _id: ${vendor._id}`)
    console.log(`   _id type: ${vendor._id.constructor.name}`)
    console.log(`   _id string: ${vendor._id.toString()}\n`)

    // Step 2: Query ProductVendor with ObjectId
    console.log('=== STEP 2: Query ProductVendor with ObjectId ===')
    const vendorObjectId = vendor._id instanceof mongoose.Types.ObjectId 
      ? vendor._id 
      : new mongoose.Types.ObjectId(vendor._id)
    
    console.log(`Querying with vendorObjectId: ${vendorObjectId.toString()}`)
    
    const productVendorLinks1 = await db.collection('productvendors').find({ 
      vendorId: vendorObjectId 
    }).toArray()
    
    console.log(`Found ${productVendorLinks1.length} links with ObjectId query\n`)

    // Step 3: Query ProductVendor with string comparison
    console.log('=== STEP 3: Query ProductVendor with String Comparison ===')
    const vendorIdStr = vendorObjectId.toString()
    const allLinks = await db.collection('productvendors').find({}).toArray()
    console.log(`Total ProductVendor links in DB: ${allLinks.length}`)
    
    const productVendorLinks2 = allLinks.filter((link) => {
      const linkVendorIdStr = link.vendorId?.toString()
      return linkVendorIdStr === vendorIdStr
    })
    
    console.log(`Found ${productVendorLinks2.length} links with string comparison\n`)

    // Step 4: Show sample link structure
    if (productVendorLinks2.length > 0) {
      console.log('=== STEP 4: Sample Link Structure ===')
      const sampleLink = productVendorLinks2[0]
      console.log('Sample link:', JSON.stringify({
        _id: sampleLink._id?.toString(),
        vendorId: sampleLink.vendorId?.toString(),
        vendorIdType: sampleLink.vendorId?.constructor?.name,
        productId: sampleLink.productId?.toString(),
        productIdType: sampleLink.productId?.constructor?.name,
      }, null, 2))
      console.log()

      // Step 5: Extract product IDs
      console.log('=== STEP 5: Extract Product IDs ===')
      const productIds = productVendorLinks2
        .map((link) => {
          const productId = link.productId
          if (!productId) {
            console.warn(`⚠️  Link has no productId`)
            return null
          }
          
          if (productId instanceof mongoose.Types.ObjectId) {
            return productId
          }
          if (mongoose.Types.ObjectId.isValid(productId)) {
            return new mongoose.Types.ObjectId(productId)
          }
          
          console.warn(`⚠️  Invalid productId: ${productId}, type: ${typeof productId}`)
          return null
        })
        .filter((id) => id !== null)
      
      console.log(`Extracted ${productIds.length} product IDs`)
      console.log(`Product IDs: ${productIds.map(id => id.toString()).join(', ')}\n`)

      // Step 6: Fetch products
      console.log('=== STEP 6: Fetch Products ===')
      const Uniform = mongoose.models.Uniform || mongoose.model('Uniform', new mongoose.Schema({}, { strict: false }))
      const products = await Uniform.find({
        _id: { $in: productIds },
      }).lean()
      
      console.log(`Found ${products.length} products`)
      products.forEach(p => {
        console.log(`  - ${p.name} (ID: ${p.id}, _id: ${p._id})`)
      })
    } else {
      console.log('❌ No ProductVendor links found!')
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

testVendorProductQuery()

