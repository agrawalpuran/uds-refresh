/**
 * Script to link products to companies based on existing relationships
 * This script will:
 * 1. Check existing ProductCompany relationships
 * 2. Link products to companies based on vendor-company relationships
 * 3. Link products to companies based on product-vendor relationships
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

async function linkProductsToCompanies() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // Get all products
    const allProducts = await db.collection('uniforms').find({}).toArray()
    console.log(`📦 Found ${allProducts.length} products\n`)
    
    // Get all companies
    const allCompanies = await db.collection('companies').find({}).toArray()
    console.log(`🏢 Found ${allCompanies.length} companies\n`)
    
    // Get existing ProductCompany relationships
    const existingProductCompanyLinks = await db.collection('productcompanies').find({}).toArray()
    console.log(`🔗 Found ${existingProductCompanyLinks.length} existing ProductCompany relationships\n`)
    
    // Get ProductVendor relationships
    const productVendorLinks = await db.collection('productvendors').find({}).toArray()
    console.log(`📦➡️🏪 Found ${productVendorLinks.length} ProductVendor relationships\n`)
    
    // Get VendorCompany relationships
    const vendorCompanyLinks = await db.collection('vendorcompanies').find({}).toArray()
    console.log(`🏪➡️🏢 Found ${vendorCompanyLinks.length} VendorCompany relationships\n`)
    
    // Create a map of vendor -> companies
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
    
    console.log(`📊 Vendor to Companies mapping: ${vendorToCompanies.size} vendors linked to companies\n`)
    
    // Create a map of product -> vendors
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
    
    console.log(`📊 Product to Vendors mapping: ${productToVendors.size} products linked to vendors\n`)
    
    // Strategy 1: Link products to companies via ProductVendor -> VendorCompany chain
    const newLinks = []
    const existingLinksMap = new Map()
    
    // Create map of existing links for quick lookup
    for (const link of existingProductCompanyLinks) {
      const productIdStr = link.productId?.toString()
      const companyIdStr = link.companyId?.toString()
      if (productIdStr && companyIdStr) {
        const key = `${productIdStr}:${companyIdStr}`
        existingLinksMap.set(key, true)
      }
    }
    
    console.log('🔍 Analyzing relationships to create ProductCompany links...\n')
    
    // For each product, find companies through vendor relationships
    for (const product of allProducts) {
      const productIdStr = product._id.toString()
      const vendors = productToVendors.get(productIdStr) || []
      
      if (vendors.length === 0) {
        console.log(`⚠️  Product ${product.id || product.name} has no vendor links`)
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
        console.log(`⚠️  Product ${product.id || product.name} vendors are not linked to any companies`)
        continue
      }
      
      // Create ProductCompany links for each company
      for (const companyIdStr of companiesForProduct) {
        const key = `${productIdStr}:${companyIdStr}`
        if (!existingLinksMap.has(key)) {
          // Find the company document
          const company = allCompanies.find((c) => c._id.toString() === companyIdStr)
          if (company) {
            newLinks.push({
              productId: product._id,
              companyId: company._id,
              productName: product.name || product.id,
              companyName: company.name || company.id
            })
            console.log(`✅ Will link: ${product.id || product.name} ➡️ ${company.name || company.id}`)
          }
        }
      }
    }
    
    console.log(`\n📝 Summary:`)
    console.log(`   - Existing ProductCompany links: ${existingProductCompanyLinks.length}`)
    console.log(`   - New links to create: ${newLinks.length}\n`)
    
    if (newLinks.length === 0) {
      console.log('✅ All products are already linked to companies based on relationships!')
      await mongoose.disconnect()
      return
    }
    
    // Create the new links
    console.log('🔨 Creating ProductCompany links...\n')
    let created = 0
    let errors = 0
    
    for (const link of newLinks) {
      try {
        await db.collection('productcompanies').insertOne({
          productId: link.productId,
          companyId: link.companyId,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        created++
        console.log(`✅ Created: ${link.productName} ➡️ ${link.companyName}`)
      } catch (error) {
        if (error.code === 11000) {
          // Duplicate key error - link already exists
          console.log(`ℹ️  Already exists: ${link.productName} ➡️ ${link.companyName}`)
        } else {
          errors++
          console.error(`❌ Error linking ${link.productName} to ${link.companyName}:`, error.message)
        }
      }
    }
    
    console.log(`\n📊 Results:`)
    console.log(`   ✅ Created: ${created} links`)
    console.log(`   ❌ Errors: ${errors} links`)
    
    // Verify the links
    const finalLinks = await db.collection('productcompanies').find({}).toArray()
    console.log(`\n✅ Total ProductCompany links after update: ${finalLinks.length}`)
    
    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    console.error('Stack:', error.stack)
    await mongoose.disconnect()
    process.exit(1)
  }
}

linkProductsToCompanies()

