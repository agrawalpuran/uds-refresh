const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

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

// Also check process.env (in case it's already set)
if (process.env.MONGODB_URI) {
  MONGODB_URI = process.env.MONGODB_URI
}

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env.local')
  process.exit(1)
}

async function debugVendorProducts() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')
    
    const db = mongoose.connection.db
    const vendorId = '100003' // Elite Uniforms
    
    console.log('╔════════════════════════════════════════════════════════════╗')
    console.log('║  DEBUGGING VENDOR PRODUCTS - COMPREHENSIVE ANALYSIS      ║')
    console.log('╚════════════════════════════════════════════════════════════╝\n')
    
    // Step 1: Find vendor
    console.log('=== STEP 1: Find Vendor ===')
    const vendor = await db.collection('vendors').findOne({ id: vendorId })
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
    
    // Step 2: Get vendor ObjectId
    const vendorObjectId = vendor._id instanceof mongoose.Types.ObjectId
      ? vendor._id
      : new mongoose.Types.ObjectId(vendor._id)
    console.log(`Vendor ObjectId: ${vendorObjectId.toString()}\n`)
    
    // Step 3: Query ProductVendor with ObjectId
    console.log('=== STEP 2: Query ProductVendor with ObjectId ===')
    const productVendorLinks1 = await db.collection('productvendors').find({ 
      vendorId: vendorObjectId 
    }).toArray()
    console.log(`Found ${productVendorLinks1.length} links with ObjectId query\n`)
    
    // Step 4: Query ProductVendor with string
    console.log('=== STEP 3: Query ProductVendor with String ===')
    const vendorIdString = vendorObjectId.toString()
    const productVendorLinks2 = await db.collection('productvendors').find({ 
      vendorId: vendorIdString 
    }).toArray()
    console.log(`Found ${productVendorLinks2.length} links with string query\n`)
    
    // Step 5: Get ALL ProductVendor links and filter manually
    console.log('=== STEP 4: Get ALL ProductVendor Links ===')
    const allLinks = await db.collection('productvendors').find({}).toArray()
    console.log(`Total ProductVendor links in database: ${allLinks.length}\n`)
    
    if (allLinks.length > 0) {
      console.log('Sample ProductVendor links (first 5):')
      allLinks.slice(0, 5).forEach((link, idx) => {
        const linkVendorId = link.vendorId
        const linkVendorIdStr = linkVendorId?.toString ? linkVendorId.toString() : String(linkVendorId || '')
        const matches = linkVendorIdStr === vendorObjectId.toString()
        
        console.log(`  Link ${idx}:`)
        console.log(`    vendorId: ${linkVendorId}`)
        console.log(`    vendorId type: ${typeof linkVendorId}`)
        console.log(`    vendorId constructor: ${linkVendorId?.constructor?.name}`)
        console.log(`    vendorId string: ${linkVendorIdStr}`)
        console.log(`    our vendorObjectId: ${vendorObjectId.toString()}`)
        console.log(`    matches: ${matches}`)
        console.log(`    productId: ${link.productId?.toString ? link.productId.toString() : String(link.productId || '')}`)
        console.log('')
      })
      
      // Filter manually
      console.log('=== STEP 5: Manual Filtering ===')
      const matchedLinks = allLinks.filter((link) => {
        const linkVendorId = link.vendorId
        let linkVendorIdStr = ''
        let linkVendorIdObjectId = null
        
        if (linkVendorId instanceof mongoose.Types.ObjectId) {
          linkVendorIdStr = linkVendorId.toString()
          linkVendorIdObjectId = linkVendorId
        } else if (typeof linkVendorId === 'object' && linkVendorId !== null) {
          linkVendorIdStr = linkVendorId.toString ? linkVendorId.toString() : String(linkVendorId)
          if (linkVendorId._id) {
            linkVendorIdObjectId = linkVendorId._id instanceof mongoose.Types.ObjectId 
              ? linkVendorId._id 
              : (mongoose.Types.ObjectId.isValid(linkVendorId._id) ? new mongoose.Types.ObjectId(linkVendorId._id) : null)
          } else if (mongoose.Types.ObjectId.isValid(linkVendorId)) {
            linkVendorIdObjectId = new mongoose.Types.ObjectId(linkVendorId)
          }
        } else {
          linkVendorIdStr = String(linkVendorId || '')
          if (mongoose.Types.ObjectId.isValid(linkVendorIdStr)) {
            linkVendorIdObjectId = new mongoose.Types.ObjectId(linkVendorIdStr)
          }
        }
        
        const matches = 
          linkVendorIdStr === vendorObjectId.toString() ||
          (linkVendorIdObjectId && vendorObjectId && linkVendorIdObjectId.equals(vendorObjectId)) ||
          (linkVendorId === vendor._id) ||
          (linkVendorIdObjectId && vendor._id instanceof mongoose.Types.ObjectId && linkVendorIdObjectId.equals(vendor._id))
        
        return matches
      })
      
      console.log(`✅ Found ${matchedLinks.length} matching ProductVendor links\n`)
      
      if (matchedLinks.length > 0) {
        console.log('=== STEP 6: Extract Product IDs ===')
        const productIds = matchedLinks.map((link) => {
          const productId = link.productId
          if (productId instanceof mongoose.Types.ObjectId) {
            return productId
          }
          if (mongoose.Types.ObjectId.isValid(productId)) {
            return new mongoose.Types.ObjectId(productId)
          }
          return null
        }).filter(id => id !== null)
        
        console.log(`Extracted ${productIds.length} product IDs\n`)
        
        // Step 7: Query products
        console.log('=== STEP 7: Query Products ===')
        const products = await db.collection('uniforms').find({
          _id: { $in: productIds }
        }).toArray()
        
        console.log(`Found ${products.length} products\n`)
        
        if (products.length > 0) {
          console.log('✅ Products found:')
          products.forEach((p, idx) => {
            console.log(`  ${idx + 1}. ${p.name} (SKU: ${p.sku}, ID: ${p.id})`)
          })
        } else {
          console.log('❌ No products found despite having ProductVendor links')
          console.log('Checking if products exist with those IDs...')
          for (const pid of productIds) {
            const product = await db.collection('uniforms').findOne({ _id: pid })
            if (product) {
              console.log(`  ✅ Product exists: ${product.name} (${product.id})`)
            } else {
              console.log(`  ❌ Product NOT found for _id: ${pid.toString()}`)
            }
          }
        }
      } else {
        console.log('❌ No matching ProductVendor links found')
        console.log('This vendor has no products assigned via ProductVendor relationships')
      }
    } else {
      console.log('❌ No ProductVendor links exist in database at all')
    }
    
    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

debugVendorProducts()

