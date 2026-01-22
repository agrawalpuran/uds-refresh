/**
 * Debug script to check vendor ID resolution and ProductVendor relationships
 * This will help identify if there's a vendorId mismatch causing wrong products to show
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        process.env[key] = value
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI_LOCAL

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found')
  process.exit(1)
}

async function debugVendorIdMismatch() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')
    
    const db = mongoose.connection.db
    
    // Check all vendors
    console.log('📋 Checking all vendors...')
    const vendors = await db.collection('vendors').find({}).toArray()
    
    console.log(`✅ Found ${vendors.length} vendor(s):\n`)
    vendors.forEach((v, idx) => {
      console.log(`   ${idx + 1}. ${v.name}`)
      console.log(`      ID: ${v.id}`)
      console.log(`      _id: ${v._id?.toString()}`)
    })
    
    // Check Footwear Plus specifically
    console.log('\n📋 Checking Footwear Plus (100002)...')
    const footwearPlus = await db.collection('vendors').findOne({ id: '100002' })
    
    if (!footwearPlus) {
      console.error('❌ Footwear Plus not found')
      process.exit(1)
    }
    
    console.log(`✅ Found: ${footwearPlus.name} (id: ${footwearPlus.id}, _id: ${footwearPlus._id?.toString()})`)
    
    const footwearPlusObjectId = footwearPlus._id instanceof mongoose.Types.ObjectId 
      ? footwearPlus._id 
      : new mongoose.Types.ObjectId(footwearPlus._id.toString())
    
    // Check ProductVendor relationships for Footwear Plus
    console.log('\n📋 Checking ProductVendor relationships for Footwear Plus...')
    const pvLinks = await db.collection('productvendors').find({
      vendorId: footwearPlusObjectId
    }).toArray()
    
    console.log(`✅ Found ${pvLinks.length} ProductVendor relationship(s)`)
    
    if (pvLinks.length > 0) {
      const productIds = pvLinks.map(link => link.productId).filter(Boolean)
      const products = await db.collection('uniforms').find({
        _id: { $in: productIds }
      }).toArray()
      
      console.log(`\n📦 Products assigned to Footwear Plus:`)
      products.forEach((p, idx) => {
        console.log(`   ${idx + 1}. ${p.name} (SKU: ${p.sku}, id: ${p.id})`)
      })
    }
    
    // Check if there are any ProductVendor relationships with wrong vendorId format
    console.log('\n📋 Checking for ProductVendor relationships with potential vendorId mismatches...')
    const allPvLinks = await db.collection('productvendors').find({}).toArray()
    
    console.log(`✅ Total ProductVendor relationships in database: ${allPvLinks.length}`)
    
    // Group by vendor
    const vendorProductMap = new Map()
    for (const link of allPvLinks) {
      const vendorIdStr = link.vendorId?.toString() || ''
      if (!vendorProductMap.has(vendorIdStr)) {
        vendorProductMap.set(vendorIdStr, [])
      }
      vendorProductMap.get(vendorIdStr).push(link.productId)
    }
    
    console.log(`\n📊 ProductVendor relationships by vendor:`)
    const vendorEntries = Array.from(vendorProductMap.entries())
    for (let i = 0; i < vendorEntries.length; i++) {
      const [vendorIdStr, productIds] = vendorEntries[i]
      const vendor = await db.collection('vendors').findOne({ _id: new mongoose.Types.ObjectId(vendorIdStr) })
      const products = await db.collection('uniforms').find({
        _id: { $in: productIds }
      }).toArray()
      
      console.log(`\n   Vendor: ${vendor?.name || 'UNKNOWN'} (id: ${vendor?.id || 'N/A'}, _id: ${vendorIdStr})`)
      console.log(`   Products (${products.length}):`)
      products.forEach((p, idx) => {
        console.log(`      ${idx + 1}. ${p.name} (SKU: ${p.sku})`)
      })
    }
    
    // Check for products that might be showing incorrectly
    console.log('\n📋 Checking problematic products (Formal Shirt, Formal Pants, Belt)...')
    const problematicProducts = await db.collection('uniforms').find({
      $or: [
        { name: /formal shirt/i },
        { name: /formal pants/i },
        { name: /belt/i }
      ]
    }).toArray()
    
    console.log(`✅ Found ${problematicProducts.length} product(s):`)
    for (let idx = 0; idx < problematicProducts.length; idx++) {
      const p = problematicProducts[idx]
      console.log(`   ${idx + 1}. ${p.name} (SKU: ${p.sku}, id: ${p.id}, _id: ${p._id?.toString()})`)
      
      // Check which vendor this product is assigned to
      const productPvLinks = allPvLinks.filter(link => 
        link.productId?.toString() === p._id?.toString()
      )
      
      if (productPvLinks.length > 0) {
        console.log(`      Assigned to vendor(s):`)
        for (let j = 0; j < productPvLinks.length; j++) {
          const link = productPvLinks[j]
          const linkVendorId = link.vendorId instanceof mongoose.Types.ObjectId
            ? link.vendorId
            : new mongoose.Types.ObjectId(link.vendorId.toString())
          const vendor = await db.collection('vendors').findOne({ 
            _id: linkVendorId
          })
          console.log(`         - ${vendor?.name || 'UNKNOWN'} (id: ${vendor?.id || 'N/A'}, _id: ${link.vendorId?.toString()})`)
        }
      } else {
        console.log(`      ⚠️  NOT assigned to any vendor`)
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected')
  }
}

debugVendorIdMismatch()

