/**
 * Test script to verify getProductsByVendor works for all vendors
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables
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

async function testVendorProducts() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')
    
    const db = mongoose.connection.db
    
    // Get all vendors
    const vendors = await db.collection('vendors').find({}).toArray()
    console.log(`📋 Testing ${vendors.length} vendor(s)...\n`)
    
    for (const vendor of vendors) {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`Testing: ${vendor.name} (ID: ${vendor.id})`)
      console.log(`${'='.repeat(60)}`)
      
      const vendorId = vendor.id.toString()
      const vendorDbObjectId = vendor._id instanceof mongoose.Types.ObjectId 
        ? vendor._id 
        : new mongoose.Types.ObjectId(vendor._id)
      
      // Step 1: Check ProductVendor relationships
      const productVendorLinks = await db.collection('productvendors').find({ 
        vendorId: vendorDbObjectId 
      }).toArray()
      
      console.log(`\n1. ProductVendor relationships: ${productVendorLinks.length}`)
      if (productVendorLinks.length > 0) {
        productVendorLinks.forEach((link, idx) => {
          console.log(`   ${idx + 1}. ProductId: ${link.productId?.toString() || 'N/A'}`)
        })
      }
      
      // Step 2: Extract product IDs
      const productIds = productVendorLinks
        .map(link => {
          const productId = link.productId
          if (productId instanceof mongoose.Types.ObjectId) {
            return productId
          } else if (mongoose.Types.ObjectId.isValid(productId)) {
            return new mongoose.Types.ObjectId(productId)
          }
          return null
        })
        .filter(id => id !== null)
      
      console.log(`\n2. Product IDs extracted: ${productIds.length}`)
      if (productIds.length > 0) {
        productIds.forEach((id, idx) => {
          console.log(`   ${idx + 1}. ${id.toString()}`)
        })
      }
      
      // Step 3: Query products
      if (productIds.length > 0) {
        const products = await db.collection('uniforms').find({
          _id: { $in: productIds }
        }).toArray()
        
        console.log(`\n3. Products found: ${products.length}`)
        if (products.length > 0) {
          products.forEach((p, idx) => {
            console.log(`   ${idx + 1}. ${p.name} (SKU: ${p.sku}, ID: ${p.id})`)
          })
        } else {
          console.log(`   ⚠️  No products found despite having ${productIds.length} product IDs`)
          console.log(`   This indicates orphaned ProductVendor relationships`)
        }
      } else {
        console.log(`\n3. No product IDs to query`)
      }
      
      // Step 4: Check inventory
      if (productIds.length > 0) {
        const inventoryRecords = await db.collection('vendorinventories').find({
          vendorId: vendorDbObjectId,
          productId: { $in: productIds }
        }).toArray()
        
        console.log(`\n4. Inventory records: ${inventoryRecords.length}`)
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

testVendorProducts()

