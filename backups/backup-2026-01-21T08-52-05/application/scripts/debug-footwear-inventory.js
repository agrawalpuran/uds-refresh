/**
 * CRITICAL DEBUG: Footwear Plus Inventory Issue
 * 
 * This script will:
 * 1. Check ProductVendor relationships for Footwear Plus
 * 2. Check what getProductsByVendor returns
 * 3. Check what getVendorInventory returns
 * 4. Identify any data leakage
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

async function debugFootwearInventory() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')
    
    const db = mongoose.connection.db
    
    // Step 1: Find Footwear Plus vendor
    console.log('📋 STEP 1: Finding Footwear Plus vendor...')
    const vendor = await db.collection('vendors').findOne({ 
      $or: [
        { name: /footwear/i },
        { id: '100002' }
      ]
    })
    
    if (!vendor) {
      console.error('❌ Vendor not found')
      process.exit(1)
    }
    
    console.log(`✅ Found vendor: ${vendor.name} (id: ${vendor.id}, _id: ${vendor._id})`)
    const vendorObjectId = vendor._id instanceof mongoose.Types.ObjectId 
      ? vendor._id 
      : new mongoose.Types.ObjectId(vendor._id.toString())
    
    // Step 2: Check ProductVendor relationships
    console.log('\n📋 STEP 2: Checking ProductVendor relationships...')
    const pvLinks = await db.collection('productvendors').find({
      vendorId: vendorObjectId
    }).toArray()
    
    console.log(`✅ Found ${pvLinks.length} ProductVendor relationship(s)`)
    const productIds = pvLinks.map(link => link.productId).filter(Boolean)
    console.log(`   Product IDs: ${productIds.map(id => id.toString()).join(', ')}`)
    
    // Step 3: Get products from ProductVendor relationships
    console.log('\n📋 STEP 3: Getting products from ProductVendor relationships...')
    const products = await db.collection('uniforms').find({
      _id: { $in: productIds }
    }).toArray()
    
    console.log(`✅ Found ${products.length} product(s) from ProductVendor relationships:`)
    products.forEach((p, idx) => {
      console.log(`   ${idx + 1}. ${p.name} (SKU: ${p.sku}, id: ${p.id})`)
    })
    
    // Step 4: Check ALL inventory records for this vendor
    console.log('\n📋 STEP 4: Checking ALL inventory records for this vendor...')
    const allInventory = await db.collection('vendorinventories').find({
      vendorId: vendorObjectId
    }).toArray()
    
    console.log(`✅ Found ${allInventory.length} inventory record(s)`)
    
    // Step 5: Check which products have inventory
    console.log('\n📋 STEP 5: Analyzing inventory records...')
    const inventoryProductIds = allInventory.map(inv => inv.productId).filter(Boolean)
    const uniqueInventoryProductIds = [...new Set(inventoryProductIds.map(id => id.toString()))]
    
    console.log(`   Inventory records reference ${uniqueInventoryProductIds.length} unique product(s)`)
    
    // Get product details for inventory products
    const inventoryProducts = await db.collection('uniforms').find({
      _id: { $in: inventoryProductIds }
    }).toArray()
    
    console.log(`\n📦 Products with inventory records:`)
    inventoryProducts.forEach((p, idx) => {
      const isAssigned = productIds.some(pid => pid.toString() === p._id.toString())
      const status = isAssigned ? '✅ ASSIGNED' : '❌ NOT ASSIGNED'
      console.log(`   ${idx + 1}. ${p.name} (SKU: ${p.sku}, id: ${p.id}) - ${status}`)
    })
    
    // Step 6: Identify orphaned inventory
    console.log('\n📋 STEP 6: Identifying orphaned inventory records...')
    const assignedProductIdStrings = new Set(productIds.map(id => id.toString()))
    const orphanedInventory = allInventory.filter(inv => {
      const invProductIdStr = inv.productId?.toString() || ''
      return !assignedProductIdStrings.has(invProductIdStr)
    })
    
    if (orphanedInventory.length > 0) {
      console.log(`❌ FOUND ${orphanedInventory.length} ORPHANED INVENTORY RECORD(S)!`)
      console.log(`   These inventory records are for products NOT assigned to this vendor`)
      
      orphanedInventory.forEach((inv, idx) => {
        const product = inventoryProducts.find(p => p._id.toString() === inv.productId?.toString())
        console.log(`   ${idx + 1}. Inventory ID: ${inv.id}, Product: ${product?.name || 'UNKNOWN'} (${product?.sku || 'N/A'})`)
      })
    } else {
      console.log(`✅ No orphaned inventory records found`)
    }
    
    // Step 7: Summary
    console.log('\n📊 SUMMARY:')
    console.log(`   Vendor: ${vendor.name} (${vendor.id})`)
    console.log(`   ProductVendor relationships: ${pvLinks.length}`)
    console.log(`   Products from relationships: ${products.length}`)
    console.log(`   Total inventory records: ${allInventory.length}`)
    console.log(`   Orphaned inventory records: ${orphanedInventory.length}`)
    
    if (orphanedInventory.length > 0) {
      console.log('\n❌ ROOT CAUSE: Orphaned inventory records exist!')
      console.log('   These need to be deleted to fix the data isolation issue.')
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected')
  }
}

debugFootwearInventory()

