/**
 * Diagnostic script to investigate vendor inventory isolation issue
 * Checks ProductVendor relationships and inventory records for Footwear Plus
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      process.env[key] = value
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI_LOCAL

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function main() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
    
    const db = mongoose.connection.db
    
    // Step 1: Find Footwear Plus vendor
    console.log('\n📋 STEP 1: Finding Footwear Plus vendor...')
    const vendor = await db.collection('vendors').findOne({ 
      $or: [
        { name: /footwear/i },
        { id: /footwear/i },
        { name: /Footwear Plus/i }
      ]
    })
    
    if (!vendor) {
      console.log('❌ Vendor not found. Listing all vendors...')
      const allVendors = await db.collection('vendors').find({}).limit(10).toArray()
      allVendors.forEach(v => {
        console.log(`  - ${v.name} (id: ${v.id}, _id: ${v._id})`)
      })
      process.exit(1)
    }
    
    console.log(`✅ Found vendor: ${vendor.name}`)
    console.log(`   ID: ${vendor.id}`)
    console.log(`   _id: ${vendor._id}`)
    console.log(`   _id type: ${vendor._id.constructor.name}`)
    
    const vendorObjectId = vendor._id instanceof mongoose.Types.ObjectId 
      ? vendor._id 
      : new mongoose.Types.ObjectId(vendor._id.toString())
    
    // Step 2: Check ProductVendor relationships
    console.log('\n📋 STEP 2: Checking ProductVendor relationships...')
    const productVendorLinks = await db.collection('productvendors').find({
      vendorId: vendorObjectId
    }).toArray()
    
    console.log(`✅ Found ${productVendorLinks.length} ProductVendor relationship(s)`)
    
    if (productVendorLinks.length === 0) {
      console.log('❌ No ProductVendor relationships found!')
      console.log('   This vendor should have products assigned via ProductVendor relationships.')
    } else {
      console.log('\n📦 ProductVendor Links:')
      for (let i = 0; i < productVendorLinks.length; i++) {
        const link = productVendorLinks[i]
        const product = await db.collection('uniforms').findOne({ _id: link.productId })
        console.log(`   ${i + 1}. Product ID: ${link.productId}`)
        console.log(`      Product Name: ${product?.name || 'NOT FOUND'}`)
        console.log(`      Product SKU: ${product?.sku || 'N/A'}`)
      }
    }
    
    // Step 3: Check inventory records
    console.log('\n📋 STEP 3: Checking inventory records...')
    const inventoryRecords = await db.collection('vendorinventories').find({
      vendorId: vendorObjectId
    }).toArray()
    
    console.log(`✅ Found ${inventoryRecords.length} inventory record(s)`)
    
    if (inventoryRecords.length > 0) {
      console.log('\n📦 Inventory Records:')
      const productIdSet = new Set()
      for (let i = 0; i < inventoryRecords.length; i++) {
        const inv = inventoryRecords[i]
        const productIdStr = inv.productId?.toString() || 'N/A'
        productIdSet.add(productIdStr)
        
        const product = await db.collection('uniforms').findOne({ _id: inv.productId })
        console.log(`   ${i + 1}. Inventory ID: ${inv.id}`)
        console.log(`      Product ID: ${productIdStr}`)
        console.log(`      Product Name: ${product?.name || 'NOT FOUND'}`)
        console.log(`      Product SKU: ${product?.sku || 'N/A'}`)
        console.log(`      Total Stock: ${inv.totalStock || 0}`)
      }
      
      console.log(`\n📊 Summary: ${productIdSet.size} unique products have inventory records`)
      
      // Step 4: Compare ProductVendor vs Inventory
      console.log('\n📋 STEP 4: Comparing ProductVendor relationships vs Inventory records...')
      const pvProductIds = new Set(productVendorLinks.map(link => link.productId?.toString()).filter(Boolean))
      const invProductIds = new Set(Array.from(productIdSet))
      
      console.log(`   ProductVendor products: ${pvProductIds.size}`)
      console.log(`   Inventory products: ${invProductIds.size}`)
      
      // Find products in inventory but NOT in ProductVendor
      const orphanedProducts = Array.from(invProductIds).filter(id => !pvProductIds.has(id))
      if (orphanedProducts.length > 0) {
        console.log(`\n❌ CRITICAL: Found ${orphanedProducts.length} product(s) in inventory but NOT in ProductVendor relationships:`)
        for (const productId of orphanedProducts) {
          const product = await db.collection('uniforms').findOne({ _id: new mongoose.Types.ObjectId(productId) })
          console.log(`   - ${product?.name || 'UNKNOWN'} (SKU: ${product?.sku || 'N/A'}, _id: ${productId})`)
        }
        console.log(`\n⚠️  These products should NOT be visible to the vendor!`)
        console.log(`   This is the root cause of the data isolation issue.`)
      } else {
        console.log(`\n✅ All inventory products are in ProductVendor relationships`)
      }
    }
    
    // Step 5: Check if there are inventory records for other vendors
    console.log('\n📋 STEP 5: Checking for inventory records with wrong vendorId...')
    const allInventory = await db.collection('vendorinventories').find({}).toArray()
    const inventoryByVendor = new Map()
    
    for (const inv of allInventory) {
      const vendorIdStr = inv.vendorId?.toString() || 'unknown'
      if (!inventoryByVendor.has(vendorIdStr)) {
        inventoryByVendor.set(vendorIdStr, [])
      }
      inventoryByVendor.get(vendorIdStr).push(inv)
    }
    
    console.log(`\n📊 Inventory distribution by vendor:`)
    for (const [vid, invs] of inventoryByVendor.entries()) {
      const v = await db.collection('vendors').findOne({ _id: new mongoose.Types.ObjectId(vid) })
      console.log(`   ${v?.name || 'UNKNOWN'} (${vid}): ${invs.length} inventory record(s)`)
    }
    
    console.log('\n✅ Diagnostic complete!')
    
  } catch (error) {
    console.error('❌ Error:', error)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

main()

