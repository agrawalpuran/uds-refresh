/**
 * Database-Level Inventory Diagnostic Script
 * 
 * This script directly inspects MongoDB to verify:
 * 1. Collection existence and structure
 * 2. Actual data stored
 * 3. Write vs read path alignment
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load MongoDB URI from .env.local
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
  console.log('Could not read .env.local, using default or environment variable')
}

async function diagnoseInventoryDatabase() {
  try {
    console.log('========================================')
    console.log('DATABASE-LEVEL INVENTORY DIAGNOSTIC')
    console.log('========================================\n')
    
    // Connect to database
    console.log('📡 Connecting to MongoDB...')
    console.log(`   URI: ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`)
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')
    
    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }
    
    // STEP 1: Verify Collection Existence
    console.log('========================================')
    console.log('STEP 1: VERIFY COLLECTION EXISTENCE')
    console.log('========================================\n')
    
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)
    
    console.log(`📋 Total collections in database: ${collectionNames.length}`)
    console.log(`   Collections: ${collectionNames.join(', ')}\n`)
    
    // Check for inventory-related collections
    const inventoryCollections = collectionNames.filter(name => 
      name.toLowerCase().includes('inventory') || 
      name.toLowerCase().includes('vendor')
    )
    
    console.log(`🔍 Inventory-related collections found: ${inventoryCollections.length}`)
    inventoryCollections.forEach(name => {
      console.log(`   - ${name}`)
    })
    console.log('')
    
    // Check specifically for vendorinventories
    const vendorInventoryExists = collectionNames.includes('vendorinventories')
    console.log(`✅ vendorinventories collection exists: ${vendorInventoryExists}`)
    
    if (!vendorInventoryExists) {
      console.log('❌ CRITICAL: vendorinventories collection does NOT exist!')
      console.log('   This means no inventory data has ever been saved.\n')
      await mongoose.disconnect()
      return
    }
    
    // STEP 2: Inspect Collection Structure
    console.log('========================================')
    console.log('STEP 2: INSPECT COLLECTION STRUCTURE')
    console.log('========================================\n')
    
    const vendorInventoryCollection = db.collection('vendorinventories')
    const totalRecords = await vendorInventoryCollection.countDocuments()
    console.log(`📊 Total records in vendorinventories: ${totalRecords}\n`)
    
    if (totalRecords === 0) {
      console.log('⚠️  WARNING: Collection exists but is EMPTY')
      console.log('   No inventory data has been persisted.\n')
    } else {
      // Get sample records
      console.log('📄 Sample records (first 3):')
      const sampleRecords = await vendorInventoryCollection.find({}).limit(3).toArray()
      
      sampleRecords.forEach((record, idx) => {
        console.log(`\n   Record ${idx + 1}:`)
        console.log(`   - _id: ${record._id}`)
        console.log(`   - id: ${record.id || 'MISSING'}`)
        console.log(`   - vendorId: ${record.vendorId} (type: ${record.vendorId?.constructor?.name || typeof record.vendorId})`)
        console.log(`   - productId: ${record.productId} (type: ${record.productId?.constructor?.name || typeof record.productId})`)
        console.log(`   - sizeInventory: ${JSON.stringify(record.sizeInventory)}`)
        console.log(`   - sizeInventory type: ${record.sizeInventory?.constructor?.name || typeof record.sizeInventory}`)
        console.log(`   - totalStock: ${record.totalStock}`)
        console.log(`   - lowInventoryThreshold: ${JSON.stringify(record.lowInventoryThreshold)}`)
        console.log(`   - createdAt: ${record.createdAt}`)
        console.log(`   - updatedAt: ${record.updatedAt}`)
      })
      console.log('')
    }
    
    // STEP 3: Verify Schema Alignment
    console.log('========================================')
    console.log('STEP 3: VERIFY SCHEMA ALIGNMENT')
    console.log('========================================\n')
    
    // Get indexes
    const indexes = await vendorInventoryCollection.indexes()
    console.log(`📑 Indexes on vendorinventories:`)
    indexes.forEach((idx, i) => {
      console.log(`   ${i + 1}. ${JSON.stringify(idx.key)} (unique: ${idx.unique || false})`)
    })
    console.log('')
    
    // Check for required fields in actual records
    let sampleRecords = []
    if (totalRecords > 0) {
      sampleRecords = await vendorInventoryCollection.find({}).limit(3).toArray()
      const sampleRecord = sampleRecords[0]
      const requiredFields = ['vendorId', 'productId', 'sizeInventory', 'totalStock']
      console.log('🔍 Required fields check:')
      requiredFields.forEach(field => {
        const exists = field in sampleRecord
        const value = sampleRecord[field]
        const type = value?.constructor?.name || typeof value
        console.log(`   - ${field}: ${exists ? '✅' : '❌'} (type: ${type})`)
        if (exists && value !== null && value !== undefined) {
          if (field === 'sizeInventory') {
            console.log(`     Value: ${JSON.stringify(value)}`)
          } else {
            console.log(`     Value: ${value}`)
          }
        }
      })
      console.log('')
    }
    
    // STEP 4: Verify Vendor and Product References
    console.log('========================================')
    console.log('STEP 4: VERIFY VENDOR/PRODUCT REFERENCES')
    console.log('========================================\n')
    
    // Check vendors collection
    const vendorsCollection = db.collection('vendors')
    const vendorCount = await vendorsCollection.countDocuments()
    console.log(`👥 Vendors in database: ${vendorCount}`)
    
    if (vendorCount > 0 && totalRecords > 0) {
      const sampleVendor = await vendorsCollection.findOne({})
      console.log(`   Sample vendor:`)
      console.log(`   - _id: ${sampleVendor._id}`)
      console.log(`   - id: ${sampleVendor.id || 'MISSING'}`)
      console.log(`   - name: ${sampleVendor.name || 'MISSING'}`)
      
      // Check if inventory records reference this vendor
      const inventoryForVendor = await vendorInventoryCollection.countDocuments({
        vendorId: sampleVendor._id
      })
      console.log(`   - Inventory records for this vendor: ${inventoryForVendor}`)
    }
    console.log('')
    
    // Check uniforms/products collection
    const uniformsCollection = db.collection('uniforms')
    const productCount = await uniformsCollection.countDocuments()
    console.log(`📦 Products in database: ${productCount}`)
    
    if (productCount > 0 && totalRecords > 0) {
      const sampleProduct = await uniformsCollection.findOne({})
      console.log(`   Sample product:`)
      console.log(`   - _id: ${sampleProduct._id}`)
      console.log(`   - id: ${sampleProduct.id || 'MISSING'}`)
      console.log(`   - name: ${sampleProduct.name || 'MISSING'}`)
      
      // Check if inventory records reference this product
      const inventoryForProduct = await vendorInventoryCollection.countDocuments({
        productId: sampleProduct._id
      })
      console.log(`   - Inventory records for this product: ${inventoryForProduct}`)
    }
    console.log('')
    
    // STEP 5: Test Write Path (Simulate)
    console.log('========================================')
    console.log('STEP 5: TEST WRITE PATH')
    console.log('========================================\n')
    
    if (vendorCount > 0 && productCount > 0) {
      const testVendor = await vendorsCollection.findOne({})
      const testProduct = await uniformsCollection.findOne({})
      
      console.log('🧪 Testing write operation...')
      console.log(`   Test vendorId: ${testVendor._id} (id: ${testVendor.id})`)
      console.log(`   Test productId: ${testProduct._id} (id: ${testProduct.id})`)
      
      // Check if record exists
      const existingRecord = await vendorInventoryCollection.findOne({
        vendorId: testVendor._id,
        productId: testProduct._id
      })
      
      if (existingRecord) {
        console.log(`   ✅ Record EXISTS for this vendor+product combination`)
        console.log(`   - Record id: ${existingRecord.id}`)
        console.log(`   - sizeInventory: ${JSON.stringify(existingRecord.sizeInventory)}`)
        console.log(`   - totalStock: ${existingRecord.totalStock}`)
      } else {
        console.log(`   ⚠️  No record found for this vendor+product combination`)
        console.log(`   This suggests write operations may not be persisting.`)
      }
    }
    console.log('')
    
    // STEP 6: Summary
    console.log('========================================')
    console.log('DIAGNOSTIC SUMMARY')
    console.log('========================================\n')
    
    console.log('✅ Collection exists: vendorinventories')
    console.log(`✅ Total records: ${totalRecords}`)
    console.log(`✅ Vendors: ${vendorCount}`)
    console.log(`✅ Products: ${productCount}`)
    
    if (totalRecords === 0) {
      console.log('\n❌ ROOT CAUSE: Collection is empty - writes are not persisting')
    } else {
      console.log('\n✅ Data exists in collection')
      console.log('   Next: Verify read path matches write identifiers')
    }
    
    await mongoose.disconnect()
    console.log('\n✅ Diagnostic complete')
    
  } catch (error) {
    console.error('\n❌ Diagnostic failed:', error)
    console.error(error.stack)
    process.exit(1)
  }
}

// Run diagnostic
diagnoseInventoryDatabase()

