/**
 * Script to create ProductVendor link for Blazer - Male (product ID 7)
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
  console.warn('Could not read .env.local, using default connection string')
}

async function fixBlazerVendorLink() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    // Find product with ID 7
    let product = await db.collection('uniforms').findOne({ id: 7 })
    if (!product) {
      product = await db.collection('uniforms').findOne({ id: '7' })
    }
    if (!product) {
      console.log('❌ Product with ID 7 not found!')
      await mongoose.disconnect()
      return
    }

    console.log(`✅ Found Product: ${product.name} (ID: ${product.id})`)
    console.log(`   Product _id: ${product._id}\n`)

    // Get the company (Indigo, ID 3)
    const company = await db.collection('companies').findOne({ id: 3 })
    if (!company) {
      console.log('❌ Company with ID 3 (Indigo) not found!')
      await mongoose.disconnect()
      return
    }

    console.log(`✅ Found Company: ${company.name} (ID: ${company.id})`)
    console.log(`   Company _id: ${company._id}\n`)

    // Get first vendor
    const vendor = await db.collection('vendors').findOne({})
    if (!vendor) {
      console.log('❌ No vendors found in database!')
      await mongoose.disconnect()
      return
    }

    console.log(`✅ Found Vendor: ${vendor.name} (ID: ${vendor.id})`)
    console.log(`   Vendor _id: ${vendor._id}\n`)

    // Check if ProductVendor link already exists
    const existingLink = await db.collection('productvendors').findOne({
      productId: product._id,
      vendorId: vendor._id,
      companyId: company._id
    })

    if (existingLink) {
      console.log('✅ ProductVendor link already exists!')
      console.log(`   Link _id: ${existingLink._id}`)
    } else {
      // Create ProductVendor link
      const result = await db.collection('productvendors').insertOne({
        productId: product._id,
        vendorId: vendor._id,
        companyId: company._id,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      console.log('✅ Created ProductVendor link!')
      console.log(`   Link _id: ${result.insertedId}`)
      console.log(`   Product: ${product.name} (${product.id})`)
      console.log(`   Vendor: ${vendor.name} (${vendor.id})`)
      console.log(`   Company: ${company.name} (${company.id})`)
    }

    // Also create link without companyId for backward compatibility
    const existingLinkNoCompany = await db.collection('productvendors').findOne({
      productId: product._id,
      vendorId: vendor._id,
      companyId: { $exists: false }
    })

    if (!existingLinkNoCompany) {
      const result2 = await db.collection('productvendors').insertOne({
        productId: product._id,
        vendorId: vendor._id,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      console.log('\n✅ Also created ProductVendor link without companyId (for backward compatibility)')
      console.log(`   Link _id: ${result2.insertedId}`)
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
    console.log('\n🎉 Fix complete! Try placing the order again.')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

fixBlazerVendorLink()

