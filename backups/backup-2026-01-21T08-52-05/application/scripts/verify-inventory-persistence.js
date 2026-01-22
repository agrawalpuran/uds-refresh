/**
 * Verify Vendor Inventory Persistence
 * 
 * This script checks:
 * 1. Database structure
 * 2. Actual data in vendorinventories collection
 * 3. Whether updates are being persisted
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

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
} catch (error) {}

async function verifyPersistence() {
  try {
    console.log('========================================')
    console.log('VENDOR INVENTORY PERSISTENCE VERIFICATION')
    console.log('========================================\n')
    
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    // STEP 1: Verify Collection Exists
    console.log('STEP 1: VERIFY COLLECTION STRUCTURE')
    console.log('========================================\n')
    
    const collections = await db.listCollections().toArray()
    const vendorInventoryExists = collections.some(c => c.name === 'vendorinventories')
    console.log(`✅ vendorinventories collection exists: ${vendorInventoryExists}\n`)
    
    if (!vendorInventoryExists) {
      console.log('❌ CRITICAL: Collection does not exist!')
      await mongoose.disconnect()
      return
    }
    
    // STEP 2: Check Schema/Indexes
    const inventoryCollection = db.collection('vendorinventories')
    const indexes = await inventoryCollection.indexes()
    console.log('📑 Indexes:')
    indexes.forEach((idx, i) => {
      console.log(`   ${i + 1}. ${JSON.stringify(idx.key)} (unique: ${idx.unique || false})`)
    })
    console.log('')
    
    // STEP 3: Check Existing Records
    const totalRecords = await inventoryCollection.countDocuments()
    console.log(`📊 Total inventory records: ${totalRecords}\n`)
    
    if (totalRecords > 0) {
      const sampleRecords = await inventoryCollection.find({}).limit(3).toArray()
      console.log('📄 Sample records:')
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
        console.log(`   - updatedAt: ${record.updatedAt}`)
      })
      console.log('')
    }
    
    // STEP 4: Test Update Operation
    console.log('STEP 4: TEST UPDATE OPERATION')
    console.log('========================================\n')
    
    let sampleRecords = []
    if (totalRecords > 0) {
      sampleRecords = await inventoryCollection.find({}).limit(3).toArray()
      const testRecord = sampleRecords[0]
      console.log(`🧪 Testing update on record: ${testRecord.id}`)
      console.log(`   Current sizeInventory: ${JSON.stringify(testRecord.sizeInventory)}`)
      console.log(`   Current totalStock: ${testRecord.totalStock}`)
      
      // Try to update
      const testUpdate = {
        'S': 100,
        'M': 200,
        'L': 150
      }
      
      console.log(`\n   Attempting update with: ${JSON.stringify(testUpdate)}`)
      
      const updateResult = await inventoryCollection.updateOne(
        { _id: testRecord._id },
        {
          $set: {
            sizeInventory: testUpdate,
            totalStock: 450, // 100 + 200 + 150
            updatedAt: new Date()
          }
        }
      )
      
      console.log(`   Update result:`)
      console.log(`   - matchedCount: ${updateResult.matchedCount}`)
      console.log(`   - modifiedCount: ${updateResult.modifiedCount}`)
      console.log(`   - upsertedCount: ${updateResult.upsertedCount}`)
      
      if (updateResult.matchedCount === 0) {
        console.log(`   ❌ CRITICAL: Update matched 0 records!`)
      } else if (updateResult.modifiedCount === 0) {
        console.log(`   ⚠️  WARNING: Update matched but modified 0 records!`)
      } else {
        console.log(`   ✅ Update successful: ${updateResult.modifiedCount} record(s) modified`)
        
        // Verify the update
        const updatedRecord = await inventoryCollection.findOne({ _id: testRecord._id })
        console.log(`\n   ✅ Verified update:`)
        console.log(`   - sizeInventory: ${JSON.stringify(updatedRecord.sizeInventory)}`)
        console.log(`   - totalStock: ${updatedRecord.totalStock}`)
      }
    }
    
    await mongoose.disconnect()
    console.log('\n✅ Verification complete')
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error)
    console.error(error.stack)
    process.exit(1)
  }
}

verifyPersistence()

