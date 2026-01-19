/**
 * Script to:
 * 1. Fix VendorCompany relationships that use old ObjectIds
 * 2. Link products to companies based on ProductVendor -> VendorCompany chain
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

async function fixAndLinkProducts() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // Get all vendors with their IDs
    const allVendors = await db.collection('vendors').find({}).toArray()
    console.log(`🏪 Found ${allVendors.length} vendors:`)
    const vendorMap = new Map()
    for (const vendor of allVendors) {
      console.log(`   - ${vendor.name} (${vendor.id}) - _id: ${vendor._id}`)
      vendorMap.set(vendor.id, vendor._id)
    }
    console.log('')
    
    // Get all companies
    const allCompanies = await db.collection('companies').find({}).toArray()
    console.log(`🏢 Found ${allCompanies.length} companies:`)
    const companyMap = new Map()
    for (const company of allCompanies) {
      console.log(`   - ${company.name} (${company.id}) - _id: ${company._id}`)
      companyMap.set(company.id, company._id)
    }
    console.log('')
    
    // Get existing VendorCompany relationships
    const existingVendorCompanyLinks = await db.collection('vendorcompanies').find({}).toArray()
    console.log(`🔗 Found ${existingVendorCompanyLinks.length} existing VendorCompany relationships\n`)
    
    // Check which VendorCompany links are using invalid ObjectIds
    console.log('🔍 Checking VendorCompany relationships...\n')
    const invalidLinks = []
    const validLinks = []
    
    for (const link of existingVendorCompanyLinks) {
      const vendorIdStr = link.vendorId?.toString()
      const companyIdStr = link.companyId?.toString()
      
      // Check if vendor ObjectId exists in current vendors
      const vendor = allVendors.find((v) => v._id.toString() === vendorIdStr)
      const company = allCompanies.find((c) => c._id.toString() === companyIdStr)
      
      if (!vendor || !company) {
        invalidLinks.push(link)
        console.log(`❌ Invalid link: Vendor ${vendorIdStr} ➡️ Company ${companyIdStr}`)
        if (!vendor) console.log(`   Vendor ObjectId not found in current vendors`)
        if (!company) console.log(`   Company ObjectId not found in current companies`)
      } else {
        validLinks.push(link)
        console.log(`✅ Valid link: ${vendor.name} (${vendor.id}) ➡️ ${company.name} (${company.id})`)
      }
    }
    console.log('')
    
    // Delete invalid links
    if (invalidLinks.length > 0) {
      console.log(`🗑️  Deleting ${invalidLinks.length} invalid VendorCompany relationships...\n`)
      for (const link of invalidLinks) {
        await db.collection('vendorcompanies').deleteOne({ _id: link._id })
        console.log(`   Deleted invalid link: ${link._id}`)
      }
      console.log('')
    }
    
    // Get ProductVendor relationships
    const productVendorLinks = await db.collection('productvendors').find({}).toArray()
    console.log(`📦➡️🏪 Found ${productVendorLinks.length} ProductVendor relationships\n`)
    
    // Get all products
    const allProducts = await db.collection('uniforms').find({}).toArray()
    console.log(`📦 Found ${allProducts.length} products\n`)
    
    // Now create ProductCompany links based on ProductVendor -> VendorCompany chain
    console.log('🔗 Creating ProductCompany links based on relationships...\n')
    
    // Build product -> vendors map
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
    
    // Build vendor -> companies map (using valid links only)
    const vendorToCompanies = new Map()
    for (const vcLink of validLinks) {
      const vendorIdStr = vcLink.vendorId?.toString()
      const companyIdStr = vcLink.companyId?.toString()
      if (vendorIdStr && companyIdStr) {
        if (!vendorToCompanies.has(vendorIdStr)) {
          vendorToCompanies.set(vendorIdStr, [])
        }
        vendorToCompanies.get(vendorIdStr).push(companyIdStr)
      }
    }
    
    // Get existing ProductCompany links
    const existingProductCompanyLinks = await db.collection('productcompanies').find({}).toArray()
    const existingLinksMap = new Map()
    for (const link of existingProductCompanyLinks) {
      const productIdStr = link.productId?.toString()
      const companyIdStr = link.companyId?.toString()
      if (productIdStr && companyIdStr) {
        const key = `${productIdStr}:${companyIdStr}`
        existingLinksMap.set(key, true)
      }
    }
    
    // Create new ProductCompany links
    const newLinks = []
    let created = 0
    let skipped = 0
    
    for (const product of allProducts) {
      const productIdStr = product._id.toString()
      const vendors = productToVendors.get(productIdStr) || []
      
      if (vendors.length === 0) {
        console.log(`⚠️  Product ${product.id || product.name} has no vendor links - skipping`)
        continue
      }
      
      // Find all companies this product's vendors supply to
      const companiesForProduct = new Set()
      for (const vendorIdStr of vendors) {
        const companies = vendorToCompanies.get(vendorIdStr) || []
        for (const companyIdStr of companies) {
          companiesForProduct.add(companyIdStr)
        }
      }
      
      if (companiesForProduct.size === 0) {
        const vendorNames = vendors.map((vId) => {
          const vendor = allVendors.find((v) => v._id.toString() === vId)
          return vendor?.name || vendor?.id || vId
        })
        console.log(`⚠️  Product ${product.id || product.name} vendors (${vendorNames.join(', ')}) are not linked to any companies - skipping`)
        continue
      }
      
      // Create ProductCompany links for each company
      for (const companyIdStr of companiesForProduct) {
        const key = `${productIdStr}:${companyIdStr}`
        if (!existingLinksMap.has(key)) {
          const company = allCompanies.find((c) => c._id.toString() === companyIdStr)
          if (company) {
            try {
              await db.collection('productcompanies').insertOne({
                productId: product._id,
                companyId: company._id,
                createdAt: new Date(),
                updatedAt: new Date()
              })
              created++
              console.log(`✅ Created: ${product.id || product.name} ➡️ ${company.name || company.id}`)
            } catch (error) {
              if (error.code === 11000) {
                // Duplicate key - already exists
                skipped++
                console.log(`ℹ️  Already exists: ${product.id || product.name} ➡️ ${company.name || company.id}`)
              } else {
                console.error(`❌ Error linking ${product.id || product.name} to ${company.name || company.id}:`, error.message)
              }
            }
          }
        } else {
          skipped++
        }
      }
    }
    
    console.log(`\n📊 Summary:`)
    console.log(`   - Invalid VendorCompany links deleted: ${invalidLinks.length}`)
    console.log(`   - Valid VendorCompany links: ${validLinks.length}`)
    console.log(`   - New ProductCompany links created: ${created}`)
    console.log(`   - Links skipped (already exist): ${skipped}`)
    
    // Final count
    const finalProductCompanyLinks = await db.collection('productcompanies').find({}).toArray()
    console.log(`   - Total ProductCompany links: ${finalProductCompanyLinks.length}`)
    
    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    console.error('Stack:', error.stack)
    await mongoose.disconnect()
    process.exit(1)
  }
}

fixAndLinkProducts()

