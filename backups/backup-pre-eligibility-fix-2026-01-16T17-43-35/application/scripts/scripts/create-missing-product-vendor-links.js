/**
 * Script to create missing ProductVendor links for products
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Try to read .env.local file manually
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
  console.warn('Could not read .env.local, using default connection string')
}

async function createMissingLinks() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    // Get all products
    const products = await db.collection('uniforms').find({}).toArray()
    console.log(`Found ${products.length} products\n`)

    // Get all vendors
    const vendors = await db.collection('vendors').find({}).toArray()
    console.log(`Found ${vendors.length} vendors\n`)

    // Get existing ProductVendor links
    const existingLinks = await db.collection('productvendors').find({}).toArray()
    const existingLinkMap = new Map()
    existingLinks.forEach(link => {
      const productIdStr = link.productId ? link.productId.toString() : null
      if (productIdStr) {
        if (!existingLinkMap.has(productIdStr)) {
          existingLinkMap.set(productIdStr, [])
        }
        existingLinkMap.get(productIdStr).push(link.vendorId.toString())
      }
    })

    let createdCount = 0
    let skippedCount = 0

    for (const product of products) {
      const productIdStr = product._id.toString()
      const existingVendors = existingLinkMap.get(productIdStr) || []

      if (existingVendors.length > 0) {
        console.log(`✓ Product "${product.name}" (${product.id}) already has ${existingVendors.length} vendor link(s)`)
        skippedCount++
        continue
      }

      // Product has no vendor links - create one
      console.log(`⚠ Product "${product.name}" (${product.id}) has NO vendor links`)

      // Determine which vendor to use
      let vendorId = null
      let vendorName = 'Unknown'

      // First, try to use product's vendorId field
      if (product.vendorId) {
        const vendorIdStr = product.vendorId.toString()
        const vendor = vendors.find(v => v._id.toString() === vendorIdStr)
        if (vendor) {
          vendorId = product.vendorId
          vendorName = vendor.name
          console.log(`   Using product's vendorId: ${vendor.name} (${vendor.id})`)
        }
      }

      // If product doesn't have vendorId or vendor not found, use first available vendor
      if (!vendorId && vendors.length > 0) {
        vendorId = vendors[0]._id
        vendorName = vendors[0].name
        console.log(`   Using first available vendor: ${vendors[0].name} (${vendors[0].id})`)
      }

      if (vendorId) {
        // Create ProductVendor link
        await db.collection('productvendors').insertOne({
          productId: product._id,
          vendorId: vendorId,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        console.log(`   ✓ Created ProductVendor link: ${product.name} -> ${vendorName}`)
        createdCount++
      } else {
        console.log(`   ❌ No vendor available to link`)
      }
      console.log()
    }

    console.log('='.repeat(80))
    console.log(`Summary:`)
    console.log(`  Products checked: ${products.length}`)
    console.log(`  Created links: ${createdCount}`)
    console.log(`  Already had links: ${skippedCount}`)

    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

createMissingLinks()

