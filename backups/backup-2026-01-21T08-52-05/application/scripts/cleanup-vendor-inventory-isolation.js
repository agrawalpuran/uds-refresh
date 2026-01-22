/**
 * CRITICAL DATA CLEANUP: Vendor Inventory Isolation
 * 
 * This script will:
 * 1. Find Footwear Plus vendor
 * 2. Identify ProductVendor relationships (should be only 2)
 * 3. Find orphaned inventory records (inventory for products NOT in ProductVendor relationships)
 * 4. Delete orphaned inventory records to enforce data isolation
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
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        process.env[key] = value
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI_LOCAL

console.log('🔍 Environment check:')
console.log('   MONGODB_URI exists:', !!process.env.MONGODB_URI)
console.log('   MONGODB_URI_LOCAL exists:', !!process.env.MONGODB_URI_LOCAL)
console.log('   Using:', MONGODB_URI ? 'Found' : 'NOT FOUND')

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function cleanupVendorInventory() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')
    
    const db = mongoose.connection.db
    
    // Step 1: Find Footwear Plus vendor
    console.log('📋 STEP 1: Finding Footwear Plus vendor...')
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
    
    const vendorObjectId = vendor._id instanceof mongoose.Types.ObjectId 
      ? vendor._id 
      : new mongoose.Types.ObjectId(vendor._id.toString())
    
    // Step 2: Get ProductVendor relationships (these are the ONLY valid products)
    console.log('\n📋 STEP 2: Getting ProductVendor relationships...')
    const productVendorLinks = await db.collection('productvendors').find({
      vendorId: vendorObjectId
    }).toArray()
    
    console.log(`✅ Found ${productVendorLinks.length} ProductVendor relationship(s)`)
    
    if (productVendorLinks.length === 0) {
      console.log('⚠️  No ProductVendor relationships found!')
      console.log('   This vendor should have products assigned via ProductVendor relationships.')
      console.log('   Cannot proceed with cleanup - vendor has no assigned products.')
      process.exit(1)
    }
    
    // Extract valid product IDs from ProductVendor relationships
    const validProductIds = new Set()
    productVendorLinks.forEach(link => {
      if (link.productId) {
        const productIdStr = link.productId instanceof mongoose.Types.ObjectId
          ? link.productId.toString()
          : String(link.productId)
        validProductIds.add(productIdStr)
      }
    })
    
    console.log(`✅ Valid product IDs (from ProductVendor): ${validProductIds.size}`)
    validProductIds.forEach(id => {
      console.log(`   - ${id}`)
    })
    
    // Get product names for valid products
    console.log('\n📦 Valid Products:')
    for (const productIdStr of validProductIds) {
      const product = await db.collection('uniforms').findOne({ 
        _id: new mongoose.Types.ObjectId(productIdStr) 
      })
      if (product) {
        console.log(`   ✅ ${product.name} (SKU: ${product.sku || 'N/A'}, _id: ${productIdStr})`)
      } else {
        console.log(`   ⚠️  Product not found: ${productIdStr} (orphaned ProductVendor relationship)`)
      }
    }
    
    // Step 3: Find ALL inventory records for this vendor
    console.log('\n📋 STEP 3: Finding ALL inventory records for this vendor...')
    const allInventory = await db.collection('vendorinventories').find({
      vendorId: vendorObjectId
    }).toArray()
    
    console.log(`✅ Found ${allInventory.length} total inventory record(s)`)
    
    // Step 4: Identify orphaned inventory records
    console.log('\n📋 STEP 4: Identifying orphaned inventory records...')
    const orphanedInventory = []
    const validInventory = []
    
    for (const inv of allInventory) {
      const invProductIdStr = inv.productId?.toString() || String(inv.productId || '')
      const isValid = validProductIds.has(invProductIdStr)
      
      if (!isValid) {
        const product = await db.collection('uniforms').findOne({ 
          _id: new mongoose.Types.ObjectId(invProductIdStr) 
        })
        orphanedInventory.push({
          inventory: inv,
          productId: invProductIdStr,
          productName: product?.name || 'UNKNOWN',
          productSku: product?.sku || 'N/A'
        })
      } else {
        validInventory.push(inv)
      }
    }
    
    console.log(`✅ Valid inventory records: ${validInventory.length}`)
    console.log(`❌ Orphaned inventory records: ${orphanedInventory.length}`)
    
    if (orphanedInventory.length === 0) {
      console.log('\n✅ No orphaned inventory records found! Data is clean.')
      process.exit(0)
    }
    
    // Step 5: Display orphaned records
    console.log('\n📋 STEP 5: Orphaned Inventory Records (will be deleted):')
    orphanedInventory.forEach((item, idx) => {
      console.log(`   ${idx + 1}. Inventory ID: ${item.inventory.id}`)
      console.log(`      Product: ${item.productName} (SKU: ${item.productSku})`)
      console.log(`      Product _id: ${item.productId}`)
      console.log(`      Total Stock: ${item.inventory.totalStock || 0}`)
    })
    
    // Step 6: Confirm deletion
    console.log('\n⚠️  WARNING: About to delete orphaned inventory records!')
    console.log(`   This will remove ${orphanedInventory.length} inventory record(s)`)
    console.log(`   These products are NOT assigned to ${vendor.name} via ProductVendor relationships`)
    console.log('\n   Proceeding with cleanup...\n')
    
    // Step 7: Delete orphaned inventory records
    console.log('📋 STEP 6: Deleting orphaned inventory records...')
    let deletedCount = 0
    
    for (const item of orphanedInventory) {
      try {
        const result = await db.collection('vendorinventories').deleteOne({
          _id: item.inventory._id
        })
        
        if (result.deletedCount > 0) {
          deletedCount++
          console.log(`   ✅ Deleted inventory for ${item.productName} (${item.inventory.id})`)
        } else {
          console.log(`   ⚠️  Failed to delete inventory ${item.inventory.id}`)
        }
      } catch (error) {
        console.error(`   ❌ Error deleting inventory ${item.inventory.id}:`, error.message)
      }
    }
    
    console.log(`\n✅ Cleanup complete! Deleted ${deletedCount} orphaned inventory record(s)`)
    
    // Step 8: Verify cleanup
    console.log('\n📋 STEP 7: Verifying cleanup...')
    const remainingInventory = await db.collection('vendorinventories').find({
      vendorId: vendorObjectId
    }).toArray()
    
    console.log(`✅ Remaining inventory records: ${remainingInventory.length}`)
    
    // Verify all remaining inventory is for valid products
    let invalidRemaining = 0
    for (const inv of remainingInventory) {
      const invProductIdStr = inv.productId?.toString() || String(inv.productId || '')
      if (!validProductIds.has(invProductIdStr)) {
        invalidRemaining++
        console.error(`   ❌ Still found invalid inventory: ${inv.id} for product ${invProductIdStr}`)
      }
    }
    
    if (invalidRemaining === 0) {
      console.log('✅ All remaining inventory records are valid!')
    } else {
      console.error(`❌ Still found ${invalidRemaining} invalid inventory record(s)!`)
    }
    
    // Step 9: Summary
    console.log('\n📊 CLEANUP SUMMARY:')
    console.log(`   Vendor: ${vendor.name} (${vendor.id})`)
    console.log(`   Valid ProductVendor relationships: ${productVendorLinks.length}`)
    console.log(`   Valid inventory records: ${validInventory.length}`)
    console.log(`   Orphaned inventory records deleted: ${deletedCount}`)
    console.log(`   Remaining inventory records: ${remainingInventory.length}`)
    console.log('\n✅ Cleanup complete!')
    
  } catch (error) {
    console.error('❌ Error:', error)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

cleanupVendorInventory()

