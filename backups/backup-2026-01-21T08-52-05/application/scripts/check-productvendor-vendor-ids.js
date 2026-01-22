/**
 * Check which vendor _id values are used in ProductVendor links
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
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (error) {
  console.warn('Could not read .env.local')
}

async function checkProductVendorIds() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    console.log('='.repeat(80))
    console.log('CHECKING PRODUCTVENDOR LINKS - VENDOR _id VALUES')
    console.log('='.repeat(80))
    console.log()

    // Get all vendors for reference
    const vendors = await db.collection('vendors').find({}).toArray()
    const vendorMap = new Map()
    vendors.forEach(v => {
      vendorMap.set(v._id.toString(), { id: v.id, name: v.name })
    })

    // Get all ProductVendor links
    const productVendors = await db.collection('productvendors').find({}).toArray()
    
    console.log(`Found ${productVendors.length} ProductVendor links:\n`)

    const vendorIdCounts = new Map()
    const vendorIdDetails = new Map()

    productVendors.forEach((pv, index) => {
      const vendorIdStr = pv.vendorId ? pv.vendorId.toString() : 'MISSING'
      const vendor = vendorMap.get(vendorIdStr)
      
      if (!vendorIdCounts.has(vendorIdStr)) {
        vendorIdCounts.set(vendorIdStr, 0)
        vendorIdDetails.set(vendorIdStr, {
          vendorName: vendor ? vendor.name : 'NOT FOUND',
          vendorId: vendor ? vendor.id : 'N/A',
          links: []
        })
      }
      
      vendorIdCounts.set(vendorIdStr, vendorIdCounts.get(vendorIdStr) + 1)
      vendorIdDetails.get(vendorIdStr).links.push({
        productId: pv.productId ? pv.productId.toString() : 'MISSING',
        companyId: pv.companyId ? pv.companyId.toString() : 'NONE'
      })
    })

    console.log('Vendor _id Distribution in ProductVendor Links:')
    console.log('='.repeat(80))
    
    vendorIdCounts.forEach((count, vendorId) => {
      const details = vendorIdDetails.get(vendorId)
      console.log(`\nVendor _id: ${vendorId}`)
      console.log(`   Vendor Name: ${details.vendorName}`)
      console.log(`   Vendor ID: ${details.vendorId}`)
      console.log(`   Used in ${count} ProductVendor link(s)`)
      
      if (vendorId === '6929b9d9a2fdaf5e8d099e3e') {
        console.log(`   ⚠️  This is the _id you mentioned!`)
      }
    })

    console.log('\n' + '='.repeat(80))
    console.log('ANALYSIS:')
    console.log('='.repeat(80))
    
    if (vendorIdCounts.size === 1) {
      const onlyVendorId = Array.from(vendorIdCounts.keys())[0]
      const details = vendorIdDetails.get(onlyVendorId)
      console.log(`❌ ISSUE: All ProductVendor links use the same vendor _id: ${onlyVendorId}`)
      console.log(`   Vendor: ${details.vendorName} (${details.vendorId})`)
      console.log(`   This means all products are linked to only one vendor!`)
      console.log(`   Other vendors (${vendors.length - 1}) are not being used.`)
    } else {
      console.log(`✅ Multiple vendors are being used in ProductVendor links`)
      console.log(`   Found ${vendorIdCounts.size} different vendor _id values`)
    }

    // Show all vendor _id values for comparison
    console.log('\n' + '='.repeat(80))
    console.log('ALL VENDOR _id VALUES (for comparison):')
    console.log('='.repeat(80))
    vendors.forEach(v => {
      const isUsed = vendorIdCounts.has(v._id.toString())
      console.log(`   ${v._id.toString()} - ${v.name} (${v.id}) ${isUsed ? '✅ USED' : '❌ NOT USED'}`)
    })

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkProductVendorIds()

