/**
 * Check current vendor IDs in the database
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
    console.log('CURRENT VENDOR IDs IN DATABASE')
    console.log('='.repeat(80))
    console.log()

    // Get all vendors
    const vendors = await db.collection('vendors').find({}).toArray()
    
    console.log(`Found ${vendors.length} vendor(s)\n`)

    vendors.forEach((vendor, index) => {
      console.log(`Vendor ${index + 1}:`)
      console.log(`   _id: ${vendor._id}`)
      console.log(`   id: ${vendor.id}`)
      console.log(`   name: ${vendor.name}`)
      console.log()
    })

    // Check ProductVendor links
    const productVendors = await db.collection('productvendors').find({}).toArray()
    console.log(`\nProductVendor links: ${productVendors.length}`)
    
    const vendorIdSet = new Set()
    productVendors.forEach(pv => {
      if (pv.vendorId) {
        vendorIdSet.add(pv.vendorId.toString())
      }
    })
    console.log(`Unique vendor _id values in ProductVendor: ${vendorIdSet.size}`)
    Array.from(vendorIdSet).forEach(vid => {
      console.log(`   - ${vid}`)
    })

    // Check Orders
    const orders = await db.collection('orders').find({ vendorId: { $exists: true } }).toArray()
    console.log(`\nOrders with vendorId: ${orders.length}`)
    
    const orderVendorIds = new Set()
    orders.forEach(order => {
      if (order.vendorId) {
        orderVendorIds.add(order.vendorId.toString())
      }
    })
    console.log(`Unique vendor _id values in Orders: ${orderVendorIds.size}`)
    Array.from(orderVendorIds).forEach(vid => {
      console.log(`   - ${vid}`)
    })

    // Check Inventory
    const inventories = await db.collection('inventories').find({ vendorId: { $exists: true } }).toArray()
    console.log(`\nInventory records with vendorId: ${inventories.length}`)
    
    const invVendorIds = new Set()
    inventories.forEach(inv => {
      if (inv.vendorId) {
        invVendorIds.add(inv.vendorId.toString())
      }
    })
    console.log(`Unique vendor _id values in Inventory: ${invVendorIds.size}`)
    Array.from(invVendorIds).forEach(vid => {
      console.log(`   - ${vid}`)
    })

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkVendorIds()

