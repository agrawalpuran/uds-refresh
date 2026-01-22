/**
 * Comprehensive diagnostic script to identify why order creation is failing
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

async function diagnoseOrderError() {
  try {
    console.log('='.repeat(80))
    console.log('COMPREHENSIVE ORDER ERROR DIAGNOSTIC')
    console.log('='.repeat(80))
    console.log()

    await mongoose.connect(MONGODB_URI)
    console.log('✓ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    // 1. Check Product "Leather Dress Shoes - Male" (id: 5)
    console.log('1. CHECKING PRODUCT: "Leather Dress Shoes - Male" (id: 5)')
    console.log('-'.repeat(80))
    const product = await db.collection('uniforms').findOne({ id: '5' })
    if (!product) {
      console.error('❌ Product with id "5" NOT FOUND')
      await mongoose.disconnect()
      return
    }
    console.log(`✓ Product found: ${product.name}`)
    console.log(`  - id: ${product.id} (type: ${typeof product.id})`)
    console.log(`  - _id: ${product._id.toString()}`)
    console.log()

    // 2. Check Company (Indigo, id: 3)
    console.log('2. CHECKING COMPANY: "Indigo" (id: 3)')
    console.log('-'.repeat(80))
    const company = await db.collection('companies').findOne({ id: 3 })
    if (!company) {
      console.error('❌ Company with id 3 NOT FOUND')
      await mongoose.disconnect()
      return
    }
    console.log(`✓ Company found: ${company.name}`)
    console.log(`  - id: ${company.id} (type: ${typeof company.id})`)
    console.log(`  - _id: ${company._id.toString()}`)
    console.log()

    // 3. Check ProductCompany relationship
    console.log('3. CHECKING ProductCompany RELATIONSHIP')
    console.log('-'.repeat(80))
    const productCompanyLinks = await db.collection('productcompanies').find({
      productId: product._id,
      companyId: company._id
    }).toArray()
    
    if (productCompanyLinks.length === 0) {
      console.error('❌ ProductCompany link NOT FOUND')
      console.error(`   Product _id: ${product._id.toString()}`)
      console.error(`   Company _id: ${company._id.toString()}`)
      
      // Check if links exist with different ObjectIds
      const allProductCompanyLinks = await db.collection('productcompanies').find({}).toArray()
      console.log(`\n   All ProductCompany links in DB: ${allProductCompanyLinks.length}`)
      allProductCompanyLinks.forEach((link, i) => {
        console.log(`   ${i + 1}. productId: ${link.productId?.toString()}, companyId: ${link.companyId?.toString()}`)
      })
    } else {
      console.log(`✓ ProductCompany link found (${productCompanyLinks.length} link(s))`)
    }
    console.log()

    // 4. Check ProductVendor relationships
    console.log('4. CHECKING ProductVendor RELATIONSHIPS')
    console.log('-'.repeat(80))
    const allProductVendorLinks = await db.collection('productvendors').find({}).toArray()
    console.log(`Total ProductVendor links in DB: ${allProductVendorLinks.length}`)
    
    const productIdStr = product._id.toString()
    const matchingProductVendorLinks = allProductVendorLinks.filter(pv => {
      const pvProductIdStr = pv.productId ? pv.productId.toString() : null
      return pvProductIdStr === productIdStr
    })
    
    if (matchingProductVendorLinks.length === 0) {
      console.error('❌ ProductVendor link NOT FOUND for this product')
      console.error(`   Product _id: ${productIdStr}`)
      console.error(`\n   All ProductVendor links in DB:`)
      allProductVendorLinks.forEach((pv, i) => {
        const pvProductIdStr = pv.productId ? pv.productId.toString() : 'null'
        const pvVendorIdStr = pv.vendorId ? pv.vendorId.toString() : 'null'
        console.log(`   ${i + 1}. productId: ${pvProductIdStr}, vendorId: ${pvVendorIdStr}`)
      })
    } else {
      console.log(`✓ ProductVendor link(s) found: ${matchingProductVendorLinks.length}`)
      const vendors = await db.collection('vendors').find({}).toArray()
      matchingProductVendorLinks.forEach((pv, i) => {
        const vendor = vendors.find(v => v._id.toString() === pv.vendorId.toString())
        if (vendor) {
          console.log(`   ${i + 1}. Vendor: ${vendor.name} (id: ${vendor.id}, _id: ${pv.vendorId.toString()})`)
        } else {
          console.log(`   ${i + 1}. Vendor not found (vendorId: ${pv.vendorId.toString()})`)
        }
      })
    }
    console.log()

    // 5. Simulate the exact lookup that getVendorsForProductCompany does
    console.log('5. SIMULATING getVendorsForProductCompany LOOKUP')
    console.log('-'.repeat(80))
    
    // Load models
    const { Uniform, Company, ProductCompany, ProductVendor, Vendor } = require('../lib/models')
    
    // Try to find product by id (as string)
    let foundProduct = await Uniform.findOne({ id: '5' })
    if (!foundProduct) {
      console.error('❌ Uniform.findOne({ id: "5" }) returned null')
    } else {
      console.log(`✓ Uniform.findOne({ id: "5" }) found product: ${foundProduct.name}`)
    }
    
    // Try to find company by id (as number)
    let foundCompany = await Company.findOne({ id: 3 })
    if (!foundCompany) {
      console.error('❌ Company.findOne({ id: 3 }) returned null')
    } else {
      console.log(`✓ Company.findOne({ id: 3 }) found company: ${foundCompany.name}`)
    }
    
    if (foundProduct && foundCompany) {
      // Check ProductCompany via Mongoose
      const pcLink = await ProductCompany.findOne({
        productId: foundProduct._id,
        companyId: foundCompany._id
      })
      if (!pcLink) {
        console.error('❌ ProductCompany.findOne() returned null')
      } else {
        console.log('✓ ProductCompany.findOne() found link')
      }
      
      // Check ProductVendor via Mongoose
      const pvLinks = await ProductVendor.find({ productId: foundProduct._id })
      if (!pvLinks || pvLinks.length === 0) {
        console.error('❌ ProductVendor.find() returned empty array')
        console.error(`   Product _id: ${foundProduct._id.toString()}`)
      } else {
        console.log(`✓ ProductVendor.find() found ${pvLinks.length} link(s)`)
        for (const pv of pvLinks) {
          const vendor = await Vendor.findById(pv.vendorId)
          if (vendor) {
            console.log(`   - Vendor: ${vendor.name} (id: ${vendor.id})`)
          } else {
            console.log(`   - Vendor not found (vendorId: ${pv.vendorId.toString()})`)
          }
        }
      }
    }
    console.log()

    // 6. Summary and recommendations
    console.log('6. SUMMARY AND RECOMMENDATIONS')
    console.log('='.repeat(80))
    
    const hasProductCompany = productCompanyLinks.length > 0
    const hasProductVendor = matchingProductVendorLinks.length > 0
    
    if (!hasProductCompany) {
      console.error('❌ MISSING: ProductCompany relationship')
      console.error('   ACTION: Create ProductCompany link between product "5" and company "3"')
    }
    
    if (!hasProductVendor) {
      console.error('❌ MISSING: ProductVendor relationship')
      console.error('   ACTION: Create ProductVendor link(s) for product "5"')
    }
    
    if (hasProductCompany && hasProductVendor) {
      console.log('✓ All relationships exist in database')
      console.log('⚠️  The issue is likely in the lookup logic in getVendorsForProductCompany')
      console.log('   ACTION: Review and fix the ObjectId comparison logic')
    }

    await mongoose.disconnect()
    console.log('\n✓ Disconnected from MongoDB')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

diagnoseOrderError()

