/**
 * Script to verify and fix product-company relationships after company ID migration
 * Ensures all ProductCompany relationships are valid and products are linked correctly
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

async function verifyAndFixProductRelationships() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection failed')
    }

    // Get all companies
    const companies = await db.collection('companies').find({}).toArray()
    console.log(`Found ${companies.length} companies\n`)

    // Create company mapping: _id -> id (numeric)
    const companyMap = new Map()
    companies.forEach(c => {
      companyMap.set(c._id.toString(), c.id)
      console.log(`Company: ${c.name} - _id: ${c._id}, id: ${c.id}`)
    })

    // Get all products
    const products = await db.collection('uniforms').find({}).toArray()
    console.log(`\nFound ${products.length} products\n`)

    // Create product mapping: _id -> id
    const productMap = new Map()
    products.forEach(p => {
      productMap.set(p._id.toString(), p.id)
    })

    // Get all ProductCompany relationships
    const productCompanyLinks = await db.collection('productcompanies').find({}).toArray()
    console.log(`\nFound ${productCompanyLinks.length} ProductCompany relationships\n`)

    // Verify each relationship
    const validLinks = []
    const invalidLinks = []
    const missingProducts = []
    const missingCompanies = []

    for (const link of productCompanyLinks) {
      const productIdStr = link.productId?.toString()
      const companyIdStr = link.companyId?.toString()

      const product = products.find(p => p._id.toString() === productIdStr)
      const company = companies.find(c => c._id.toString() === companyIdStr)

      if (!product) {
        missingProducts.push({ link, productIdStr })
        invalidLinks.push(link)
      } else if (!company) {
        missingCompanies.push({ link, companyIdStr })
        invalidLinks.push(link)
      } else {
        validLinks.push({
          link,
          productId: product.id,
          productName: product.name,
          companyId: company.id,
          companyName: company.name
        })
      }
    }

    console.log('\n=== RELATIONSHIP VERIFICATION ===')
    console.log(`Valid relationships: ${validLinks.length}`)
    console.log(`Invalid relationships: ${invalidLinks.length}`)
    console.log(`Missing products: ${missingProducts.length}`)
    console.log(`Missing companies: ${missingCompanies.length}`)

    if (invalidLinks.length > 0) {
      console.log('\n=== INVALID RELATIONSHIPS ===')
      invalidLinks.forEach((link, idx) => {
        console.log(`${idx + 1}. ProductId: ${link.productId?.toString()}, CompanyId: ${link.companyId?.toString()}`)
      })
    }

    // Show valid relationships grouped by company
    console.log('\n=== VALID RELATIONSHIPS BY COMPANY ===')
    const byCompany = new Map()
    validLinks.forEach(vl => {
      if (!byCompany.has(vl.companyId)) {
        byCompany.set(vl.companyId, [])
      }
      byCompany.get(vl.companyId).push(vl)
    })

    for (const [companyId, links] of byCompany.entries()) {
      const company = companies.find(c => c.id === companyId)
      console.log(`\nCompany: ${company?.name || 'Unknown'} (ID: ${companyId})`)
      console.log(`  Products linked: ${links.length}`)
      links.forEach((link, idx) => {
        console.log(`    ${idx + 1}. ${link.productName} (${link.productId})`)
      })
    }

    // Check if products are missing relationships
    console.log('\n=== PRODUCTS WITHOUT COMPANY RELATIONSHIPS ===')
    const productsWithoutLinks = products.filter(p => {
      const productIdStr = p._id.toString()
      return !productCompanyLinks.some(link => link.productId?.toString() === productIdStr)
    })

    if (productsWithoutLinks.length > 0) {
      console.log(`Found ${productsWithoutLinks.length} products without company relationships:`)
      productsWithoutLinks.forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.name || p.id} (${p.id})`)
      })
    } else {
      console.log('All products have company relationships')
    }

    // Clean up invalid relationships
    if (invalidLinks.length > 0) {
      console.log(`\n=== CLEANING UP ${invalidLinks.length} INVALID RELATIONSHIPS ===`)
      for (const link of invalidLinks) {
        await db.collection('productcompanies').deleteOne({ _id: link._id })
        console.log(`  Deleted invalid relationship: ProductId=${link.productId?.toString()}, CompanyId=${link.companyId?.toString()}`)
      }
      console.log('Cleanup complete\n')
    }

    // Summary
    console.log('\n=== SUMMARY ===')
    console.log(`Total companies: ${companies.length}`)
    console.log(`Total products: ${products.length}`)
    console.log(`Valid ProductCompany relationships: ${validLinks.length}`)
    console.log(`Invalid relationships removed: ${invalidLinks.length}`)
    console.log(`Products without relationships: ${productsWithoutLinks.length}`)

    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
    console.log('\nVerification complete!')
  } catch (error) {
    console.error('Error during verification:', error)
    process.exit(1)
  }
}

// Run verification
verifyAndFixProductRelationships()

