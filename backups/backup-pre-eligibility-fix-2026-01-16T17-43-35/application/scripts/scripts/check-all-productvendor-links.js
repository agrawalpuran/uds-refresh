/**
 * Check all ProductVendor links in the database
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
  console.log('ALL PRODUCTVENDOR LINKS IN DATABASE')
  console.log('='.repeat(80))
  console.log()
  
  const allLinks = await db.collection('productvendors').find({}).toArray()
  console.log(`Total ProductVendor links: ${allLinks.length}`)
  console.log()
  
  if (allLinks.length === 0) {
    console.log('❌ No ProductVendor links found in database!')
    console.log('   You need to create ProductVendor links for products.')
    console.log()
    
    // Show what products and companies exist
    const products = await db.collection('uniforms').find({}, { projection: { id: 1, name: 1 } }).limit(10).toArray()
    const companies = await db.collection('companies').find({}, { projection: { id: 1, name: 1 } }).toArray()
    const vendors = await db.collection('vendors').find({}, { projection: { id: 1, name: 1 } }).toArray()
    
    console.log('Available resources:')
    console.log(`  - Products: ${products.length}`)
    products.forEach(p => console.log(`    * id=${p.id}, name=${p.name}`))
    console.log(`  - Companies: ${companies.length}`)
    companies.forEach(c => console.log(`    * id=${c.id}, name=${c.name}`))
    console.log(`  - Vendors: ${vendors.length}`)
    vendors.forEach(v => console.log(`    * id=${v.id}, name=${v.name}`))
  } else {
    const products = await db.collection('uniforms').find({}).toArray()
    const companies = await db.collection('companies').find({}).toArray()
    const vendors = await db.collection('vendors').find({}).toArray()
    
    const productMap = new Map()
    products.forEach(p => productMap.set(p._id.toString(), p))
    
    const companyMap = new Map()
    companies.forEach(c => companyMap.set(c._id.toString(), c))
    
    const vendorMap = new Map()
    vendors.forEach(v => vendorMap.set(v._id.toString(), v))
    
    console.log('ProductVendor Links:')
    allLinks.forEach((link, i) => {
      const product = productMap.get(link.productId?.toString())
      const vendor = vendorMap.get(link.vendorId?.toString())
      const company = link.companyId ? companyMap.get(link.companyId.toString()) : null
      
      console.log(`  ${i + 1}. Product: ${product ? `${product.id} (${product.name})` : 'NOT FOUND'}`)
      console.log(`     Vendor: ${vendor ? `${vendor.id} (${vendor.name})` : 'NOT FOUND'}`)
      console.log(`     Company: ${company ? `${company.id} (${company.name})` : link.companyId ? 'NOT FOUND' : 'MISSING ❌'}`)
      console.log()
    })
    
    // Count links with and without companyId
    const withCompanyId = allLinks.filter(l => l.companyId).length
    const withoutCompanyId = allLinks.length - withCompanyId
    
    console.log(`Summary:`)
    console.log(`  - Links with companyId: ${withCompanyId}`)
    console.log(`  - Links without companyId: ${withoutCompanyId} ${withoutCompanyId > 0 ? '❌' : ''}`)
  }
  
  await mongoose.disconnect()
}).catch(error => {
  console.error('Error:', error)
  process.exit(1)
})

