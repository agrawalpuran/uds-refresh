/**
 * Script to debug ProductVendor relationships
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

async function debugRelationships() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    // Get product "Formal Shirt - Male" (id: "1")
    const product = await db.collection('uniforms').findOne({ id: '1' })
    if (!product) {
      console.error('Product with id "1" not found')
      await mongoose.disconnect()
      return
    }

    console.log(`Product: ${product.name}`)
    console.log(`  id: ${product.id}`)
    console.log(`  _id: ${product._id.toString()}`)
    console.log(`  _id type: ${product._id.constructor.name}\n`)

    // Get ALL ProductVendor links
    const allProductVendorLinks = await db.collection('productvendors').find({}).toArray()
    console.log(`All ProductVendor links (${allProductVendorLinks.length}):`)
    allProductVendorLinks.forEach((pv, index) => {
      const productIdStr = pv.productId ? pv.productId.toString() : 'null'
      const vendorIdStr = pv.vendorId ? pv.vendorId.toString() : 'null'
      const matches = productIdStr === product._id.toString()
      console.log(`  ${index + 1}. productId: ${productIdStr}, vendorId: ${vendorIdStr} ${matches ? '✓ MATCHES' : ''}`)
    })

    // Check for this specific product
    const productVendorLinks = await db.collection('productvendors').find({
      productId: product._id
    }).toArray()

    console.log(`\nProductVendor links for this product: ${productVendorLinks.length}`)
    if (productVendorLinks.length === 0) {
      // Try with string comparison
      const productIdStr = product._id.toString()
      const linksByString = allProductVendorLinks.filter(pv => 
        pv.productId && pv.productId.toString() === productIdStr
      )
      console.log(`Links found by string comparison: ${linksByString.length}`)
      
      if (linksByString.length > 0) {
        console.log('Found links using string comparison:')
        linksByString.forEach((pv, index) => {
          console.log(`  ${index + 1}. vendorId: ${pv.vendorId.toString()}`)
        })
      }
    } else {
      productVendorLinks.forEach((pv, index) => {
        console.log(`  ${index + 1}. vendorId: ${pv.vendorId.toString()}`)
      })
    }

    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

debugRelationships()

