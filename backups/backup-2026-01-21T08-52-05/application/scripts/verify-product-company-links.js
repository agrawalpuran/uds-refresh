/**
 * Script to verify ProductCompany links and show which products are linked to which companies
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

async function verifyLinks() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // Get all products
    const allProducts = await db.collection('uniforms').find({}).toArray()
    console.log(`📦 Products (${allProducts.length}):`)
    const productMap = new Map()
    for (const product of allProducts) {
      productMap.set(product._id.toString(), product)
      console.log(`   - ${product.id || product.name} (_id: ${product._id})`)
    }
    console.log('')
    
    // Get all companies
    const allCompanies = await db.collection('companies').find({}).toArray()
    console.log(`🏢 Companies (${allCompanies.length}):`)
    const companyMap = new Map()
    for (const company of allCompanies) {
      companyMap.set(company._id.toString(), company)
      console.log(`   - ${company.name} (${company.id}) (_id: ${company._id})`)
    }
    console.log('')
    
    // Get ProductCompany links
    const productCompanyLinks = await db.collection('productcompanies').find({}).toArray()
    console.log(`🔗 ProductCompany Links (${productCompanyLinks.length}):\n`)
    
    // Group by product
    const productLinksMap = new Map()
    for (const link of productCompanyLinks) {
      const productIdStr = link.productId?.toString()
      const companyIdStr = link.companyId?.toString()
      
      const product = productMap.get(productIdStr)
      const company = companyMap.get(companyIdStr)
      
      if (product && company) {
        if (!productLinksMap.has(productIdStr)) {
          productLinksMap.set(productIdStr, [])
        }
        productLinksMap.get(productIdStr).push(company)
      } else {
        console.log(`⚠️  Invalid link: Product ${productIdStr} ➡️ Company ${companyIdStr}`)
        if (!product) console.log(`   Product not found`)
        if (!company) console.log(`   Company not found`)
      }
    }
    
    // Display links by product
    for (const product of allProducts) {
      const productIdStr = product._id.toString()
      const links = productLinksMap.get(productIdStr) || []
      if (links.length > 0) {
        const companyNames = links.map((c) => c.name || c.id).join(', ')
        console.log(`✅ ${product.id || product.name}: Linked to ${links.length} company(ies) - ${companyNames}`)
      } else {
        console.log(`❌ ${product.id || product.name}: NOT linked to any company`)
      }
    }
    
    console.log('\n📊 Summary:')
    console.log(`   - Total products: ${allProducts.length}`)
    console.log(`   - Products with company links: ${productLinksMap.size}`)
    console.log(`   - Products without company links: ${allProducts.length - productLinksMap.size}`)
    console.log(`   - Total ProductCompany links: ${productCompanyLinks.length}`)
    
    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    console.error('Stack:', error.stack)
    await mongoose.disconnect()
    process.exit(1)
  }
}

verifyLinks()

