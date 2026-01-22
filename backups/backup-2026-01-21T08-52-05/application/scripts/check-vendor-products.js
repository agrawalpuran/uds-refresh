/**
 * Diagnostic script to check vendor products and relationships
 * Run with: node scripts/check-vendor-products.js
 */

const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')

let MONGODB_URI = process.env.MONGODB_URI

// Try to read from .env.local file directly
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
      console.log('✅ Loaded MONGODB_URI from .env.local')
    }
  }
} catch (error) {
  console.log('⚠️  Could not read .env.local, trying dotenv...')
  try {
    require('dotenv').config({ path: '.env.local' })
    MONGODB_URI = process.env.MONGODB_URI
  } catch (e) {
    // dotenv not available
  }
}

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found')
  console.error('Please set MONGODB_URI in .env.local')
  process.exit(1)
}

async function checkVendorProducts() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB\n')

    const db = mongoose.connection.db

    // Check vendors
    console.log('=== VENDORS ===')
    const vendors = await db.collection('vendors').find({}).toArray()
    console.log(`Total vendors: ${vendors.length}`)
    vendors.forEach(v => {
      console.log(`  - ID: ${v.id}, Name: ${v.name}, Email: ${v.email}`)
    })
    console.log()

    // Check ProductVendor relationships
    console.log('=== PRODUCT-VENDOR RELATIONSHIPS ===')
    const productVendorLinks = await db.collection('productvendors').find({}).toArray()
    console.log(`Total ProductVendor relationships: ${productVendorLinks.length}`)
    
    if (productVendorLinks.length > 0) {
      // Get vendor details
      const vendorMap = new Map()
      vendors.forEach(v => {
        vendorMap.set(v._id.toString(), v)
      })

      // Get product details
      const products = await db.collection('uniforms').find({}).toArray()
      const productMap = new Map()
      products.forEach(p => {
        productMap.set(p._id.toString(), p)
      })

      productVendorLinks.forEach(link => {
        const vendor = vendorMap.get(link.vendorId?.toString())
        const product = productMap.get(link.productId?.toString())
        console.log(`  - Vendor: ${vendor?.name || 'Unknown'} (${vendor?.id || 'N/A'}) <-> Product: ${product?.name || 'Unknown'} (${product?.id || 'N/A'})`)
      })
    }
    console.log()

    // Check specific vendor (100001)
    console.log('=== VENDOR 100001 DETAILS ===')
    const vendor100001 = vendors.find(v => v.id === '100001')
    if (vendor100001) {
      console.log(`Found vendor: ${vendor100001.name} (ID: ${vendor100001.id}, _id: ${vendor100001._id})`)
      
      const vendor100001Links = productVendorLinks.filter(link => 
        link.vendorId?.toString() === vendor100001._id.toString()
      )
      console.log(`ProductVendor relationships for vendor 100001: ${vendor100001Links.length}`)
      
      if (vendor100001Links.length > 0) {
        const products = await db.collection('uniforms').find({}).toArray()
        const productMap = new Map()
        products.forEach(p => {
          productMap.set(p._id.toString(), p)
        })
        
        vendor100001Links.forEach(link => {
          const product = productMap.get(link.productId?.toString())
          console.log(`  - Product: ${product?.name || 'Unknown'} (${product?.id || 'N/A'})`)
        })
      } else {
        console.log('  ⚠️  No ProductVendor relationships found for vendor 100001')
      }

      // Check orders
      const orders = await db.collection('orders').find({ vendorId: vendor100001._id }).toArray()
      console.log(`Orders for vendor 100001: ${orders.length}`)
    } else {
      console.log('  ❌ Vendor 100001 not found!')
    }
    console.log()

    // Check products
    console.log('=== PRODUCTS ===')
    const products = await db.collection('uniforms').find({}).limit(10).toArray()
    console.log(`Total products (showing first 10): ${products.length}`)
    products.forEach(p => {
      console.log(`  - ID: ${p.id}, Name: ${p.name}, Category: ${p.category}`)
    })
    console.log()

    await mongoose.disconnect()
    console.log('Disconnected from MongoDB')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

checkVendorProducts()

