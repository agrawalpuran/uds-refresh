/**
 * Test the lookup for product "Formal Trousers - Male" (id: 3) with company 3 (Indigo)
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
  console.log('TESTING LOOKUP FOR PRODUCT 3 (Formal Trousers - Male)')
  console.log('='.repeat(80))
  console.log()
  
  // Get product 3
  const product = await db.collection('uniforms').findOne({ id: '3' })
  if (!product) {
    console.log('❌ Product 3 not found')
    await mongoose.disconnect()
    return
  }
  
  console.log(`Product: ${product.name} (id: ${product.id}, _id: ${product._id.toString()})`)
  console.log()
  
  // Get company 3 (Indigo)
  let company = await db.collection('companies').findOne({ id: '3' })
  if (!company) {
    company = await db.collection('companies').findOne({ id: 3 })
  }
  if (!company) {
    console.log('❌ Company 3 not found')
    await mongoose.disconnect()
    return
  }
  
  console.log(`Company: ${company.name} (id: ${company.id}, _id: ${company._id.toString()})`)
  console.log()
  
  // Check ProductCompany link
  const pcLink = await db.collection('productcompanies').findOne({
    productId: product._id,
    companyId: company._id
  })
  
  if (!pcLink) {
    console.log('❌ ProductCompany link NOT FOUND')
  } else {
    console.log('✓ ProductCompany link exists')
  }
  console.log()
  
  // Check ProductVendor links
  const productIdStr = product._id.toString()
  const companyIdStr = company._id.toString()
  
  console.log(`Looking for ProductVendor links with:`)
  console.log(`  - productId: ${productIdStr}`)
  console.log(`  - companyId: ${companyIdStr}`)
  console.log()
  
  // Get all ProductVendor links
  const allLinks = await db.collection('productvendors').find({}).toArray()
  console.log(`Total ProductVendor links in DB: ${allLinks.length}`)
  
  // Filter by productId and companyId
  const matchingLinks = allLinks.filter(pv => {
    const pvProductIdStr = pv.productId ? pv.productId.toString() : null
    const pvCompanyIdStr = pv.companyId ? pv.companyId.toString() : null
    
    const productMatches = pvProductIdStr === productIdStr
    const companyMatches = pvCompanyIdStr === companyIdStr
    
    console.log(`  Link: productId=${pvProductIdStr}, companyId=${pvCompanyIdStr || 'MISSING'}`)
    console.log(`    - Product matches: ${productMatches}`)
    console.log(`    - Company matches: ${companyMatches}`)
    console.log(`    - Overall match: ${productMatches && companyMatches}`)
    console.log()
    
    return productMatches && companyMatches
  })
  
  console.log(`Found ${matchingLinks.length} matching ProductVendor link(s)`)
  
  if (matchingLinks.length > 0) {
    const vendors = await db.collection('vendors').find({}).toArray()
    matchingLinks.forEach((link, i) => {
      const vendor = vendors.find(v => v._id.toString() === link.vendorId.toString())
      console.log(`  ${i + 1}. Vendor: ${vendor ? `${vendor.id} (${vendor.name})` : 'NOT FOUND'}`)
    })
    console.log()
    console.log('✓ Lookup should work!')
  } else {
    console.log('❌ No matching links found!')
    console.log()
    console.log('All ProductVendor links for this product:')
    const productLinks = allLinks.filter(pv => 
      pv.productId && pv.productId.toString() === productIdStr
    )
    productLinks.forEach((link, i) => {
      const pvCompanyIdStr = link.companyId ? link.companyId.toString() : 'MISSING'
      console.log(`  ${i + 1}. companyId: ${pvCompanyIdStr}`)
    })
  }
  
  await mongoose.disconnect()
}).catch(error => {
  console.error('Error:', error)
  process.exit(1)
})


