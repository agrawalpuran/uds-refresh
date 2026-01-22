/**
 * Script to fix missing ProductVendor relationships
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

async function fixProductVendorLinks() {
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
    console.log(`Found ${vendors.length} vendors:`)
    vendors.forEach(v => console.log(`  - ${v.name} (id: ${v.id}, _id: ${v._id.toString()})`))
    console.log()

    // Get existing ProductVendor links
    const existingLinks = await db.collection('productvendors').find({}).toArray()
    console.log(`Existing ProductVendor links: ${existingLinks.length}\n`)

    // Check each product
    let fixedCount = 0
    let skippedCount = 0

    for (const product of products) {
      // Check if product already has vendor links
      const existingProductLinks = existingLinks.filter(
        link => link.productId.toString() === product._id.toString()
      )

      if (existingProductLinks.length > 0) {
        console.log(`✓ Product "${product.name}" (${product.id}) already has ${existingProductLinks.length} vendor link(s)`)
        skippedCount++
        continue
      }

      // Product has no vendor links - need to create one
      console.log(`⚠ Product "${product.name}" (${product.id}) has NO vendor links`)

      // Use the product's vendorId if it exists, otherwise use the first vendor
      let vendorId = null
      if (product.vendorId) {
        vendorId = product.vendorId
        console.log(`   Using product's vendorId: ${vendorId.toString()}`)
      } else if (vendors.length > 0) {
        vendorId = vendors[0]._id
        console.log(`   Using first available vendor: ${vendors[0].name}`)
      }

      if (vendorId) {
        // Check if link already exists
        const existingLink = await db.collection('productvendors').findOne({
          productId: product._id,
          vendorId: vendorId
        })

        if (!existingLink) {
          // Create ProductVendor link
          await db.collection('productvendors').insertOne({
            productId: product._id,
            vendorId: vendorId,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          console.log(`   ✓ Created ProductVendor link`)
          fixedCount++
        } else {
          console.log(`   - Link already exists`)
        }
      } else {
        console.log(`   ❌ No vendor available to link`)
      }
      console.log()
    }

    console.log('='.repeat(80))
    console.log(`Summary:`)
    console.log(`  Products checked: ${products.length}`)
    console.log(`  Fixed: ${fixedCount}`)
    console.log(`  Already had links: ${skippedCount}`)
    console.log(`  Failed: ${products.length - fixedCount - skippedCount}`)

    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

fixProductVendorLinks()

