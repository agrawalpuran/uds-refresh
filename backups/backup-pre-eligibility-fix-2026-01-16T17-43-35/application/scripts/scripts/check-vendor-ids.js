/**
 * Check vendor _id values to see if they're all the same
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

async function checkVendorIds() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    console.log('='.repeat(80))
    console.log('CHECKING VENDOR _id VALUES')
    console.log('='.repeat(80))
    console.log()

    // Get all vendors
    const vendors = await db.collection('vendors').find({}).toArray()
    
    console.log(`Found ${vendors.length} vendors:\n`)
    
    const idMap = new Map()
    
    vendors.forEach((vendor, index) => {
      const idStr = vendor._id.toString()
      console.log(`Vendor ${index + 1}:`)
      console.log(`   _id: ${idStr}`)
      console.log(`   id: ${vendor.id || 'N/A'}`)
      console.log(`   name: ${vendor.name || 'N/A'}`)
      console.log()
      
      if (idMap.has(idStr)) {
        console.log(`   ⚠️  WARNING: Duplicate _id found!`)
        console.log(`   This vendor has the same _id as: ${idMap.get(idStr)}`)
      } else {
        idMap.set(idStr, vendor.name || vendor.id || 'Unknown')
      }
    })

    console.log('='.repeat(80))
    console.log('SUMMARY:')
    console.log('='.repeat(80))
    
    if (idMap.size === vendors.length) {
      console.log('✅ All vendors have unique _id values')
    } else {
      console.log(`❌ PROBLEM: Found ${vendors.length} vendors but only ${idMap.size} unique _id values`)
      console.log(`   This means some vendors share the same _id!`)
      console.log(`   This is a serious data integrity issue.`)
    }

    // Check if the specific _id the user mentioned exists
    const specificId = '6929b9d9a2fdaf5e8d099e3e'
    console.log(`\nChecking for _id: ${specificId}`)
    const vendorsWithThisId = vendors.filter(v => v._id.toString() === specificId)
    console.log(`Found ${vendorsWithThisId.length} vendor(s) with this _id:`)
    vendorsWithThisId.forEach(v => {
      console.log(`   - ${v.name || 'N/A'} (id: ${v.id || 'N/A'})`)
    })

    // Also check ProductVendor links to see which vendor _id they reference
    console.log('\n' + '='.repeat(80))
    console.log('CHECKING PRODUCTVENDOR LINKS:')
    console.log('='.repeat(80))
    const productVendors = await db.collection('productvendors').find({}).toArray()
    const vendorIdCounts = new Map()
    
    productVendors.forEach(pv => {
      if (pv.vendorId) {
        const vendorIdStr = pv.vendorId.toString()
        vendorIdCounts.set(vendorIdStr, (vendorIdCounts.get(vendorIdStr) || 0) + 1)
      }
    })
    
    console.log('Vendor _id usage in ProductVendor links:')
    vendorIdCounts.forEach((count, vendorId) => {
      const vendor = vendors.find(v => v._id.toString() === vendorId)
      console.log(`   ${vendorId}: ${count} link(s) - ${vendor ? vendor.name : 'VENDOR NOT FOUND'}`)
    })

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkVendorIds()

