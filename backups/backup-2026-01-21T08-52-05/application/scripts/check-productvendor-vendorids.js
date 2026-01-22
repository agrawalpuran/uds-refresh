/**
 * Check actual vendorId values in ProductVendor collection
 */

const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')

let MONGODB_URI = process.env.MONGODB_URI

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
  console.log('⚠️  Could not read .env.local')
}

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found')
  process.exit(1)
}

async function checkProductVendorVendorIds() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db

    // Get vendor
    const vendor = await db.collection('vendors').findOne({ id: '100001' })
    if (!vendor) {
      console.error('❌ Vendor not found!')
      await mongoose.disconnect()
      return
    }

    console.log(`Vendor: ${vendor.name}`)
    console.log(`  _id: ${vendor._id}`)
    console.log(`  _id type: ${vendor._id.constructor.name}`)
    console.log(`  _id string: ${vendor._id.toString()}\n`)

    // Get ALL ProductVendor links
    const allLinks = await db.collection('productvendors').find({}).toArray()
    console.log(`Total ProductVendor links: ${allLinks.length}\n`)

    console.log('=== ALL PRODUCTVENDOR LINKS ===')
    allLinks.forEach((link, index) => {
      const linkVendorId = link.vendorId
      const vendorIdStr = vendor._id.toString()
      const linkVendorIdStr = linkVendorId?.toString()
      
      console.log(`Link ${index + 1}:`)
      console.log(`  vendorId: ${linkVendorIdStr}`)
      console.log(`  vendorId type: ${linkVendorId?.constructor?.name}`)
      console.log(`  Matches vendor? ${linkVendorIdStr === vendorIdStr}`)
      console.log(`  ObjectId.equals? ${linkVendorId && vendor._id && linkVendorId.equals ? linkVendorId.equals(vendor._id) : 'N/A'}`)
      console.log()
    })

    // Try different query methods
    console.log('=== TESTING QUERIES ===')
    
    // Method 1: Direct ObjectId
    const query1 = await db.collection('productvendors').find({ 
      vendorId: vendor._id 
    }).toArray()
    console.log(`Query with vendor._id (ObjectId): ${query1.length} results`)

    // Method 2: String comparison
    const query2 = allLinks.filter(link => {
      return link.vendorId?.toString() === vendor._id.toString()
    })
    console.log(`Filter with string comparison: ${query2.length} results`)

    // Method 3: New ObjectId
    const vendorObjectId = new mongoose.Types.ObjectId(vendor._id)
    const query3 = await db.collection('productvendors').find({ 
      vendorId: vendorObjectId 
    }).toArray()
    console.log(`Query with new ObjectId: ${query3.length} results`)

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkProductVendorVendorIds()

