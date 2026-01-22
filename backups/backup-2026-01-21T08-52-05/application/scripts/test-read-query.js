/**
 * Test the exact read query used by getVendorInventory
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

async function testReadQuery() {
  try {
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    // Simulate getVendorInventory logic
    console.log('========================================')
    console.log('TESTING READ QUERY (exact getVendorInventory logic)')
    console.log('========================================\n')
    
    // Step 1: Find vendor by string id (what UI passes)
    const vendorIdString = '100001' // UniformPro Inc
    console.log(`1. Finding vendor by string id: "${vendorIdString}"`)
    
    const vendorsCollection = db.collection('vendors')
    const vendor = await vendorsCollection.findOne({ id: vendorIdString })
    
    if (!vendor) {
      console.log('   ❌ Vendor not found!')
      await mongoose.disconnect()
      return
    }
    
    console.log(`   ✅ Vendor found: ${vendor.name}`)
    console.log(`   ✅ Vendor _id: ${vendor._id}`)
    console.log(`   ✅ Vendor _id type: ${vendor._id.constructor.name}`)
    console.log('')
    
    // Step 2: Query inventory with vendor._id
    console.log(`2. Querying inventory with vendorId: ${vendor._id}`)
    const inventoryCollection = db.collection('vendorinventories')
    
    // Test different query formats
    const query1 = { vendorId: vendor._id }
    const query2 = { vendorId: new mongoose.Types.ObjectId(vendor._id.toString()) }
    const query3 = { vendorId: mongoose.Types.ObjectId.createFromHexString(vendor._id.toString()) }
    
    console.log(`   Query 1 (direct _id): ${JSON.stringify(query1)}`)
    const result1 = await inventoryCollection.find(query1).toArray()
    console.log(`   Result 1: ${result1.length} records\n`)
    
    console.log(`   Query 2 (new ObjectId): ${JSON.stringify(query2)}`)
    const result2 = await inventoryCollection.find(query2).toArray()
    console.log(`   Result 2: ${result2.length} records\n`)
    
    console.log(`   Query 3 (createFromHexString): ${JSON.stringify(query3)}`)
    const result3 = await inventoryCollection.find(query3).toArray()
    console.log(`   Result 3: ${result3.length} records\n`)
    
    // Check what's actually in the inventory
    console.log('3. All inventory records:')
    const allInventory = await inventoryCollection.find({}).toArray()
    allInventory.forEach((inv, idx) => {
      console.log(`   Record ${idx + 1}:`)
      console.log(`     vendorId: ${inv.vendorId} (type: ${inv.vendorId.constructor.name})`)
      console.log(`     vendorId equals vendor._id: ${inv.vendorId.equals(vendor._id)}`)
      console.log(`     vendorId toString === vendor._id toString: ${inv.vendorId.toString() === vendor._id.toString()}`)
    })
    console.log('')
    
    // Step 3: Try using Mongoose model (what the code actually uses)
    console.log('4. Testing with Mongoose VendorInventory model:')
    const VendorInventory = mongoose.models.VendorInventory || mongoose.model('VendorInventory', new mongoose.Schema({}, { strict: false }))
    
    const mongooseQuery = { vendorId: vendor._id }
    const mongooseResults = await VendorInventory.find(mongooseQuery).lean()
    console.log(`   Mongoose query result: ${mongooseResults.length} records`)
    
    if (mongooseResults.length > 0) {
      console.log(`   ✅ SUCCESS! Found inventory records`)
      mongooseResults.forEach((inv, idx) => {
        console.log(`     Record ${idx + 1}: id=${inv.id}, totalStock=${inv.totalStock}`)
      })
    } else {
      console.log(`   ❌ FAILED! No records found with Mongoose model`)
    }
    
    await mongoose.disconnect()
    console.log('\n✅ Test complete')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    console.error(error.stack)
    process.exit(1)
  }
}

testReadQuery()

