/**
 * Check all products and their ProductVendor links
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
  console.warn('Could not read .env.local')
}

mongoose.connect(MONGODB_URI).then(async () => {
  const db = mongoose.connection.db
  
  console.log('='.repeat(80))
  console.log('CHECKING ALL PRODUCTS FOR VENDOR LINKS')
  console.log('='.repeat(80))
  console.log()
  
  // Get all products
  const products = await db.collection('uniforms').find({}).toArray()
  console.log(`Total products: ${products.length}`)
  console.log()
  
  // Get all ProductCompany links
  const productCompanyLinks = await db.collection('productcompanies').find({}).toArray()
  console.log(`Total ProductCompany links: ${productCompanyLinks.length}`)
  console.log()
  
  // Get all ProductVendor links
  const productVendorLinks = await db.collection('productvendors').find({}).toArray()
  console.log(`Total ProductVendor links: ${productVendorLinks.length}`)
  console.log()
  
  // Get all companies
  const companies = await db.collection('companies').find({}).toArray()
  const companyMap = new Map()
  companies.forEach(c => companyMap.set(c._id.toString(), c))
  
  // Get all vendors
  const vendors = await db.collection('vendors').find({}).toArray()
  const vendorMap = new Map()
  vendors.forEach(v => vendorMap.set(v._id.toString(), v))
  
  // Analyze each product
  console.log('PRODUCT ANALYSIS:')
  console.log('='.repeat(80))
  
  const productsWithoutVendorLinks = []
  const productsWithPartialLinks = []
  
  for (const product of products) {
    const productIdStr = product._id.toString()
    
    // Find ProductCompany links for this product
    const pcLinks = productCompanyLinks.filter(pc => 
      pc.productId.toString() === productIdStr
    )
    
    // Find ProductVendor links for this product
    const pvLinks = productVendorLinks.filter(pv => 
      pv.productId.toString() === productIdStr
    )
    
    console.log(`\nProduct: ${product.name} (id: ${product.id})`)
    console.log(`  - ProductCompany links: ${pcLinks.length}`)
    pcLinks.forEach(pc => {
      const company = companyMap.get(pc.companyId.toString())
      console.log(`    * Company: ${company ? `${company.id} (${company.name})` : 'NOT FOUND'}`)
    })
    
    console.log(`  - ProductVendor links: ${pvLinks.length}`)
    if (pvLinks.length === 0) {
      console.log(`    ❌ NO VENDOR LINKS`)
      productsWithoutVendorLinks.push({
        product,
        companies: pcLinks.map(pc => {
          const company = companyMap.get(pc.companyId.toString())
          return company ? { id: company.id, name: company.name, _id: company._id } : null
        }).filter(Boolean)
      })
    } else {
      pvLinks.forEach(pv => {
        const vendor = vendorMap.get(pv.vendorId.toString())
        const company = pv.companyId ? companyMap.get(pv.companyId.toString()) : null
        console.log(`    * Vendor: ${vendor ? `${vendor.id} (${vendor.name})` : 'NOT FOUND'}`)
        console.log(`      Company: ${company ? `${company.id} (${company.name})` : 'MISSING ❌'}`)
      })
      
      // Check if all companies have vendor links
      const companiesWithLinks = new Set(pvLinks.map(pv => pv.companyId?.toString()).filter(Boolean))
      const missingCompanies = pcLinks.filter(pc => !companiesWithLinks.has(pc.companyId.toString()))
      
      if (missingCompanies.length > 0) {
        console.log(`    ⚠️  Missing vendor links for ${missingCompanies.length} company/companies:`)
        missingCompanies.forEach(pc => {
          const company = companyMap.get(pc.companyId.toString())
          console.log(`      - ${company ? `${company.id} (${company.name})` : 'NOT FOUND'}`)
        })
        productsWithPartialLinks.push({
          product,
          missingCompanies: missingCompanies.map(pc => {
            const company = companyMap.get(pc.companyId.toString())
            return company ? { id: company.id, name: company.name, _id: company._id } : null
          }).filter(Boolean)
        })
      }
    }
  }
  
  console.log()
  console.log('='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log(`Products without ANY vendor links: ${productsWithoutVendorLinks.length}`)
  if (productsWithoutVendorLinks.length > 0) {
    console.log('\nProducts missing vendor links:')
    productsWithoutVendorLinks.forEach(({ product, companies }) => {
      console.log(`  - ${product.name} (id: ${product.id})`)
      console.log(`    Linked to companies: ${companies.map(c => `${c.id} (${c.name})`).join(', ') || 'NONE'}`)
    })
  }
  
  console.log(`\nProducts with PARTIAL vendor links: ${productsWithPartialLinks.length}`)
  if (productsWithPartialLinks.length > 0) {
    console.log('\nProducts missing vendor links for some companies:')
    productsWithPartialLinks.forEach(({ product, missingCompanies }) => {
      console.log(`  - ${product.name} (id: ${product.id})`)
      console.log(`    Missing links for: ${missingCompanies.map(c => `${c.id} (${c.name})`).join(', ')}`)
    })
  }
  
  await mongoose.disconnect()
}).catch(error => {
  console.error('Error:', error)
  process.exit(1)
})


