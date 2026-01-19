/**
 * Test the exact order creation flow to find where it fails
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

async function testOrderFlow() {
  try {
    console.log('='.repeat(80))
    console.log('TESTING ORDER CREATION FLOW')
    console.log('='.repeat(80))
    console.log()

    await mongoose.connect(MONGODB_URI)
    console.log('✓ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    // Step 1: Find product "5"
    console.log('STEP 1: Finding product with id "5"')
    console.log('-'.repeat(80))
    const product = await db.collection('uniforms').findOne({ id: '5' })
    if (!product) {
      console.error('❌ Product not found')
      await mongoose.disconnect()
      return
    }
    console.log(`✓ Product: ${product.name}, _id: ${product._id.toString()}\n`)

    // Step 2: Find company "3"
    console.log('STEP 2: Finding company with id 3')
    console.log('-'.repeat(80))
    const company = await db.collection('companies').findOne({ id: 3 })
    if (!company) {
      console.error('❌ Company not found')
      await mongoose.disconnect()
      return
    }
    console.log(`✓ Company: ${company.name}, _id: ${company._id.toString()}\n`)

    // Step 3: Check ProductCompany link
    console.log('STEP 3: Checking ProductCompany link')
    console.log('-'.repeat(80))
    const productCompanyLink = await db.collection('productcompanies').findOne({
      productId: product._id,
      companyId: company._id
    })
    if (!productCompanyLink) {
      console.error('❌ ProductCompany link NOT FOUND')
      console.error(`   Looking for: productId=${product._id.toString()}, companyId=${company._id.toString()}`)
      await mongoose.disconnect()
      return
    }
    console.log(`✓ ProductCompany link exists\n`)

    // Step 4: Check ProductVendor links
    console.log('STEP 4: Checking ProductVendor links')
    console.log('-'.repeat(80))
    const allProductVendors = await db.collection('productvendors').find({}).toArray()
    console.log(`Total ProductVendor links in DB: ${allProductVendors.length}`)
    
    const productIdStr = product._id.toString()
    const matchingLinks = allProductVendors.filter(pv => {
      if (!pv.productId) return false
      return pv.productId.toString() === productIdStr
    })
    
    console.log(`ProductVendor links for product: ${matchingLinks.length}`)
    if (matchingLinks.length === 0) {
      console.error('❌ NO ProductVendor links found!')
      console.error(`   Product _id: ${productIdStr}`)
      console.error(`\n   All ProductVendor links:`)
      allProductVendors.forEach((pv, i) => {
        console.error(`   ${i + 1}. productId: ${pv.productId?.toString()}, vendorId: ${pv.vendorId?.toString()}`)
      })
      await mongoose.disconnect()
      return
    }
    
    // Step 5: Get vendor details
    console.log('\nSTEP 5: Getting vendor details')
    console.log('-'.repeat(80))
    const allVendors = await db.collection('vendors').find({}).toArray()
    const vendorMap = new Map()
    allVendors.forEach(v => {
      vendorMap.set(v._id.toString(), { id: v.id, name: v.name })
    })
    
    matchingLinks.forEach((pv, i) => {
      const vendorIdStr = pv.vendorId.toString()
      const vendor = vendorMap.get(vendorIdStr)
      if (vendor) {
        console.log(`✓ Link ${i + 1}: Vendor ${vendor.id} (${vendor.name})`)
      } else {
        console.error(`❌ Link ${i + 1}: Vendor not found (vendorId: ${vendorIdStr})`)
      }
    })

    // Step 6: Simulate the exact function call
    console.log('\nSTEP 6: Simulating getVendorsForProductCompany call')
    console.log('-'.repeat(80))
    console.log('Calling: getVendorsForProductCompany("5", "3", false)')
    
    // Import models first
    const { Uniform, Company, ProductCompany, ProductVendor, Vendor } = require('../lib/models')
    
    // Now simulate the function
    const productId = '5'
    const companyId = '3'
    
    // Find product
    let foundProduct = await Uniform.findOne({ id: productId })
    if (!foundProduct) {
      foundProduct = await Uniform.findOne({ id: String(productId) })
    }
    if (!foundProduct) {
      foundProduct = await Uniform.findOne({ id: Number(productId) })
    }
    
    if (!foundProduct) {
      console.error('❌ Product not found via Mongoose')
      await mongoose.disconnect()
      return
    }
    console.log(`✓ Product found: ${foundProduct.name}, _id: ${foundProduct._id.toString()}`)
    
    // Find company
    let foundCompany = await Company.findOne({ id: companyId })
    if (!foundCompany) {
      foundCompany = await Company.findOne({ id: Number(companyId) })
    }
    if (!foundCompany) {
      foundCompany = await Company.findOne({ id: String(companyId) })
    }
    
    if (!foundCompany) {
      console.error('❌ Company not found via Mongoose')
      await mongoose.disconnect()
      return
    }
    console.log(`✓ Company found: ${foundCompany.name}, _id: ${foundCompany._id.toString()}`)
    
    // Check ProductCompany
    const pcLink = await ProductCompany.findOne({
      productId: foundProduct._id,
      companyId: foundCompany._id
    })
    if (!pcLink) {
      console.error('❌ ProductCompany link not found via Mongoose')
      console.error(`   productId: ${foundProduct._id.toString()}, companyId: ${foundCompany._id.toString()}`)
      await mongoose.disconnect()
      return
    }
    console.log(`✓ ProductCompany link found`)
    
    // Now check ProductVendor using raw MongoDB (as the function does)
    const rawProductVendors = await db.collection('productvendors').find({}).toArray()
    const productIdStr2 = foundProduct._id.toString()
    const matchingLinks2 = rawProductVendors.filter(pv => {
      if (!pv.productId) return false
      return pv.productId.toString() === productIdStr2
    })
    
    console.log(`\nProductVendor links found: ${matchingLinks2.length}`)
    if (matchingLinks2.length === 0) {
      console.error('❌ NO ProductVendor links found in function simulation!')
      await mongoose.disconnect()
      return
    }
    
    // Get vendors
    const allVendors2 = await db.collection('vendors').find({}).toArray()
    const vendorMap2 = new Map()
    allVendors2.forEach(v => {
      vendorMap2.set(v._id.toString(), { id: v.id, name: v.name })
    })
    
    const matchingVendors = []
    for (const pvLink of matchingLinks2) {
      if (!pvLink.vendorId) continue
      const vendorIdStr = pvLink.vendorId.toString()
      const vendor = vendorMap2.get(vendorIdStr)
      if (vendor) {
        matchingVendors.push({
          vendorId: vendor.id,
          vendorName: vendor.name
        })
        console.log(`✓ Vendor found: ${vendor.id} (${vendor.name})`)
      }
    }
    
    if (matchingVendors.length === 0) {
      console.error('❌ NO vendors extracted from ProductVendor links!')
    } else {
      console.log(`\n✅ SUCCESS! Found ${matchingVendors.length} vendor(s):`)
      matchingVendors.forEach((v, i) => {
        console.log(`   ${i + 1}. ${v.vendorId} - ${v.vendorName}`)
      })
    }

    await mongoose.disconnect()
    console.log('\n✓ Disconnected from MongoDB')
  } catch (error) {
    console.error('Error:', error)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

testOrderFlow()

