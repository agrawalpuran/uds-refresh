/**
 * Script to check product "Leather Dress Shoes - Male" (id: 5) vendor relationships
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

async function checkProduct5() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    // Check product with id "5"
    const product = await db.collection('uniforms').findOne({ id: '5' })
    if (!product) {
      console.error('Product with id "5" not found')
      await mongoose.disconnect()
      return
    }

    console.log(`Product: ${product.name}`)
    console.log(`  id: ${product.id} (type: ${typeof product.id})`)
    console.log(`  _id: ${product._id.toString()}`)
    console.log(`  vendorId (from product): ${product.vendorId ? product.vendorId.toString() : 'null'}\n`)

    // Check company (id: 3 - Indigo)
    const company = await db.collection('companies').findOne({ id: 3 })
    if (!company) {
      console.error('Company with id 3 not found')
      await mongoose.disconnect()
      return
    }

    console.log(`Company: ${company.name}`)
    console.log(`  id: ${company.id} (type: ${typeof company.id})`)
    console.log(`  _id: ${company._id.toString()}\n`)

    // Check ProductCompany relationship
    const productCompanyLinks = await db.collection('productcompanies').find({
      productId: product._id,
      companyId: company._id
    }).toArray()

    console.log(`ProductCompany links: ${productCompanyLinks.length}`)
    if (productCompanyLinks.length === 0) {
      console.error('❌ Product is NOT linked to company!')
    } else {
      console.log('✓ Product is linked to company')
    }

    // Check ALL ProductVendor links
    const allProductVendorLinks = await db.collection('productvendors').find({}).toArray()
    console.log(`\nAll ProductVendor links in DB: ${allProductVendorLinks.length}`)

    // Check ProductVendor relationships for this specific product
    const productIdStr = product._id.toString()
    const matchingLinks = allProductVendorLinks.filter(pv => {
      const pvProductIdStr = pv.productId ? pv.productId.toString() : null
      return pvProductIdStr === productIdStr
    })

    console.log(`ProductVendor links for this product: ${matchingLinks.length}`)
    if (matchingLinks.length === 0) {
      console.error('❌ Product is NOT linked to any vendor!')
      console.log('\nAll ProductVendor links in database:')
      allProductVendorLinks.forEach((pv, index) => {
        const pvProductIdStr = pv.productId ? pv.productId.toString() : 'null'
        console.log(`  ${index + 1}. productId: ${pvProductIdStr}, vendorId: ${pv.vendorId ? pv.vendorId.toString() : 'null'}`)
      })
    } else {
      console.log('✓ Product is linked to vendor(s):')
      const vendors = await db.collection('vendors').find({}).toArray()
      matchingLinks.forEach((pv, index) => {
        const vendor = vendors.find(v => v._id.toString() === pv.vendorId.toString())
        if (vendor) {
          console.log(`  ${index + 1}. ${vendor.name} (id: ${vendor.id}, _id: ${pv.vendorId.toString()})`)
        } else {
          console.log(`  ${index + 1}. Vendor not found (vendorId: ${pv.vendorId.toString()})`)
        }
      })
    }

    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

checkProduct5()

