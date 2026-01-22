/**
 * Direct test of the vendor lookup to see what's happening
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

async function testVendorLookup() {
  try {
    console.log('='.repeat(80))
    console.log('TESTING VENDOR LOOKUP - SIMULATING EXACT ORDER FLOW')
    console.log('='.repeat(80))
    console.log()

    await mongoose.connect(MONGODB_URI)
    console.log('✓ Connected to MongoDB\n')

    // Import models
    const { Uniform, Company, ProductCompany, ProductVendor, Vendor } = require('../lib/models')
    
    // Test with exact values from error: productId="5", companyId="3"
    const productId = '5'
    const companyId = '3'
    
    console.log(`Testing: productId="${productId}", companyId="${companyId}"`)
    console.log('-'.repeat(80))
    
    // Step 1: Find product
    console.log('\nSTEP 1: Finding product...')
    let product = await Uniform.findOne({ id: productId })
    if (!product) {
      product = await Uniform.findOne({ id: String(productId) })
    }
    if (!product) {
      product = await Uniform.findOne({ id: Number(productId) })
    }
    
    if (!product) {
      console.error('❌ Product not found')
      await mongoose.disconnect()
      return
    }
    console.log(`✓ Product: ${product.name}, _id: ${product._id.toString()}`)
    
    // Step 2: Find company
    console.log('\nSTEP 2: Finding company...')
    let company = await Company.findOne({ id: companyId })
    if (!company) {
      company = await Company.findOne({ id: Number(companyId) })
    }
    if (!company) {
      company = await Company.findOne({ id: String(companyId) })
    }
    
    if (!company) {
      console.error('❌ Company not found')
      await mongoose.disconnect()
      return
    }
    console.log(`✓ Company: ${company.name}, _id: ${company._id.toString()}`)
    
    // Step 3: Check ProductCompany link (exact logic from function)
    console.log('\nSTEP 3: Checking ProductCompany link...')
    let productCompanyLink = await ProductCompany.findOne({
      productId: product._id,
      companyId: company._id
    })
    console.log(`Mongoose ProductCompany.findOne result: ${productCompanyLink ? 'FOUND' : 'NOT FOUND'}`)
    
    const db = mongoose.connection.db
    if (!productCompanyLink && db) {
      console.log('Trying raw MongoDB collection...')
      const rawProductCompanies = await db.collection('productcompanies').find({
        productId: product._id,
        companyId: company._id
      }).toArray()
      
      console.log(`Raw MongoDB found ${rawProductCompanies.length} link(s)`)
      
      if (rawProductCompanies.length > 0) {
        console.log('✓ Found ProductCompany link in raw collection')
        productCompanyLink = rawProductCompanies[0]
      }
    }
    
    if (!productCompanyLink) {
      console.error('❌ ProductCompany link NOT FOUND')
      await mongoose.disconnect()
      return
    }
    console.log('✓ ProductCompany link exists')
    
    // Step 4: Check ProductVendor links (exact logic from function)
    console.log('\nSTEP 4: Checking ProductVendor links...')
    if (!db) {
      console.error('❌ Database connection not available')
      await mongoose.disconnect()
      return
    }
    
    const productIdStr = product._id.toString()
    console.log(`Searching for ProductVendor links with productId: ${productIdStr}`)
    
    const rawProductVendors = await db.collection('productvendors').find({}).toArray()
    console.log(`Total ProductVendor links in DB: ${rawProductVendors.length}`)
    
    const matchingLinks = rawProductVendors.filter((pv) => {
      if (!pv.productId) return false
      const pvProductIdStr = pv.productId.toString()
      return pvProductIdStr === productIdStr
    })
    
    console.log(`Found ${matchingLinks.length} ProductVendor link(s) for product ${productId}`)
    
    if (matchingLinks.length === 0) {
      console.error('❌ NO ProductVendor links found!')
      console.error('All ProductVendor links in DB:')
      rawProductVendors.forEach((pv, i) => {
        console.error(`  ${i + 1}. productId: ${pv.productId?.toString()}, vendorId: ${pv.vendorId?.toString()}`)
      })
      await mongoose.disconnect()
      return
    }
    
    // Step 5: Get vendor details
    console.log('\nSTEP 5: Getting vendor details...')
    const allVendors = await db.collection('vendors').find({}).toArray()
    const vendorMap = new Map()
    allVendors.forEach((v) => {
      vendorMap.set(v._id.toString(), { id: v.id, name: v.name, _id: v._id })
    })
    
    const matchingVendors = []
    for (const pvLink of matchingLinks) {
      if (!pvLink.vendorId) {
        console.warn('ProductVendor link has no vendorId')
        continue
      }
      
      const vendorIdStr = pvLink.vendorId.toString()
      const vendor = vendorMap.get(vendorIdStr)
      
      if (vendor) {
        matchingVendors.push({
          vendorId: vendor.id,
          vendorName: vendor.name || 'Unknown Vendor'
        })
        console.log(`✓ Vendor: ${vendor.id} (${vendor.name})`)
      } else {
        console.warn(`Vendor not found for vendorId: ${vendorIdStr}`)
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

testVendorLookup()

