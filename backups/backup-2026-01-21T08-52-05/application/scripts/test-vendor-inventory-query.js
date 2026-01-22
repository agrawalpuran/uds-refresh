/**
 * Test the exact query that getVendorInventory uses
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

async function testQuery() {
  try {
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    console.log('========================================')
    console.log('TESTING EXACT getVendorInventory QUERY')
    console.log('========================================\n')
    
    // Step 1: Find vendor by string id (what UI passes)
    const vendorIdString = '100001'
    console.log(`1. Finding vendor by string id: "${vendorIdString}"`)
    
    // Use Mongoose Vendor model (same as code)
    const Vendor = mongoose.models.Vendor || mongoose.model('Vendor', new mongoose.Schema({}, { strict: false }))
    const vendor = await Vendor.findOne({ id: vendorIdString })
    
    if (!vendor) {
      console.log('   ❌ Vendor not found!')
      await mongoose.disconnect()
      return
    }
    
    console.log(`   ✅ Vendor found: ${vendor.name}`)
    console.log(`   ✅ Vendor _id: ${vendor._id}`)
    console.log(`   ✅ Vendor _id type: ${typeof vendor._id}`)
    console.log(`   ✅ Vendor _id constructor: ${vendor._id?.constructor?.name}`)
    console.log(`   ✅ Vendor _id instanceof ObjectId: ${vendor._id instanceof mongoose.Types.ObjectId}`)
    console.log('')
    
    // Step 2: Convert to ObjectId (as in fixed code)
    const vendorObjectId = vendor._id instanceof mongoose.Types.ObjectId 
      ? vendor._id 
      : new mongoose.Types.ObjectId(vendor._id.toString())
    
    console.log(`2. Converted vendorObjectId:`)
    console.log(`   Value: ${vendorObjectId}`)
    console.log(`   Type: ${typeof vendorObjectId}`)
    console.log(`   Constructor: ${vendorObjectId.constructor.name}`)
    console.log(`   instanceof ObjectId: ${vendorObjectId instanceof mongoose.Types.ObjectId}`)
    console.log('')
    
    // Step 3: Query inventory with ObjectId
    console.log(`3. Querying inventory with vendorObjectId...`)
    const inventoryCollection = db.collection('vendorinventories')
    
    // Test 1: Direct ObjectId query
    const query1 = { vendorId: vendorObjectId }
    console.log(`   Query 1: { vendorId: ObjectId("${vendorObjectId.toString()}") }`)
    const result1 = await inventoryCollection.find(query1).toArray()
    console.log(`   Result 1: ${result1.length} records`)
    if (result1.length > 0) {
      console.log(`   ✅ SUCCESS! Found inventory:`)
      result1.forEach((inv, idx) => {
        console.log(`     Record ${idx + 1}:`)
        console.log(`       id: ${inv.id}`)
        console.log(`       productId: ${inv.productId}`)
        console.log(`       sizeInventory: ${JSON.stringify(inv.sizeInventory)}`)
        console.log(`       totalStock: ${inv.totalStock}`)
      })
    } else {
      console.log(`   ❌ FAILED - No records found`)
    }
    console.log('')
    
    // Test 2: Check all inventory records
    console.log(`4. All inventory records in database:`)
    const allInventory = await inventoryCollection.find({}).toArray()
    console.log(`   Total records: ${allInventory.length}`)
    allInventory.forEach((inv, idx) => {
      console.log(`   Record ${idx + 1}:`)
      console.log(`     vendorId: ${inv.vendorId} (type: ${inv.vendorId?.constructor?.name})`)
      console.log(`     vendorId toString: ${inv.vendorId?.toString()}`)
      console.log(`     Matches query vendorId: ${inv.vendorId?.equals(vendorObjectId)}`)
      console.log(`     productId: ${inv.productId}`)
      console.log(`     sizeInventory: ${JSON.stringify(inv.sizeInventory)}`)
    })
    console.log('')
    
    // Test 3: Try with Mongoose VendorInventory model
    console.log(`5. Testing with Mongoose VendorInventory model:`)
    const VendorInventory = mongoose.models.VendorInventory || mongoose.model('VendorInventory', new mongoose.Schema({}, { strict: false }))
    
    const mongooseResult = await VendorInventory.find({ vendorId: vendorObjectId }).lean()
    console.log(`   Mongoose query result: ${mongooseResult.length} records`)
    if (mongooseResult.length > 0) {
      console.log(`   ✅ SUCCESS!`)
      mongooseResult.forEach((inv, idx) => {
        console.log(`     Record ${idx + 1}: id=${inv.id}, totalStock=${inv.totalStock}`)
      })
    } else {
      console.log(`   ❌ FAILED - No records found`)
    }
    
    await mongoose.disconnect()
    console.log('\n✅ Test complete')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    console.error(error.stack)
    process.exit(1)
  }
}

testQuery()

