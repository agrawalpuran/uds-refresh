/**
 * Script to:
 * 1. Clean up duplicate ProductCompany links
 * 2. Ensure all products are linked to companies based on ProductVendor -> VendorCompany chain
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

async function cleanupAndEnsureLinks() {
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
    
    // Get all vendors
    const allVendors = await db.collection('vendors').find({}).toArray()
    console.log(`🏪 Found ${allVendors.length} vendors\n`)
    
    // Get ProductVendor relationships
    const productVendorLinks = await db.collection('productvendors').find({}).toArray()
    console.log(`📦➡️🏪 Found ${productVendorLinks.length} ProductVendor relationships\n`)
    
    // Get VendorCompany relationships
    const vendorCompanyLinks = await db.collection('vendorcompanies').find({}).toArray()
    console.log(`🏪➡️🏢 Found ${vendorCompanyLinks.length} VendorCompany relationships\n`)
    
    // Get existing ProductCompany relationships
    const existingProductCompanyLinks = await db.collection('productcompanies').find({}).toArray()
    console.log(`📦➡️🏢 Found ${existingProductCompanyLinks.length} existing ProductCompany relationships\n`)
    
    // Build maps
    const productMap = new Map()
    allProducts.forEach((p) => {
      productMap.set(p._id.toString(), p)
    })
    
    const companyMap = new Map()
    allCompanies.forEach((c) => {
      companyMap.set(c._id.toString(), c)
    })
    
    const vendorMap = new Map()
    allVendors.forEach((v) => {
      vendorMap.set(v._id.toString(), v)
    })
    
    // Step 1: Find and remove duplicate ProductCompany links
    console.log('🔍 Step 1: Finding duplicate ProductCompany links...\n')
    const linkKeys = new Map()
    const duplicates = []
    
    for (const link of existingProductCompanyLinks) {
      const productIdStr = link.productId?.toString()
      const companyIdStr = link.companyId?.toString()
      if (productIdStr && companyIdStr) {
        const key = `${productIdStr}:${companyIdStr}`
        if (linkKeys.has(key)) {
          duplicates.push(link)
          console.log(`⚠️  Duplicate found: Product ${productIdStr} ➡️ Company ${companyIdStr}`)
        } else {
          linkKeys.set(key, link)
        }
      }
    }
    
    if (duplicates.length > 0) {
      console.log(`\n🗑️  Removing ${duplicates.length} duplicate links...\n`)
      for (const dup of duplicates) {
        await db.collection('productcompanies').deleteOne({ _id: dup._id })
        const product = productMap.get(dup.productId?.toString())
        const company = companyMap.get(dup.companyId?.toString())
        console.log(`   Deleted duplicate: ${product?.id || product?.name} ➡️ ${company?.name || company?.id}`)
      }
      console.log('')
    } else {
      console.log('✅ No duplicate links found\n')
    }
    
    // Step 2: Build relationship chains
    console.log('🔍 Step 2: Building relationship chains...\n')
    
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
    
    // Build vendor -> companies map
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
    
    // Step 3: Get current links after cleanup
    const currentLinks = await db.collection('productcompanies').find({}).toArray()
    const currentLinksMap = new Map()
    for (const link of currentLinks) {
      const productIdStr = link.productId?.toString()
      const companyIdStr = link.companyId?.toString()
      if (productIdStr && companyIdStr) {
        const key = `${productIdStr}:${companyIdStr}`
        currentLinksMap.set(key, true)
      }
    }
    
    // Step 4: Find missing links based on vendor relationships
    console.log('🔍 Step 3: Finding missing ProductCompany links based on vendor relationships...\n')
    const linksToCreate = []
    
    for (const product of allProducts) {
      const productIdStr = product._id.toString()
      const vendors = productToVendors.get(productIdStr) || []
      
      if (vendors.length === 0) {
        console.log(`⚠️  ${product.id || product.name}: No vendor links - cannot link via vendor chain`)
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
          const vendor = vendorMap.get(vId)
          return vendor?.name || vendor?.id || vId
        })
        console.log(`⚠️  ${product.id || product.name}: Vendors (${vendorNames.join(', ')}) not linked to companies`)
        continue
      }
      
      // Check which companies are missing links
      for (const companyIdStr of companiesForProduct) {
        const key = `${productIdStr}:${companyIdStr}`
        if (!currentLinksMap.has(key)) {
          const company = companyMap.get(companyIdStr)
          linksToCreate.push({
            productId: product._id,
            companyId: company._id,
            productName: product.id || product.name,
            companyName: company?.name || company?.id
          })
          console.log(`➕ Will create: ${product.id || product.name} ➡️ ${company?.name || company?.id}`)
        }
      }
    }
    
    console.log(`\n📝 Summary:`)
    console.log(`   - Duplicate links removed: ${duplicates.length}`)
    console.log(`   - New links to create: ${linksToCreate.length}`)
    console.log(`   - Current ProductCompany links: ${currentLinks.length}\n`)
    
    if (linksToCreate.length === 0) {
      console.log('✅ All products are properly linked to companies based on vendor relationships!')
    } else {
      // Create the links
      console.log('🔨 Creating ProductCompany links...\n')
      let created = 0
      let errors = 0
      
      for (const link of linksToCreate) {
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
            console.log(`ℹ️  Already exists: ${link.productName} ➡️ ${link.companyName}`)
          } else {
            errors++
            console.error(`❌ Error: ${error.message}`)
          }
        }
      }
      
      console.log(`\n📊 Results:`)
      console.log(`   ✅ Created: ${created} links`)
      console.log(`   ❌ Errors: ${errors} links`)
    }
    
    // Final verification
    const finalLinks = await db.collection('productcompanies').find({}).toArray()
    console.log(`\n✅ Final ProductCompany links: ${finalLinks.length}`)
    
    // Show final mapping
    console.log(`\n📋 Final Product-Company Mapping:`)
    const finalProductLinksMap = new Map()
    for (const link of finalLinks) {
      const productIdStr = link.productId?.toString()
      const companyIdStr = link.companyId?.toString()
      const product = productMap.get(productIdStr)
      const company = companyMap.get(companyIdStr)
      if (product && company) {
        if (!finalProductLinksMap.has(productIdStr)) {
          finalProductLinksMap.set(productIdStr, new Set())
        }
        finalProductLinksMap.get(productIdStr).add(company.name || company.id)
      }
    }
    
    for (const product of allProducts) {
      const productIdStr = product._id.toString()
      const companies = finalProductLinksMap.get(productIdStr)
      if (companies && companies.size > 0) {
        const companyNames = Array.from(companies).join(', ')
        console.log(`   ✅ ${product.id || product.name}: ${companies.size} company(ies) - ${companyNames}`)
      } else {
        console.log(`   ❌ ${product.id || product.name}: NOT linked to any company`)
      }
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

cleanupAndEnsureLinks()

