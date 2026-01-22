/**
 * Script to analyze relationships and see why products aren't being linked
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
      MONGODB_URI = mongoMatch[1].trim()
    }
  }
} catch (error) {
  console.log('Could not read .env.local, using default or environment variable')
}

async function analyzeRelationships() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // Get all products
    const allProducts = await db.collection('uniforms').find({}).toArray()
    console.log(`📦 Products (${allProducts.length}):`)
    allProducts.forEach((p) => {
      console.log(`   - ${p.id || p.name} (_id: ${p._id})`)
    })
    console.log('')
    
    // Get all vendors
    const allVendors = await db.collection('vendors').find({}).toArray()
    console.log(`🏪 Vendors (${allVendors.length}):`)
    allVendors.forEach((v) => {
      console.log(`   - ${v.id || v.name} (_id: ${v._id})`)
    })
    console.log('')
    
    // Get all companies
    const allCompanies = await db.collection('companies').find({}).toArray()
    console.log(`🏢 Companies (${allCompanies.length}):`)
    allCompanies.forEach((c) => {
      console.log(`   - ${c.name} (${c.id}) (_id: ${c._id})`)
    })
    console.log('')
    
    // Get ProductVendor relationships
    const productVendorLinks = await db.collection('productvendors').find({}).toArray()
    console.log(`📦➡️🏪 ProductVendor relationships (${productVendorLinks.length}):`)
    for (const link of productVendorLinks) {
      const product = allProducts.find((p) => p._id.toString() === link.productId?.toString())
      const vendor = allVendors.find((v) => v._id.toString() === link.vendorId?.toString())
      console.log(`   - Product: ${product?.id || product?.name || link.productId} ➡️ Vendor: ${vendor?.id || vendor?.name || link.vendorId}`)
    }
    console.log('')
    
    // Get VendorCompany relationships
    const vendorCompanyLinks = await db.collection('vendorcompanies').find({}).toArray()
    console.log(`🏪➡️🏢 VendorCompany relationships (${vendorCompanyLinks.length}):`)
    for (const link of vendorCompanyLinks) {
      const vendor = allVendors.find((v) => v._id.toString() === link.vendorId?.toString())
      const company = allCompanies.find((c) => c._id.toString() === link.companyId?.toString())
      console.log(`   - Vendor: ${vendor?.id || vendor?.name || link.vendorId} ➡️ Company: ${company?.name || company?.id || link.companyId}`)
    }
    console.log('')
    
    // Get ProductCompany relationships
    const productCompanyLinks = await db.collection('productcompanies').find({}).toArray()
    console.log(`📦➡️🏢 ProductCompany relationships (${productCompanyLinks.length}):`)
    for (const link of productCompanyLinks) {
      const product = allProducts.find((p) => p._id.toString() === link.productId?.toString())
      const company = allCompanies.find((c) => c._id.toString() === link.companyId?.toString())
      console.log(`   - Product: ${product?.id || product?.name || link.productId} ➡️ Company: ${company?.name || company?.id || link.companyId}`)
    }
    console.log('')
    
    // Now try to link products to companies based on relationships
    console.log('🔍 Analyzing which products should be linked to which companies...\n')
    
    // Create maps
    const productToVendors = new Map()
    for (const pvLink of productVendorLinks) {
      const productIdStr = pvLink.productId?.toString()
      const vendorIdStr = pvLink.vendorId?.toString()
      if (productIdStr && vendorIdStr) {
        if (!productToVendors.has(productIdStr)) {
          productToVendors.set(productIdStr, [])
        }
        productToVendors.get(productIdStr).push(vendorIdStr)
      }
    }
    
    const vendorToCompanies = new Map()
    for (const vcLink of vendorCompanyLinks) {
      const vendorIdStr = vcLink.vendorId?.toString()
      const companyIdStr = vcLink.companyId?.toString()
      if (vendorIdStr && companyIdStr) {
        if (!vendorToCompanies.has(vendorIdStr)) {
          vendorToCompanies.set(vendorIdStr, [])
        }
        vendorToCompanies.get(vendorIdStr).push(companyIdStr)
      }
    }
    
    const existingLinks = new Map()
    for (const pcLink of productCompanyLinks) {
      const productIdStr = pcLink.productId?.toString()
      const companyIdStr = pcLink.companyId?.toString()
      if (productIdStr && companyIdStr) {
        const key = `${productIdStr}:${companyIdStr}`
        existingLinks.set(key, true)
      }
    }
    
    // Find missing links
    const missingLinks = []
    for (const product of allProducts) {
      const productIdStr = product._id.toString()
      const vendors = productToVendors.get(productIdStr) || []
      
      if (vendors.length === 0) {
        console.log(`⚠️  Product ${product.id || product.name} has no vendor links`)
        continue
      }
      
      const companiesForProduct = new Set()
      for (const vendorIdStr of vendors) {
        const companies = vendorToCompanies.get(vendorIdStr) || []
        for (const companyIdStr of companies) {
          companiesForProduct.add(companyIdStr)
        }
      }
      
      if (companiesForProduct.size === 0) {
        console.log(`⚠️  Product ${product.id || product.name} vendors are not linked to any companies`)
        const vendorNames = vendors.map((vId) => {
          const vendor = allVendors.find((v) => v._id.toString() === vId)
          return vendor?.name || vendor?.id || vId
        })
        console.log(`   Vendors: ${vendorNames.join(', ')}`)
        continue
      }
      
      // Check which companies are missing
      for (const companyIdStr of companiesForProduct) {
        const key = `${productIdStr}:${companyIdStr}`
        if (!existingLinks.has(key)) {
          const company = allCompanies.find((c) => c._id.toString() === companyIdStr)
          missingLinks.push({
            product: product.id || product.name,
            productId: productIdStr,
            company: company?.name || company?.id,
            companyId: companyIdStr
          })
        }
      }
    }
    
    if (missingLinks.length > 0) {
      console.log(`\n📝 Missing ProductCompany links (${missingLinks.length}):`)
      for (const link of missingLinks) {
        console.log(`   - ${link.product} ➡️ ${link.company}`)
      }
    } else {
      console.log(`\n✅ All products are properly linked to companies!`)
    }
    
    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    console.error('Stack:', error.stack)
    await mongoose.disconnect()
    process.exit(1)
  }
}

analyzeRelationships()

