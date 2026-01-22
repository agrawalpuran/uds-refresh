/**
 * Create missing ProductVendor links for all products
 * For each product-company combination, create a ProductVendor link
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
  console.log('CREATING MISSING PRODUCTVENDOR LINKS')
  console.log('='.repeat(80))
  console.log()
  
  // Get all products
  const products = await db.collection('uniforms').find({}).toArray()
  console.log(`Total products: ${products.length}`)
  
  // Get all ProductCompany links
  const productCompanyLinks = await db.collection('productcompanies').find({}).toArray()
  console.log(`Total ProductCompany links: ${productCompanyLinks.length}`)
  
  // Get all ProductVendor links
  const productVendorLinks = await db.collection('productvendors').find({}).toArray()
  console.log(`Total ProductVendor links: ${productVendorLinks.length}`)
  console.log()
  
  // Get all vendors (use the first vendor as default)
  const vendors = await db.collection('vendors').find({}).toArray()
  if (vendors.length === 0) {
    console.log('❌ No vendors found in database! Cannot create ProductVendor links.')
    await mongoose.disconnect()
    return
  }
  
  const defaultVendor = vendors[0]
  console.log(`Using default vendor: ${defaultVendor.id} (${defaultVendor.name})`)
  console.log()
  
  // Get all companies
  const companies = await db.collection('companies').find({}).toArray()
  const companyMap = new Map()
  companies.forEach(c => companyMap.set(c._id.toString(), c))
  
  let createdCount = 0
  let skippedCount = 0
  
  // For each ProductCompany link, check if ProductVendor link exists
  for (const pcLink of productCompanyLinks) {
    const productIdObj = pcLink.productId
    const companyIdObj = pcLink.companyId
    
    // Check if ProductVendor link already exists
    const existingLink = productVendorLinks.find(pv => 
      pv.productId.toString() === productIdObj.toString() &&
      pv.companyId && pv.companyId.toString() === companyIdObj.toString()
    )
    
    if (existingLink) {
      skippedCount++
      continue
    }
    
    // Find product and company info
    const product = products.find(p => p._id.toString() === productIdObj.toString())
    const company = companyMap.get(companyIdObj.toString())
    
    if (!product) {
      console.log(`⚠️  Product not found for ProductCompany link`)
      continue
    }
    
    if (!company) {
      console.log(`⚠️  Company not found for ProductCompany link`)
      continue
    }
    
    console.log(`Creating ProductVendor link:`)
    console.log(`  - Product: ${product.name} (id: ${product.id})`)
    console.log(`  - Company: ${company.name} (id: ${company.id})`)
    console.log(`  - Vendor: ${defaultVendor.name} (id: ${defaultVendor.id})`)
    
    // Create ProductVendor link
    await db.collection('productvendors').insertOne({
      productId: productIdObj,
      vendorId: defaultVendor._id,
      companyId: companyIdObj,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    
    console.log(`  ✓ Created`)
    console.log()
    createdCount++
  }
  
  console.log('='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log(`✓ Created: ${createdCount} ProductVendor link(s)`)
  console.log(`⚠️  Skipped (already exists): ${skippedCount} link(s)`)
  console.log()
  
  // Verify
  const finalCount = await db.collection('productvendors').countDocuments({})
  console.log(`Total ProductVendor links after creation: ${finalCount}`)
  
  await mongoose.disconnect()
  console.log()
  console.log('✓ Done!')
}).catch(error => {
  console.error('Error:', error)
  process.exit(1)
})


