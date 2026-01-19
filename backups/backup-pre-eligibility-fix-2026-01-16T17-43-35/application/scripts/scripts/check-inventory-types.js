/**
 * Check exact types of IDs in inventory records
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

async function checkTypes() {
  try {
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    const inventoryCollection = db.collection('vendorinventories')
    const inv = await inventoryCollection.findOne({})
    
    if (!inv) {
      console.log('No inventory records')
      await mongoose.disconnect()
      return
    }
    
    console.log('INVENTORY RECORD DETAILED TYPE CHECK:')
    console.log(`vendorId: ${inv.vendorId}`)
    console.log(`vendorId type: ${typeof inv.vendorId}`)
    console.log(`vendorId constructor: ${inv.vendorId?.constructor?.name}`)
    console.log(`vendorId instanceof ObjectId: ${inv.vendorId instanceof mongoose.Types.ObjectId}`)
    console.log(`vendorId instanceof Object: ${inv.vendorId instanceof Object}`)
    console.log(`vendorId toString: ${inv.vendorId?.toString()}`)
    console.log('')
    
    console.log(`productId: ${inv.productId}`)
    console.log(`productId type: ${typeof inv.productId}`)
    console.log(`productId constructor: ${inv.productId?.constructor?.name}`)
    console.log(`productId instanceof ObjectId: ${inv.productId instanceof mongoose.Types.ObjectId}`)
    console.log(`productId instanceof Object: ${inv.productId instanceof Object}`)
    console.log(`productId toString: ${inv.productId?.toString()}`)
    console.log('')
    
    // Try to find vendor
    const vendorsCollection = db.collection('vendors')
    const vendorById = await vendorsCollection.findOne({ _id: new mongoose.Types.ObjectId(inv.vendorId.toString()) })
    console.log(`Vendor found by ObjectId: ${vendorById ? vendorById.name : 'NOT FOUND'}`)
    
    const allVendors = await vendorsCollection.find({}).toArray()
    console.log(`\nAll vendors:`)
    allVendors.forEach(v => {
      const matches = v._id.toString() === inv.vendorId.toString()
      console.log(`  ${v.name}: _id=${v._id.toString()}, matches=${matches}`)
    })
    
    await mongoose.disconnect()
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

checkTypes()

