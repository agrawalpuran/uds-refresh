/**
 * Direct test of the lookup logic
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
  console.log('TESTING LOOKUP LOGIC')
  console.log('='.repeat(80))
  console.log()
  
  // Get product 5
  const product = await db.collection('uniforms').findOne({ id: '5' })
  if (!product) {
    console.log('❌ Product 5 not found')
    await mongoose.disconnect()
    return
  }
  
  // Get company 3 (Indigo) - try both string and number
  let company = await db.collection('companies').findOne({ id: '3' })
  if (!company) {
    company = await db.collection('companies').findOne({ id: 3 })
  }
  if (!company) {
    console.log('❌ Company 3 not found')
    // List all companies
    const allCompanies = await db.collection('companies').find({}).toArray()
    console.log('Available companies:', allCompanies.map(c => `id=${c.id} (type: ${typeof c.id}), name=${c.name}`))
    await mongoose.disconnect()
    return
  }
  
  console.log(`Product: ${product.name} (id: ${product.id}, _id: ${product._id.toString()})`)
  console.log(`Company: ${company.name} (id: ${company.id}, _id: ${company._id.toString()})`)
  console.log()
  
  // Get all ProductVendor links
  const allLinks = await db.collection('productvendors').find({}).toArray()
  console.log(`Total ProductVendor links: ${allLinks.length}`)
  console.log()
  
  // Filter by productId and companyId using string comparison
  const productIdStr = product._id.toString()
  const companyIdStr = company._id.toString()
  
  console.log(`Filtering with:`)
  console.log(`  - productId: ${productIdStr}`)
  console.log(`  - companyId: ${companyIdStr}`)
  console.log()
  
  const matchingLinks = allLinks.filter(pv => {
    const pvProductIdStr = pv.productId ? pv.productId.toString() : null
    const pvCompanyIdStr = pv.companyId ? pv.companyId.toString() : null
    
    return pvProductIdStr === productIdStr && pvCompanyIdStr === companyIdStr
  })
  
  console.log(`Found ${matchingLinks.length} matching link(s):`)
  if (matchingLinks.length > 0) {
    const vendors = await db.collection('vendors').find({}).toArray()
    matchingLinks.forEach((link, i) => {
      const vendor = vendors.find(v => v._id.toString() === link.vendorId.toString())
      console.log(`  ${i + 1}. Vendor: ${vendor ? `${vendor.id} (${vendor.name})` : 'NOT FOUND'}`)
    })
    console.log()
    console.log('✓ Lookup should work!')
  } else {
    console.log('❌ No matching links found')
    console.log()
    console.log('All ProductVendor links:')
    allLinks.forEach((link, i) => {
      const pvProductIdStr = link.productId ? link.productId.toString() : 'MISSING'
      const pvCompanyIdStr = link.companyId ? link.companyId.toString() : 'MISSING'
      console.log(`  ${i + 1}. productId: ${pvProductIdStr}, companyId: ${pvCompanyIdStr}`)
      console.log(`     Match product: ${pvProductIdStr === productIdStr}`)
      console.log(`     Match company: ${pvCompanyIdStr === companyIdStr}`)
    })
  }
  
  await mongoose.disconnect()
}).catch(error => {
  console.error('Error:', error)
  process.exit(1)
})

