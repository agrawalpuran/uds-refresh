/**
 * Script to check product-company-vendor relationships
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

async function checkRelationships() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    // Check product "Formal Shirt - Male" (id: "1")
    const product = await db.collection('uniforms').findOne({ id: '1' })
    if (!product) {
      console.error('Product with id "1" not found')
      await mongoose.disconnect()
      return
    }

    console.log(`Product: ${product.name}`)
    console.log(`  id: ${product.id}`)
    console.log(`  _id: ${product._id.toString()}\n`)

    // Check company (id: 3 - Indigo)
    const company = await db.collection('companies').findOne({ id: 3 })
    if (!company) {
      console.error('Company with id 3 not found')
      await mongoose.disconnect()
      return
    }

    console.log(`Company: ${company.name}`)
    console.log(`  id: ${company.id}`)
    console.log(`  _id: ${company._id.toString()}\n`)

    // Check ProductCompany relationship
    const productCompanyLinks = await db.collection('productcompanies').find({
      productId: product._id,
      companyId: company._id
    }).toArray()

    console.log(`ProductCompany links: ${productCompanyLinks.length}`)
    if (productCompanyLinks.length === 0) {
      console.error('❌ Product is NOT linked to company!')
      console.log('   This is the problem - the product needs to be linked to the company first.')
    } else {
      console.log('✓ Product is linked to company')
    }

    // Check ProductVendor relationships
    const productVendorLinks = await db.collection('productvendors').find({
      productId: product._id
    }).toArray()

    console.log(`\nProductVendor links: ${productVendorLinks.length}`)
    if (productVendorLinks.length === 0) {
      console.error('❌ Product is NOT linked to any vendor!')
      console.log('   This is also a problem - the product needs to be linked to at least one vendor.')
    } else {
      console.log('✓ Product is linked to vendor(s):')
      const vendors = await db.collection('vendors').find({}).toArray()
      productVendorLinks.forEach((pv, index) => {
        const vendor = vendors.find(v => v._id.toString() === pv.vendorId.toString())
        if (vendor) {
          console.log(`   ${index + 1}. ${vendor.name} (id: ${vendor.id})`)
        } else {
          console.log(`   ${index + 1}. Vendor not found (vendorId: ${pv.vendorId.toString()})`)
        }
      })
    }

    // Summary
    console.log('\n' + '='.repeat(80))
    if (productCompanyLinks.length === 0) {
      console.log('❌ ISSUE: Product is not linked to company')
      console.log('   Fix: Create ProductCompany relationship')
    }
    if (productVendorLinks.length === 0) {
      console.log('❌ ISSUE: Product is not linked to any vendor')
      console.log('   Fix: Create ProductVendor relationship')
    }
    if (productCompanyLinks.length > 0 && productVendorLinks.length > 0) {
      console.log('✓ All relationships exist - the issue might be in the lookup logic')
    }

    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

checkRelationships()

