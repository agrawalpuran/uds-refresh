/**
 * Verify ID Mismatch Between Write and Read Paths
 * 
 * This script checks:
 * 1. What vendor/product IDs are used in inventory records (ObjectIds)
 * 2. What vendor/product IDs the UI/API uses (string IDs)
 * 3. The mismatch causing read failures
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load MongoDB URI
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
  console.log('Could not read .env.local')
}

async function verifyIdMismatch() {
  try {
    console.log('========================================')
    console.log('ID MISMATCH VERIFICATION')
    console.log('========================================\n')
    
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    // Get the inventory record
    const inventoryCollection = db.collection('vendorinventories')
    const inventoryRecord = await inventoryCollection.findOne({})
    
    if (!inventoryRecord) {
      console.log('❌ No inventory records found')
      await mongoose.disconnect()
      return
    }
    
    console.log('📋 INVENTORY RECORD (as stored in DB):')
    console.log(`   vendorId (ObjectId): ${inventoryRecord.vendorId}`)
    console.log(`   productId (ObjectId): ${inventoryRecord.productId}\n`)
    
    // Get vendor by ObjectId
    const vendorsCollection = db.collection('vendors')
    const vendor = await vendorsCollection.findOne({ _id: inventoryRecord.vendorId })
    
    if (vendor) {
      console.log('👥 VENDOR (looked up by ObjectId):')
      console.log(`   _id: ${vendor._id}`)
      console.log(`   id (string): ${vendor.id}`)
      console.log(`   name: ${vendor.name}\n`)
    } else {
      console.log('❌ Vendor not found by ObjectId\n')
    }
    
    // Get product by ObjectId
    const uniformsCollection = db.collection('uniforms')
    const product = await uniformsCollection.findOne({ _id: inventoryRecord.productId })
    
    if (product) {
      console.log('📦 PRODUCT (looked up by ObjectId):')
      console.log(`   _id: ${product._id}`)
      console.log(`   id (string): ${product.id}`)
      console.log(`   name: ${product.name}\n`)
    } else {
      console.log('❌ Product not found by ObjectId\n')
    }
    
    // Now check what happens when we query by string ID (what UI uses)
    console.log('========================================')
    console.log('READ PATH SIMULATION (what UI/API does)')
    console.log('========================================\n')
    
    if (vendor && product) {
      console.log(`🔍 UI/API would use:`)
      console.log(`   vendorId (string): "${vendor.id}"`)
      console.log(`   productId (string): "${product.id}"\n`)
      
      // Simulate what getVendorInventory does
      console.log('📖 Simulating getVendorInventory() logic:')
      console.log('   1. Find vendor by string id...')
      const vendorByStringId = await vendorsCollection.findOne({ id: vendor.id })
      
      if (vendorByStringId) {
        console.log(`   ✅ Found vendor: ${vendorByStringId.name}`)
        console.log(`   ✅ Vendor _id: ${vendorByStringId._id}`)
        
        console.log('   2. Find product by string id...')
        const productByStringId = await uniformsCollection.findOne({ id: product.id })
        
        if (productByStringId) {
          console.log(`   ✅ Found product: ${productByStringId.name}`)
          console.log(`   ✅ Product _id: ${productByStringId._id}\n`)
          
          console.log('   3. Query inventory by vendor._id and product._id...')
          const inventoryByConvertedIds = await inventoryCollection.findOne({
            vendorId: vendorByStringId._id,
            productId: productByStringId._id
          })
          
          if (inventoryByConvertedIds) {
            console.log(`   ✅ FOUND INVENTORY RECORD!`)
            console.log(`   - id: ${inventoryByConvertedIds.id}`)
            console.log(`   - sizeInventory: ${JSON.stringify(inventoryByConvertedIds.sizeInventory)}`)
            console.log(`   - totalStock: ${inventoryByConvertedIds.totalStock}\n`)
          } else {
            console.log(`   ❌ NO INVENTORY RECORD FOUND!`)
            console.log(`   This is the ROOT CAUSE - read path cannot find written data!\n`)
            
            // Check if IDs match
            console.log('🔍 ID COMPARISON:')
            console.log(`   Written vendorId: ${inventoryRecord.vendorId}`)
            console.log(`   Read vendorId:    ${vendorByStringId._id}`)
            console.log(`   Match: ${inventoryRecord.vendorId.equals(vendorByStringId._id)}\n`)
            
            console.log(`   Written productId: ${inventoryRecord.productId}`)
            console.log(`   Read productId:    ${productByStringId._id}`)
            console.log(`   Match: ${inventoryRecord.productId.equals(productByStringId._id)}\n`)
          }
        } else {
          console.log(`   ❌ Product not found by string id: ${product.id}\n`)
        }
      } else {
        console.log(`   ❌ Vendor not found by string id: ${vendor.id}\n`)
      }
    }
    
    // Check all vendors and their inventory
    console.log('========================================')
    console.log('ALL VENDORS AND THEIR INVENTORY')
    console.log('========================================\n')
    
    const allVendors = await vendorsCollection.find({}).toArray()
    for (const v of allVendors) {
      const invCount = await inventoryCollection.countDocuments({ vendorId: v._id })
      console.log(`Vendor: ${v.name} (id: ${v.id}, _id: ${v._id})`)
      console.log(`  Inventory records: ${invCount}`)
      
      if (invCount > 0) {
        const invs = await inventoryCollection.find({ vendorId: v._id }).toArray()
        invs.forEach(inv => {
          const prod = uniformsCollection.findOne({ _id: inv.productId })
          console.log(`    - Product _id: ${inv.productId}, sizeInventory: ${JSON.stringify(inv.sizeInventory)}`)
        })
      }
      console.log('')
    }
    
    await mongoose.disconnect()
    console.log('✅ Verification complete')
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error)
    console.error(error.stack)
    process.exit(1)
  }
}

verifyIdMismatch()

